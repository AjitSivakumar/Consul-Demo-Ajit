/**
 * Ambi Pipeline Backtest — Round 2
 * ─────────────────────────────────
 * Deeper diagnostic tests before any structural changes.
 * Tests: trigger edge cases, enrichment format accuracy, confidence calibration,
 * token truncation, category correctness, deduplication, adversarial non-fires,
 * web search citation reliability, and research/sales prompt divergence.
 *
 * Run: node scripts/backtest2.mjs
 * Writes: scripts/backtest2-results.json
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
// Shared helpers (mirrors aiService.ts)
// ─────────────────────────────────────────────────────────────────────────────

function detectAmbiTrigger(text) {
  const lower = text.toLowerCase();
  const hasAmbi = /\b(ambi|amby|hambi|ambee|mb)\b/.test(lower);
  if (!hasAmbi) return null;
  const isQuestion = /[?]/.test(text) ||
    /\b(what|who|where|when|how|why|can you|could you|tell me|find|look up|search|do you know|explain|summarize|compare|give me|show me)\b/.test(lower);
  if (!isQuestion) return null;
  const match = lower.match(/\b(?:ambi|amby|hambi|ambee|mb)\b[,.]?\s*(.*)/);
  const extracted = match?.[1]?.trim();
  return extracted && extracted.length > 4 ? extracted : text.trim();
}

function isVisualizationRequest(q) {
  return /\b(chart|graph|plot|visuali[sz]e|visuali[sz]ation|line chart|bar chart|trend|over time|over the (last|past)\s+\d+|timeline|compare|comparison)\b/i.test(q);
}

function stripDisclaimers(text) {
  return text
    .replace(/I (don't|do not|cannot|can't) have the (capability|ability) to (generate|create|make|produce|render) (visual content|charts?|graphs?|line charts?|bar charts?|visuali[sz]ations?)[^.]*\.\s*/gi, '')
    .replace(/However,\s*I can provide you with (the )?[^.]+data[^.]*\.\s*/gi, '')
    .trim();
}

async function callEnrichment(question, answer, hint) {
  const clean = stripDisclaimers(answer);
  if (clean.length < 80 && !hint) return { format: 'none', data: {}, raw: null };
  const hintNote = hint === 'chart'
    ? '\n\nIMPORTANT: User explicitly requested a chart. If ANY numeric table or time-series data is present, use "chart".'
    : '';
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Analyze this Q&A pair and choose a visual format. Return a JSON object.

Formats: metric_grid, chart, correction, flow, none.
metric_grid: 3+ distinct named numeric metrics that are meaningfully comparable.
chart: Table or time-series data with actual numbers. chartType "line" for time-series, "bar" for categories.
correction: Clear wrong/right split correcting a misconception.
flow: Sequential process with 3-6 discrete named steps.
none: Everything else.

Return exactly one of:
{ "format":"chart", "chart": { "labels":[...], "datasets":[{"label":"","data":[...],"color":"#hex"}], "chartType":"line|bar", "note":"" } }
{ "format":"metric_grid", "metric_grid": { "metrics":[{"label":"","value":"","sub":""}] } }
{ "format":"correction", "correction": { "wrong":"", "right":"" } }
{ "format":"flow", "flow": { "nodes":[{"id":"","label":""}] } }
{ "format":"none" }
${hintNote}`,
      },
      { role: 'user', content: `Question: ${question}\n\nAnswer: ${clean}` },
    ],
  });
  try {
    const p = JSON.parse(resp.choices[0].message.content || '{}');
    return { format: p.format ?? 'none', data: p[p.format] ?? {}, raw: p };
  } catch { return { format: 'none', data: {}, raw: null }; }
}

async function webSearch(question, context = '') {
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini-search-preview',
      web_search_options: {},
      messages: [
        { role: 'system', content: 'Answer with specific, verifiable data. If asked for a chart or comparison, provide a markdown table. Do NOT say "I cannot generate charts".' },
        { role: 'user', content: context ? `Context:\n${context}\n\nQuestion: ${question}` : question },
      ],
    });
    const choice = resp.choices?.[0];
    const annotations = choice?.message?.annotations ?? [];
    const citation = annotations.find(a => a.type === 'url_citation');
    return {
      answer: choice?.message?.content ?? '',
      sourceUrl: citation?.url ?? null,
      sourceName: citation?.title ?? null,
      hasCitation: !!citation,
      tokenCount: resp.usage?.completion_tokens ?? null,
    };
  } catch (e) {
    return { answer: '', sourceUrl: null, sourceName: null, hasCitation: false, error: e.message };
  }
}

async function judge(question, answer, context = '', expectedFormat = null) {
  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 250,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Evaluate this AI answer. Return JSON:
{
  "relevance": 0-10,
  "accuracy": 0-10,
  "hallucination_risk": 0-10,
  "completeness": 0-10,
  "verdict": "pass|warn|fail",
  "truncated": true|false,
  "notes": "one sentence"
}
truncated=true if the answer appears cut off mid-sentence.`,
      },
      { role: 'user', content: `Context: ${context.slice(0, 300)}\nQ: ${question}\nA: ${answer.slice(0, 600)}` },
    ],
  });
  try { return JSON.parse(resp.choices[0].message.content || '{}'); }
  catch { return { verdict: 'fail', notes: 'parse error' }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: detectAmbiTrigger edge cases
// ─────────────────────────────────────────────────────────────────────────────

function testTriggerDetection() {
  log('\n' + '═'.repeat(60));
  log('TEST 1: detectAmbiTrigger — edge cases');
  log('═'.repeat(60));

  const cases = [
    // Should detect
    { text: 'Hey Ambi, what is the ORR threshold for continuation?', expect: true, label: 'standard question' },
    { text: 'ambi can you find the KEYNOTE-024 Grade 2+ AE rate', expect: true, label: 'no punctuation' },
    { text: 'Amby, look up the current Iridium pricing', expect: true, label: 'amby variant' },
    { text: 'hambi tell me the pembrolizumab dosing schedule', expect: true, label: 'hambi variant' },
    { text: 'Ambi summarize the enrollment lag', expect: true, label: 'summarize keyword' },
    { text: 'Ambi compare the two device specs', expect: true, label: 'compare keyword' },
    { text: 'AMBI what is the screen failure rate benchmark?', expect: true, label: 'uppercase' },
    { text: 'Ambi, show me the stakeholder pathway', expect: true, label: 'show me' },
    // Should NOT detect
    { text: 'I think ambi this is a good point', expect: false, label: 'ambi as filler, no question' },
    { text: 'The ambient meeting environment is important', expect: false, label: 'ambient not ambi' },
    { text: 'What is the ORR threshold?', expect: false, label: 'question but no ambi' },
    { text: 'Ambi.', expect: false, label: 'ambi with no content' },
    { text: 'Let ambi handle it', expect: false, label: 'no question marker' },
    { text: 'Great job ambi', expect: false, label: 'praise, no question' },
  ];

  const results = cases.map(({ text, expect, label }) => {
    const result = detectAmbiTrigger(text);
    const got = result !== null;
    const pass = got === expect;
    log(`  ${pass ? '✓' : '✗'} [${label}] → ${got ? `"${result?.slice(0, 45)}"` : 'null'}`);
    return { text, label, expected: expect, got, extracted: result, pass };
  });

  const passed = results.filter(r => r.pass).length;
  log(`\n  Result: ${passed}/${results.length} correct`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Enrichment format accuracy — known-format Q&A pairs
// ─────────────────────────────────────────────────────────────────────────────

async function testEnrichmentFormats() {
  log('\n' + '═'.repeat(60));
  log('TEST 2: enrichResolutionOutput — known-format Q&A pairs');
  log('═'.repeat(60));

  const cases = [
    {
      label: 'clear metric_grid (3+ named numbers)',
      q: 'What are the key efficacy metrics for AXEL-02 at week 16?',
      a: 'ORR: 28% (95% CI 16.2–42.1%). Enrollment: 47/90 patients (52%). Grade 2+ AE rate: 34%. Continuation threshold: 35% ORR. PS2 screen failure rate: 29% vs protocol assumption of 18%.',
      expectFormat: 'metric_grid',
      hint: undefined,
    },
    {
      label: 'clear chart (multi-series time data)',
      q: 'Show enrollment progress per month across all three sites',
      a: `Enrollment by month:
| Month | Site A | Site B | Detroit |
|-------|--------|--------|---------|
| Jan   | 8      | 6      | 4       |
| Feb   | 9      | 7      | 3       |
| Mar   | 10     | 8      | 2       |
| Apr   | 11     | 7      | 2       |`,
      expectFormat: 'chart',
      hint: 'chart',
    },
    {
      label: 'clear correction (wrong vs right)',
      q: 'Is comparing AXEL-02 34% Grade 2+ to KEYNOTE-024 26.6% Grade 3+ valid?',
      a: 'No. AXEL-02 reports Grade 2+ adverse events (34%) while KEYNOTE-024 KEYNOTE-024 reported Grade 3+ treatment-related adverse events (26.6%). These use different grading denominators and are not directly comparable. The correct comparison requires extracting Grade 2+ data from KEYNOTE-024\'s supplementary tables, which shows approximately 52% Grade 2+ adverse events — making AXEL-02\'s 34% look better, not worse.',
      expectFormat: 'correction',
      hint: undefined,
    },
    {
      label: 'clear flow (sequential process)',
      q: 'What is the regulatory pathway for using maternal outcomes data publicly?',
      a: 'Step 1: Submit IRB amendment to include public-use data provision. Step 2: Obtain DPH sign-off on maternal outcomes data use. Step 3: Route funding request through OPM for cool corridors program. Step 4: Submit materials to adaptation office (DEEP). Step 5: Present at June policy session with Tobin Center backing.',
      expectFormat: 'flow',
      hint: undefined,
    },
    {
      label: 'should be none (factual paragraph)',
      q: 'What is pembrolizumab?',
      a: 'Pembrolizumab (Keytruda) is a humanized monoclonal antibody that targets PD-1, a checkpoint receptor on T cells. It is approved for multiple indications including NSCLC, melanoma, and other solid tumors. It works by blocking PD-1 from binding to its ligands PD-L1 and PD-L2, restoring T cell activity against tumor cells.',
      expectFormat: 'none',
      hint: undefined,
    },
    {
      label: 'should be none (single stat)',
      q: 'What is the current enrollment count?',
      a: '47 patients are enrolled as of week 16, representing 52% of the 90-patient target.',
      expectFormat: 'none',
      hint: undefined,
    },
    {
      label: 'viz-hint forces chart on borderline case',
      q: 'Can you give me a chart of the Sharpe ratio divergence?',
      a: 'The Q1 live Sharpe was 1.24 versus the backtest Sharpe of 1.87, a divergence of 0.63. In Q4 last year the live Sharpe was 1.61 and the backtest 1.92. In Q3 the live was 1.55 and the backtest 1.78.',
      expectFormat: 'chart',
      hint: 'chart',
    },
    {
      label: 'disclaimer-prefixed answer (should strip and still enrich)',
      q: 'Show me a line chart of ORR confidence intervals by sample size',
      a: "I don't have the capability to generate visual content like line charts directly. However, I can provide you with the data: At n=30, 95% CI width is ±18%. At n=50, ±14%. At n=75, ±11%. At n=100, ±9%. At n=150, ±7%. These are approximate Wilson score intervals for a 30% response rate.",
      expectFormat: 'chart',
      hint: 'chart',
    },
  ];

  const results = [];
  for (const { label, q, a, expectFormat, hint } of cases) {
    try {
      const result = await callEnrichment(q, a, hint);
      const pass = result.format === expectFormat;
      const hasData = Object.keys(result.data ?? {}).length > 0;
      log(`  ${pass ? '✓' : '✗'} [${label}]`);
      log(`     expected: ${expectFormat} | got: ${result.format}${!pass ? ' ← WRONG' : ''} | data_present: ${hasData}`);
      if (result.format === 'chart' && result.data?.labels) {
        log(`     labels: [${result.data.labels?.slice(0, 4).join(', ')}...] datasets: ${result.data.datasets?.length ?? 0}`);
      }
      if (result.format === 'metric_grid' && result.data?.metrics) {
        log(`     metrics: ${result.data.metrics?.length} items`);
      }
      results.push({ label, q, expectedFormat, gotFormat: result.format, pass, hasData, data: result.data });
    } catch (e) {
      log(`  ✗ [${label}] ERROR: ${e.message}`);
      results.push({ label, pass: false, error: e.message });
    }
    await delay(400);
  }

  const passed = results.filter(r => r.pass).length;
  log(`\n  Result: ${passed}/${results.length} correct format choices`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Inference category accuracy
// ─────────────────────────────────────────────────────────────────────────────

async function testInferenceCategories() {
  log('\n' + '═'.repeat(60));
  log('TEST 3: inferNeedsWithAI — category accuracy');
  log('═'.repeat(60));

  const cases = [
    {
      label: 'contradiction (AE grading mismatch)',
      meetingType: 'research',
      transcript: [
        'Dr. Patel: KEYNOTE-024 reported Grade 3+ treatment-related adverse events at 26.6 percent.',
        'Dr. Torres: Our Grade 2 or higher is 34 percent.',
        'Dr. Wu: Those are not directly comparable denominators.',
      ],
      expectedCategory: 'contradiction',
    },
    {
      label: 'methodology (look-ahead bias in backtest)',
      meetingType: 'research',
      transcript: [
        'James Wei: Our backtest uses same-day signal generation and execution.',
        'Dr. Reyes: That assumes we can execute at the price the signal was generated on — that is look-ahead bias.',
        'Marcus: The Sharpe divergence might just be that.',
      ],
      expectedCategory: 'methodology',
    },
    {
      label: 'metric (missing CI context)',
      meetingType: 'research',
      transcript: [
        'Dr. Torres: ORR at three months is 28 percent across 47 evaluable patients.',
        'Dr. Patel: Our protocol-specified continuation threshold is 35 percent.',
        'Dr. Wu: We need to decide on continuation before the DSMB meeting.',
      ],
      expectedCategory: 'metric',
    },
    {
      label: 'comparison (customer asking for competitor data — sales)',
      meetingType: 'sales',
      transcript: [
        'Account Exec: The Iridium GO! handles photos and data uploads passively.',
        'GTC Buyer: How does the GO! compare to the SPOT Gen4 for long expeditions?',
        'Sales Engineer: We should pull the spec comparison.',
      ],
      expectedCategory: 'comparison',
    },
    {
      label: 'should NOT fire — logistics only',
      meetingType: 'research',
      transcript: [
        'Dr. Chen: Can we meet next Tuesday?',
        'James: Tuesday works. I\'ll send a calendar invite.',
        'Dr. Chen: Perfect, let\'s use the same Zoom link.',
      ],
      expectedCategory: null, // expects empty
    },
    {
      label: 'should NOT fire — already resolved topic',
      meetingType: 'sales',
      transcript: [
        'GTC Buyer: What is the price of the Iridium Extreme?',
        'Account Exec: The Extreme retails at around $1,400.',
        'GTC Buyer: Okay good.',
      ],
      resolvedTopics: ['Iridium Extreme pricing'],
      expectedCategory: null,
    },
  ];

  const results = [];
  for (const { label, meetingType, transcript, resolvedTopics = [], expectedCategory } of cases) {
    const recentTranscript = transcript.join('\n');
    const latest = transcript[transcript.length - 1];
    const ctx = {
      meetingTitle: 'Test Meeting',
      accountContext: meetingType === 'sales' ? 'GTC' : 'PharmaCo',
      recentTranscript,
      resolvedTopics,
      meetingType,
    };

    const systemPrompt = meetingType === 'research'
      ? `You are a real-time research copilot. Surface ONE high-value question RIGHT NOW. Return JSON: { "needs": [...] } or { "needs": [] }. Each need: { "category": "hypothesis|methodology|contradiction|correction|metric|open_question", "prompt": "...", "priority": "p1", "confidence": 0.65-1.0, "rationale": "..." }. Rules: 0-1 needs. Skip logistics. Skip already-resolved topics.`
      : `You are a B2B sales deal intelligence engine. Surface ONE gap that could lose the deal. Return JSON: { "needs": [...] } or { "needs": [] }. Each need: { "category": "comparison|risk|pricing|objection|decision|correction", "prompt": "...", "priority": "p1", "confidence": 0.80-1.0, "rationale": "..." }. Rules: 0-1 needs. Trigger on CUSTOMER speech only. Skip soft topics.`;

    try {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              ctx.resolvedTopics.length ? `Already surfaced: ${ctx.resolvedTopics.join(', ')}` : null,
              `Recent transcript:\n${recentTranscript}`,
              `Latest: ${latest}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      });

      const parsed = JSON.parse(resp.choices[0].message.content || '{}');
      const needs = Array.isArray(parsed.needs) ? parsed.needs : [];
      const fired = needs.length > 0;
      const need = needs[0];
      const gotCategory = need?.category ?? null;

      const pass = expectedCategory === null
        ? !fired  // expected no fire
        : fired && gotCategory === expectedCategory;

      const verdict = expectedCategory === null
        ? (fired ? '✗ fired when should not have' : '✓ correctly silent')
        : (fired ? (gotCategory === expectedCategory ? '✓ correct category' : `✗ wrong category: got "${gotCategory}"`) : '✗ did not fire');

      log(`  ${pass ? '✓' : '✗'} [${label}]`);
      if (fired) log(`     category: ${gotCategory} | conf: ${need.confidence} | "${need.prompt?.slice(0, 60)}"`);
      else log(`     → silent (no need surfaced)`);

      results.push({ label, expectedCategory, gotCategory, fired, pass, prompt: need?.prompt });
    } catch (e) {
      log(`  ✗ [${label}] ERROR: ${e.message}`);
      results.push({ label, pass: false, error: e.message });
    }
    await delay(350);
  }

  const passed = results.filter(r => r.pass).length;
  log(`\n  Result: ${passed}/${results.length} correct`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Web search citation reliability + token truncation
// ─────────────────────────────────────────────────────────────────────────────

async function testWebSearchReliability() {
  log('\n' + '═'.repeat(60));
  log('TEST 4: Web search — citation reliability & answer completeness');
  log('═'.repeat(60));

  const queries = [
    { q: 'What is the Grade 2+ adverse event rate for pembrolizumab in KEYNOTE-024?', meetingType: 'research' },
    { q: 'What is the PS2 screen failure rate benchmark for anti-PD-L1 NSCLC trials?', meetingType: 'research' },
    { q: 'Iridium GO! vs SPOT Gen4 data upload speed and specs comparison', meetingType: 'sales' },
    { q: 'What is the current retail price of the Iridium Extreme satellite communicator?', meetingType: 'sales' },
    { q: 'What are typical phase II anti-PD-L1 trial continuation thresholds for NSCLC?', meetingType: 'research' },
    { q: 'What is the backtested vs live Sharpe ratio divergence typical for momentum factors?', meetingType: 'research' },
  ];

  const results = [];
  for (const { q, meetingType } of queries) {
    try {
      const result = await webSearch(q);
      const judged = await judge(q, result.answer);
      const answerLen = result.answer.length;
      const wordCount = result.answer.split(/\s+/).length;

      log(`  Q: "${q.slice(0, 60)}"`);
      log(`     citation: ${result.hasCitation ? '✓ ' + (result.sourceName?.slice(0, 40) ?? 'unnamed') : '✗ none'}`);
      log(`     tokens: ${result.tokenCount ?? 'unknown'} | words: ${wordCount} | truncated: ${judged.truncated ? '⚠ YES' : 'no'}`);
      log(`     verdict: ${judged.verdict} | relevance: ${judged.relevance}/10 | accuracy: ${judged.accuracy}/10 | hallucination: ${judged.hallucination_risk}/10`);
      log(`     ${judged.notes}`);

      results.push({
        question: q,
        meetingType,
        hasCitation: result.hasCitation,
        sourceName: result.sourceName,
        sourceUrl: result.sourceUrl,
        answerLength: answerLen,
        wordCount,
        tokenCount: result.tokenCount,
        truncated: judged.truncated,
        judgment: judged,
      });
    } catch (e) {
      log(`  ERROR: ${e.message}`);
      results.push({ question: q, error: e.message });
    }
    await delay(500);
  }

  const citationRate = results.filter(r => r.hasCitation).length;
  const passRate = results.filter(r => r.judgment?.verdict === 'pass').length;
  const truncated = results.filter(r => r.truncated).length;
  log(`\n  Citations: ${citationRate}/${results.length} | Pass rate: ${passRate}/${results.length} | Truncated: ${truncated}/${results.length}`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Confidence score calibration
// ─────────────────────────────────────────────────────────────────────────────

async function testConfidenceCalibration() {
  log('\n' + '═'.repeat(60));
  log('TEST 5: Inference confidence calibration');
  log('═'.repeat(60));
  log('  (Do high-confidence needs produce better answers than low-confidence ones?)');

  const highConfPairs = [
    {
      q: 'What is the published Grade 2+ AE rate in KEYNOTE-024?',
      transcript: 'KEYNOTE-024 published Grade 3+ at 26.6% but we need the Grade 2+ denominator which is in the supplementary tables.',
      expectedConfHigh: true,
    },
    {
      q: 'What is the standard look-ahead bias correction for same-day signal backtest?',
      transcript: 'We generate and execute signals on the same day which may introduce look-ahead bias.',
      expectedConfHigh: true,
    },
  ];

  const lowConfPairs = [
    {
      q: 'What is the general sentiment around momentum investing?',
      transcript: 'Momentum investing has been popular recently.',
      expectedConfHigh: false,
    },
    {
      q: 'What are some typical regulatory processes?',
      transcript: 'We should think about regulatory processes at some point.',
      expectedConfHigh: false,
    },
  ];

  const results = [];
  for (const { q, transcript, expectedConfHigh } of [...highConfPairs, ...lowConfPairs]) {
    const result = await webSearch(q, transcript);
    const judged = await judge(q, result.answer, transcript);
    log(`  [${expectedConfHigh ? 'HIGH-CONF' : 'LOW-CONF '}] "${q.slice(0, 55)}"`);
    log(`     verdict: ${judged.verdict} | relevance: ${judged.relevance}/10 | accuracy: ${judged.accuracy}/10`);
    log(`     ${judged.notes}`);
    results.push({ q, expectedConfHigh, judgment: judged });
    await delay(400);
  }

  const highPassRate = results.filter(r => r.expectedConfHigh && r.judgment?.verdict === 'pass').length;
  const lowPassRate = results.filter(r => !r.expectedConfHigh && r.judgment?.verdict !== 'fail').length;
  log(`\n  High-conf questions pass rate: ${highPassRate}/${highConfPairs.length}`);
  log(`  Low-conf questions non-fail rate: ${lowPassRate}/${lowConfPairs.length}`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Research vs Sales prompt divergence on identical transcript
// ─────────────────────────────────────────────────────────────────────────────

async function testResearchVsSalesPrompt() {
  log('\n' + '═'.repeat(60));
  log('TEST 6: Research vs Sales inference divergence on same transcript');
  log('═'.repeat(60));
  log('  (Same content — do the prompts produce different, appropriate gaps?)');

  const sharedTranscript = [
    'Speaker A: The current ORR is 28 percent against a 35 percent threshold.',
    'Speaker B: We have 47 patients enrolled out of 90. Running behind schedule.',
    'Speaker A: The AE rate is 34 percent Grade 2+. Comparable trial showed 26.6 percent Grade 3+.',
  ].join('\n');

  const latest = 'Speaker A: The AE rate is 34 percent Grade 2+. Comparable trial showed 26.6 percent Grade 3+.';

  for (const meetingType of ['research', 'sales']) {
    const systemPrompt = meetingType === 'research'
      ? `You are a real-time research copilot. Surface ONE high-value question RIGHT NOW. Return JSON: { "needs": [...] } or { "needs": [] }. Each need: { "category": "hypothesis|methodology|contradiction|correction|metric|open_question", "prompt": "...", "priority": "p1", "confidence": 0.65-1.0, "rationale": "..." }. Rules: 0-1 needs.`
      : `You are a B2B sales deal intelligence engine. Surface ONE gap that could lose the deal. Return JSON: { "needs": [...] } or { "needs": [] }. Each need: { "category": "comparison|risk|pricing|objection|decision|correction", "prompt": "...", "priority": "p1", "confidence": 0.80-1.0, "rationale": "..." }. Rules: 0-1 needs.`;

    try {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Recent transcript:\n${sharedTranscript}\n\nLatest: ${latest}` },
        ],
      });
      const parsed = JSON.parse(resp.choices[0].message.content || '{}');
      const needs = Array.isArray(parsed.needs) ? parsed.needs : [];
      const need = needs[0];
      log(`\n  [${meetingType.toUpperCase()}]`);
      if (need) {
        log(`     category: ${need.category} | conf: ${need.confidence}`);
        log(`     prompt: "${need.prompt?.slice(0, 80)}"`);
        log(`     rationale: "${need.rationale?.slice(0, 80)}"`);
      } else {
        log(`     → no need surfaced`);
      }
    } catch (e) {
      log(`  ERROR (${meetingType}): ${e.message}`);
    }
    await delay(300);
  }

  log('\n  (Qualitative — check whether research focuses on methodology/contradiction and sales on risk/comparison)');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Deduplication — does resolvedTopics prevent re-surfacing?
// ─────────────────────────────────────────────────────────────────────────────

async function testDeduplication() {
  log('\n' + '═'.repeat(60));
  log('TEST 7: Deduplication — resolvedTopics suppression');
  log('═'.repeat(60));

  const transcript = 'Dr. Wu: KEYNOTE-024 reported Grade 3+ treatment-related adverse events at 26.6 percent. Our Grade 2 or higher is 34 percent — those are not directly comparable denominators.';

  const withoutResolved = [];
  const withResolved = ['KEYNOTE-024 Grade 2+ AE rate comparison', 'AE grading denominator mismatch between AXEL-02 and KEYNOTE-024'];

  for (const [label, resolved] of [['Without resolvedTopics', withoutResolved], ['With resolvedTopics', withResolved]]) {
    const systemPrompt = `You are a real-time research copilot. Surface ONE high-value question RIGHT NOW. Return JSON: { "needs": [...] } or { "needs": [] }. Each need: { "category": "hypothesis|methodology|contradiction|correction|metric|open_question", "prompt": "...", "priority": "p1", "confidence": 0.65-1.0, "rationale": "..." }. Rules: 0-1 needs. Skip anything in the already-surfaced list.`;

    try {
      const resp = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              resolved.length ? `Already surfaced: ${resolved.join(', ')}` : null,
              `Transcript:\n${transcript}`,
            ].filter(Boolean).join('\n\n'),
          },
        ],
      });
      const parsed = JSON.parse(resp.choices[0].message.content || '{}');
      const needs = Array.isArray(parsed.needs) ? parsed.needs : [];
      const fired = needs.length > 0;
      log(`  [${label}] → ${fired ? `fired: "${needs[0].prompt?.slice(0, 65)}"` : 'silent ✓'}`);
    } catch (e) {
      log(`  [${label}] ERROR: ${e.message}`);
    }
    await delay(300);
  }

  log('\n  Expectation: fires without resolvedTopics, stays silent with them');
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Viz detection stress test — borderline and ambiguous cases
// ─────────────────────────────────────────────────────────────────────────────

function testVizDetectionBorderline() {
  log('\n' + '═'.repeat(60));
  log('TEST 8: isVisualizationRequest — borderline cases');
  log('═'.repeat(60));

  const cases = [
    // Borderline true
    { q: 'can you track the enrollment over the trial', expect: true, label: 'track = time-series intent' },
    { q: 'show how the Sharpe ratio changed quarter over quarter', expect: true, label: 'show + time' },
    { q: 'what does the AE rate look like across studies', expect: false, label: '"look like" ambiguous — not a chart keyword' },
    { q: 'map out the stakeholder relationships', expect: false, label: 'map = flow intent but not in regex' },
    // Borderline false
    { q: 'is there a trend in the data', expect: true, label: 'trend keyword' },
    { q: 'what trends are emerging', expect: true, label: 'trends keyword' },
    { q: 'how does this compare to historical', expect: true, label: 'compare keyword' },
    { q: 'draw a conclusion from the numbers', expect: false, label: 'draw ≠ chart' },
    { q: 'give me a breakdown of the costs', expect: false, label: 'breakdown ≠ chart (missing from regex)' },
    { q: 'show me the data', expect: false, label: '"show me" without chart noun' },
  ];

  const results = cases.map(({ q, expect, label }) => {
    const got = isVisualizationRequest(q);
    const pass = got === expect;
    log(`  ${pass ? '✓' : '✗'} [${label}]`);
    log(`     "${q}" → ${got ? 'chart' : 'none'} (expect: ${expect ? 'chart' : 'none'})`);
    return { q, label, expected: expect, got, pass };
  });

  const passed = results.filter(r => r.pass).length;
  log(`\n  Result: ${passed}/${results.length} correct`);
  log(`  Note: cases marked ✗ indicate gaps/false-positives in the regex`);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  log('\n╔══════════════════════════════════════════════╗');
  log('║       AMBI PIPELINE BACKTEST — ROUND 2       ║');
  log(`║       ${new Date().toISOString().slice(0, 10)}                          ║`);
  log('╚══════════════════════════════════════════════╝');

  const t1 = testTriggerDetection();
  await delay(200);

  const t8 = testVizDetectionBorderline();
  await delay(200);

  const t2 = await testEnrichmentFormats();
  await delay(300);

  const t3 = await testInferenceCategories();
  await delay(300);

  const t4 = await testWebSearchReliability();
  await delay(300);

  const t5 = await testConfidenceCalibration();
  await delay(300);

  await testResearchVsSalesPrompt();
  await delay(300);

  await testDeduplication();

  // Final aggregate
  log('\n' + '═'.repeat(60));
  log('AGGREGATE SUMMARY');
  log('═'.repeat(60));
  log(`  T1 Trigger detection:      ${t1.filter(r=>r.pass).length}/${t1.length} correct`);
  log(`  T8 Viz detection (border): ${t8.filter(r=>r.pass).length}/${t8.length} correct`);
  log(`  T2 Enrichment formats:     ${t2.filter(r=>r.pass).length}/${t2.length} correct`);
  log(`  T3 Inference categories:   ${t3.filter(r=>r.pass).length}/${t3.length} correct`);
  log(`  T4 Web search:`);
  log(`       Citations found: ${t4.filter(r=>r.hasCitation).length}/${t4.length}`);
  log(`       Answers pass: ${t4.filter(r=>r.judgment?.verdict==='pass').length}/${t4.length}`);
  log(`       Truncated: ${t4.filter(r=>r.truncated).length}/${t4.length}`);

  const output = {
    run_at: new Date().toISOString(),
    t1_trigger_detection: t1,
    t2_enrichment_formats: t2,
    t3_inference_categories: t3,
    t4_web_search_reliability: t4,
    t5_confidence_calibration: t5,
    t8_viz_detection_borderline: t8,
  };

  const out = join(__dirname, 'backtest2-results.json');
  writeFileSync(out, JSON.stringify(output, null, 2));
  log(`\n  Full results: scripts/backtest2-results.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
