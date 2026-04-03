import OpenAI from 'openai';
import { InformationNeed, EvidenceCard } from '../types/domain';
import { ResearchElement, QAElement, ActionElement, SlideElement } from '../types/deliverables';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

const client = new OpenAI({
  apiKey,
  dangerouslyAllowBrowser: true, // For demo only — use backend in production
});

/**
 * Extract information needs from a transcript segment using LLM
 */
export async function inferNeedsWithAI(
  transcript: string,
  previousContext: string
): Promise<InformationNeed[]> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `You are a selective meeting intelligence assistant for tech sales. Only surface truly important information gaps — things the sales team MUST research to succeed.

Meeting context so far:
${previousContext}

Latest transcript segment:
${transcript}

Identify 0-2 HIGH-VALUE information needs from this segment. Apply strict criteria:
- Only flag gaps where missing information could lose the deal or significantly hurt the conversation
- Skip generic themes, small talk, or topics already covered
- Prefer p1 (critical) and p2 (important) — never return p3 items
- Confidence must be >= 0.6 — if you're unsure it's a real gap, don't include it

Return as JSON:
{
  "needs": [
    {
      "category": "comparison|risk|pricing|objection|claim|decision",
      "prompt": "What specific information should be researched?",
      "priority": "p1|p2",
      "confidence": 0.6-1.0,
      "rationale": "Why this matters for the deal"
    }
  ]
}

If nothing critical, return {"needs": []}.`,
        },
      ],
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    return Array.isArray(parsed.needs)
      ? parsed.needs.map((need: any, idx: number) => ({
          id: `need-ai-${Date.now()}-${idx}`,
          category: need.category || 'claim',
          prompt: need.prompt || '',
          rationale: need.rationale || '',
          triggeredBySegmentId: `segment-${Date.now()}`,
          confidence: need.confidence ?? 0.7,
          priority: need.priority || 'p2',
          status: 'new' as const,
        }))
      : [];
  } catch (err) {
    console.error('AI inference error:', err);
    return [];
  }
}

/**
 * Generate a structured research summary from transcript + evidence
 */
export async function generateResearchSummary(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string
): Promise<ResearchElement> {
  const evidenceText = evidence
    .map(
      (e) =>
        `[${e.verification.toUpperCase()}] ${e.title}: ${e.summary}\nSource: ${e.attributions.map((a) => a.title).join(', ')}`
    )
    .join('\n\n');

  const fallback: ResearchElement = { question: '', answer: 'Unable to generate research summary.', sources: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a tech sales intelligence analyst. Given a meeting transcript and evidence, produce a structured research summary.

Return JSON with this exact shape:
{
  "question": "The key question surfaced during the meeting",
  "answer": "Full-form answer (150-250 words). Bold key phrases with **bold**.",
  "comparisonTable": {
    "columns": ["Feature", "Product A", "Product B"],
    "rows": [["Voice calls", "✓", "✗"], ["Photo upload", "✗", "✓"]]
  },
  "barChart": [
    { "label": "Category A", "value": 94, "style": "primary" },
    { "label": "Category B", "value": 71, "style": "muted" }
  ],
  "barChartNote": "Source note for the chart data",
  "keyFinding": {
    "text": "Key statistic or finding with **bold** emphasis on numbers",
    "source": "Data source attribution"
  },
  "sources": ["Source name 1", "Source name 2"]
}

Rules:
- comparisonTable: Generate if the conversation involves comparing two or more products/options/approaches. Use ✓ and ✗ for boolean features. Omit if no comparison exists.
- barChart: Generate 2-4 bars if there are quantitative metrics to visualize (rates, percentages, counts). Omit if no numeric data.
- keyFinding: Generate if there is a notable statistic or conclusion worth highlighting. Omit if nothing stands out.
- sources: Always include at least one source. These can be "Meeting transcript", "Internal product documentation", etc.
- Adapt entirely to whatever the meeting was about — do NOT assume any specific products or topics.`
        },
        {
          role: 'user',
          content: `Meeting transcript:\n${transcriptText}\n\nSupporting evidence:\n${evidenceText}\n\nUploaded documents context:\n${docContext || '(none)'}`,
        },
      ],
    });

    const content = response.choices[0].message.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content);
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
    console.error('Research summary generation error:', err);
    return fallback;
  }
}

/**
 * Generate structured Q&A grouped by category
 */
export async function generateQAAnswers(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string
): Promise<QAElement> {
  const evidenceText = evidence.map((e) => `${e.title}: ${e.summary}`).join('\n');
  const fallback: QAElement = { categories: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a tech sales expert. Based on a meeting transcript, generate proactive questions the customer is likely to ask in the next follow-up call, with prepared answers.

Return JSON:
{
  "categories": [
    {
      "label": "Category name (e.g. Technical, Pricing, Implementation)",
      "items": [
        {
          "tag": "T1",
          "question": "Specific question the customer might ask",
          "answer": "Confident, data-backed answer (2-4 sentences). Use **bold** for key figures.",
          "source": "Source attribution for the answer data"
        }
      ]
    }
  ]
}

Rules:
- Generate 2-3 categories based on what was discussed (tech, pricing, implementation, timeline, etc.)
- 2-3 questions per category
- Tags: Use first letter of category + number (T1, T2, P1, P2, etc.)
- Each answer must cite a source
- Adapt entirely to the meeting topic — do NOT assume specific products`
        },
        {
          role: 'user',
          content: `Meeting transcript:\n${transcriptText}\n\nEvidence:\n${evidenceText}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.categories)) return fallback;
    return { categories: parsed.categories };
  } catch (err) {
    console.error('QA generation error:', err);
    return fallback;
  }
}

/**
 * Generate structured action items with gap tags and intel blocks
 */
export async function generateActionItems(
  transcriptText: string,
  gaps: Array<{ label: string; missingQuestion: string }>,
  docContext: string
): Promise<ActionElement> {
  const gapsText = gaps.map((g) => `- ${g.label}: ${g.missingQuestion}`).join('\n');
  const fallback: ActionElement = { items: [] };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sales operations manager. Generate specific action items from a meeting transcript.

Return JSON:
{
  "items": [
    {
      "num": "A1",
      "title": "Short action title",
      "description": "2-3 sentence description. Use **bold** for emphasis.",
      "gapTags": ["Tag describing what needs to be resolved"],
      "intel": {
        "label": "Client intelligence (auto-surfaced)",
        "text": "Background intel relevant to this action item",
        "source": "Source: external web research or internal docs"
      }
    }
  ]
}

Rules:
- Generate 3-5 action items
- gapTags: short pill labels for what's unresolved (e.g. "Pricing confirmation", "Client history"). Omit if not applicable.
- intel: Include for at most 1-2 items where external research would help. Omit for others.
- Adapt entirely to the meeting topic`
        },
        {
          role: 'user',
          content: `Meeting transcript:\n${transcriptText}\n\nOpen gaps:\n${gapsText || '(none identified)'}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.items)) return fallback;
    return { items: parsed.items };
  } catch (err) {
    console.error('Action item generation error:', err);
    return fallback;
  }
}

/**
 * Generate slide deck thumbnails from meeting content
 */
export async function generateSlideDeck(
  transcriptText: string,
  evidence: EvidenceCard[],
  docContext: string
): Promise<SlideElement> {
  const evidenceText = evidence.map((e) => `${e.title}: ${e.summary}`).join('\n');
  const fallback: SlideElement = { slides: [], summary: '' };

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sales presentation strategist. Based on the meeting discussion, generate a concise leave-behind slide deck.

Return JSON:
{
  "slides": [
    {
      "num": 1,
      "label": "Slide 1 — Topic",
      "title": "Slide headline",
      "bullets": ["Key point 1", "Key point 2"],
      "chips": [
        { "text": "Label text", "style": "teal" },
        { "text": "Label text", "style": "blue" }
      ],
      "miniChart": [
        { "label": "Metric A", "value": 94, "style": "primary" },
        { "label": "Metric B", "value": 71, "style": "muted" }
      ],
      "status": "resolved",
      "pendingNote": null
    }
  ],
  "summary": "Brief note about what data these slides draw from"
}

Rules:
- Generate 3-5 slides
- chips: 1-3 short colored chips per slide. Style is teal, blue, or gray. Omit if not needed.
- miniChart: Include on at most 1-2 slides where quantitative comparison aids understanding. Omit otherwise.
- status: "resolved" if all data is available, "pending" if the analyst needs to fill in data (e.g. pricing).
- pendingNote: Only for "pending" slides — describe what's needed.
- Adapt to whatever the meeting was about`
        },
        {
          role: 'user',
          content: `Meeting transcript:\n${transcriptText}\n\nEvidence:\n${evidenceText}\n\nDocuments:\n${docContext || '(none)'}`,
        },
      ],
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    return {
      slides: Array.isArray(parsed.slides) ? parsed.slides : [],
      summary: parsed.summary || '',
    };
  } catch (err) {
    console.error('Slide deck generation error:', err);
    return fallback;
  }
}

/**
 * Generate the next few transcript turns for live in-meeting streaming.
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
          content:
            'You generate realistic meeting transcript turns for a B2B technical sales call. Keep each line short and natural. Include practical objections, pricing, tradeoff, deployment, and proof questions over time.',
        },
        {
          role: 'user',
          content: `Create the next ${turnCount} transcript turns for this meeting.

Account: ${params.accountContext}
Project: ${params.projectContext}
Participants: ${params.participants.join(', ')}

Recent transcript context:
${params.recentTranscript || '(meeting just started)'}

Return JSON:
{
  "turns": [
    { "speaker": "Participant Name", "text": "single utterance" }
  ]
}

Rules:
- Speaker must be one of the listed participants.
- Each text must be 8-28 words.
- No narration, only spoken lines.
- Avoid repeating prior wording.
`,
        },
      ],
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed.turns)) {
      return [];
    }

    return parsed.turns
      .map((turn: any) => ({
        speaker: typeof turn.speaker === 'string' ? turn.speaker : params.participants[0] || 'Participant',
        text: typeof turn.text === 'string' ? turn.text.trim() : '',
      }))
      .filter((turn: { speaker: string; text: string }) => turn.text.length > 0)
      .slice(0, turnCount);
  } catch (err) {
    console.error('Live transcript generation error:', err);
    return [];
  }
}

/**
 * Generate ambient suggestions for real-time panel
 */
export interface ProactiveSuggestion {
  headline: string;
  prompt: string;
  rationale: string;
  category: 'comparison' | 'risk' | 'pricing' | 'objection' | 'claim' | 'decision' | 'metric';
}

export async function generateAmbientSuggestion(
  transcript: string,
  previousHeadlines: string[]
): Promise<ProactiveSuggestion | null> {
  try {
    const prevContext =
      previousHeadlines.length > 0
        ? `\n\nAlready surfaced (avoid repeating these topics):\n${previousHeadlines.slice(-3).join('\n')}`
        : '';

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a real-time meeting assistant. Identify ONE piece of information that would be genuinely useful to surface right now — a specific stat, factual correction, comparison, or answer to an implied question. It must be concrete and researchable. If nothing is worth surfacing, return {"skip": true}.',
        },
        {
          role: 'user',
          content: `Latest transcript segment:
${transcript}${prevContext}

Return JSON with exactly these fields (or {"skip": true} if nothing worth surfacing):
{
  "headline": "short card title (max 8 words)",
  "prompt": "specific question to research and answer for the team",
  "rationale": "one sentence: why this is useful right now",
  "category": "comparison|risk|pricing|objection|claim|decision|metric"
}`,
        },
      ],
    });

    const content = (response.choices[0].message.content || '').trim();
    const parsed = JSON.parse(content);
    if (parsed.skip || !parsed.headline || !parsed.prompt) return null;
    return parsed as ProactiveSuggestion;
  } catch (err) {
    console.error('Ambient suggestion error:', err);
    return null;
  }
}

/**
 * Resolve an information gap via internet research (GPT knowledge)
 */
export async function resolveGapFromInternet(
  question: string,
  transcriptContext: string
): Promise<{ answer: string; source: string; confidence: number }> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'You are a research analyst. Provide a concise, factual answer using your knowledge. Include specific data points, numbers, or comparisons where possible. If uncertain, indicate that. Keep the answer to 2-5 sentences.',
        },
        {
          role: 'user',
          content: `Meeting context:\n${transcriptContext}\n\nResearch question:\n${question}`,
        },
      ],
    });

    const answer = (response.choices[0].message.content || '').trim();
    return { answer, source: 'Internet research (AI)', confidence: answer ? 0.75 : 0 };
  } catch (err) {
    console.error('Internet gap resolution error:', err);
    return { answer: 'Unable to resolve — API error.', source: 'Error', confidence: 0 };
  }
}

/**
 * Resolve an information gap by deep-searching uploaded documents.
 * Expects pre-retrieved relevant chunks with source attribution.
 */
export async function resolveGapFromDocuments(
  question: string,
  documentContext: string
): Promise<{ answer: string; source: string; confidence: number }> {
  if (!documentContext.trim()) {
    return { answer: 'No documents uploaded to search.', source: 'No documents', confidence: 0 };
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a precise document analyst for a sales meeting copilot. Your job is to find the EXACT answer to a question using ONLY the provided document excerpts.

Rules:
- Quote specific numbers, percentages, prices, and facts from the documents
- Name the exact document you found the data in
- If multiple documents contribute, synthesize and cite each
- If the documents do not contain a clear answer, set found to false
- Be detailed (3-6 sentences) and include all relevant data points

Return JSON: { "found": true/false, "answer": "...", "source_document": "filename", "confidence": 0.0-1.0 }`,
        },
        {
          role: 'user',
          content: `Document excerpts:\n${documentContext}\n\nQuestion to answer from these documents:\n${question}`,
        },
      ],
    });

    const raw = (response.choices[0].message.content || '').trim();
    try {
      const parsed = JSON.parse(raw);
      return {
        answer: parsed.answer || raw,
        source: parsed.source_document || 'Uploaded documents',
        confidence: parsed.found ? (parsed.confidence ?? 0.85) : 0.1,
      };
    } catch {
      // Fallback: treat as plain text answer
      const notFound = raw.toLowerCase().includes('not found');
      return {
        answer: raw,
        source: notFound ? 'Not in documents' : 'Uploaded documents',
        confidence: notFound ? 0.1 : 0.85,
      };
    }
  } catch (err) {
    console.error('Document gap resolution error:', err);
    return { answer: 'Unable to resolve — API error.', source: 'Error', confidence: 0 };
  }
}
