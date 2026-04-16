/**
 * Ambi Pipeline Backtest — Population Trends (Research Mode)
 * ──────────────────────────────────────────────────────────
 * Baseline evaluation for a general research conversation about world population
 * trends over the last 40 years. Tests all pipeline stages under research mode:
 *
 *   P1 — inferNeedsWithAI    : gap detection quality + category accuracy
 *   P2 — generateAmbientSuggestion : proactive insight relevance + specificity
 *   P3 — resolveGapFromInternet    : answer completeness + citation quality
 *   P4 — enrichResolutionOutput    : rich format selection + chart extraction
 *   P5 — vizHint routing           : does the pipeline correctly flag viz queries?
 *   P6 — direct Ambi queries       : end-to-end for conversational requests
 *
 * Run:  node scripts/backtest-population.mjs
 * Writes: scripts/backtest-population-results.json
 */

import OpenAI from 'openai';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = [join(__dirname, '..', '.env.local'), join(__dirname, '..', '.env')].find(existsSync);
  if (!p) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const client = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY });
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { process.stdout.write(msg + '\n'); }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (mirrors aiService.ts production code)
// ─────────────────────────────────────────────────────────────────────────────

function isVisualizationRequest(q) {
  return /\b(chart|graph|plot|visuali[sz]e|visuali[sz]ation|line chart|bar chart|trends?|over time|over the (last|past)\s+\d+|timeline|compar(e|ison)|track(ing)?|progression|historically|(quarter|month|year|week)[- ]over[- ](quarter|month|year|week))\b/i.test(q)
    || /how (has|have|did).{0,40}change/i.test(q)
    || /show.{0,20}(how|what).{0,20}(change|evolv|grow|declin|drop|rise|increas|decreas)/i.test(q);
}

function stripDisclaimers(text) {
  return text
    .replace(/I (don't|do not|cannot|can't) have the (capability|ability) to (generate|create|make|produce|render) (visual content|charts?|graphs?|line charts?|bar charts?|visuali[sz]ations?)[^.]*\.\s*/gi, '')
    .replace(/However,\s*I can provide you with (the )?[^.]+data[^.]*\.\s*/gi, '')
    .replace(/You can use (this|the) data to (create|make|generate|build) [^.]+\.\s*/gi, '')
    .trim();
}

async function inferNeedsWithAI(latestSegment, ctx) {
  const contextBlock = `Meeting type: research\nTopic: ${ctx.topic}\nAlready surfaced: ${ctx.alreadySurfaced.join(', ') || 'none'}`;
  const userContent = `${contextBlock}\n\nRecent conversation:\n${ctx.recentTranscript}\n\nLatest segment:\n${latestSegment}`;

  // Tier 1: specific numeric/methodological claims (high confidence bar)
  const tier1 = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a real-time research copilot. Surface ONE high-value question anchored to a specific, verifiable claim in the latest segment.

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

Tier 1 targets (fire when present):
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

  const tier1Parsed = JSON.parse(tier1.choices[0].message.content || '{}');
  const tier1Needs = Array.isArray(tier1Parsed.needs) ? tier1Parsed.needs : [];
  if (tier1Needs.length > 0) return tier1Needs;

  // Tier 2 fallback: broader analytical claims when Tier 1 fires nothing
  const tier2 = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a real-time research copilot for a general analytical discussion. The conversation doesn't contain a sharp numeric claim right now — but a senior researcher might still want to verify or deepen something.

Surface ONE question ONLY if it would meaningfully improve understanding of the current topic.

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
- A comparative baseline implicitly assumed but not verified ("compared to what?" for a trend claim)
- A confounding variable or alternative explanation not yet mentioned
- A well-known dataset or study that directly covers what's being discussed
- A definitional ambiguity that would change interpretation if resolved differently

Hard rules:
- 0 or 1 needs only
- Do NOT fire on: pure opinion, logistics, scheduling, turns that are just questions with no analytical claim
- Do NOT repeat anything already surfaced
- If nothing meaningful can be added, return { "needs": [] }
- confidence must be >= 0.55`,
      },
      { role: 'user', content: userContent },
    ],
  });

  const tier2Parsed = JSON.parse(tier2.choices[0].message.content || '{}');
  return Array.isArray(tier2Parsed.needs) ? tier2Parsed.needs : [];
}

async function generateAmbientSuggestion(recentSegments, previousHeadlines, ctx) {
  const prevBlock = previousHeadlines.length > 0
    ? `\nDo NOT repeat: ${previousHeadlines.slice(-5).join(', ')}`
    : '';
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 250,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a real-time research copilot. Surface a proactive suggestion ONLY if it adds something the team hasn't noticed — something a senior collaborator would say "wait, have you checked…?" about.

Qualify (must be concrete and lookable-up):
- A named prior study or dataset that directly contradicts or benchmarks what was just claimed
- A methodological flaw the team is walking into
- A specific metric or statistic from the literature that should be cited right now
- A variable or confound not yet mentioned that affects interpretation

Disqualify: generic encouragement, restating what was said, vague "consider X" without a specific resolvable question.

Return: { "headline": "max 8 words — specific not generic", "prompt": "exact research question to look up", "rationale": "one sentence", "category": "hypothesis|methodology|contradiction|metric|open_question|comparison", "importance": 1-10 }
Or: { "skip": true }

importance: 9-10 = team would stop immediately; 7-8 = worth surfacing; <7 = skip`,
      },
      {
        role: 'user',
        content: `Topic: ${ctx.topic}${prevBlock}\n\nRecent conversation:\n${recentSegments}`,
      },
    ],
  });
  const parsed = JSON.parse(response.choices[0].message.content || '{}');
  if (parsed.skip || !parsed.headline || !parsed.prompt) return null;
  if (typeof parsed.importance !== 'number' || parsed.importance < 7) return null;
  return parsed;
}

async function resolveGapFromInternet(question, transcriptContext, meetingType = 'research') {
  const visualNote = isVisualizationRequest(question)
    ? '\n\nIf the answer involves numeric trends over time, include the actual numbers in a clear table format (years as rows, regions as columns) so they can be plotted.'
    : '';
  const systemPrompt = `You are a senior research analyst. Search the web and answer the question with specific, verifiable data points (4-6 sentences). Always cite the actual publication, organization, or dataset found. Be precise with numbers and dates.${visualNote}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Meeting context:\n${transcriptContext}\n\nQuestion: ${question}` },
      ],
    });
    const choice = response.choices?.[0];
    const rawAnswer = choice?.message?.content ?? '';
    const annotations = choice?.message?.annotations ?? [];
    const firstCitation = annotations.find(a => a.type === 'url_citation');
    return {
      answer: stripDisclaimers(rawAnswer),
      source: firstCitation?.title ?? 'Web search',
      sourceUrl: firstCitation?.url ?? null,
      truncated: rawAnswer.length > 0 && !rawAnswer.match(/[.!?]\s*$/) && rawAnswer.length < 200,
    };
  } catch (err) {
    return { answer: `Error: ${err.message}`, source: 'Error', sourceUrl: null, truncated: false };
  }
}

async function enrichResolutionOutput(question, answer, hint) {
  if (answer.length < 100 && !hint) return { format: 'none' };
  const cleanAnswer = stripDisclaimers(answer);
  const hintInstruction = hint === 'chart'
    ? '\n\nIMPORTANT: The user explicitly asked for a chart. If the answer contains any table or numeric time-series data, you MUST use "chart". Extract ALL data points and ALL series.'
    : '';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    max_tokens: 1600,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You analyze a Q&A pair and decide if a visual format genuinely improves comprehension. Default to "none" unless the answer clearly contains structured data.

WHEN TO USE EACH FORMAT:
metric_grid: ONLY when 3+ distinct named numeric metrics each have their own sentence or bullet. Do NOT use for numbers incidentally mentioned mid-sentence.
chart: Use when the answer contains a table or time-series data with actual numbers. For multi-column tables, create one dataset per column. Extract ALL numbers — never invent. Set chartType to "line" for time series, "bar" for categories.
correction: ONLY when the answer directly contradicts a stated misconception with a clear wrong/right split.
flow: ONLY when the answer describes a clear sequential process with 3-6 discrete named steps.
none: Use for factual paragraphs, definitions, single-stat answers, opinions, or anything without structured data.

For chart JSON: { "format": "chart", "chart": { "labels": [...], "datasets": [{"label": "Series", "data": [...], "color": "#hex"}], "chartType": "line", "yAxisLabel": "...", "note": "..." } }

When in doubt, use none. Return JSON.${hintInstruction}`,
      },
      { role: 'user', content: `Question: ${question}\n\nAnswer: ${cleanAnswer}` },
    ],
  });
  const raw = response.choices[0].message.content;
  if (!raw) return { format: 'none' };
  return JSON.parse(raw);
}

async function judgeAnswer(question, answer) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are an expert evaluator. Score the answer to the research question on these dimensions (1-10 each). Return JSON only.

{
  "relevance": ...,       // Does the answer directly address the question?
  "completeness": ...,    // Are key data points, dates, and context included?
  "specificity": ...,     // Are actual numbers/studies cited, or vague generalities?
  "hallucination_risk": ..., // 10 = no hallucination risk, 1 = clearly fabricated data
  "truncated": true/false,   // Does the answer end abruptly mid-thought?
  "verdict": "pass|fail",    // pass if relevance>=7, completeness>=6, hallucination_risk>=7
  "note": "one sentence summary"
}`,
      },
      { role: 'user', content: `Question: ${question}\n\nAnswer: ${answer}` },
    ],
  });
  return JSON.parse(response.choices[0].message.content || '{}');
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulated population research conversation
// Each turn = what was just said in the meeting
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC = 'Global population trends by region, 1985–2025';

const TRANSCRIPT_TURNS = [
  { speaker: 'Researcher A', text: "Let's start with the big picture. Global population went from about 4.8 billion in 1985 to around 8.1 billion today. That's a 69% increase in 40 years." },
  { speaker: 'Researcher B', text: "Sub-Saharan Africa has been the dominant growth story. The region's population has roughly tripled since 1985, from about 400 million to over 1.2 billion now." },
  { speaker: 'Researcher A', text: "Europe is essentially flat. Most countries are at or below replacement fertility. Germany's population is actually declining without immigration." },
  { speaker: 'Researcher B', text: "China's one-child policy had massive demographic consequences. Their working-age population peaked around 2011, and they're now dealing with an aging crisis similar to Japan." },
  { speaker: 'Researcher A', text: "India surpassed China in total population last year. But India's fertility rate has also been dropping fast — it's now around 2.0, basically at replacement level." },
  { speaker: 'Researcher B', text: "Southeast Asia is interesting — countries like Vietnam and Thailand went through the demographic transition extremely fast compared to historical European timelines." },
  { speaker: 'Researcher A', text: "The urban-rural split is also massive. In 1985, more people lived in rural areas globally. Now it's the opposite — over 55% urban. And in regions like Latin America, it's over 80% urban." },
  { speaker: 'Researcher B', text: "What I find striking is that all the UN medium-variant projections from the 1990s significantly underestimated Sub-Saharan Africa's fertility persistence. The models kept assuming faster convergence." },
  { speaker: 'Researcher A', text: "Can you track how the share of global population has shifted between regions from 1985 to now?" },
  { speaker: 'Researcher B', text: "And what does the UN currently project for Nigeria specifically? I've heard it could become the third most populous country by 2050, ahead of the US." },
];

const CTX_BASE = {
  topic: TOPIC,
  meetingType: 'research',
  alreadySurfaced: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────────────────────

const results = {
  run_at: new Date().toISOString(),
  topic: TOPIC,
  p1_gap_detection: [],
  p2_ambient_suggestions: [],
  p3_web_resolution: [],
  p4_enrichment: [],
  p5_viz_routing: [],
  p6_direct_queries: [],
  summary: {},
};

// ── P1: Gap detection across transcript turns ─────────────────────────────────
log('\n═══ P1: Gap Detection (inferNeedsWithAI) ════════════════════════');
const recentTranscript = TRANSCRIPT_TURNS.slice(0, 6).map(t => `${t.speaker}: ${t.text}`).join('\n');

for (let i = 2; i < TRANSCRIPT_TURNS.length; i++) {
  const turn = TRANSCRIPT_TURNS[i];
  const ctx = {
    ...CTX_BASE,
    recentTranscript: TRANSCRIPT_TURNS.slice(Math.max(0, i - 3), i).map(t => `${t.speaker}: ${t.text}`).join('\n'),
  };

  log(`\n  Turn ${i + 1}: "${turn.text.slice(0, 70)}..."`);
  try {
    const needs = await inferNeedsWithAI(turn.text, ctx);
    if (needs.length === 0) {
      log(`  → No gap detected`);
      results.p1_gap_detection.push({ turn: i + 1, speaker: turn.speaker, fired: false, need: null });
    } else {
      const n = needs[0];
      log(`  → [${n.category}] "${n.prompt}"`);
      log(`     confidence: ${n.confidence} | trigger: "${n.triggerPhrase}"`);
      log(`     rationale: ${n.rationale}`);
      results.p1_gap_detection.push({ turn: i + 1, speaker: turn.speaker, fired: true, need: n });
    }
  } catch (err) {
    log(`  → ERROR: ${err.message}`);
    results.p1_gap_detection.push({ turn: i + 1, error: err.message });
  }
  await delay(800);
}

// ── P2: Ambient suggestions across rolling windows ───────────────────────────
log('\n\n═══ P2: Ambient Suggestions (generateAmbientSuggestion) ════════');
const windows = [
  { label: 'Turns 1-3 (global overview)', turns: TRANSCRIPT_TURNS.slice(0, 3) },
  { label: 'Turns 3-5 (China/India)', turns: TRANSCRIPT_TURNS.slice(2, 5) },
  { label: 'Turns 5-7 (SE Asia/urbanization)', turns: TRANSCRIPT_TURNS.slice(4, 7) },
  { label: 'Turns 7-9 (UN model critique)', turns: TRANSCRIPT_TURNS.slice(6, 9) },
];

const surfacedHeadlines = [];
for (const w of windows) {
  const recentText = w.turns.map(t => `${t.speaker}: ${t.text}`).join('\n');
  log(`\n  Window: ${w.label}`);
  try {
    const suggestion = await generateAmbientSuggestion(recentText, surfacedHeadlines, CTX_BASE);
    if (!suggestion) {
      log('  → Skipped (below importance threshold or no valid suggestion)');
      results.p2_ambient_suggestions.push({ window: w.label, fired: false });
    } else {
      log(`  → [${suggestion.category}] "${suggestion.headline}" (importance: ${suggestion.importance})`);
      log(`     prompt: ${suggestion.prompt}`);
      log(`     rationale: ${suggestion.rationale}`);
      surfacedHeadlines.push(suggestion.headline);
      results.p2_ambient_suggestions.push({ window: w.label, fired: true, suggestion });
    }
  } catch (err) {
    log(`  → ERROR: ${err.message}`);
    results.p2_ambient_suggestions.push({ window: w.label, error: err.message });
  }
  await delay(800);
}

// ── P3: Web resolution — realistic research questions ────────────────────────
log('\n\n═══ P3: Web Resolution (resolveGapFromInternet) ════════════════');
const resolutionQueries = [
  { q: 'What was Sub-Saharan Africa\'s total population in 1985 and 2024 according to UN data?', expectsNumbers: true },
  { q: 'What is Nigeria\'s projected population in 2050 according to the UN World Population Prospects 2024?', expectsNumbers: true },
  { q: 'When did India surpass China in total population, and what were the exact figures at that point?', expectsNumbers: true },
  { q: 'What was China\'s working-age population peak year and size according to official statistics?', expectsNumbers: true },
  { q: 'How did UN 1994 World Population Conference projections for Sub-Saharan Africa compare to actual 2024 outcomes?', expectsNumbers: true },
  { q: 'What is the current total fertility rate for India and Vietnam as of the latest available data?', expectsNumbers: true },
];

const transcriptContext = TRANSCRIPT_TURNS.slice(0, 8).map(t => `${t.speaker}: ${t.text}`).join('\n');

for (const { q, expectsNumbers } of resolutionQueries) {
  log(`\n  Q: "${q}"`);
  try {
    const result = await resolveGapFromInternet(q, transcriptContext, 'research');
    const judge = await judgeAnswer(q, result.answer);
    const answerPreview = result.answer.slice(0, 180) + (result.answer.length > 180 ? '...' : '');
    log(`  Answer (${result.answer.length} chars): ${answerPreview}`);
    log(`  Source: ${result.source}`);
    log(`  Judge: relevance=${judge.relevance} completeness=${judge.completeness} specificity=${judge.specificity} hallucination_risk=${judge.hallucination_risk} truncated=${judge.truncated}`);
    log(`  Verdict: ${judge.verdict === 'pass' ? '✓ PASS' : '✗ FAIL'} — ${judge.note}`);
    results.p3_web_resolution.push({ q, answer: result.answer, source: result.source, sourceUrl: result.sourceUrl, judge });
  } catch (err) {
    log(`  → ERROR: ${err.message}`);
    results.p3_web_resolution.push({ q, error: err.message });
  }
  await delay(1200);
}

// ── P4: Enrichment format selection ─────────────────────────────────────────
log('\n\n═══ P4: Enrichment Format Selection (enrichResolutionOutput) ════');

const enrichmentCases = [
  {
    label: 'Multi-region population time-series (should → chart)',
    q: 'How has each region\'s share of global population changed from 1985 to 2025?',
    a: `According to UN data, regional shares of global population shifted significantly from 1985 to 2025:

| Region           | 1985  | 2000  | 2010  | 2025  |
|-----------------|-------|-------|-------|-------|
| Sub-Saharan Africa | 8.7% | 10.5% | 12.8% | 16.1% |
| South Asia      | 22.1% | 23.3% | 24.2% | 25.4% |
| East Asia       | 28.2% | 27.1% | 25.6% | 23.1% |
| Europe          | 15.8% | 14.1% | 12.9% | 11.2% |
| Americas        | 13.6% | 13.7% | 13.5% | 13.3% |
| MENA            | 5.4%  | 5.9%  | 6.4%  | 7.0%  |`,
    expectedFormat: 'chart',
    hint: 'chart',
  },
  {
    label: 'Named demographic stats (should → metric_grid)',
    q: 'What are the key fertility rate figures for major regions?',
    a: `Current total fertility rates (TFR) by region according to UN 2024 data: Sub-Saharan Africa has a TFR of 4.5 children per woman. South Asia's TFR stands at 2.1. East Asia (including China) has dropped to 1.3, far below replacement level. Europe's TFR is 1.5. Global average TFR is 2.3, down from 3.8 in 1985.`,
    expectedFormat: 'metric_grid',
    hint: undefined,
  },
  {
    label: 'UN model critique — factual paragraph (should → none)',
    q: 'Why did UN 1990s projections underestimate Sub-Saharan Africa fertility persistence?',
    a: `The UN Population Division's 1994 and 1998 projections assumed that Sub-Saharan Africa would follow the same fertility transition pathway seen in Asia and Latin America, expecting TFR to fall from around 6.0 to replacement level by 2020. This assumption was driven by rising education rates and urbanization. However, persistently low female education enrollment in the Sahel and Central Africa, combined with strong cultural pronatalism and limited contraceptive access, meant that fertility decline stalled at around 5.0 in many countries. The models failed to account for region-specific structural factors distinct from the East Asian developmental trajectory.`,
    expectedFormat: 'none',
    hint: undefined,
  },
  {
    label: 'Single stat with context (should → none, not metric_grid)',
    q: 'When did India surpass China in population?',
    a: `India surpassed China in total population in April 2023, according to UN estimates. India's population reached 1.4286 billion, edging past China's 1.4257 billion. This milestone reflects India's sustained fertility rate of approximately 2.0 alongside China's long-term demographic slowdown following the one-child policy era.`,
    expectedFormat: 'none',
    hint: undefined,
  },
  {
    label: 'Visualization explicitly requested + data present (should → chart)',
    q: 'Can you track the global urban vs rural population split from 1985 to today?',
    a: `Global urban and rural population split (UN data):

Year | Urban (%) | Rural (%)
1985 | 41%       | 59%
1990 | 43%       | 57%
1995 | 45%       | 55%
2000 | 47%       | 53%
2007 | 50%       | 50%
2010 | 52%       | 48%
2015 | 54%       | 46%
2020 | 56%       | 44%
2025 | 58%       | 42%`,
    expectedFormat: 'chart',
    hint: 'chart',
  },
];

for (const c of enrichmentCases) {
  log(`\n  Case: ${c.label}`);
  log(`  Expected: ${c.expectedFormat}${c.hint ? ' (with hint)' : ''}`);
  try {
    const rich = await enrichResolutionOutput(c.q, c.a, c.hint);
    const gotFormat = rich.format ?? 'none';
    const pass = gotFormat === c.expectedFormat;
    log(`  Got: ${gotFormat} ${pass ? '✓' : '✗ FAIL'}`);
    if (gotFormat === 'chart' && rich.chart) {
      log(`  Chart: ${rich.chart.datasets?.length ?? 0} dataset(s), ${rich.chart.labels?.length ?? 0} labels, type=${rich.chart.chartType}`);
    }
    if (gotFormat === 'metric_grid' && rich.metric_grid) {
      log(`  Metrics: ${rich.metric_grid.metrics?.length ?? 0} items`);
    }
    results.p4_enrichment.push({ label: c.label, expectedFormat: c.expectedFormat, gotFormat, pass, rich });
  } catch (err) {
    log(`  → ERROR: ${err.message}`);
    results.p4_enrichment.push({ label: c.label, expectedFormat: c.expectedFormat, error: err.message });
  }
  await delay(600);
}

// ── P5: Visualization routing ────────────────────────────────────────────────
log('\n\n═══ P5: Visualization Request Routing (isVisualizationRequest) ══');

const vizCases = [
  { q: 'Can you track how the share of global population has shifted between regions from 1985 to now?', expected: true },
  { q: 'Show me how Sub-Saharan Africa\'s population has grown over the last 40 years', expected: true },
  { q: 'Can you plot fertility rate trends for Asia vs Europe?', expected: true },
  { q: 'How has China\'s working-age population changed since 2000?', expected: true },
  { q: 'Chart the urban vs rural population split globally from 1985 to 2025', expected: true },
  { q: 'What is the year-over-year change in Nigeria\'s population growth rate?', expected: true },
  { q: 'Track the demographic transition across Southeast Asian countries', expected: true },
  { q: 'What does the UN project for Nigeria by 2050?', expected: false },
  { q: 'Why did UN models underestimate Sub-Saharan Africa fertility?', expected: false },
  { q: 'When did India surpass China in population?', expected: false },
  { q: 'What is the current fertility rate in Europe?', expected: false },
];

let vizPassed = 0;
for (const c of vizCases) {
  const got = isVisualizationRequest(c.q);
  const pass = got === c.expected;
  if (pass) vizPassed++;
  log(`  ${pass ? '✓' : '✗'} [expected=${c.expected} got=${got}] "${c.q.slice(0, 65)}"`);
  results.p5_viz_routing.push({ q: c.q, expected: c.expected, got, pass });
}
log(`\n  Score: ${vizPassed}/${vizCases.length}`);

// ── P6: Direct Ambi queries — end-to-end conversational requests ─────────────
log('\n\n═══ P6: Direct Conversational Queries (end-to-end) ═════════════');

const directQueries = [
  { q: 'Can you track the population share by region from 1985 to today?', expectsViz: true },
  { q: 'What does the UN project for Nigeria by 2050?', expectsViz: false },
  { q: 'How has Europe\'s fertility rate changed over the last 40 years?', expectsViz: true },
  { q: 'Summarize the key drivers of Sub-Saharan Africa\'s population growth', expectsViz: false },
];

for (const { q, expectsViz } of directQueries) {
  log(`\n  Query: "${q}"`);
  log(`  Expects viz: ${expectsViz} | vizHint detected: ${isVisualizationRequest(q)}`);
  const hint = isVisualizationRequest(q) ? 'chart' : undefined;

  try {
    const resolution = await resolveGapFromInternet(q, transcriptContext, 'research');
    const judge = await judgeAnswer(q, resolution.answer);
    const rich = await enrichResolutionOutput(q, resolution.answer, hint);
    const gotFormat = rich.format ?? 'none';
    const vizMatch = expectsViz ? gotFormat === 'chart' : gotFormat === 'none' || gotFormat !== 'chart';

    log(`  Answer length: ${resolution.answer.length} chars`);
    log(`  Source: ${resolution.source}`);
    log(`  Rich format: ${gotFormat}`);
    log(`  Judge: relevance=${judge.relevance} completeness=${judge.completeness} specificity=${judge.specificity} hallu=${judge.hallucination_risk} truncated=${judge.truncated}`);
    log(`  Viz match: ${vizMatch ? '✓' : '✗'} | Answer verdict: ${judge.verdict === 'pass' ? '✓ PASS' : '✗ FAIL'}`);
    log(`  Note: ${judge.note}`);

    results.p6_direct_queries.push({ q, expectsViz, hint: !!hint, answer: resolution.answer, source: resolution.source, rich, judge, vizMatch });
  } catch (err) {
    log(`  → ERROR: ${err.message}`);
    results.p6_direct_queries.push({ q, error: err.message });
  }
  await delay(1500);
}

// ── Summary ──────────────────────────────────────────────────────────────────
log('\n\n═══ SUMMARY ════════════════════════════════════════════════════');

const p1Fired = results.p1_gap_detection.filter(r => r.fired).length;
const p1Total = results.p1_gap_detection.length;
const p2Fired = results.p2_ambient_suggestions.filter(r => r.fired).length;
const p2Total = results.p2_ambient_suggestions.length;
const p3Pass = results.p3_web_resolution.filter(r => r.judge?.verdict === 'pass').length;
const p3Total = results.p3_web_resolution.length;
const p4Pass = results.p4_enrichment.filter(r => r.pass).length;
const p4Total = results.p4_enrichment.length;
const p5Score = vizPassed;
const p5Total = vizCases.length;
const p6AnswerPass = results.p6_direct_queries.filter(r => r.judge?.verdict === 'pass').length;
const p6VizMatch = results.p6_direct_queries.filter(r => r.vizMatch).length;
const p6Total = results.p6_direct_queries.length;

log(`  P1 Gap detection:       ${p1Fired}/${p1Total} turns fired a gap`);
log(`  P2 Ambient suggestions: ${p2Fired}/${p2Total} windows surfaced an insight`);
log(`  P3 Web resolution:      ${p3Pass}/${p3Total} answers passed judge`);
log(`  P4 Enrichment formats:  ${p4Pass}/${p4Total} correct format selected`);
log(`  P5 Viz routing:         ${p5Score}/${p5Total} correctly routed`);
log(`  P6 Direct queries:      ${p6AnswerPass}/${p6Total} answers pass, ${p6VizMatch}/${p6Total} viz correctly matched`);

results.summary = {
  p1_gap_fired: `${p1Fired}/${p1Total}`,
  p2_ambient_fired: `${p2Fired}/${p2Total}`,
  p3_web_pass: `${p3Pass}/${p3Total}`,
  p4_enrichment_pass: `${p4Pass}/${p4Total}`,
  p5_viz_routing: `${p5Score}/${p5Total}`,
  p6_answer_pass: `${p6AnswerPass}/${p6Total}`,
  p6_viz_match: `${p6VizMatch}/${p6Total}`,
};

writeFileSync(
  join(__dirname, 'backtest-population-results.json'),
  JSON.stringify(results, null, 2),
);
log('\n  Results saved to scripts/backtest-population-results.json\n');
