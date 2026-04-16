/**
 * Ambi Pipeline Backtest
 * ─────────────────────
 * Replays the AXEL-02 (research) and GTC×Iridium (sales) presets through the
 * full AI pipeline. Tests every stage: inference, ambient suggestion, web
 * resolution, enrichment format selection, and direct Ambi queries.
 *
 * Run: node scripts/backtest.mjs
 * Writes: scripts/backtest-results.json + console summary
 */

import OpenAI from 'openai';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load API key ──────────────────────────────────────────────────────────────
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local');
  const fallback = join(__dirname, '..', '.env');
  const path = existsSync(envPath) ? envPath : fallback;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const client = new OpenAI({ apiKey: process.env.VITE_OPENAI_API_KEY });

// ── Preset data ───────────────────────────────────────────────────────────────

const AXEL02 = {
  id: 'axel-02-phase2',
  label: 'AXEL-02 Phase II — Safety Review',
  meetingType: 'research',
  accountContext: 'PharmaCo Oncology — AXEL-02 Program',
  projectContext: 'Phase II trial of AXEL-02 (anti-PD-L1 inhibitor) in NSCLC. Primary endpoint: ORR ≥ 35%. Target: 90 patients.',
  transcript: [
    { speaker: 'Dr. Jennifer Wu', text: "Week 16 enrollment update: we're at 47 of 90 patients enrolled. That's 52 percent of target, running about three weeks behind the protocol timeline." },
    { speaker: 'Dr. Maya Patel', text: "What's driving the lag — screen failures or site throughput at the Detroit center?" },
    { speaker: 'Dr. Jennifer Wu', text: "Mostly screen failures. Performance status 2 patients are appearing in the Detroit referral pool at 29 percent — our protocol eligibility assumption was 18 percent." },
    { speaker: 'Dr. Liam Torres', text: "Before we resolve enrollment, I need to flag the interim efficacy snapshot. ORR at three months across 47 evaluable patients is 28 percent. Our protocol-specified continuation threshold is 35 percent." },
    { speaker: 'Dr. Maya Patel', text: "We're below threshold but at 47 patients the confidence interval should be very wide. What's the 95 percent CI on that 28 percent?" },
    { speaker: 'Dr. Liam Torres', text: "95 percent CI is 16.2 to 42.1 percent. We cannot call failure — 35 percent is well within the interval. The DSMB will want AE contextualization before approving continuation." },
    { speaker: 'Dr. Maya Patel', text: "On safety: two SAEs, both Grade 3 immune pneumonitis, both resolved with high-dose steroids within two weeks. Total Grade 2 or higher adverse event rate is 34 percent of enrolled patients." },
    { speaker: 'Dr. Jennifer Wu', text: "The DSMB will ask us to benchmark against KEYNOTE-024. Do we have the pembrolizumab comparator AE rate available for the memo?" },
    { speaker: 'Dr. Liam Torres', text: "KEYNOTE-024 reported Grade 3 or higher treatment-related adverse events at 26.6 percent. Our Grade 2 or higher is 34 percent — those are not directly comparable denominators." },
    { speaker: 'Dr. Maya Patel', text: "That's exactly the problem. If we present our 34 percent Grade 2+ alongside their 26.6 percent Grade 3+, it will look worse than it actually is. The DSMB needs the same grading denominator for a valid comparison." },
    { speaker: 'Dr. Jennifer Wu', text: "KEYNOTE-024 does publish Grade 2+ breakdown in the supplementary tables. We need to pull that before we submit the safety memo or we're comparing apples to oranges in front of the DSMB." },
    { speaker: 'Dr. Liam Torres', text: "If the Detroit screen failure rate holds at 29 percent, we track to full enrollment by week 30 — a six-week protocol deviation. We need a decision on whether to open a third site or adjust eligibility criteria." },
    { speaker: 'Dr. Maya Patel', text: "Let's run the power analysis under the current pace before we commit to a third site. If we can still hit the primary endpoint at 80 of 90 patients, a six-week delay may be the lower-risk path." },
  ],
};

const GTC_IRIDIUM = {
  id: 'gtc-iridium',
  label: 'GTC × Iridium Demo',
  meetingType: 'sales',
  accountContext: 'GTC',
  projectContext: 'Preet Chandi South Pole expedition — dual device proposal',
  transcript: [
    { speaker: 'GTC Buyer', text: 'Why do we need both devices for Preet? It sounds redundant.' },
    { speaker: 'Account Exec', text: 'Extreme covers voice and SOS. GO supports photo upload. They solve different constraints.' },
    { speaker: 'GTC Buyer', text: 'Do we have deployment evidence that dual-device setups succeed more often?' },
    { speaker: 'Sales Engineer', text: 'We should compare mission completion and comms uptime for dual versus single-device teams.' },
    { speaker: 'GTC Buyer', text: 'What pricing bundle would we propose Thursday? That seems unresolved.' },
    { speaker: 'Account Exec', text: "My instinct is they're complementary not redundant the Iridium Extreme handles all voice and SOS natively, and the GO! handles photos and data uploads." },
    { speaker: 'Account Exec', text: "That chart is the answer. Ninety-four versus seventy-one percent is not a marginal difference. And the capability gap is black and white you literally cannot do voice blogs on the GO! alone." },
    { speaker: 'Sales Engineer', text: "The passive setup is the biggest differentiator for solo expeditions. The GO! keeping that data pipeline open without Preet ever touching it — that's why the content numbers are so much higher." },
    { speaker: 'GTC Buyer', text: 'How does the Iridium GO! compare to the SPOT Gen4 for content delivery on long expeditions?' },
    { speaker: 'Sales Engineer', text: "Either way, we're not asking Preet to make a decision on the ice — she picks up the Extreme for voice and the GO! runs passively for everything else." },
  ],
};

// ── Synthetic direct Ambi queries injected at end of meeting ─────────────────

const AMBI_QUERIES = {
  research: [
    "Ambi, what is the Grade 2+ adverse event rate in KEYNOTE-024 supplementary data?",
    "Ambi, what does the literature say about PS2 screen failure rates in anti-PD-L1 NSCLC trials?",
    "Ambi, can you show me a line chart of ORR confidence intervals versus sample size for immunotherapy trials?",
    "Ambi, compare KEYNOTE-024 and CheckMate 026 AE grading methodologies",
  ],
  sales: [
    "Ambi, what is the Iridium GO! data upload speed compared to SPOT Gen4?",
    "Ambi, what's the price difference between the Iridium Extreme and SPOT Gen4?",
    "Ambi, give me a comparison chart of satellite communicators for extreme expeditions",
  ],
};

// ── Viz-request detection test cases ─────────────────────────────────────────

const VIZ_TEST_CASES = [
  { q: "can you give me a line chart for population changes over 40 years", expect: true },
  { q: "show me a comparison chart of AE rates across trials", expect: true },
  { q: "what is the ORR threshold in KEYNOTE-024?", expect: false },
  { q: "visualize the stakeholder pathway for DPH approval", expect: true },
  { q: "what happened in Q1?", expect: false },
  { q: "plot the Sharpe ratio trend over the last 4 quarters", expect: true },
  { q: "compare dual-device vs single-device mission completion rates", expect: true },
  { q: "how does pembrolizumab work mechanistically?", expect: false },
  { q: "show me the enrollment numbers over time", expect: true },
  { q: "what is the definition of grade 3 adverse event?", expect: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVisualizationRequest(question) {
  return /\b(chart|graph|plot|visuali[sz]e|visuali[sz]ation|line chart|bar chart|trend|over time|over the (last|past)\s+\d+|timeline|compare|comparison)\b/i.test(question);
}

function detectAmbiTrigger(text) {
  const lower = text.toLowerCase();
  const hasAmbi = /\b(ambi|amby|hambi|ambee|mb)\b/.test(lower);
  if (!hasAmbi) return null;
  const isQuestion =
    /[?]/.test(text) ||
    /\b(what|who|where|when|how|why|can you|could you|tell me|find|look up|search|do you know|explain|summarize|compare|give me|show me)\b/.test(lower);
  if (!isQuestion) return null;
  const match = lower.match(/\b(?:ambi|amby|hambi|ambee|mb)\b[,.]?\s*(.*)/);
  const extracted = match?.[1]?.trim();
  return extracted && extracted.length > 4 ? extracted : text.trim();
}

function stripVisualizationDisclaimers(text) {
  return text
    .replace(/I (don't|do not|cannot|can't) have the (capability|ability) to (generate|create|make|produce|render) (visual content|charts?|graphs?|line charts?|bar charts?|visuali[sz]ations?)[^.]*\.\s*/gi, '')
    .replace(/However,\s*I can provide you with (the )?[^.]+data[^.]*\.\s*/gi, '')
    .replace(/You can use (this|the) data to (create|make|generate|build) [^.]+\.\s*/gi, '')
    .trim();
}

function stripInlineCitations(text) {
  return text
    .replace(/\s*\(\[[^\]]*\]\(https?:\/\/[^)]+\)\)/g, '')
    .replace(/\s*\[[^\]]*\]\(https?:\/\/[^)]+\)/g, '')
    .replace(/\s*\(https?:\/\/[^)]+\)/g, '')
    .replace(/\?utm_source=openai/g, '')
    .trim();
}

async function inferNeedsWithAI(latestSegment, ctx) {
  const contextLines = [];
  if (ctx.meetingTitle) contextLines.push(`Meeting: ${ctx.meetingTitle}`);
  if (ctx.accountContext) contextLines.push(`Context: ${ctx.accountContext}`);
  if (ctx.resolvedTopics?.length) contextLines.push(`Already surfaced: ${ctx.resolvedTopics.join(', ')}`);
  const contextBlock = contextLines.join('\n');

  const systemPrompt = ctx.meetingType === 'research'
    ? `You are a real-time research copilot. Surface ONE high-value question the team should verify RIGHT NOW.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need: { "category": "hypothesis|methodology|contradiction|correction|metric|open_question", "prompt": "specific answerable question", "priority": "p1", "confidence": 0.75-1.0, "rationale": "one sentence risk if unchecked", "triggerPhrase": "2-5 word phrase from transcript" }

Rules: 0-1 needs only. Confidence >= 0.65. Skip logistics/scheduling.`
    : `You are a B2B sales deal intelligence engine. Surface ONE gap that could directly lose the deal.

Return JSON: { "needs": [...] } or { "needs": [] }

Each need: { "category": "comparison|risk|pricing|objection|decision|correction", "prompt": "specific answerable question", "priority": "p1", "confidence": 0.80-1.0, "rationale": "one sentence why this matters for the deal", "triggerPhrase": "1-4 word phrase" }

Rules: 0-1 needs only. Confidence >= 0.85. Only trigger on CUSTOMER speech. Skip soft topics.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 512,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${contextBlock}\n\nRecent transcript:\n${ctx.recentTranscript}\n\nLatest: ${latestSegment}` },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content || '{}');
  return Array.isArray(parsed.needs) ? parsed.needs : [];
}

async function resolveGapFromInternet(question, context, meetingType) {
  const visualNote = `\nIMPORTANT: If asked for a chart or comparison, provide data as a markdown table. Do NOT say "I cannot generate charts".`;
  const systemPrompt = meetingType === 'research'
    ? `You are a senior research analyst. Search the web and answer using published literature. Be precise. NEVER invent specific empirical numbers not in search results. Cite actual sources.${visualNote}`
    : `You are a research analyst. Answer with specific, verifiable data points. Cite actual sources.${visualNote}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
    });
    const choice = response.choices?.[0];
    const rawAnswer = choice?.message?.content ?? '';
    const annotations = choice?.message?.annotations ?? [];
    const firstCitation = annotations.find(a => a.type === 'url_citation');
    return {
      answer: stripInlineCitations(rawAnswer),
      source: firstCitation?.title ?? 'Web search',
      sourceUrl: firstCitation?.url ?? null,
      confidence: meetingType === 'research' ? 0.78 : 0.82,
      usedWebSearch: true,
    };
  } catch {
    const fallback = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
    });
    return {
      answer: fallback.choices[0].message.content ?? '',
      source: 'GPT knowledge (web search unavailable)',
      sourceUrl: null,
      confidence: 0.6,
      usedWebSearch: false,
    };
  }
}

async function enrichResolutionOutput(question, answer, hint) {
  const cleanAnswer = stripVisualizationDisclaimers(answer);
  if (cleanAnswer.length < 80 && !hint) return { format: 'none', data: {} };

  const hintInstruction = hint === 'chart'
    ? '\n\nIMPORTANT: The user explicitly asked for a chart. If ANY numeric table or time-series data is present, you MUST use "chart". Extract ALL datasets.'
    : '';

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    max_tokens: 1600,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Analyze this Q&A pair and choose a visual format. Return a JSON object.

Formats: metric_grid, chart, correction, flow, or none.
metric_grid: 3+ distinct named numeric metrics that are meaningfully comparable.
chart: Table or time-series data with actual numbers. Multi-column tables → one dataset per column, row headers as labels. chartType "line" for time-series, "bar" for categories.
correction: Clear wrong/right split correcting a misconception.
flow: Sequential process with 3-6 discrete named steps.
none: Everything else — factual text, single stats, opinions, definitions.

JSON schema examples:
chart: { "format":"chart", "chart": { "labels":[...], "datasets":[{"label":"","data":[...],"color":"#hex"}], "chartType":"line|bar", "yAxisLabel":"", "note":"" } }
metric_grid: { "format":"metric_grid", "metric_grid": { "metrics":[{"label":"","value":"","sub":""}], "insightText":"" } }
correction: { "format":"correction", "correction": { "wrong":"", "right":"", "reframe":"" } }
flow: { "format":"flow", "flow": { "nodes":[{"id":"","label":"","sub":""}], "note":"" } }
none: { "format":"none" }

When in doubt, use none.${hintInstruction}`,
      },
      { role: 'user', content: `Question: ${question}\n\nAnswer: ${cleanAnswer}` },
    ],
  });

  try {
    const parsed = JSON.parse(response.choices[0].message.content || '{}');
    return { format: parsed.format ?? 'none', data: parsed[parsed.format] ?? {} };
  } catch {
    return { format: 'none', data: {} };
  }
}

// LLM-as-judge: score a Q&A pair for relevance, accuracy, hallucination risk
async function judgeAnswer(question, answer, transcriptContext, meetingType) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 300,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are evaluating an AI answer in a meeting context.
Score on three dimensions (0-10 each):
- relevance: does the answer directly address what was asked?
- accuracy: does the answer cite verifiable facts without obvious errors?
- hallucination_risk: 0=no risk, 10=clearly hallucinated. Low scores are better.

Also provide: "verdict" (pass|warn|fail) and "notes" (one sentence).

Return JSON: { "relevance": 0-10, "accuracy": 0-10, "hallucination_risk": 0-10, "verdict": "pass|warn|fail", "notes": "..." }`,
      },
      {
        role: 'user',
        content: `Meeting type: ${meetingType}\nContext: ${transcriptContext.slice(0, 400)}\n\nQuestion: ${question}\nAnswer: ${answer.slice(0, 800)}`,
      },
    ],
  });
  try {
    return JSON.parse(response.choices[0].message.content || '{}');
  } catch {
    return { relevance: 0, accuracy: 0, hallucination_risk: 10, verdict: 'fail', notes: 'parse error' };
  }
}

// ── Main test runner ──────────────────────────────────────────────────────────

async function runPreset(preset) {
  const results = {
    preset: preset.label,
    meetingType: preset.meetingType,
    inference: [],
    resolution: [],
    enrichment: [],
    directAmbi: [],
    ambientSuggestions: [],
  };

  const resolvedTopics = [];
  const recentTranscript = () => preset.transcript.slice(-5).map(e => `${e.speaker}: ${e.text}`).join('\n');

  log(`\n${'═'.repeat(60)}`);
  log(`PRESET: ${preset.label.toUpperCase()}`);
  log(`${'═'.repeat(60)}`);

  // ── 1. Inference: fire on every 3rd event batch ─────────────────────────────
  log(`\n── Stage 1: inferNeedsWithAI ──`);

  for (let i = 2; i < preset.transcript.length; i += 3) {
    const batch = preset.transcript.slice(Math.max(0, i - 2), i + 1);
    const latestSegment = `${batch[batch.length - 1].speaker}: ${batch[batch.length - 1].text}`;
    const ctx = {
      meetingTitle: preset.label,
      accountContext: preset.accountContext,
      recentTranscript: batch.map(e => `${e.speaker}: ${e.text}`).join('\n'),
      resolvedTopics: [...resolvedTopics],
      meetingType: preset.meetingType,
    };

    try {
      const needs = await inferNeedsWithAI(latestSegment, ctx);
      const fired = needs.length > 0;
      const need = needs[0];

      log(`  [evt ${i+1}] ${fired ? '✓ FIRED' : '— none'} ${fired ? `| "${need.prompt.slice(0, 70)}…" (conf: ${need.confidence})` : ''}`);

      results.inference.push({
        event_idx: i + 1,
        trigger: latestSegment.slice(0, 80),
        fired,
        need: need ? { prompt: need.prompt, category: need.category, confidence: need.confidence, rationale: need.rationale } : null,
      });

      if (fired) {
        resolvedTopics.push(need.prompt.slice(0, 50));

        // ── 2. Resolution: resolve the inferred gap ────────────────────────────
        log(`  [res] Resolving: "${need.prompt.slice(0, 60)}…"`);
        const result = await resolveGapFromInternet(need.prompt, ctx.recentTranscript, preset.meetingType);
        const judgment = await judgeAnswer(need.prompt, result.answer, ctx.recentTranscript, preset.meetingType);
        const vizHint = isVisualizationRequest(need.prompt) ? 'chart' : undefined;
        const enrichment = await enrichResolutionOutput(need.prompt, result.answer, vizHint);

        log(`  [res] verdict: ${judgment.verdict} | relevance: ${judgment.relevance}/10 | accuracy: ${judgment.accuracy}/10 | hallucination: ${judgment.hallucination_risk}/10`);
        log(`  [enr] format: ${enrichment.format}`);

        results.resolution.push({
          question: need.prompt,
          answer_preview: result.answer.slice(0, 200),
          source: result.source,
          usedWebSearch: result.usedWebSearch,
          judgment,
        });
        results.enrichment.push({
          question: need.prompt,
          format: enrichment.format,
          has_data: Object.keys(enrichment.data).length > 0,
          viz_hint_applied: !!vizHint,
        });
      }
    } catch (err) {
      log(`  [evt ${i+1}] ERROR: ${err.message}`);
      results.inference.push({ event_idx: i + 1, fired: false, error: err.message });
    }

    await delay(300);
  }

  // ── 3. Ambient suggestions: sample 3 moments ─────────────────────────────────
  log(`\n── Stage 2: generateAmbientSuggestion ──`);
  const samplePoints = [3, 6, 10].filter(i => i < preset.transcript.length);
  for (const i of samplePoints) {
    const recentSegments = preset.transcript.slice(Math.max(0, i - 2), i + 1).map(e => `${e.speaker}: ${e.text}`).join('\n');
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 250,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: preset.meetingType === 'research'
              ? `Surface a proactive suggestion ONLY if it adds something the team hasn't noticed. Return JSON: { "headline": "max 8 words", "prompt": "specific research question", "rationale": "one sentence", "category": "hypothesis|methodology|contradiction|metric|open_question|comparison", "importance": 1-10 } or JSON { "skip": true }`
              : `Surface a suggestion ONLY if it gives the rep a concrete immediate advantage. Return JSON: { "headline": "max 8 words", "prompt": "specific question", "rationale": "one sentence", "category": "comparison|risk|pricing|objection|claim|decision|metric", "importance": 1-10 } or JSON { "skip": true }`,
          },
          { role: 'user', content: `Context: ${preset.accountContext}\n\nRecent:\n${recentSegments}` },
        ],
      });
      const parsed = JSON.parse(response.choices[0].message.content || '{}');
      const fired = !parsed.skip && parsed.headline && typeof parsed.importance === 'number' && parsed.importance >= 7;
      log(`  [evt ${i+1}] ${fired ? `✓ "${parsed.headline}" (importance: ${parsed.importance})` : '— skipped'}`);
      results.ambientSuggestions.push({ event_idx: i + 1, fired, suggestion: fired ? parsed : null });
    } catch (err) {
      log(`  [evt ${i+1}] ERROR: ${err.message}`);
    }
    await delay(300);
  }

  // ── 4. Direct Ambi queries ───────────────────────────────────────────────────
  log(`\n── Stage 3: Direct Ambi Queries ──`);
  const queries = AMBI_QUERIES[preset.meetingType] ?? [];
  for (const raw of queries) {
    const extracted = detectAmbiTrigger(raw);
    const detectionPass = extracted !== null;
    log(`  [detect] "${raw.slice(0, 50)}…" → ${detectionPass ? `✓ "${extracted?.slice(0, 50)}"` : '✗ not detected'}`);

    if (!extracted) {
      results.directAmbi.push({ raw, detected: false });
      continue;
    }

    try {
      const result = await resolveGapFromInternet(extracted, recentTranscript(), preset.meetingType);
      const vizHint = isVisualizationRequest(extracted) ? 'chart' : undefined;
      const enrichment = await enrichResolutionOutput(extracted, result.answer, vizHint);
      const judgment = await judgeAnswer(extracted, result.answer, recentTranscript(), preset.meetingType);

      log(`  [ans]  verdict: ${judgment.verdict} | format: ${enrichment.format} | viz_hint: ${vizHint ?? 'none'}`);
      log(`         ${judgment.notes}`);

      results.directAmbi.push({
        raw,
        detected: true,
        extracted,
        answer_preview: result.answer.slice(0, 200),
        source: result.source,
        enrichment_format: enrichment.format,
        viz_hint: vizHint ?? null,
        judgment,
      });
    } catch (err) {
      log(`  [ans]  ERROR: ${err.message}`);
      results.directAmbi.push({ raw, detected: true, extracted, error: err.message });
    }
    await delay(400);
  }

  return results;
}

// ── Viz detection unit tests ──────────────────────────────────────────────────

function runVizDetectionTests() {
  log('\n── Stage 0: isVisualizationRequest unit tests ──');
  const results = VIZ_TEST_CASES.map(({ q, expect }) => {
    const got = isVisualizationRequest(q);
    const pass = got === expect;
    log(`  ${pass ? '✓' : '✗'} [expect:${expect ? 'chart' : 'none '}] "${q.slice(0, 55)}"`);
    return { question: q, expected: expect, got, pass };
  });
  const passed = results.filter(r => r.pass).length;
  log(`  ${passed}/${results.length} passed`);
  return results;
}

// ── Aggregate scoring ─────────────────────────────────────────────────────────

function scoreResults(allResults) {
  const scores = {};
  for (const r of allResults) {
    const inferenceFired = r.inference.filter(i => i.fired).length;
    const inferenceTotal = r.inference.length;
    const resolutions = r.resolution;
    const avgRelevance = resolutions.length ? (resolutions.reduce((s, r) => s + (r.judgment?.relevance ?? 0), 0) / resolutions.length).toFixed(1) : 'n/a';
    const avgAccuracy = resolutions.length ? (resolutions.reduce((s, r) => s + (r.judgment?.accuracy ?? 0), 0) / resolutions.length).toFixed(1) : 'n/a';
    const avgHallucination = resolutions.length ? (resolutions.reduce((s, r) => s + (r.judgment?.hallucination_risk ?? 0), 0) / resolutions.length).toFixed(1) : 'n/a';
    const verdicts = resolutions.map(r => r.judgment?.verdict ?? 'fail');
    const passRate = resolutions.length ? `${verdicts.filter(v => v === 'pass').length}/${resolutions.length}` : '0/0';
    const enrichFormats = r.enrichment.map(e => e.format);
    const formatDist = enrichFormats.reduce((acc, f) => { acc[f] = (acc[f] ?? 0) + 1; return acc; }, {});
    const ambiDetected = r.directAmbi.filter(q => q.detected).length;
    const ambiTotal = r.directAmbi.length;
    const ambiVerdicts = r.directAmbi.filter(q => q.judgment).map(q => q.judgment.verdict);
    const ambiPassRate = ambiVerdicts.length ? `${ambiVerdicts.filter(v => v === 'pass').length}/${ambiVerdicts.length}` : 'n/a';
    const ambiFormats = r.directAmbi.filter(q => q.enrichment_format).map(q => q.enrichment_format);
    const ambiFormatDist = ambiFormats.reduce((acc, f) => { acc[f] = (acc[f] ?? 0) + 1; return acc; }, {});
    scores[r.preset] = { inferenceFired, inferenceTotal, avgRelevance, avgAccuracy, avgHallucination, passRate, formatDist, ambiDetected, ambiTotal, ambiPassRate, ambiFormatDist };
  }
  return scores;
}

function log(msg) { process.stdout.write(msg + '\n'); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  log('\n╔══════════════════════════════════════════════╗');
  log('║          AMBI PIPELINE BACKTEST              ║');
  log(`║          ${new Date().toISOString().slice(0, 10)}                          ║`);
  log('╚══════════════════════════════════════════════╝');

  const vizTests = runVizDetectionTests();
  await delay(200);

  const allResults = [];
  for (const preset of [AXEL02, GTC_IRIDIUM]) {
    const result = await runPreset(preset);
    allResults.push(result);
    await delay(500);
  }

  const scores = scoreResults(allResults);

  // ── Summary ────────────────────────────────────────────────────────────────
  log('\n' + '═'.repeat(60));
  log('SUMMARY');
  log('═'.repeat(60));

  const vizPass = vizTests.filter(t => t.pass).length;
  log(`\nViz detection: ${vizPass}/${vizTests.length} correct`);

  for (const [preset, s] of Object.entries(scores)) {
    log(`\n${preset}`);
    log(`  Inference:   ${s.inferenceFired}/${s.inferenceTotal} batches fired`);
    log(`  Resolution:  pass_rate=${s.passRate} | relevance=${s.avgRelevance}/10 | accuracy=${s.avgAccuracy}/10 | hallucination=${s.avgHallucination}/10`);
    log(`  Enrichment:  ${JSON.stringify(s.formatDist)}`);
    log(`  Direct Ambi: detected ${s.ambiDetected}/${s.ambiTotal} | answer pass rate ${s.ambiPassRate}`);
    log(`  Ambi enrich: ${JSON.stringify(s.ambiFormatDist)}`);
  }

  // ── Write full results ─────────────────────────────────────────────────────
  const output = {
    run_at: new Date().toISOString(),
    viz_detection_tests: vizTests,
    preset_results: allResults,
    scores,
  };

  const outPath = join(__dirname, 'backtest-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  log(`\nFull results written to: scripts/backtest-results.json`);
}

main().catch(err => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
