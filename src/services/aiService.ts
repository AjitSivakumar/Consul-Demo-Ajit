import OpenAI from 'openai';
import { InformationNeed, EvidenceCard } from '../types/domain';
import { ResearchElement, QAElement, ActionElement, SlideElement } from '../types/deliverables';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

/** Strip inline markdown citation patterns the search model injects into answer text.
 *  e.g. "8.3 billion. ([worldometers.info](https://...))" → "8.3 billion."
 *  The source URL is already captured separately via annotations.
 */
function stripInlineCitations(text: string): string {
  return text
    .replace(/\s*\(\[[^\]]*\]\(https?:\/\/[^)]+\)\)/g, '') // ([text](url)) with outer parens
    .replace(/\s*\[[^\]]*\]\(https?:\/\/[^)]+\)/g, '')      // [text](url) without outer parens
    .replace(/\s*\(https?:\/\/[^)]+\)/g, '')                 // bare (url)
    .replace(/\?utm_source=openai/g, '')                     // strip openai UTM tags
    .trim();
}

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
  const contextBlock = buildContextBlock(ctx);
  const userContent = `${contextBlock}\n\nRecent conversation:\n${ctx.recentTranscript}\n\nLatest segment:\n${latestSegment}`;

  function mapNeeds(needs: any[]): InformationNeed[] {
    return needs.map((need: any, idx: number) => ({
      id: `need-ai-${Date.now()}-${idx}`,
      category: need.category || 'claim',
      prompt: need.prompt || '',
      rationale: need.rationale || '',
      triggerPhrase: need.triggerPhrase || undefined,
      triggeredBySegmentId: `segment-${Date.now()}`,
      confidence: need.confidence ?? 0.7,
      priority: 'p1' as const,
      status: 'new' as const,
    }));
  }

  // ── Sales mode: single pass, strict ─────────────────────────────────────
  if (ctx.meetingType !== 'research') {
    try {
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
          { role: 'user', content: userContent },
        ],
      });
      const parsed = JSON.parse(response.choices[0].message.content || '{}');
      return Array.isArray(parsed.needs) ? mapNeeds(parsed.needs) : [];
    } catch (err) {
      console.error('AI inference error:', err);
      return [];
    }
  }

  // ── Research mode: two-tier pass ─────────────────────────────────────────
  // Tier 1: specific numeric/methodological claims (high confidence bar)
  // Tier 2 fallback: broader analytical claims when Tier 1 fires nothing
  try {
    const tier1Response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a real-time research copilot. Surface ONE high-value question the team should verify RIGHT NOW — something anchored to a specific, verifiable claim in the latest segment.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need:
{
  "category": "hypothesis|methodology|contradiction|correction|metric|open_question",
  "prompt": "Specific, answerable question — include the exact claim, number, or entity from the conversation",
  "priority": "p1",
  "confidence": 0.70-1.0,
  "rationale": "One sentence: the concrete risk if this isn't checked",
  "triggerPhrase": "exact 2-5 word phrase from the latest segment"
}

Tier 1 targets (fire when any of these are present):
- contradiction: a specific number or named result that conflicts with a published benchmark
- methodology: a statistical or experimental flaw actively being committed
- metric: a key figure cited without the benchmark or CI needed to interpret it
- open_question: an unresolved factual question with a known, findable answer
- hypothesis: a causal or mechanistic claim asserted as established fact without citation

Hard rules:
- 0 or 1 needs only
- Prompt must be answerable from published literature or established data sources
- confidence >= 0.70
- Skip: logistics, scheduling, pure opinion, already-surfaced topics`,
        },
        { role: 'user', content: userContent },
      ],
    });

    const tier1Parsed = JSON.parse(tier1Response.choices[0].message.content || '{}');
    const tier1Needs = Array.isArray(tier1Parsed.needs) ? tier1Parsed.needs : [];

    if (tier1Needs.length > 0) {
      return mapNeeds(tier1Needs);
    }

    // Tier 2: fallback for general analytical conversation with no sharp numeric claims
    const tier2Response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a real-time research copilot for a general analytical discussion. The conversation doesn't contain a sharp numeric claim right now — but a senior researcher might still want to verify or deepen something.

Surface ONE question ONLY if it would meaningfully improve understanding of the current topic. This is a softer bar than the primary pass.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need:
{
  "category": "hypothesis|methodology|open_question|comparison",
  "prompt": "A specific, answerable question grounded in the current discussion — not a generic 'what is X?' but something that adds a dimension the team hasn't addressed",
  "priority": "p1",
  "confidence": 0.55-0.70,
  "rationale": "One sentence: what analytical gap this fills",
  "triggerPhrase": "exact 2-5 word phrase from the latest segment"
}

Good fallback targets:
- A comparative baseline the team is implicitly assuming but hasn't verified (e.g. "compared to what?" for a trend claim)
- A confounding variable or alternative explanation not yet mentioned
- A well-known dataset or study that directly covers what's being discussed
- A definitional ambiguity that would change the interpretation if resolved differently

Hard rules:
- 0 or 1 needs only
- Do NOT fire on: pure opinion, logistics, scheduling, turns that are just questions with no analytical claim
- Do NOT repeat anything in the Already surfaced list
- If nothing meaningful can be added, return { "needs": [] }
- confidence must be >= 0.55`,
        },
        { role: 'user', content: userContent },
      ],
    });

    const tier2Parsed = JSON.parse(tier2Response.choices[0].message.content || '{}');
    const tier2Needs = Array.isArray(tier2Parsed.needs) ? tier2Parsed.needs : [];
    return mapNeeds(tier2Needs);

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

// ── Rich visual enrichment ───────────────────────────────────────────────────

type RichOutput = Pick<import('../types/domain').EvidenceCard,
  'richChart' | 'richMetricGrid' | 'richCorrectionBlock' | 'richFlowDiagram'>;

/**
 * Strip opening disclaimers about visual content that search/chat models emit.
 * e.g. "I don't have the capability to generate charts. However, I can provide..."
 * These confuse the enrichment model into thinking there's no data in the answer.
 */
function stripVisualizationDisclaimers(text: string): string {
  return text
    .replace(/I (don't|do not|cannot|can't) have the (capability|ability) to (generate|create|make|produce|render) (visual content|charts?|graphs?|line charts?|bar charts?|visuali[sz]ations?)[^.]*\.\s*/gi, '')
    .replace(/However,\s*I can provide you with (the )?[^.]+data[^.]*\.\s*/gi, '')
    .replace(/You can use (this|the) data to (create|make|generate|build) [^.]+\.\s*/gi, '')
    .trim();
}

/**
 * Detect if a question is asking for a chart, graph, or time-series visual.
 * Covers explicit requests ("chart", "graph") and natural language patterns
 * ("track X over Y", "how has X changed", "trends", "quarter over quarter").
 */
export function isVisualizationRequest(question: string): boolean {
  return /\b(chart|graph|plot|visuali[sz]e|visuali[sz]ation|line chart|bar chart|trends?|over time|over the (last|past)\s+\d+|timeline|compar(e|ison)|track(ing)?|progression|historically|(quarter|month|year|week)[- ]over[- ](quarter|month|year|week))\b/i.test(question)
    || /how (has|have|did).{0,40}change/i.test(question)
    || /show.{0,20}(how|what).{0,20}(change|evolv|grow|declin|drop|rise|increas|decreas)/i.test(question);
}

/**
 * Analyze a Q&A pair and choose the best visual format (metric_grid, chart,
 * correction, flow, or none). Returns partial RichOutput to spread onto EvidenceCard.
 * Never throws — returns {} on any error.
 *
 * @param hint - Pass 'chart' when the user explicitly requested a chart/graph,
 *               biasing the model to choose chart over none.
 */
export async function enrichResolutionOutput(
  question: string,
  answer: string,
  hint?: 'chart' | 'metric_grid' | 'comparison'
): Promise<Partial<RichOutput>> {
  // Skip enrichment for short answers unless a visualization was explicitly requested
  if (answer.length < 100 && !hint) return {};

  // Strip opening disclaimers before analysis — they confuse the enrichment model
  const cleanAnswer = stripVisualizationDisclaimers(answer);

  const hintInstruction = hint === 'chart'
    ? '\n\nIMPORTANT: The user explicitly asked for a chart or graph. If the answer contains any table or numeric time-series data, you MUST use "chart". Extract ALL data points and ALL series from the answer — do not omit columns.'
    : hint === 'metric_grid'
    ? '\n\nIMPORTANT: The user asked for a metric comparison. If the answer contains named numeric values, use "metric_grid".'
    : hint === 'comparison'
    ? '\n\nIMPORTANT: The user asked for a comparison. Use "correction" if there is a clear wrong/right framing, otherwise "metric_grid" if there are comparable numbers.'
    : '';

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 1600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You analyze a Q&A pair and decide if a visual format would genuinely improve comprehension. Default to "none" unless the answer clearly contains structured data that benefits from visualization.

WHEN TO USE EACH FORMAT:
metric_grid: ONLY when the answer explicitly contains 3+ distinct named numeric metrics (percentages, dollar values, rates, counts) that are meaningfully comparable AND each one is the primary subject of its own sentence or bullet. Do NOT use metric_grid for numbers incidentally mentioned mid-sentence (e.g. "47 patients, which is 52% of target" = 1 metric, not 2). Each metric needs label, value, and sub.
chart: Use when the answer contains a table or time-series data with actual numbers. For multi-column tables (e.g. 5 countries over 10 years), create one dataset per column with the row headers as labels array. Extract ALL numbers — never invent. Set chartType to "line" for time series, "bar" for categories.
correction: ONLY when the answer directly contradicts a stated or obvious misconception with a clear wrong/right split.
flow: ONLY when the answer describes a clear sequential process with 3-6 discrete named steps.
none: Use for factual paragraphs, definitions, single-stat answers, opinions, or anything without structured data.

For chart with multiple series, the JSON structure is:
{
  "format": "chart",
  "chart": {
    "labels": ["Year1", "Year2", ...],
    "datasets": [
      {"label": "Series A", "data": [n1, n2, ...], "color": "#hex"},
      {"label": "Series B", "data": [n1, n2, ...], "color": "#hex"}
    ],
    "chartType": "line",
    "yAxisLabel": "Unit label",
    "note": "Source note"
  }
}

When in doubt, use none. Return JSON with "format" key and matching data key only if format is not "none".${hintInstruction}`,
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nAnswer: ${cleanAnswer}`,
        },
      ],
    });

    const raw = response.choices[0].message.content;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const format: string = parsed.format ?? 'none';

    if (format === 'metric_grid' && parsed.metric_grid) {
      const mg = parsed.metric_grid;
      return {
        richMetricGrid: {
          metrics: Array.isArray(mg.metrics) ? mg.metrics : [],
          insightText: mg.insightText,
        },
      };
    }

    if (format === 'chart' && parsed.chart) {
      const ch = parsed.chart;
      const CHART_COLORS = ['#c084fc', '#60a5fa', '#4ade80', '#eab308'];
      const datasets = Array.isArray(ch.datasets)
        ? ch.datasets.map((ds: any, idx: number) => ({
            label: ds.label ?? '',
            data: Array.isArray(ds.data) ? ds.data : [],
            color: ds.color ?? CHART_COLORS[idx % CHART_COLORS.length],
            dashed: ds.dashed,
          }))
        : [];
      return {
        richChart: {
          labels: Array.isArray(ch.labels) ? ch.labels : [],
          datasets,
          note: ch.note ?? '',
          chartType: ch.chartType ?? 'bar',
          yAxisLabel: ch.yAxisLabel,
        },
      };
    }

    if (format === 'correction' && parsed.correction) {
      const cb = parsed.correction;
      return {
        richCorrectionBlock: {
          wrong: {
            label: '❌ Common assumption',
            text: cb.wrong?.text ?? cb.wrong ?? '',
          },
          right: {
            label: '✓ What the data shows',
            text: cb.right?.text ?? cb.right ?? '',
          },
          reframe: cb.reframe,
        },
      };
    }

    if (format === 'flow' && parsed.flow) {
      const fl = parsed.flow;
      const rawNodes: any[] = Array.isArray(fl.nodes) ? fl.nodes : [];
      const nodes = rawNodes.map((n: any, idx: number) => ({
        id: n.id ?? `n${idx + 1}`,
        label: n.label ?? '',
        sub: n.sub,
        kind: (idx === 0 ? 'start' : idx === rawNodes.length - 1 ? 'end' : 'default') as
          'start' | 'end' | 'default',
        color: n.color,
      }));
      return {
        richFlowDiagram: {
          chips: [],
          note: fl.note,
          nodes,
        },
      };
    }

    return {};
  } catch (err) {
    console.error('enrichResolutionOutput error:', err);
    return {};
  }
}

/**
 * Answer a gap from uploaded or indexed documents.
 */
export async function resolveGapFromDocuments(
  question: string,
  documentContext: string
): Promise<{ answer: string; source: string; confidence: number; rich?: Partial<RichOutput> }> {
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
    const found = !!parsed.found;
    const answer = parsed.answer || 'Not found in documents.';
    const confidence = found ? (parsed.confidence ?? 0.85) : 0.1;
    const rich = found ? await enrichResolutionOutput(question, answer) : {};
    return {
      answer,
      source: parsed.source_document || 'Internal documents',
      confidence,
      rich,
    };
  } catch (err) {
    console.error('Document gap resolution error:', err);
    return { answer: 'Unable to resolve — API error.', source: 'Error', confidence: 0 };
  }
}

/**
 * Answer a gap using real web search (gpt-4o-mini-search-preview via chat completions).
 * Returns actual source URLs from the message annotations.
 */
export async function resolveGapFromInternet(
  question: string,
  transcriptContext: string,
  meetingType: 'sales' | 'research' = 'sales'
): Promise<{ answer: string; source: string; sourceUrl: string | null; confidence: number; rich?: Partial<RichOutput>; citations?: { title: string; url: string }[]; provenance?: 'model_inference' | 'web_search' }> {
  const visualNote = `

IMPORTANT — Visual rendering: This interface renders charts and tables automatically from your text output.
- If the question asks for a chart, graph, trend, or comparison: provide the data as a markdown table (columns = series, rows = time periods or categories). Do NOT say "I cannot generate charts" — just provide the table and the interface will render it.
- Do NOT add disclaimers like "I don't have the capability to generate visual content."`;

  const systemPrompt = meetingType === 'research'
    ? `You are a senior research analyst. Search the web and answer using published literature, trial registries, and established standards. Be precise about what the search results actually say.

Hard rules:
- NEVER invent specific empirical numbers not present in the search results
- If search results lack a specific figure, say "Search results don't confirm a specific number — [general context from results]"
- Always cite the actual source found (publication name, trial registry, organization)
- For very recent or proprietary data not in search results, say so explicitly${visualNote}`
    : `You are a research analyst. Search the web and answer the question with specific, verifiable data points (3-5 sentences). Cite the actual sources found.${visualNote}`;

  try {
    // gpt-4o-mini-search-preview supports web_search_options via chat completions —
    // same endpoint, same CORS headers, works in the browser with dangerouslyAllowBrowser
    const response = await (client.chat.completions.create as any)({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Meeting context:\n${transcriptContext}\n\nQuestion: ${question}` },
      ],
    });

    const choice = response.choices?.[0];
    const rawAnswer: string = choice?.message?.content ?? '';

    if (!rawAnswer) throw new Error('Empty response from search model');

    const answerText = stripInlineCitations(rawAnswer);

    // Extract URL citation from annotations if present
    const annotations: any[] = choice?.message?.annotations ?? [];
    const firstCitation = annotations.find((a: any) => a.type === 'url_citation');
    const sourceUrl: string | null = firstCitation?.url ?? null;
    const sourceName: string = firstCitation?.title ?? 'Web search';

    const citations = annotations
      .filter((a: any) => a.type === 'url_citation' && a.url)
      .map((a: any) => ({ title: a.title ?? a.url, url: a.url }));
    const confidence = meetingType === 'research' ? 0.78 : 0.82;
    const rich = await enrichResolutionOutput(question, answerText);
    return { answer: answerText, source: sourceName, sourceUrl, confidence, rich, citations, provenance: 'web_search' };

  } catch (err) {
    console.error('Web search error, falling back to GPT knowledge:', err);
    try {
      const fallbackPrompt = meetingType === 'research'
        ? `You are a senior research analyst. Answer using only facts you are genuinely confident about. NEVER invent specific empirical numbers. If uncertain, state the general principle and flag it.`
        : `You are a research analyst. Answer with specific, verifiable data points (3-5 sentences). Do not invent URLs or statistics.`;

      const fallback = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: meetingType === 'research' ? 0.15 : 0.3,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: fallbackPrompt },
          { role: 'user', content: `Meeting context:\n${transcriptContext}\n\nQuestion: ${question}` },
        ],
      });
      const answer = fallback.choices[0].message.content ?? '';
      const rich = await enrichResolutionOutput(question, answer);
      return {
        answer,
        source: 'GPT knowledge (web search unavailable)',
        sourceUrl: null,
        confidence: meetingType === 'research' ? 0.55 : 0.65,
        rich,
        citations: [],
        provenance: 'model_inference',
      };
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
      return { answer: 'Unable to resolve.', source: 'Error', sourceUrl: null, confidence: 0, citations: [], provenance: 'model_inference' };
    }
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
  const hasAmbi = /\b(ambi|amby|hambi|ambee|mb)\b/.test(lower);
  if (!hasAmbi) return null;

  const isQuestion =
    /[?]/.test(text) ||
    /\b(what|who|where|when|how|why|can you|could you|tell me|find|look up|search|do you know|explain|summarize|compare)\b/.test(lower);

  if (!isQuestion) return null;

  // Extract the question — everything after the ambi reference
  const match = lower.match(/\b(?:ambi|amby|hambi|ambee|mb)\b[,.]?\s*(.*)/);
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
): Promise<{ answer: string; source: string; usedDocs: boolean; confidence: number; rich?: Partial<RichOutput> }> {
  const hasDocs = documentContext.trim().length > 0;
  if (!hasDocs) {
    return { answer: '', source: '', usedDocs: false, confidence: 0 };
  }

  const persona = meetingType === 'research'
    ? 'You are Ambi, a research intelligence assistant in a live meeting.'
    : 'You are Ambi, a sales intelligence assistant in a live meeting.';

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${persona} Someone in the meeting has asked you a question directly.

Answer using ONLY the provided documents. Do NOT use general knowledge or training data to fill gaps.

Rules:
- Quote specific numbers, dates, and figures verbatim from the documents
- Name the exact document you found the answer in
- If the documents do not contain a clear answer, set found: false and confidence below 0.5
- Never invent information not present in the documents

Return JSON:
{
  "found": true|false,
  "answer": "...",
  "source": "Exact document name",
  "usedDocs": true,
  "confidence": 0.0-1.0
}`,
        },
        {
          role: 'user',
          content: `Meeting context:\n${transcriptContext}\n\nDocuments:\n${documentContext}\n\nQuestion: ${question}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    if (!parsed.found) {
      return { answer: '', source: '', usedDocs: false, confidence: 0 };
    }
    const answer = parsed.answer || '';
    const rich = await enrichResolutionOutput(question, answer);
    return {
      answer,
      source: parsed.source || 'Internal documents',
      usedDocs: true,
      confidence: parsed.confidence ?? 0.8,
      rich,
    };
  } catch (err) {
    console.error('Direct Ambi response error:', err);
    return { answer: '', source: '', usedDocs: false, confidence: 0 };
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
