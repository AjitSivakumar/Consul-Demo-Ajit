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
          content: `You are a deal intelligence engine for B2B sales. Your job is to catch ONLY the gaps that could directly lose a deal.

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
  category: 'comparison' | 'risk' | 'pricing' | 'objection' | 'claim' | 'decision' | 'metric';
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
          content: `You are a real-time sales copilot. Surface a suggestion ONLY if it would give the rep a concrete, immediate advantage right now.

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
  transcriptContext: string
): Promise<{ answer: string; source: string; sourceUrl: string | null; confidence: number }> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a research analyst. Answer the question with specific, verifiable data points (3-5 sentences). Cite the type of source (e.g. "Gartner 2024 report", "company's public pricing page", "SEC filing") but do NOT invent URLs.

Return JSON: { "answer": "...", "source_name": "Source description" }`,
        },
        {
          role: 'user',
          content: `Meeting context:\n${transcriptContext}\n\nQuestion: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return {
      answer: parsed.answer || '',
      source: parsed.source_name || 'General research',
      sourceUrl: null, // never generate URLs — GPT hallucinates them
      confidence: parsed.answer ? 0.72 : 0,
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
  accountContext = ''
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
          content: `You are a senior tech sales intelligence analyst. Produce a structured research summary grounded in what was actually discussed.

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
  accountContext = ''
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
          content: `You are a senior sales strategist. Generate two types of Q&A:
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
  accountContext = ''
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
          content: `You are a sales ops manager. Generate specific, owner-assigned action items from this meeting.

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
  accountContext = ''
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
          content: `You are a sales presentation strategist. Create a tight leave-behind deck from this meeting.

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

/**
 * Generate next live transcript turns for AI Live mode.
 */
export async function generateLiveTranscriptTurns(params: {
  recentTranscript: string;
  participants: string[];
  accountContext: string;
  projectContext: string;
  count?: number;
}): Promise<Array<{ speaker: string; text: string }>> {
  const turnCount = Math.min(Math.max(params.count ?? 2, 1), 3);

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.75,
      max_tokens: 450,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You generate realistic meeting transcript turns for a B2B technical sales call. Keep each line short and natural. Alternate between seller and buyer. Include practical objections, pricing, tradeoff, deployment, and proof questions over time.',
        },
        {
          role: 'user',
          content: `Create the next ${turnCount} transcript turns.

Account: ${params.accountContext}
Project: ${params.projectContext}
Participants: ${params.participants.join(', ')}

Recent transcript:
${params.recentTranscript || '(meeting just started)'}

Return JSON: { "turns": [{ "speaker": "Name", "text": "utterance" }] }
Rules: speaker must be a listed participant. 8-28 words per turn. No narration.`,
        },
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
