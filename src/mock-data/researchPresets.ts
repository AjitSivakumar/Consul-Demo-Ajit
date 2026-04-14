import { MeetingContext, TranscriptEvent } from '../types/domain';

export interface ResearchMeetingPreset {
  id: string;
  label: string;
  context: MeetingContext;
  transcript: TranscriptEvent[];
  autoPlay?: boolean;
  liveAI?: boolean;
}

export const researchPresets: ResearchMeetingPreset[] = [
  // ─── Preset R1: AXEL-02 Phase II Clinical Trial Safety Review ────────────
  // PharmaCo oncology team reviewing week-16 interim data for anti-PD-L1 in NSCLC.
  // Key tensions: ORR below protocol threshold, AE grading denominator mismatch vs
  // KEYNOTE-024, enrollment pace deficit, and a decision on third site opening.
  {
    id: 'axel-02-phase2',
    label: 'AXEL-02 Phase II — Safety Review',
    liveAI: true,
    context: {
      meetingId: 'meeting-axel-02-phase2',
      title: 'AXEL-02 Phase II — Week 16 Safety & Efficacy Interim Review',
      participants: ['Dr. Maya Patel', 'Dr. Liam Torres', 'Dr. Jennifer Wu'],
      accountContext: 'PharmaCo Oncology — AXEL-02 Program',
      projectContext: 'Phase II trial of AXEL-02 (anti-PD-L1 inhibitor) in treatment-naive NSCLC. Primary endpoint: ORR ≥ 35% at interim analysis. Target enrollment: 90 patients.',
      discussedThemes: [],
      unresolvedQuestions: [],
      deliverableTargets: ['DSMB safety memo', 'Enrollment recovery plan', 'AE benchmark comparison table'],
      confidenceByTheme: {},
      meetingType: 'research',
    },
    transcript: [
      {
        id: 'evt-ax-1',
        segmentId: 'seg-ax-1',
        timestampIso: '2026-04-08T09:00:05Z',
        speaker: 'Dr. Jennifer Wu',
        text: "Week 16 enrollment update: we're at 47 of 90 patients enrolled. That's 52 percent of target, running about three weeks behind the protocol timeline.",
      },
      {
        id: 'evt-ax-2',
        segmentId: 'seg-ax-2',
        timestampIso: '2026-04-08T09:00:35Z',
        speaker: 'Dr. Maya Patel',
        text: "What's driving the lag — screen failures or site throughput at the Detroit center?",
      },
      {
        id: 'evt-ax-3',
        segmentId: 'seg-ax-3',
        timestampIso: '2026-04-08T09:01:00Z',
        speaker: 'Dr. Jennifer Wu',
        text: "Mostly screen failures. Performance status 2 patients are appearing in the Detroit referral pool at 29 percent — our protocol eligibility assumption was 18 percent. That gap is the primary bottleneck.",
      },
      {
        id: 'evt-ax-4',
        segmentId: 'seg-ax-4',
        timestampIso: '2026-04-08T09:01:30Z',
        speaker: 'Dr. Liam Torres',
        text: "Before we resolve enrollment, I need to flag the interim efficacy snapshot. ORR at three months across 47 evaluable patients is 28 percent. Our protocol-specified continuation threshold is 35 percent.",
      },
      {
        id: 'evt-ax-5',
        segmentId: 'seg-ax-5',
        timestampIso: '2026-04-08T09:01:58Z',
        speaker: 'Dr. Maya Patel',
        text: "We're below threshold but at 47 patients the confidence interval should be very wide. What's the 95 percent CI on that 28 percent?",
      },
      {
        id: 'evt-ax-6',
        segmentId: 'seg-ax-6',
        timestampIso: '2026-04-08T09:02:22Z',
        speaker: 'Dr. Liam Torres',
        text: "95 percent CI is 16.2 to 42.1 percent. We cannot call failure — 35 percent is well within the interval. The DSMB will want AE contextualization before approving continuation.",
      },
      {
        id: 'evt-ax-7',
        segmentId: 'seg-ax-7',
        timestampIso: '2026-04-08T09:02:50Z',
        speaker: 'Dr. Maya Patel',
        text: "On safety: two SAEs, both Grade 3 immune pneumonitis, both resolved with high-dose steroids within two weeks. Total Grade 2 or higher adverse event rate is 34 percent of enrolled patients.",
      },
      {
        id: 'evt-ax-8',
        segmentId: 'seg-ax-8',
        timestampIso: '2026-04-08T09:03:18Z',
        speaker: 'Dr. Jennifer Wu',
        text: "The DSMB will ask us to benchmark against KEYNOTE-024. Do we have the pembrolizumab comparator AE rate available for the memo?",
      },
      {
        id: 'evt-ax-9',
        segmentId: 'seg-ax-9',
        timestampIso: '2026-04-08T09:03:45Z',
        speaker: 'Dr. Liam Torres',
        text: "KEYNOTE-024 reported Grade 3 or higher treatment-related adverse events at 26.6 percent. Our Grade 2 or higher is 34 percent — those are not directly comparable denominators.",
      },
      {
        id: 'evt-ax-10',
        segmentId: 'seg-ax-10',
        timestampIso: '2026-04-08T09:04:12Z',
        speaker: 'Dr. Maya Patel',
        text: "That's exactly the problem. If we present our 34 percent Grade 2+ alongside their 26.6 percent Grade 3+, it will look worse than it actually is. The DSMB needs the same grading denominator for a valid comparison.",
      },
      {
        id: 'evt-ax-11',
        segmentId: 'seg-ax-11',
        timestampIso: '2026-04-08T09:04:40Z',
        speaker: 'Dr. Jennifer Wu',
        text: "KEYNOTE-024 does publish Grade 2+ breakdown in the supplementary tables. We need to pull that before we submit the safety memo or we're comparing apples to oranges in front of the DSMB.",
      },
      {
        id: 'evt-ax-12',
        segmentId: 'seg-ax-12',
        timestampIso: '2026-04-08T09:05:05Z',
        speaker: 'Dr. Liam Torres',
        text: "Separately on enrollment: if the Detroit screen failure rate holds at 29 percent, we track to full enrollment by week 30 — a six-week protocol deviation. We need a decision on whether to open a third site or adjust eligibility criteria.",
      },
      {
        id: 'evt-ax-13',
        segmentId: 'seg-ax-13',
        timestampIso: '2026-04-08T09:05:35Z',
        speaker: 'Dr. Maya Patel',
        text: "Let's run the power analysis under the current pace before we commit to a third site. If we can still hit the primary endpoint at 80 of 90 patients, a six-week delay may be the lower-risk path.",
      },
    ],
  },

  // ─── Preset R2: Momentum Factor Q1 Live vs Backtest Validation ───────────
  // Quant team reviewing Q1 live performance vs backtest for a US large-cap
  // momentum strategy. Core discoveries: look-ahead bias in backtest inflated
  // Sharpe by ~0.4, factor crowding drove the March drawdown, and turnover
  // friction accounts for most of the remaining live/backtest gap.
  {
    id: 'momentum-q1-validation',
    label: 'Momentum Factor Q1 Validation',
    autoPlay: true,
    liveAI: true,
    context: {
      meetingId: 'meeting-momentum-q1',
      title: 'Momentum Factor Q1 Live vs Backtest Validation',
      participants: ['James Wei', 'Dr. Sofia Reyes', 'Marcus Chen'],
      accountContext: 'Quantitative Strategies Group',
      projectContext: 'US large-cap momentum factor strategy. Q1 live Sharpe 1.24 vs backtest 1.87. March drawdown -4.2%. Annual turnover 340%.',
      discussedThemes: [],
      unresolvedQuestions: [],
      deliverableTargets: ['Backtest correction report', 'Performance attribution memo', 'Turnover optimization proposal'],
      confidenceByTheme: {},
      meetingType: 'research',
    },
    transcript: [
      {
        id: 'evt-mq-1',
        segmentId: 'seg-mq-1',
        timestampIso: '2026-04-09T10:00:05Z',
        speaker: 'James Wei',
        text: "Q1 live numbers are finalized. Annualized Sharpe is 1.24. The backtest over the same lookback window was 1.87. That's a 63 basis point divergence — I want to understand what's driving it.",
      },
      {
        id: 'evt-mq-2',
        segmentId: 'seg-mq-2',
        timestampIso: '2026-04-09T10:00:32Z',
        speaker: 'Dr. Sofia Reyes',
        text: "63 basis points of Sharpe divergence is outside noise. I've been looking at three possible sources: slippage, factor degradation, and backtest methodology. I have findings on all three.",
      },
      {
        id: 'evt-mq-3',
        segmentId: 'seg-mq-3',
        timestampIso: '2026-04-09T10:00:58Z',
        speaker: 'Marcus Chen',
        text: "Before we attribute the divergence, I want to flag the March drawdown. Peak to trough was negative 4.2 percent over nine trading sessions. That's within policy limits but the velocity is abnormal.",
      },
      {
        id: 'evt-mq-4',
        segmentId: 'seg-mq-4',
        timestampIso: '2026-04-09T10:01:22Z',
        speaker: 'Dr. Sofia Reyes',
        text: "The nine-session drawdown aligns with the momentum reversal week. I checked — we were at 94th percentile momentum factor loading that week. Heavily concentrated at the tail of the distribution.",
      },
      {
        id: 'evt-mq-5',
        segmentId: 'seg-mq-5',
        timestampIso: '2026-04-09T10:01:48Z',
        speaker: 'James Wei',
        text: "That's factor crowding. Five of our top ten holdings appear in at least three major momentum ETFs. When the factor reverses, all those vehicles are liquidating the same names simultaneously.",
      },
      {
        id: 'evt-mq-6',
        segmentId: 'seg-mq-6',
        timestampIso: '2026-04-09T10:02:15Z',
        speaker: 'Dr. Sofia Reyes',
        text: "Crowding explains the drawdown velocity. Now on the Sharpe gap: I ran a look-ahead bias audit. The backtest rebalancing signals were computed using closing prices from the same trading day as execution.",
      },
      {
        id: 'evt-mq-7',
        segmentId: 'seg-mq-7',
        timestampIso: '2026-04-09T10:02:42Z',
        speaker: 'Marcus Chen',
        text: "So the backtest was seeing end-of-day prices at the exact moment it was placing orders. That's optimistic — it's trading on information not available at execution time.",
      },
      {
        id: 'evt-mq-8',
        segmentId: 'seg-mq-8',
        timestampIso: '2026-04-09T10:03:08Z',
        speaker: 'Dr. Sofia Reyes',
        text: "Exactly. Correcting to a T-1 signal — using prior close to drive T rebalance — brings the backtest Sharpe down to approximately 1.48. The unexplained live gap shrinks from 63 to about 24 basis points.",
      },
      {
        id: 'evt-mq-9',
        segmentId: 'seg-mq-9',
        timestampIso: '2026-04-09T10:03:35Z',
        speaker: 'James Wei',
        text: "24 basis points is manageable. Now let's account for friction costs. Annual turnover is running at 340 percent. What does that cost us in real transaction drag?",
      },
      {
        id: 'evt-mq-10',
        segmentId: 'seg-mq-10',
        timestampIso: '2026-04-09T10:04:00Z',
        speaker: 'Dr. Sofia Reyes',
        text: "At 340 percent turnover, with average implementation shortfall of 8 basis points per leg on a two-leg rebalance, I'm estimating roughly 54 basis points of annual drag from transaction costs alone.",
      },
      {
        id: 'evt-mq-11',
        segmentId: 'seg-mq-11',
        timestampIso: '2026-04-09T10:04:28Z',
        speaker: 'Marcus Chen',
        text: "So corrected backtest Sharpe of 1.48 minus 54 bps of friction gives us a net expected Sharpe around 1.29. Live at 1.24 — the remaining gap is within estimation error. The factor isn't broken.",
      },
      {
        id: 'evt-mq-12',
        segmentId: 'seg-mq-12',
        timestampIso: '2026-04-09T10:04:55Z',
        speaker: 'James Wei',
        text: "That's a better story than I expected. The backtest had a methodology flaw and real friction explains the rest. But the crowding problem in March is structural — we haven't solved that.",
      },
      {
        id: 'evt-mq-13',
        segmentId: 'seg-mq-13',
        timestampIso: '2026-04-09T10:05:22Z',
        speaker: 'Dr. Sofia Reyes',
        text: "I'll model a diversification constraint — cap any position to appear in at most two major factor ETFs. I'll show what that does to our factor loading and expected net Sharpe versus current construction.",
      },
    ],
  },

  // ─── Preset R3: CRISPR Off-Target Month 6 Review ─────────────────────────
  // Vasquez lab reviewing month-6 data comparing lipofection vs electroporation
  // for CRISPR-Cas9 delivery in primary human T cells. Key issues: Zhang lab
  // discrepancy (different Cas9 variant), HEK293 generalizability, and incomplete
  // GUIDE-seq wet lab validation before submission.
  {
    id: 'crispr-offtarget-m6',
    label: 'CRISPR Off-Target — Month 6 Review',
    liveAI: true,
    context: {
      meetingId: 'meeting-crispr-m6',
      title: 'CRISPR-Cas9 Delivery Comparison — Month 6 Progress Review',
      participants: ['Dr. Elena Vasquez', 'Kai Huang', 'Aisha Okonkwo'],
      accountContext: 'Vasquez Lab — Biomedical Engineering',
      projectContext: 'Lipofection vs electroporation for CRISPR-Cas9 delivery in primary human T cells. Measuring on-target editing efficiency and off-target events (GUIDE-seq). Preparing for submission to Nature Methods.',
      discussedThemes: [],
      unresolvedQuestions: [],
      deliverableTargets: ['Methods paper draft', 'GUIDE-seq validation summary', 'Zhang lab comparison memo'],
      confidenceByTheme: {},
      meetingType: 'research',
    },
    transcript: [
      {
        id: 'evt-cr-1',
        segmentId: 'seg-cr-1',
        timestampIso: '2026-04-10T14:00:05Z',
        speaker: 'Dr. Elena Vasquez',
        text: "Month 6 delivery comparison results. Lipofection on-target editing efficiency: 73 percent in primary T cells. Electroporation: 61 percent. Both measured by digital PCR at day 7 post-transfection.",
      },
      {
        id: 'evt-cr-2',
        segmentId: 'seg-cr-2',
        timestampIso: '2026-04-10T14:00:38Z',
        speaker: 'Kai Huang',
        text: "The efficiency gap between methods is consistent with month 3. But the off-target profile is where the two methods diverge most significantly.",
      },
      {
        id: 'evt-cr-3',
        segmentId: 'seg-cr-3',
        timestampIso: '2026-04-10T14:01:05Z',
        speaker: 'Aisha Okonkwo',
        text: "GUIDE-seq results: lipofection averaging 0.8 predicted off-target sites per guide. Electroporation is 0.3. So lipofection is more efficient but produces nearly three times the off-target signal.",
      },
      {
        id: 'evt-cr-4',
        segmentId: 'seg-cr-4',
        timestampIso: '2026-04-10T14:01:32Z',
        speaker: 'Dr. Elena Vasquez',
        text: "For a therapeutic application moving toward IND, 0.3 versus 0.8 off-target sites per guide is not marginal. That's a clinically meaningful safety gap, and reviewers will ask us to contextualize it.",
      },
      {
        id: 'evt-cr-5',
        segmentId: 'seg-cr-5',
        timestampIso: '2026-04-10T14:01:58Z',
        speaker: 'Kai Huang',
        text: "The Zhang lab published in Nature Methods 2024 showing 68 percent efficiency with lipofection in primary T cells using a similar guide. Our 73 percent is higher, but their GUIDE-seq off-target count was 0.4 — not 0.8. That discrepancy needs addressing before we submit.",
      },
      {
        id: 'evt-cr-6',
        segmentId: 'seg-cr-6',
        timestampIso: '2026-04-10T14:02:25Z',
        speaker: 'Dr. Elena Vasquez',
        text: "The off-target discrepancy with Zhang is significant. Is this Cas9 variant, guide design, cell donor variability, or protocol timing? We can't frame our numbers as directly comparable without understanding the source.",
      },
      {
        id: 'evt-cr-7',
        segmentId: 'seg-cr-7',
        timestampIso: '2026-04-10T14:02:52Z',
        speaker: 'Aisha Okonkwo',
        text: "I checked their methods section: Zhang lab used SpCas9-HF1 high-fidelity variant. We're running standard SpCas9. HF1 is specifically engineered to reduce off-target activity through conformational proofreading.",
      },
      {
        id: 'evt-cr-8',
        segmentId: 'seg-cr-8',
        timestampIso: '2026-04-10T14:03:18Z',
        speaker: 'Kai Huang',
        text: "That explains the off-target difference entirely. Their 0.4 is with a construct designed to minimize off-target events. Our 0.8 with standard SpCas9 is in the expected range for unmodified enzyme.",
      },
      {
        id: 'evt-cr-9',
        segmentId: 'seg-cr-9',
        timestampIso: '2026-04-10T14:03:44Z',
        speaker: 'Dr. Elena Vasquez',
        text: "For the paper: do we add an HF1 comparison arm, or scope it as future work? An HF1 arm would add 8 to 10 weeks of wet lab time. That's the trade-off.",
      },
      {
        id: 'evt-cr-10',
        segmentId: 'seg-cr-10',
        timestampIso: '2026-04-10T14:04:10Z',
        speaker: 'Aisha Okonkwo',
        text: "There's also the cell model question. Most of our data is from primary T cells. The Zhang lab's 2024 comparison initially used HEK293 cells for preliminary screening before moving to primary T cells.",
      },
      {
        id: 'evt-cr-11',
        segmentId: 'seg-cr-11',
        timestampIso: '2026-04-10T14:04:36Z',
        speaker: 'Kai Huang',
        text: "HEK293 and primary T cells have fundamentally different transfection dynamics, chromatin accessibility, and doubling time. HEK293 results don't reliably predict primary T cell behavior — they're not a valid direct comparator.",
      },
      {
        id: 'evt-cr-12',
        segmentId: 'seg-cr-12',
        timestampIso: '2026-04-10T14:05:00Z',
        speaker: 'Dr. Elena Vasquez',
        text: "We should address the HEK293 generalizability limitation explicitly in the discussion rather than leave it for reviewers to surface as a critique.",
      },
      {
        id: 'evt-cr-13',
        segmentId: 'seg-cr-13',
        timestampIso: '2026-04-10T14:05:25Z',
        speaker: 'Aisha Okonkwo',
        text: "One last item: what's the plan for GUIDE-seq wet lab validation? We have computational predictions but the wet lab confirmation is still incomplete — reviewers will flag this.",
      },
      {
        id: 'evt-cr-14',
        segmentId: 'seg-cr-14',
        timestampIso: '2026-04-10T14:05:50Z',
        speaker: 'Kai Huang',
        text: "We've confirmed 6 of the top 8 predicted off-target sites by wet lab sequencing. The remaining two need a fresh T cell batch — I have that scheduled for next Tuesday at the blood bank.",
      },
    ],
  },
];
