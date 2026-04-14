# Research Meeting Mode — System Plan

## Overview

Ambi supports two meeting types: `sales` and `research`. This document describes how research meetings are configured, how context flows through the AI pipeline, and what inputs/outputs are expected at each stage.

---

## 1. Meeting Types and Configuration

### How meetingType is set

1. User clicks "Start a Meeting" on the dashboard → `PreMeetingModal` opens.
2. User toggles the meeting type button (Sales / Research).
3. On confirm, `SET_MEETING_CONTEXT` is dispatched with `meetingType: 'research'`.
4. `initialMeetingState.context.meetingType` defaults to `'sales'` — so the system is always typed.

### Where meetingType lives

| Location | Field |
|---|---|
| `MeetingState.context` | `meetingType?: 'sales' \| 'research'` |
| `MeetingContextPacket` | `meetingType: 'sales' \| 'research'` |
| `MeetingPreset.context` | `meetingType?: 'sales' \| 'research'` |

### Presets with meetingType: 'research'
- `chen-tobin-heat` — climate/epidemiology (existing)
- `chen-tobin-heat-auto` — same, autoPlay version
- `axel-02-phase2` — Phase II clinical trial safety review *(new)*
- `momentum-q1-validation` — quant finance live vs backtest validation *(new)*
- `crispr-offtarget-m6` — CRISPR delivery comparison *(new)*

---

## 2. Real-Time AI Inference Pipeline

Every transcript event while `liveStatus === 'listening'` runs through two parallel tracks:

### Track A: Triggered needs (`inferNeedsWithAI`)
- Fires every 20s minimum, after 5+ transcript events
- Reads the `MeetingContextPacket` which includes `meetingType`
- **Research system prompt** hunts for:
  - `hypothesis` — unverified claims about causal relationships
  - `methodology` — undefined procedures, sampling, statistical methods
  - `contradiction` — results that conflict with cited prior work
  - `correction` — misstatements of fact or framing that could damage credibility
  - `metric` — specific numbers without context (effect sizes, p-values, rates)
  - `open_question` — explicit unknowns the team needs to resolve
- Returns 0–2 needs with `confidence ≥ 0.70`

### Track B: Ambient suggestions (`generateAmbientSuggestion`)
- Fires every 10s minimum, on segments ≥15 words
- **Research system prompt** looks for:
  - Prior study contradictions worth surfacing
  - Methodological concerns not yet raised in the conversation
  - Key statistics that require literature context
  - Timing or process risks (e.g., submission deadlines, regulatory windows)
- Returns `null` or `{ headline, prompt, rationale, category }` with importance 1–10

### Direct Ambi queries
- Fires whenever the trigger word (`ambi`, `amby`, `hambi`, `ambee`) appears + question detected
- Bypasses normal inference for that tick
- Uses `generateDirectAmbiResponse()`: docs-first, then general GPT knowledge
- Creates a `direct_query` category need shown with "You asked" badge

---

## 3. Context Packet Construction

Assembled in `useAmbientMeetingAI.ts` before every AI call:

```ts
const ctxPacket: MeetingContextPacket = {
  meetingTitle: state.context.title,
  accountContext: state.context.accountContext,
  detectedThemes: state.context.discussedThemes,
  resolvedTopics: state.evidence.map(e => e.title),
  unresolvedQuestions: state.context.unresolvedQuestions,
  recentTranscript: state.transcript.slice(-10).map(...).join('\n'),
  elapsedMinutes: ...,
  meetingType: state.context.meetingType ?? 'sales',
};
```

The `buildContextBlock()` helper in `aiService.ts` converts this to a formatted string prepended to every prompt.

---

## 4. Demo Presets vs Live AI

### Preset mode (`presetActive: true`)
- Set when `LOAD_PRESET` is dispatched
- **Blocks all AI inference** — no `inferNeedsWithAI`, no `generateAmbientSuggestion`
- Only `inferInformationNeeds()` from `inferenceEngine.ts` runs — checks `demoTriggers`
- Each trigger fires at most once per event (first match wins — `break` after first trigger)
- Each `InformationNeed` created has `demoEvidence` pre-loaded (no AI call needed to resolve)
- Auto-resolve uses the `demoEvidence` directly on first status === 'new' detection

### Live AI mode (`presetActive: false`)
- Full AI inference pipeline runs
- `demoTriggers` still checked (but no preset is active, so `activePresetId` is null → triggers for all presets are skipped if `activePresetId && trigger.presetId !== activePresetId`)
- AI-generated needs auto-resolved via: uploaded docs → GPT general knowledge → mark failed

---

## 5. Original Research Presets

### R1: AXEL-02 Phase II — Clinical Trial Safety Review
**File:** `src/mock-data/researchPresets.ts`  
**ID:** `axel-02-phase2`

**Participants:** Dr. Maya Patel (PI), Dr. Liam Torres (Biostatistician), Dr. Jennifer Wu (Clinical Monitor)

**Scenario:** Week-16 interim review of a Phase II anti-PD-L1 inhibitor trial in first-line NSCLC. Three interlocking problems:
1. ORR 28% below protocol threshold of 35% — but CI is too wide at n=47 to conclude failure
2. AE denominator mismatch: team about to present Grade 2+ (34%) against KEYNOTE-024's Grade 3+ (26.6%) — incomparable
3. Enrollment 3 weeks behind due to screen failure rate 29% vs 18% expected at Detroit site

**Demo triggers:**

| Trigger | Fires on | Evidence type |
|---|---|---|
| ORR/enrollment metric | "28 percent" + "threshold" or "47 of 90" | `richMetricGrid` — ORR, CI, SAEs, enrollment |
| AE comparison methodology | "KEYNOTE-024" + "26.6" or "pembrolizumab comparator" | `richTable` — AXEL-02 vs KEYNOTE-024 AE breakdown |
| AE denominator caution | "comparable denominators" or Grade 2+/Grade 3+ comparison | `richCorrectionBlock` — wrong/right framing for DSMB memo |

---

### R2: Momentum Factor Q1 — Live vs Backtest Validation
**File:** `src/mock-data/researchPresets.ts`  
**ID:** `momentum-q1-validation` *(autoPlay: true)*

**Participants:** James Wei (Portfolio Manager), Dr. Sofia Reyes (Quantitative Analyst), Marcus Chen (Risk Manager)

**Scenario:** Q1 live Sharpe of 1.24 diverges from backtest of 1.87. Root cause analysis reveals three compounding issues:
1. Same-day look-ahead bias in backtest inflated Sharpe from 1.87 → corrected 1.48
2. Factor crowding at 94th percentile loading amplified March reversal drawdown (-4.2% in 9 sessions)
3. 340% annualized turnover generates ~54 bps friction, explaining most of the residual live/backtest gap

**Demo triggers:**

| Trigger | Fires on | Evidence type |
|---|---|---|
| Factor crowding hypothesis | "factor crowding" or "94th percentile" momentum | `richMetricGrid` — loading, ETF overlap, drawdown velocity |
| Look-ahead bias methodology | "look-ahead bias" + backtest or same-day signal | `richCorrectionBlock` — corrected Sharpe 1.87→1.48 |
| Turnover friction metric | "implementation shortfall" or "340" + "turnover" | `richMetricGrid` — turnover rate, drag bps, net Sharpe |

---

### R3: CRISPR Off-Target — Month 6 Delivery Comparison
**File:** `src/mock-data/researchPresets.ts`  
**ID:** `crispr-offtarget-m6`

**Participants:** Dr. Elena Vasquez (PI), Kai Huang (Postdoc), Aisha Okonkwo (Grad Student)

**Scenario:** Month-6 comparison of lipofection vs electroporation for CRISPR-Cas9 delivery in primary human T cells. Lipofection wins on efficiency (73% vs 61%) but loses on off-target safety (0.8 vs 0.3 sites/guide). Three issues for the Nature Methods paper:
1. Apparent discrepancy with Zhang lab 2024 (0.4 off-target) explained by Cas9 variant (HF1 vs standard)
2. Zhang's HEK293 preliminary data is not a valid comparator to primary T cell results
3. GUIDE-seq wet lab validation is 75% complete — 2 of 8 sites still pending a fresh T cell batch

**Demo triggers:**

| Trigger | Fires on | Evidence type |
|---|---|---|
| Zhang lab contradiction | "zhang lab" + "68" or "nature methods" + "lipofection" | `richTable` — head-to-head comparison with Cas9 variant noted |
| HEK293 methodology | "hek293" or "generalizability" + "primary" | `richCorrectionBlock` — invalid vs valid comparison framing |
| GUIDE-seq validation | "guide-seq" + "plan"/"wet lab" or "6 of 8" confirmed | `richMetricGrid` — validation status and submission critical path |

---

## 6. End-of-Meeting Deliverables

All four deliverable generators branch on `meetingType`:

| Generator | Sales output | Research output |
|---|---|---|
| `generateResearchSummary` | Deal gap analysis, competitive risks | Findings summary, data quality flags, open questions |
| `generateQAAnswers` | Objection responses, pricing Q&A | Methodology Q&A, findings Q&A, data quality Q&A |
| `generateActionItems` | AE / SE / SE owner actions | PI / Team / External owner actions |
| `generateSlideDeck` | Discovery → problem → solution → ROI | Background → methodology → key findings → open questions → next steps |

---

## 7. AI Live Mode (Research)

When `mode === 'ai-live'` and `meetingType === 'research'`, `generateLiveTranscriptTurns` uses a research-specific system prompt:

- Participants are researchers (PI, postdoc, grad student, etc.)
- Turns include specific data references, statistical caveats, methodological concerns
- 10–35 words per turn (slightly longer than sales for technical precision)
- No sales language

The `meetingType` is passed from `useTranscriptRunner` via `stateRef.current.context.meetingType`.

---

## 8. Insight Card Visual Distinction

| Category | Tag | Card style |
|---|---|---|
| `correction` | "Caution" (amber dot) | Caution modal on resolve |
| `comparison` | "Diagram" (purple dot) | Diagram modal on resolve |
| `direct_query` | "You asked" (blue dot) | Blue border `.irow--direct` |
| All others | none | Default purple border |

Research-specific categories (`hypothesis`, `methodology`, `contradiction`) render as standard cards with the prompt text. They can be extended with custom tags if visual distinction for research categories becomes a priority.

---

## 9. Known Limitations

- **Chen Lab presets** do not have `demoEvidence` on their triggers — they produce needs that auto-resolve via AI (GPT knowledge). If `presetActive` is true, AI inference is blocked, so those needs will stay in `'new'` status unless auto-resolve runs first. The Chen Lab presets use the special-case `CHEN_LAB_PRESET_IDS` handler in `useAmbientMeetingAI.ts` for end-of-meeting.
- **All 3 new research presets** have full `demoEvidence` — they work correctly in preset mode.
- **Confidence threshold** for auto-resolve from AI: ≥ 0.65. Research mode AI returns similar confidence ranges to sales mode.
- **PDF parsing is stubbed** — `documentService.ts` returns placeholder text. Uploaded PDFs will not yield useful doc context for research queries.
