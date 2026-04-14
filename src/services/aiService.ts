import OpenAI from 'openai';
import { InformationNeed, EvidenceCard } from '../types/domain';
import { ResearchElement, QAElement, ActionElement, SlideElement } from '../types/deliverables';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

const client = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true,
});

// ── Meeting context packet ───────────────────────────────────────────────────
// Assembled from state on every AI call so each prompt has full awareness of
// what's already been covered, detected, and resolved.

export interface MeetingContextPacket {
  meetingTitle: string;
  accountContext: string;       // from pre-meeting modal
  detectedThemes: string[];     // from inferenceEngine
  resolvedTopics: string[];     // titles of evidence already surfaced
  unresolvedQuestions: string[];
  recentTranscript: string;     // last 10 turns, formatted
  elapsedMinutes: number;
  meetingType: 'sales' | 'research';
}

function buildContextBlock(ctx: MeetingContextPacket): string {
  const lines: string[] = [];
  if (ctx.meetingTitle) lines.push(`Meeting: ${ctx.meetingTitle}`);
  if (ctx.accountContext) lines.push(`Context: ${ctx.accountContext}`);
  if (ctx.elapsedMinutes > 0) lines.push(`Elapsed: ${ctx.elapsedMinutes} min`);
  if (ctx.detectedThemes.length) lines.push(`Themes discussed: ${ctx.detectedThemes.join(', ')}`);
  if (ctx.resolvedTopics.length) lines.push(`Already surfaced: ${ctx.resolvedTopics.join(', ')}`);
  if (ctx.unresolvedQuestions.length) lines.push(`Open questions: ${ctx.unresolvedQuestions.slice(0, 3).join(' | ')}`);
  return lines.join('\n');
}

// Compress long transcripts to stay within token limits for deliverable generation
function compressTranscript(transcriptText: string, maxChars = 12000): string {
  if (transcriptText.length <= maxChars) return transcriptText;
  const lines = transcriptText.split('\n').filter(Boolean);
  // Keep first 20% and last 60% — opening context + recent conversation
  const headCount = Math.floor(lines.length * 0.2);
  const tailCount = Math.floor(lines.length * 0.6);
  const head = lines.slice(0, headCount);
  const tail = lines.slice(lines.length - tailCount);
  return [...head, '\n[... earlier conversation compressed ...]\n', ...tail].join('\n');
}

// ── Real-time inference ──────────────────────────────────────────────────────

/**
 * Detect critical information gaps from the latest transcript segment.
 * Low temperature (0.2) for precise, reliable gap detection with minimal hallucination.
 */
export async function inferNeedsWithAI(
  latestSegment: string,
  ctx: MeetingContextPacket
): Promise<InformationNeed[]> {
  try {
    const contextBlock = buildContextBlock(ctx);

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: ctx.meetingType === 'research'
            ? `You are a real-time research copilot embedded in a scientific, clinical, or quantitative analysis meeting. Your job is to surface ONE high-value question that the team should have answered RIGHT NOW — something a senior domain expert would immediately want to look up or verify.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need:
{
  "category": "hypothesis|methodology|contradiction|correction|metric|open_question",
  "prompt": "Specific, answerable question a researcher would actually Google or look up — include the exact claim, number, or entity from the conversation",
  "priority": "p1",
  "confidence": 0.75-1.0,
  "rationale": "One sentence: the concrete risk if this isn't checked",
  "triggerPhrase": "exact 2-5 word phrase from the latest segment that triggered this"
}

What to catch (fire on the FIRST clear signal):
- contradiction: a specific number or result that directly conflicts with a named prior study or established benchmark — ask for the specific published figure (e.g. "What was the Grade 2+ AE rate in KEYNOTE-024 supplementary data?")
- methodology: a statistical or experimental flaw being committed — ask the specific corrective question (e.g. "What is the standard T+1 lag correction for same-day look-ahead bias in backtest signals?")
- metric: a key number cited without the context needed to interpret it — ask for the benchmark, reference range, or CI that anchors it
- open_question: an explicit unresolved decision or validation step with a knowable answer — name the specific thing that needs to be checked
- hypothesis: an unverified causal or mechanistic claim being treated as established fact

Hard rules:
- 0 or 1 needs only. Never return more than one.
- The prompt must be answerable from published literature or established standards — not from proprietary databases, unpublished data, or 2024+ papers. If the only good answer requires a database or a very recent paper, skip it.
- Skip: scheduling, logistics, general discussion without a specific verifiable claim
- Skip: anything already in the "Already surfaced" list
- confidence >= 0.65 — fire if you are reasonably sure this gap is real and the answer is findable`
            : `You are a deal intelligence engine for B2B sales. Your job is to catch ONLY the gaps that could directly lose a deal.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need:
{
  "category": "comparison|risk|pricing|objection|decision|correction",
  "prompt": "Specific, answerable research question",
  "priority": "p1",
  "confidence": 0.80-1.0,
  "rationale": "One sentence: why this matters for the deal right now",
  "triggerPhrase": "exact 1-4 word phrase from the latest segment"
}

Strict rules:
- 0 or 1 needs only. Never more.
- Only trigger on CUSTOMER speech — what the prospect/buyer says carries 3x more weight than the seller
- Skip if the topic was already surfaced (check "Already surfaced" list)
- Skip small talk, general discussion, soft objections
- correction category ONLY for demonstrably false factual claims, not uncertainty
- confidence must be >= 0.85 — if in doubt, return empty`,
        },
        {
          role: 'user',
          content: `${contextBlock}\n\nRecent conversation:\n${ctx.recentTranscript}\n\nLatest segment:\n${latestSegment}`,
        },
      ],
    });

    const content = response.choices[0].message.content;
    if (!content) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.needs)
      ? parsed.needs.map((need: any, idx: number) => ({
          id: `need-ai-${Date.now()}-${idx}`,
          category: need.category || 'claim',
          prompt: need.prompt || '',
          rationale: need.rationale || '',
          triggerPhrase: need.triggerPhrase || undefined,
          triggeredBySegmentId: `segment-${Date.now()}`,
          confidence: need.confidence ?? 0.7,
          priority: 'p1' as const,
          status: 'new' as const,
        }))
      : [];
  } catch (err) {
    console.error('AI inference error:', err);
    return [];
  }
}

// ── Ambient / proactive suggestions ─────────────────────────────────────────

export interface ProactiveSuggestion {
  headline: string;
  prompt: string;
  rationale: string;
  category: 'comparison' | 'risk' | 'pricing' | 'objection' | 'claim' | 'decision' | 'metric'
    | 'hypothesis' | 'methodology' | 'contradiction' | 'open_question';
  importance: number;
}

/**
 * Proactively surface insights the rep should know RIGHT NOW.
 * Uses the last 3 segments + full meeting context for arc awareness.
 */
export async function generateAmbientSuggestion(
  recentSegments: string,   // last 2-3 transcript turns joined
  previousHeadlines: string[],
  ctx: MeetingContextPacket
): Promise<ProactiveSuggestion | null> {
  try {
    const contextBlock = buildContextBlock(ctx);
    const prevBlock = previousHeadlines.length > 0
      ? `\nDo NOT repeat these already-surfaced topics:\n${previousHeadlines.slice(-5).join('\n')}`
      : '';

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 250,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: ctx.meetingType === 'research'
            ? `You are a real-time research copilot. Surface a proactive suggestion ONLY if it adds something the team hasn't noticed — something a senior collaborator would say "wait, have you checked…?" about.

Qualify (must be concrete and lookable-up):
- A named prior study that directly contradicts or benchmarks what was just claimed
- A methodological flaw that the team is walking into without realizing
- A specific metric or statistic from the literature that should be cited right now
- A regulatory, submission, or institutional constraint that's about to become relevant
- A variable or confound not yet mentioned that affects the interpretation

Disqualify: generic encouragement, restating what was said, scheduling, anything in the already-surfaced list, vague "consider X" statements without a specific resolvable question.

Return: { "headline": "max 8 words — specific not generic", "prompt": "exact research question to look up — include named entities, numbers, studies", "rationale": "one sentence: what risk or opportunity this surfaces", "category": "hypothesis|methodology|contradiction|metric|open_question|comparison", "importance": 1-10 }
Or: { "skip": true }

importance: 9-10 = team would stop and look this up immediately; 7-8 = worth surfacing now; <7 = skip it`
            : `You are a real-time sales copilot. Surface a suggestion ONLY if it would give the rep a concrete, immediate advantage right now.

Qualify: specific stat, competitive differentiator, pricing data point, risk the rep should address, or direct answer to something the CUSTOMER just implied.

Disqualify: generic observations, topics already covered, rep-side statements, soft topics without a clear action.

Return: { "headline": "max 8 words", "prompt": "specific research question", "rationale": "one sentence", "category": "comparison|risk|pricing|objection|claim|decision|metric", "importance": 1-10 }
Or: { "skip": true }`,
        },
        {
          role: 'user',
          content: `${contextBlock}${prevBlock}\n\nRecent conversation:\n${recentSegments}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    if (parsed.skip || !parsed.headline || !parsed.prompt) return null;
    if (typeof parsed.importance !== 'number' || parsed.importance < 7) return null;
    return parsed as ProactiveSuggestion;
  } catch (err) {
    console.error('Ambient suggestion error:', err);
    return null;
  }
}

// ── Gap resolution ───────────────────────────────────────────────────────────

/**
 * Answer a gap from uploaded or indexed documents.
 */
export async function resolveGapFromDocuments(
  question: string,
  documentContext: string
): Promise<{ answer: string; source: string; confidence: number }> {
  if (!documentContext.trim()) {
    return { answer: 'No documents to search.', source: 'No documents', confidence: 0 };
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a precise document analyst. Find the exact answer using ONLY the provided excerpts.

- Quote specific numbers, prices, percentages, and dates verbatim
- Name the exact document source
- If multiple documents contribute, cite each
- If no clear answer exists, set found: false

Return JSON: { "found": true|false, "answer": "...", "source_document": "filename", "confidence": 0.0-1.0 }`,
        },
        {
          role: 'user',
          content: `Documents:\n${documentContext}\n\nQuestion: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      answer: parsed.answer || 'Not found in documents.',
      source: parsed.source_document || 'Internal documents',
      confidence: parsed.found ? (parsed.confidence ?? 0.85) : 0.1,
    };
  } catch (err) {
    console.error('Document gap resolution error:', err);
    return { answer: 'Unable to resolve — API error.', source: 'Error', confidence: 0 };
  }
}

/**
 * Answer a gap from GPT general knowledge.
 * Does NOT return URLs — GPT hallucinates them.
 */
export async function resolveGapFromInternet(
  question: string,
  transcriptContext: string,
  meetingType: 'sales' | 'research' = 'sales'
): Promise<{ answer: string; source: string; sourceUrl: string | null; confidence: number }> {
  const systemPrompt = meetingType === 'research'
    ? `You are a senior research analyst. Answer using only facts you are genuinely confident about from published literature and established standards. Self-assess your confidence honestly.

Confidence calibration — be precise:
- Major published trial data (KEYNOTE, NEJM, Lancet) or established methodology: 0.80-0.92
- General scientific principle or widely-cited guideline: 0.65-0.80
- Specific paper from 2024 or later: you likely lack reliable data — set confidence 0.25-0.40 and say so explicitly
- Proprietary quantitative thresholds (factor loading percentiles, trading cost benchmarks, HFT parameters): you cannot know these reliably — set confidence 0.30-0.45 and say so explicitly
- Specific institutional protocols, unpublished data, or lab-specific numbers: set confidence 0.20-0.35
- If uncertain whether a specific number is correct: state the range or principle you know, flag uncertainty, set confidence accordingly

Hard rules:
- NEVER invent specific empirical numbers (p-values, effect sizes, rates, thresholds) you don't actually know
- If you cannot give a reliable answer, your answer should say "This requires [specific database/expert/document] — I can provide general context but not a reliable specific figure"
- Always name the source type (e.g. "KEYNOTE-024, NEJM 2016", "FDA CDER IND guidance", "Frazzini and Moskowitz 2012")

Return JSON: { "answer": "3-6 sentences", "source_name": "Source type and citation", "confidence": 0.0-1.0 }`
    : `You are a research analyst. Answer the question with specific, verifiable data points (3-5 sentences). Cite the type of source (e.g. "Gartner 2024 report", "company's public pricing page", "SEC filing") but do NOT invent URLs.

Return JSON: { "answer": "...", "source_name": "Source description" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: meetingType === 'research' ? 0.15 : 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Meeting context:\n${transcriptContext}\n\nQuestion: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    // For research: use the model's self-assessed confidence; for sales: hardcode 0.72
    const rawConf = typeof parsed.confidence === 'number' ? parsed.confidence : 0.72;
    return {
      answer: parsed.answer || '',
      source: parsed.source_name || 'General research',
      sourceUrl: null, // never generate URLs — GPT hallucinates them
      confidence: parsed.answer ? rawConf : 0,
    };
  } catch (err) {
    console.error('Internet gap resolution error:', err);
    return { answer: 'Unable to resolve.', source: 'Error', sourceUrl: null, confidence: 0 };
  }
}

// ── End-of-meeting deliverables ──────────────────────────────────────────────
// Use gpt-4o for research + Q&A — noticeably better synthesis quality.
// Use gpt-4o-mini for action items + slides — less reasoning-heavy.

/**
 * Generate structured research summary. Uses gpt-4o for depth.
 */
export async function generateResearchSummary(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string,
  accountContext = '',
  meetingType: 'sales' | 'research' = 'sales'
): Promise<ResearchElement> {
  const compressed = compressTranscript(transcriptText);
  const evidenceText = evidence
    .map((e) => `[${e.verification.toUpperCase()}] ${e.title}: ${e.summary}\nSource: ${e.attributions.map((a) => a.title).join(', ')}`)
    .join('\n\n');
  const contextLine = accountContext ? `Account context: ${accountContext}\n\n` : '';

  const fallback: ResearchElement = { question: '', answer: 'Unable to generate research summary.', sources: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: meetingType === 'research'
            ? `You are a senior research analyst. Produce a structured summary of what was discussed, discovered, and remains open in this research meeting.

Return JSON:
{
  "question": "The central research question or topic of the meeting",
  "answer": "Substantive 150-250 word synthesis. Use **bold** for key findings, p-values, sample sizes, and named methodologies.",
  "comparisonTable": { "columns": ["Approach", "Pros", "Cons"], "rows": [] },
  "barChart": [{ "label": "Metric", "value": 94, "style": "primary" }],
  "barChartNote": "Source note",
  "keyFinding": { "text": "Most important finding with **bold** emphasis", "source": "Attribution" },
  "sources": ["Source 1", "Source 2"]
}

Rules:
- comparisonTable: only when methodologies, approaches, or datasets were explicitly compared
- barChart: only for real quantitative data mentioned (effect sizes, response rates, p-values)
- keyFinding: the single most important scientific or analytical takeaway
- Answer must be grounded in the transcript — no generic filler`
            : `You are a senior tech sales intelligence analyst. Produce a structured research summary grounded in what was actually discussed.

Return JSON:
{
  "question": "The central question or theme of the meeting",
  "answer": "Substantive 150-250 word answer. Use **bold** for key data points and figures.",
  "comparisonTable": {
    "columns": ["Feature", "Option A", "Option B"],
    "rows": [["Row label", "✓", "✗"]]
  },
  "barChart": [{ "label": "Category", "value": 94, "style": "primary" }],
  "barChartNote": "Source note",
  "keyFinding": { "text": "Key stat with **bold** emphasis", "source": "Attribution" },
  "sources": ["Source 1", "Source 2"]
}

Rules:
- comparisonTable: only if meeting involved comparing products, vendors, or approaches
- barChart: only if there are real quantitative metrics (2-4 bars max)
- keyFinding: only if one finding stands out as most important
- Answer must be grounded in the transcript — no generic filler
- Adapt to whatever the meeting was about`,
        },
        {
          role: 'user',
          content: `${contextLine}Transcript:\n${compressed}\n\nEvidence surfaced during meeting:\n${evidenceText || '(none)'}\n\nInternal documents:\n${docContext || '(none)'}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      question: parsed.question || '',
      answer: parsed.answer || '',
      comparisonTable: parsed.comparisonTable || undefined,
      barChart: Array.isArray(parsed.barChart) ? parsed.barChart : undefined,
      barChartNote: parsed.barChartNote || undefined,
      keyFinding: parsed.keyFinding || undefined,
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };
  } catch (err) {
    console.error('Research summary error:', err);
    return fallback;
  }
}

/**
 * Generate Q&A. Uses gpt-4o for nuanced question anticipation.
 */
export async function generateQAAnswers(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string,
  accountContext = '',
  meetingType: 'sales' | 'research' = 'sales'
): Promise<QAElement> {
  const compressed = compressTranscript(transcriptText);
  const evidenceText = evidence.map((e) => `${e.title}: ${e.summary}`).join('\n');
  const contextLine = accountContext ? `Account context: ${accountContext}\n\n` : '';
  const fallback: QAElement = { categories: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: meetingType === 'research'
            ? `You are a senior research analyst. Generate two types of Q&A from this research meeting:
1. Questions that were ACTUALLY raised during the meeting (with rigorous answers)
2. Questions that should be investigated in the next phase of work

Return JSON:
{
  "categories": [
    {
      "label": "Category (e.g. Methodology, Findings, Data Quality, Next Steps)",
      "items": [
        {
          "tag": "R1",
          "question": "Exact or implied research question",
          "answer": "Precise, evidence-grounded 2-4 sentence answer. **Bold** key figures, p-values, sample sizes.",
          "source": "Source attribution",
          "type": "asked|follow-up"
        }
      ]
    }
  ]
}

Rules:
- 2-3 categories based on research domains discussed
- 2-3 items per category
- Mark items raised in transcript as "asked", items for future investigation as "follow-up"
- Every answer must cite specific data or documents where available`
            : `You are a senior sales strategist. Generate two types of Q&A:
1. Questions the customer ACTUALLY asked during this meeting (with better answers than were given)
2. Questions they are LIKELY to ask in the next follow-up

Return JSON:
{
  "categories": [
    {
      "label": "Category (e.g. Technical, Pricing, Implementation, Objections)",
      "items": [
        {
          "tag": "T1",
          "question": "Exact or likely question",
          "answer": "Confident, specific 2-4 sentence answer. **Bold** key figures.",
          "source": "Source attribution",
          "type": "asked|anticipated"
        }
      ]
    }
  ]
}

Rules:
- 2-3 categories based on what was discussed
- 2-3 items per category
- Mark items from the actual transcript as "asked", anticipated ones as "anticipated"
- Every answer must be specific and citable
- Adapt to the meeting topic — no generic filler`,
        },
        {
          role: 'user',
          content: `${contextLine}Transcript:\n${compressed}\n\nEvidence:\n${evidenceText || '(none)'}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return Array.isArray(parsed.categories) ? { categories: parsed.categories } : fallback;
  } catch (err) {
    console.error('QA generation error:', err);
    return fallback;
  }
}

/**
 * Generate action items. Distinguishes seller vs buyer actions.
 */
export async function generateActionItems(
  transcriptText: string,
  gaps: Array<{ label: string; missingQuestion: string }>,
  docContext: string,
  accountContext = '',
  meetingType: 'sales' | 'research' = 'sales'
): Promise<ActionElement> {
  const compressed = compressTranscript(transcriptText);
  const gapsText = gaps.map((g) => `- ${g.label}: ${g.missingQuestion}`).join('\n');
  const contextLine = accountContext ? `Account context: ${accountContext}\n\n` : '';
  const fallback: ActionElement = { items: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: meetingType === 'research'
            ? `You are a research project manager. Generate specific, owner-assigned next steps from this research meeting.

Return JSON:
{
  "items": [
    {
      "num": "A1",
      "title": "Short action title",
      "owner": "PI|Team|External",
      "description": "2-3 sentences. **Bold** key details, deadlines, and dependencies.",
      "gapTags": ["Open: sample size", "Needs: validation dataset"],
      "intel": {
        "label": "Background",
        "text": "Relevant context for this action",
        "source": "Source"
      }
    }
  ]
}

Rules:
- 3-5 actions only
- owner: "PI" (principal investigator/lead), "Team" (research team), or "External" (collaborators/vendors)
- gapTags: only for items where data or validation is still needed
- Be specific — include named variables, datasets, and timelines mentioned`
            : `You are a sales ops manager. Generate specific, owner-assigned action items from this meeting.

Return JSON:
{
  "items": [
    {
      "num": "A1",
      "title": "Short action title",
      "owner": "Seller|Buyer|Both",
      "description": "2-3 sentences. **Bold** key details.",
      "gapTags": ["Unresolved: pricing", "Needs: technical spec"],
      "intel": {
        "label": "Background intel",
        "text": "Relevant context for this action",
        "source": "Source"
      }
    }
  ]
}

Rules:
- 3-5 actions only
- owner field: "Seller" (rep's team), "Buyer" (prospect's team), or "Both"
- gapTags: only for actions where something is still unresolved
- intel: at most 2 items, only where background context genuinely helps
- Be specific — include names, dates, and amounts mentioned in the transcript`,
        },
        {
          role: 'user',
          content: `${contextLine}Transcript:\n${compressed}\n\nOpen gaps:\n${gapsText || '(none)'}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return Array.isArray(parsed.items) ? { items: parsed.items } : fallback;
  } catch (err) {
    console.error('Action items error:', err);
    return fallback;
  }
}

/**
 * Generate slide deck thumbnails.
 */
export async function generateSlideDeck(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string,
  accountContext = '',
  meetingType: 'sales' | 'research' = 'sales'
): Promise<SlideElement> {
  const compressed = compressTranscript(transcriptText);
  const evidenceText = evidence.map((e) => `${e.title}: ${e.summary}`).join('\n');
  const contextLine = accountContext ? `Account context: ${accountContext}\n\n` : '';
  const fallback: SlideElement = { slides: [], summary: '' };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: meetingType === 'research'
            ? `You are a research communications specialist. Create a concise research summary deck from this meeting.

Return JSON:
{
  "slides": [
    {
      "num": 1,
      "label": "Slide 1 — Topic",
      "title": "Slide headline",
      "bullets": ["Key point 1", "Key point 2", "Key point 3"],
      "chips": [{ "text": "Label", "style": "teal" }],
      "miniChart": [{ "label": "Metric", "value": 94, "style": "primary" }],
      "status": "resolved|pending",
      "pendingNote": null
    }
  ],
  "summary": "One sentence on the research findings these slides represent"
}

Rules:
- 3-5 slides: background, methodology, key findings, open questions, next steps
- bullets: precise — include effect sizes, sample sizes, confidence intervals where mentioned
- miniChart: only for real quantitative data from the discussion
- pending + pendingNote for slides where data or validation is still outstanding`
            : `You are a sales presentation strategist. Create a tight leave-behind deck from this meeting.

Return JSON:
{
  "slides": [
    {
      "num": 1,
      "label": "Slide 1 — Topic",
      "title": "Slide headline",
      "bullets": ["Key point 1", "Key point 2", "Key point 3"],
      "chips": [{ "text": "Label", "style": "teal" }],
      "miniChart": [{ "label": "Metric", "value": 94, "style": "primary" }],
      "status": "resolved|pending",
      "pendingNote": null
    }
  ],
  "summary": "One sentence on what data these slides draw from"
}

Rules:
- 3-5 slides, each covering a distinct topic from the meeting
- chips: teal, blue, or gray only. 1-3 per slide max. Omit if not useful.
- miniChart: max 2 slides, only for real numbers from the conversation
- pending + pendingNote for slides where data still needs to be confirmed`,
        },
        {
          role: 'user',
          content: `${contextLine}Transcript:\n${compressed}\n\nEvidence:\n${evidenceText || '(none)'}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      slides: Array.isArray(parsed.slides) ? parsed.slides : [],
      summary: parsed.summary || '',
    };
  } catch (err) {
    console.error('Slide deck error:', err);
    return fallback;
  }
}

// ── Direct Ambi query response ───────────────────────────────────────────────

/**
 * Detect whether a transcript segment is addressing Ambi directly.
 * Matches "ambi", "amby", "hambi", "hey ambi", etc. (speech-to-text variants).
 */
export function detectAmbiTrigger(text: string): string | null {
  const lower = text.toLowerCase();
  // Must contain an ambi variant AND be a question or request
  const hasAmbi = /\b(ambi|amby|hambi|ambee)\b/.test(lower);
  if (!hasAmbi) return null;

  const isQuestion =
    /[?]/.test(text) ||
    /\b(what|who|where|when|how|why|can you|could you|tell me|find|look up|search|do you know|explain|summarize|compare)\b/.test(lower);

  if (!isQuestion) return null;

  // Extract the question — everything after the ambi reference
  const match = lower.match(/\b(?:ambi|amby|hambi|ambee)\b[,.]?\s*(.*)/);
  const extracted = match?.[1]?.trim();
  return extracted && extracted.length > 4 ? extracted : text.trim();
}

/**
 * Answer a question directed at Ambi.
 * Tier 1: uploaded docs + knowledge base context
 * Tier 2: GPT general knowledge
 * Returns a combined answer with source attribution.
 */
export async function generateDirectAmbiResponse(
  question: string,
  documentContext: string,
  transcriptContext: string,
  meetingType: 'sales' | 'research' = 'sales'
): Promise<{ answer: string; source: string; usedDocs: boolean; confidence: number }> {
  const persona = meetingType === 'research'
    ? 'You are Ambi, a research intelligence assistant in a live meeting.'
    : 'You are Ambi, a sales intelligence assistant in a live meeting.';

  try {
    const hasDocs = documentContext.trim().length > 0;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${persona} Someone in the meeting has asked you a question directly.

Answer it using the provided documents and meeting context first. If they don't cover the question, use your general knowledge to supplement — but clearly distinguish what came from documents vs general knowledge.

Be concise (3-6 sentences). Be specific — cite document names, data points, figures where available.

Return JSON:
{
  "answer": "...",
  "source": "Document name OR 'General knowledge' OR 'Combined: Doc X + general knowledge'",
  "usedDocs": true|false,
  "confidence": 0.0-1.0
}`,
        },
        {
          role: 'user',
          content: `Meeting context:\n${transcriptContext}\n\n${hasDocs ? `Documents:\n${documentContext}\n\n` : ''}Question: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      answer: parsed.answer || 'I was unable to find a confident answer.',
      source: parsed.source || 'Ambi',
      usedDocs: parsed.usedDocs ?? false,
      confidence: parsed.confidence ?? 0.7,
    };
  } catch (err) {
    console.error('Direct Ambi response error:', err);
    return { answer: 'Unable to respond right now.', source: 'Ambi', usedDocs: false, confidence: 0 };
  }
}

/**
 * Generate next live transcript turns for AI Live mode.
 */
export async function generateLiveTranscriptTurns(params: {
  recentTranscript: string;
  participants: string[];
  accountContext: string;
  projectContext: string;
  count?: number;
  meetingType?: 'sales' | 'research';
}): Promise<Array<{ speaker: string; text: string }>> {
  const turnCount = Math.min(Math.max(params.count ?? 2, 1), 3);
  const isResearch = params.meetingType === 'research';

  const systemPrompt = isResearch
    ? 'You generate realistic academic research meeting transcript turns. Participants are researchers (PI, postdoc, grad student, analyst, biostatistician, quant, etc.). Keep each line short and natural. Include specific data references, methodological concerns, replication issues, statistical caveats, and experimental design debates over time. Use field-appropriate terminology. No sales language.'
    : 'You generate realistic meeting transcript turns for a B2B technical sales call. Keep each line short and natural. Alternate between seller and buyer. Include practical objections, pricing, tradeoff, deployment, and proof questions over time.';

  const userPrompt = isResearch
    ? `Create the next ${turnCount} research meeting transcript turns.

Research context: ${params.accountContext}
Project: ${params.projectContext}
Participants: ${params.participants.join(', ')}

Recent transcript:
${params.recentTranscript || '(meeting just started — open with a data update or findings summary)'}

Return JSON: { "turns": [{ "speaker": "Name", "text": "utterance" }] }
Rules: speaker must be a listed participant. 10-35 words per turn. Include specific numbers, p-values, effect sizes, or methodological details where natural. No narration.`
    : `Create the next ${turnCount} transcript turns.

Account: ${params.accountContext}
Project: ${params.projectContext}
Participants: ${params.participants.join(', ')}

Recent transcript:
${params.recentTranscript || '(meeting just started)'}

Return JSON: { "turns": [{ "speaker": "Name", "text": "utterance" }] }
Rules: speaker must be a listed participant. 8-28 words per turn. No narration.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.75,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    if (!Array.isArray(parsed.turns)) return [];
    return parsed.turns
      .map((t: any) => ({ speaker: String(t.speaker), text: String(t.text).trim() }))
      .filter((t: { speaker: string; text: string }) => t.text.length > 0)
      .slice(0, turnCount);
  } catch (err) {
    console.error('Live transcript error:', err);
    return [];
  }
}
