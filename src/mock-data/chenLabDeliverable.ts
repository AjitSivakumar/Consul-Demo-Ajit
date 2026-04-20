import type { GeneratedDeliverables } from '../types/deliverables';

/** Hardcoded deliverable for the Chen Lab × Tobin Center preset. */
export const chenLabDeliverable: GeneratedDeliverables = {
  // ── 01 Research summary ─────────────────────────────────────────────────────
  research: {
    question:
      'What is the effect size for extreme heat exposure on preterm birth in high-risk Connecticut census tracts, and does the evidence support a cost-benefit projection for the adaptation office?',
    answer:
      'Chen Lab data shows a **relative risk of approximately 1.4** for preterm birth on extreme heat days among third-trimester pregnancies in low-income census tracts in New Haven — the highest-confidence stratum in the dataset. This represents **~40% excess risk above baseline** in that population. Even after applying conservative assumptions to account for the unresolved AC access confounder, the directionality is stable.\n\nAt a NICHD-reported average direct cost of **~$50,000 per preterm birth**, a lower-bound pilot estimate for New Haven is defensible and actionable before the June session. What the current data **cannot** support is a single-point city-wide projection — that framing would invite methodological scrutiny the preprint (pre-peer-review) is not yet positioned to withstand.\n\nRecommended narrative for the adaptation office: **pilot justification anchored on a credible lower bound, not a city-wide forecast**.',
    comparisonTable: {
      columns: ['Geography', 'Data quality', 'Sample', 'Effect (RR)', 'Confounder risk', 'Pitch role'],
      rows: [
        ['New Haven — low-income tracts', 'High · census tract', 'Sufficient', '~1.4', 'Low — stable post-adjustment', 'Anchor'],
        ['New Haven — all tracts', 'High · census tract', 'Large', '~1.2', 'Low', 'Supporting'],
        ['Bridgeport', 'Thin · sparse tracts', 'Limited', 'Directional', 'High — may not survive revision', 'Secondary'],
        ['Statewide CT', 'Aggregate only', 'Very large', 'Not stratified', 'Moderate', 'Background context'],
      ],
    },
    barChart: [
      { label: 'NH · low-income · Q3 (RR 1.4)', value: 40, style: 'primary' },
      { label: 'NH · all tracts · Q3 (RR 1.2)', value: 22, style: 'muted' },
      { label: 'Conservative lower bound', value: 28, style: 'primary' },
      { label: 'Bridgeport · directional only', value: 14, style: 'muted' },
    ],
    barChartNote:
      'Bars show % excess risk above baseline (RR − 1 × 100). Lower bound estimates post-AC access confounder adjustment. Bridgeport value is directional — not suitable for primary citation.',
    keyFinding: {
      text:
        '**The evidence is strong enough to justify a pilot** — but not a city-wide cost-benefit projection with a single point estimate. Lead with a credible lower-bound New Haven estimate; position Bridgeport as directional pending peer-review revision.',
      source: 'Chen Lab preprint (pre-peer-review) · Tobin Center meeting, April 10 2026',
    },
    sources: [
      'Chen Lab preprint — Heat Exposure & Preterm Birth in CT Census Tracts (pre-peer-review)',
      'NICHD — Average direct cost per preterm birth: ~$50,000',
      'Meeting transcript — Sarah Chen & James Okafor, April 10 2026',
    ],
  },

  // ── 02 Q&A ──────────────────────────────────────────────────────────────────
  qa: {
    categories: [
      {
        label: 'Evidence & Methodology',
        items: [
          {
            tag: 'DATA',
            question: 'What is the core effect size, and how confident should we be in it?',
            answer:
              '**RR ≈ 1.4** (~40% excess preterm birth risk) on extreme heat days, third-trimester pregnancies, low-income tracts in New Haven. The directionality is stable even under conservative assumptions, but the AC access confounder is unresolved — the precise point estimate may shift in the peer-reviewed revision.',
            source: 'Chen Lab preprint',
          },
          {
            tag: 'DATA',
            question: 'Why can\'t we present a single city-wide cost-benefit number?',
            answer:
              'The preprint is **pre-peer-review** and the AC confounder adjustment is incomplete. A city-wide projection built on this figure would invite the kind of methodological scrutiny the data cannot yet withstand. A lower-bound pilot estimate for New Haven is defensible; a city-wide forecast is not.',
            source: 'Sarah Chen, meeting notes · April 10 2026',
          },
          {
            tag: 'CAUTION',
            question: 'What is the AC access confounder and what does it mean for the pitch?',
            answer:
              'Air conditioning access is correlated with both income level and preterm birth risk — meaning some of the heat effect may be partially explained by differential AC access rather than heat exposure alone. If the adjustment **shrinks the RR**, the directionality still holds. Build the pitch around the lower bound, not the headline number, so any revision doesn\'t undercut the adaptation case.',
            source: 'Sarah Chen, meeting notes',
          },
        ],
      },
      {
        label: 'Geographic Scope',
        items: [
          {
            tag: 'GEO',
            question: 'Why are New Haven and Bridgeport treated differently in the pitch?',
            answer:
              'New Haven has **census tract-level data** with sufficient sample size for the low-income stratum analysis — this is the high-confidence anchor. Bridgeport data is **thinner**; if Bridgeport estimates don\'t survive peer review, leading with both cities equally creates a credibility problem. Frame as: New Haven is the primary evidence base; Bridgeport is a directional signal.',
            source: 'Sarah Chen, April 10 2026',
          },
          {
            tag: 'GEO',
            question: 'Can the analysis be extended to other CT cities for the June session?',
            answer:
              'Not at current data quality. Statewide aggregate data exists but is not stratified by income or trimester at the tract level outside New Haven. Extending prematurely would dilute the precision that makes the New Haven case compelling to the adaptation office.',
            source: 'Chen Lab preprint scope',
          },
        ],
      },
      {
        label: 'Policy & Stakeholders',
        items: [
          {
            tag: 'POLICY',
            question: 'Who controls the funding for cool corridor infrastructure?',
            answer:
              'Cool corridor / heat refuge funding most likely routes through **OPM (Office of Policy and Management)**, not DEEP directly. The adaptation office reports to DEEP but would need to coordinate with OPM on capital allocation. Confirm this pathway before the June pitch to avoid a dead end.',
            source: 'James Okafor, meeting notes',
          },
          {
            tag: 'POLICY',
            question: 'What does DPH sign-off mean in practice and when does it apply?',
            answer:
              '**DPH (Department of Public Health)** approval is required before using maternal outcomes data in any public-facing materials. This is a compliance gate — not a policy vote. Plan for it early in the process so it doesn\'t become a bottleneck after the adaptation office engagement is underway.',
            source: 'James Okafor, meeting notes',
          },
          {
            tag: 'TIMING',
            question: 'How much runway do we have before the June session deadline?',
            answer:
              'The adaptation office will lock into summer priorities in the coming weeks. Sarah\'s concern is that this window closes before we get the pitch in front of the right people. Target: **deck complete and outreach started within 2–3 weeks** of this meeting to hit the June session.',
            source: 'Sarah Chen, April 10 2026',
          },
        ],
      },
    ],
  },

  // ── 03 Action items ─────────────────────────────────────────────────────────
  actions: {
    items: [
      {
        num: '01',
        title: 'Draft pilot justification brief — New Haven lower-bound framing',
        description:
          'Build the economic case around the **credible lower-bound RR estimate** for New Haven low-income tracts. Apply NICHD\'s $50,000 per-preterm-birth cost figure to a conservative prevented-births projection. Explicitly note the pre-peer-review status and flag that the estimate will be updated post-revision.',
        gapTags: ['Lower-bound RR pending AC adjustment', 'NH prevented-births count needed'],
        intel: {
          label: 'Cost anchor',
          text:
            'NICHD reports average **direct costs of ~$50,000 per preterm birth** (excluding long-term developmental costs). Even a conservative estimate of 10–20 prevented births per season in the target tracts produces a defensible cost-benefit anchor for a targeted pilot program.',
          source: 'NICHD Cost Data · Chen Lab preprint',
        },
      },
      {
        num: '02',
        title: 'Map the DEEP → OPM → DPH stakeholder pathway with named contacts',
        description:
          'Produce a one-page pathway diagram: adaptation office (under DEEP) as entry point, OPM as the funding authority for cool corridors, DPH as the sign-off gate for maternal outcomes data in public materials. Identify named contacts at each node **before** the June session.',
        gapTags: ['OPM contact not identified', 'DPH data-use process not confirmed', 'DEEP adaptation office lead needed'],
        intel: {
          label: 'Stakeholder pathway',
          text:
            'James: "The adaptation office reports to DEEP, but the funding for cool corridors probably runs through OPM — and we\'d need DPH sign-off to use the maternal outcomes data in any public-facing materials. **This could get complicated fast.**" Map it early; run sign-offs in parallel where possible.',
          source: 'James Okafor, April 10 2026',
        },
      },
      {
        num: '03',
        title: 'Resolve AC access confounder before the June pitch goes out',
        description:
          'The Tobin pitch should not go out with the AC confounder unresolved. Either: (a) the adjustment is complete and the revised RR is stable, in which case use the post-adjustment lower bound; or (b) the pitch explicitly **footnotes the limitation** with a pre-specified plausible range (e.g., RR 1.2–1.4).',
        gapTags: ['AC confounder adjustment in progress', 'Revised RR not yet available'],
      },
      {
        num: '04',
        title: 'Restructure deck: New Haven anchor, Bridgeport as directional secondary',
        description:
          'The current preprint title implies geographic equivalence between New Haven and Bridgeport. **Reframe so New Haven is the primary evidence base** and Bridgeport is positioned as "directional signal — pending revision." This protects credibility if Bridgeport estimates shift after peer review.',
        gapTags: ['Bridgeport estimates pending revision'],
        intel: {
          label: 'Sarah Chen\'s framing',
          text:
            '"If the Bridgeport estimates don\'t survive revision, that\'s a **credibility problem**." Lead with what\'s solid — New Haven census tract-level data — and let Bridgeport support rather than anchor the pitch.',
          source: 'Sarah Chen, April 10 2026',
        },
      },
      {
        num: '05',
        title: 'Initiate outreach to adaptation office — target before summer priority lock-in',
        description:
          'Coordinate with James to identify the right contact at DEEP\'s adaptation office and schedule an initial conversation **before summer priorities lock in**. The June session is the hard deadline; outreach needs to happen at least 3 weeks prior to allow time for a follow-up.',
        gapTags: ['Adaptation office contact not identified', 'Outreach timeline not scheduled'],
      },
    ],
  },

  generatedAt: new Date().toISOString(),
};
