import { EvidenceCard, EvidenceKind, InformationNeed, MeetingContext, TranscriptEvent } from '../types/domain';

type DemoEvidence = Omit<EvidenceCard, 'id' | 'needId' | 'triggeredBySegmentId'>;

const comparisonHints = ['compare', 'versus', 'vs', 'difference', 'alternative', 'better', 'worse', 'trade-off', 'tradeoff'];
const riskHints = ['risk', 'failure', 'fails', 'degrade', 'concern', 'worried', 'downside', 'limitation'];
const pricingHints = ['price', 'pricing', 'bundle', 'cost', 'budget', 'rate', 'fee', 'subscription'];
const objectionHints = ['need both', 'redundant', 'overlap', 'unnecessary', 'overkill', 'too many', 'consolidate'];

export function updateMeetingContext(context: MeetingContext, event: TranscriptEvent): MeetingContext {
 const themeCandidates = extractThemes(event.text);
 const unresolved = event.text.includes('?')
 ? [...new Set([...context.unresolvedQuestions, event.text.trim()])]
 : context.unresolvedQuestions;

 const confidenceByTheme = { ...context.confidenceByTheme };
 themeCandidates.forEach((theme) => {
 const prev = confidenceByTheme[theme] ?? 0.4;
 confidenceByTheme[theme] = Math.min(0.98, prev + 0.08);
 });

 return {
 ...context,
 discussedThemes: [...new Set([...context.discussedThemes, ...themeCandidates])],
 unresolvedQuestions: unresolved,
 confidenceByTheme,
 lastSegmentId: event.segmentId
 };
}

// ── Demo triggers: fire specific insights for known conversation segments ──

const demoTriggers: Array<{
 detect: (text: string) => boolean;
 detectAssist?: (text: string) => boolean;
 needs: Array<{ category: InformationNeed['category']; prompt: string; triggerPhrase: string; demoEvidence: DemoEvidence; isProactiveDemoTrigger?: boolean; proactiveHeadline?: string; proactiveImportance?: number; }>;
}> = [
 // Trigger A: Comparison table Extreme vs GO! feature breakdown
 {
 detect: (text) =>
 (text.includes('extreme covers voice') || text.includes('go supports photo') || text.includes('go! handles photos')),
 detectAssist: (text) =>
 text.includes('extreme') ||
 (text.includes('go') && text.includes('photo')),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'Iridium Extreme vs GO! side-by-side capability breakdown',
  triggerPhrase: 'Extreme covers voice and SOS. GO supports photo upload.',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Iridium Extreme vs GO! side-by-side capability breakdown',
  summary: 'The Extreme and GO! solve different constraints. The Extreme handles voice, SOS, and GPS; the GO! handles passive photo upload and data. In a solo expedition context, the two devices are complementary not redundant.',
  kind: 'comparison' as EvidenceKind,
  recencyLabel: 'Iridium device architecture docs',
  confidence: 0.97,
  verification: 'verified' as const,
  explainWhyNow: 'Account Exec distinguished the two device roles',
  attributions: [
  { sourceId: 'iridium-spec-combo-table', sourceType: 'product_doc' as const, title: 'Iridium device architecture docs', freshnessScore: 0.95, trustScore: 0.97 },
  ],
  richTable: {
  devices: [
   {
   name: 'Iridium Extreme',
   badge: '★ Primary',
   subtitle: 'Voice · SOS · GPS',
   isPrimary: true,
   features: [
   { name: 'SOS button', val: '✓', kind: 'yes' as const },
   { name: 'Voice calls', val: '✓', kind: 'yes' as const },
   { name: 'GPS tracking', val: '✓', kind: 'yes' as const },
   { name: 'Passive data', val: ' ', kind: 'neu' as const },
   { name: 'Photo upload', val: ' ', kind: 'neu' as const },
   ],
   },
   {
   name: 'Iridium GO!',
   badge: '◎ Passive layer',
   subtitle: 'Data · Photos · Content',
   isPrimary: false,
   features: [
   { name: 'SOS button', val: '✗', kind: 'no' as const },
   { name: 'Voice calls', val: '✗', kind: 'no' as const },
   { name: 'GPS tracking', val: '✓', kind: 'yes' as const },
   { name: 'Passive data', val: '✓', kind: 'yes' as const },
   { name: 'Photo upload', val: '✓', kind: 'yes' as const },
   ],
   },
  ],
  },
  },
 },
 ],
 },
 // Trigger B: Bar graph dual vs single device content delivery
 {
 detect: (text) =>
 (text.includes('that chart is the answer') || text.includes('ninety-four versus seventy-one') || text.includes('94') && text.includes('71') && text.includes('percent')),
 detectAssist: (text) =>
 text.includes('ninety-four') || text.includes('94') || text.includes('chart'),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'Dual-device vs single-device mission completion and content delivery comparison',
  triggerPhrase: 'That chart is the answer.',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Dual-device vs single-device mission completion and content delivery',
  summary: 'Deployment data across 2022–2024 shows dual-device setups complete missions at 94% vs 71% for single-device, and deliver content at 91% vs 43%. The gap is largest in content delivery driven by the GO!\'s passive pipeline.',
  kind: 'metric' as EvidenceKind,
  recencyLabel: 'Internal deployment data · 2022–2024',
  confidence: 0.95,
  verification: 'verified' as const,
  explainWhyNow: 'Account Exec referenced the data chart directly',
  attributions: [
  { sourceId: 'iridium-deployments-dual-single', sourceType: 'internal_structured' as const, title: 'Expedition deployments 2022–2024', freshnessScore: 0.9, trustScore: 0.95 },
  ],
  richChart: {
  labels: ['Mission completion', 'Content delivery', 'Comms uptime'],
  datasets: [
   { label: 'Dual-device', color: '#2563EB', data: [94, 91, 88] },
   { label: 'Single-device', color: '#94A3B8', data: [71, 43, 62] },
  ],
  note: 'Expedition deployments 2022–2024 · n=47 solo expeditions · Iridium internal data',
  },
  },
 },
 ],
 },
 // Trigger 1: Proactive passive setup + content delivery
 {
 detect: (text) =>
 text.includes('passive') &&
 (text.includes('solo') || text.includes('content') || text.includes('differentiator')),
 detectAssist: (text) =>
 text.includes('passive'),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'Passive setup correlates with higher content delivery 91% vs 43%',
  triggerPhrase: 'passive setup is the biggest differentiator',
  isProactiveDemoTrigger: true,
  proactiveHeadline: 'Passive setup correlates with higher content delivery 91% vs 43%',
  proactiveImportance: 9,
  demoEvidence: {
  title: 'Passive setup correlates with higher content delivery 91% vs 43%',
  summary: 'Content delivery gap between dual and single-device setups is the largest performance delta across all four metrics bigger than mission completion or comms uptime. The GO!\'s always-on passive mode keeps the data pipeline open even when the athlete is physically occupied.',
  kind: 'metric' as EvidenceKind,
  recencyLabel: 'Internal deployment data · 2022–2024',
  confidence: 0.94,
  verification: 'verified' as const,
  explainWhyNow: 'Person 2 mentioned passive setup as a key differentiator for solo expeditions',
  attributions: [
  { sourceId: 'iridium-deployments-content', sourceType: 'internal_structured' as const, title: 'Expedition deployments 2022–2024', freshnessScore: 0.9, trustScore: 0.95 },
  ],
  richMetricGrid: {
  metrics: [
   { label: 'Content delivery\ndual-device', value: '91%', sub: 'vs 43% single-device' },
   { label: 'Performance gap\nvs all other metrics', value: '+48pp', sub: 'largest delta in dataset' },
   { label: 'GO! field interactions\nrequired on ice', value: '0', sub: 'passive after pre-config' },
   { label: 'Comms failures from\nsingle-point setups', value: '68%', sub: 'external polar research' },
  ],
  insightText: 'The passive architecture of the GO! is the mechanism behind the content delivery advantage. Unlike voice comms which require active device handling data and photo pipelines run silently in the background via Iridium SBD. In solo expeditions specifically, athletes can\'t spare cognitive bandwidth for device management, so a passive data layer isn\'t just convenient, it\'s structurally necessary for consistent content output. This is the lead sales argument for GTC: not "two devices," but "one active device, one silent pipeline."',
  },
  },
 },
 ],
 },
 // Trigger 3: Caution leading with GO! as primary
 {
 detect: (text) =>
 (text.includes('lead with') && (text.includes('go!') || text.includes('go!'))) ||
 (text.includes('primary device') && text.includes('go')) ||
 (text.includes('go!') && text.includes('primary') && text.includes('backup')),
 detectAssist: (text) =>
 text.includes('lead with') || (text.includes('primary') && text.includes('go')),
 needs: [
 {
  category: 'correction' as InformationNeed['category'],
  prompt: 'Leading with the GO! as primary inverts the device hierarchy and misrepresents the safety story',
  triggerPhrase: 'lead with the GO! as the primary device',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Leading with the GO! as primary inverts the device hierarchy',
  summary: 'Framing the GO! as the primary device is a critical positioning error for this client. The GO! has no standalone SOS capability and cannot make voice calls without a paired device. In an expedition context, leading with it as primary exposes GTC to liability questions and undermines Iridium\'s safety narrative. The Extreme is the primary device not because of voice, but because it carries the SOS button.',
  kind: 'claim' as EvidenceKind,
  recencyLabel: 'Product · Extreme spec · GO! architecture docs',
  confidence: 0.97,
  verification: 'verified' as const,
  explainWhyNow: 'Person 2 suggested leading with GO! as primary device',
  attributions: [
  { sourceId: 'iridium-spec-extreme-sos', sourceType: 'product_doc' as const, title: 'Iridium Extreme spec sheet', freshnessScore: 0.95, trustScore: 0.99 },
  ],
  richCorrectionBlock: {
  wrong: { label: '❌ Avoid framing', text: '"GO! primary, Extreme backup" implies SOS is non-essential' },
  right: { label: '✓ Correct framing', text: '"Extreme primary, GO! passive layer" safety-first narrative' },
  riskItems: [
   { num: '01', title: 'No standalone SOS on the GO!', body: 'The GO! has no physical SOS button. In an emergency, if the Extreme is lost or damaged, a solo athlete has no distress signaling capability. Leading with GO! as primary erases this from the client\'s mental model.' },
   { num: '02', title: 'Voice requires the Extreme GO! cannot call independently', body: 'The GO! routes voice through a paired smartphone app, which requires a charged phone and local Wi-Fi to the GO!. In polar conditions, this dependency is a failure point.' },
   { num: '03', title: "GTC's technical team will catch this", body: 'GTC knows the hardware. Entering Thursday with an inverted hierarchy will signal that the sales counterpart doesn\'t understand the product stack damaging credibility on the most important technical sale point.' },
  ],
  reframe: 'Lead with safety first: "One device handles every emergency scenario SOS, voice, GPS. The GO! runs silently alongside it to add a content layer without asking Preet to do anything extra." This keeps the Extreme as the anchor and positions the GO! as an additive benefit, not a replacement.',
  },
  },
 },
 ],
 },
 // Trigger CT-R1: Effect size table fires on Chen Lab confounder mention
 {
 detect: (text) =>
 text.includes('confounder around ac') || text.includes('working through a confounder'),
 detectAssist: (text) =>
 text.includes('liability for the tobin') ||
 text.includes('shifts in revision') ||
 (text.includes('confounder') && text.includes('liability')),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'Effect sizes by trimester and income stratum which numbers are safe to anchor on',
  triggerPhrase: 'still working through a confounder around AC access',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Effect size estimates by trimester and income stratum stability flags',
  summary: 'Cross-referenced Chen Lab preprint data. Here are the strata James can safely anchor on and the one still in flux due to the AC access confounder Sarah flagged. Conservative anchor: RR 1.24 (CI lower bound) holds even if Q1/3rd-trim central estimate shifts.',
  kind: 'metric' as EvidenceKind,
  recencyLabel: 'ambi_data_effect_sizes.json · Chen Lab preprint v2 · not peer reviewed',
  confidence: 0.93,
  verification: 'verified' as const,
  explainWhyNow: 'Sarah flagged the AC confounder affecting third-trimester Q1 estimates',
  attributions: [
  { sourceId: 'chen-lab-effect-sizes', sourceType: 'internal_structured' as const, title: 'ambi_data_effect_sizes.json', freshnessScore: 0.9, trustScore: 0.93 },
  ],
  richTable: {
  devices: [
   {
   name: '2nd Trim · Q1',
   badge: '✓ Anchor',
   subtitle: 'Low income · p=0.001',
   isPrimary: true,
   features: [
   { name: 'RR', val: '1.19', kind: 'yes' as const },
   { name: '95% CI', val: '1.07 – 1.32', kind: 'neu' as const },
   { name: 'Stability', val: 'Stable ✓', kind: 'yes' as const },
   ],
   },
   {
   name: '2nd Trim · Q2-Q3',
   badge: '✓ Anchor',
   subtitle: 'Mid income · p=0.014',
   isPrimary: true,
   features: [
   { name: 'RR', val: '1.11', kind: 'yes' as const },
   { name: '95% CI', val: '1.02 – 1.20', kind: 'neu' as const },
   { name: 'Stability', val: 'Stable ✓', kind: 'yes' as const },
   ],
   },
   {
   name: '3rd Trim · Q2-Q3',
   badge: '✓ Anchor',
   subtitle: 'Mid income · p=0.0003',
   isPrimary: true,
   features: [
   { name: 'RR', val: '1.18', kind: 'yes' as const },
   { name: '95% CI', val: '1.09 – 1.28', kind: 'neu' as const },
   { name: 'Stability', val: 'Stable ✓', kind: 'yes' as const },
   ],
   },
   {
   name: '3rd Trim · Q1 ⚠',
   badge: '⚠ In flux',
   subtitle: 'Low income · AC confounder',
   isPrimary: false,
   features: [
   { name: 'RR', val: '1.41', kind: 'no' as const },
   { name: '95% CI', val: '1.24 – 1.60', kind: 'neu' as const },
   { name: 'Stability', val: 'In flux ⚠', kind: 'no' as const },
   ],
   },
  ],
  },
  },
 },
 ],
 },
 // Trigger CT-R2: Dose-response chart fires on RR 1.4 / directionality mention
 {
 detect: (text) =>
 text.includes('1.4 relative risk') || text.includes('directionality is stable'),
 detectAssist: (text) =>
 text.includes('directionality is stable') ||
 text.includes('justify a pilot') ||
 text.includes('strong enough to justify'),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'Dose-response curves diverge sharply by income directionality holds across assumptions',
  triggerPhrase: 'around 1.4 relative risk in that stratum, directionality is stable',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Dose-response curves diverge sharply by income stratum directionality is stable',
  summary: 'Low-income tracts show a steep monotonic increase in preterm birth risk with heat exposure. Higher-income tracts are essentially flat consistent with AC access buffering the effect. Pattern holds under conservative assumptions. Corroborated by Chersich et al. (2025): heat wave exposure increased preterm birth odds by 26% across 198 studies.',
  kind: 'metric' as EvidenceKind,
  recencyLabel: 'ambi_data_rr_graph.json · Chersich et al. (2025) · Nature Medicine',
  confidence: 0.95,
  verification: 'verified' as const,
  explainWhyNow: 'Sarah named the 1.4 RR figure and asserted directionality is stable under conservative assumptions',
  attributions: [
  { sourceId: 'chen-lab-rr-graph', sourceType: 'internal_structured' as const, title: 'ambi_data_rr_graph.json', freshnessScore: 0.9, trustScore: 0.93 },
  { sourceId: 'chersich-2025', sourceType: 'web' as const, title: 'Chersich et al. (2025) · Nature Medicine', freshnessScore: 0.95, trustScore: 0.97 },
  ],
  richChart: {
  chartType: 'line',
  yAxisLabel: 'Relative risk (RR)',
  labels: ['Q1 (0–1 days)', 'Q2 (2–3)', 'Q3 (4–5)', 'Q4 (6–8)', 'Q5 (9+ days)'],
  datasets: [
   { label: 'Low-income (Q1)', color: '', data: [1.00, 1.11, 1.20, 1.31, 1.41] },
   { label: 'Higher-income (Q2–Q4)', color: '', dashed: true, data: [1.00, 1.04, 1.06, 1.08, 1.10] },
  ],
  note: 'Third trimester · New Haven CT census tracts 2018–2023 · ⚠ Low-income Q5 central estimate under review (AC confounder) lower bound 1.24 considered stable · Chersich et al. (2025): OR=1.26 during heat waves across 198 studies',
  },
  },
 },
 ],
 },
 // Trigger CT-DG: CT stakeholder diagram fires on DEEP/OPM/DPH agency mention
 {
 detect: (text) =>
 text.includes('reports to deep') || (text.includes('runs through opm') && text.includes('dph')),
 detectAssist: (text) =>
 text.includes('department of public health') ||
 text.includes('maternal outcomes data') ||
 text.includes('public-facing materials') ||
 text.includes('get complicated fast'),
 needs: [
 {
  category: 'comparison' as InformationNeed['category'],
  prompt: 'CT stakeholder sign-off pathway maps to a branching flowchart three parallel tracks',
  triggerPhrase: 'adaptation office reports to DEEP, funding runs through OPM, DPH sign-off',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'CT stakeholder sign-off pathway DEEP, OPM, and DPH don\'t run in sequence',
  summary: 'James just described a multi-agency approval structure that doesn\'t run in sequence: policy sign-off through DEEP, capital funding through OPM, data authorization through DPH. Ambi identified a branching decision structure worth visualizing before the pitch so the critical path is visible.',
  kind: 'comparison' as EvidenceKind,
  recencyLabel: 'Generated from conversation context',
  confidence: 0.91,
  verification: 'inferred' as const,
  explainWhyNow: 'James named three separate agencies (DEEP, OPM, DPH) with distinct non-sequential roles',
  attributions: [
  { sourceId: 'ct-exec-order-21-3', sourceType: 'web' as const, title: 'CT Executive Order 21-3 (Dec 2021)', url: 'https://portal.ct.gov/connecticutclimateaction/executive-order/executive-order-no-21-3', snippet: 'CT Executive Order 21-3 directs DEEP to lead climate adaptation planning and establishes the CT Climate Adaptation Office within DEEP\'s authority. DEEP administers the Climate Resilience Fund and serves as the primary policy approver for cool corridor and urban heat programs.', freshnessScore: 0.9, trustScore: 0.95 },
  { sourceId: 'ct-opm-urban-act', sourceType: 'web' as const, title: 'CT OPM Urban Act Grant Program (CGS 4-66c)', url: 'https://portal.ct.gov/DECD/Content/Community-Development/03_Funding_Opportunities/Capital-Infrastructure-Grants/Urban-Act-Grant-Program', snippet: 'The CT Office of Policy and Management administers the Urban Act Grant Program, which funds capital infrastructure including community resilience and cooling programs in designated urban centers such as New Haven.', freshnessScore: 0.88, trustScore: 0.92 },
  { sourceId: 'ct-dcrf-2023', sourceType: 'web' as const, title: 'DCRF Round 1 Press Release (2023)', url: 'https://portal.ct.gov/deep/news-releases/news-releases---2023/governor-lamont-announces-8-8-m-in-state-funding-to-support-21-climate-plans-and-project-grants', snippet: 'The DCRF has explicitly funded cool corridor planning in Connecticut. Groundwork Bridgeport received $249,816 in the 2023 inaugural round specifically to identify cool corridors in urban tracts.', freshnessScore: 0.87, trustScore: 0.90 },
  { sourceId: 'ct-ohs-data-request', sourceType: 'web' as const, title: 'CT Office of Health Strategy Data Request Process', url: 'https://portal.ct.gov/healthscorect/data-request', snippet: 'CT DPH controls Vital Records and the CT-LLoVE longitudinal dataset. Access to maternal outcomes data requires a Data Use Agreement with CT OHS and DPH\'s Human Investigations Committee, involving multi-step application, Data Release Committee review, and HIPAA compliance verification.', freshnessScore: 0.88, trustScore: 0.91 },
  ],
  richFlowDiagram: {
  chips: [],
  note: 'Ambi generated from conversation context · DEEP = CT Dept. of Energy & Environmental Protection · OPM = Office of Policy & Management · DPH = CT Dept. of Public Health · Critical path: DPH data-sharing MOU with YSPH typically takes 6–10 weeks likely the longest lead-time item',
  badges: [
   { label: '● DEEP (policy)', color: 'teal' as const },
   { label: '● OPM (funding)', color: 'navy' as const },
   { label: '● DPH (data auth)', color: 'red' as const },
   { label: '● Pilot launch', color: 'green' as const },
  ],
  nodes: [
   { id: 'tobin', label: 'Tobin Center pitch',  kind: 'start' as const, color: 'gray' as const, sub: 'June session window' },
   { id: 'deep',  label: 'CT Climate Adaptation Office', kind: 'default' as const, color: 'teal' as const, sub: 'reports to DEEP · concept approval' },
   { id: 'parallel', label: 'Parallel tracks required', kind: 'branch' as const, color: 'gold' as const, sub: 'funding + data auth run concurrently' },
   { id: 'opm', label: 'OPM',    kind: 'default' as const, color: 'navy' as const, sub: 'cool corridor capital · budget review', parentId: 'parallel', trackId: 'funding', trackLabel: 'Funding track' },
   { id: 'gov', label: 'Governor\'s Office',  kind: 'default' as const, color: 'navy' as const, sub: 'climate budget authorization',  parentId: 'parallel', trackId: 'funding' },
   { id: 'dph', label: 'CT DPH',    kind: 'warning' as const, color: 'red' as const, sub: 'maternal outcomes · public use auth',  parentId: 'parallel', trackId: 'data-auth', trackLabel: 'Data auth track' },
   { id: 'irb', label: 'IRB / data agreement',  kind: 'warning' as const, color: 'red' as const, sub: 'Chen Lab YSPH · data sharing MOU',  parentId: 'parallel', trackId: 'data-auth' },
   { id: 'gate',  label: 'Both tracks cleared?',  kind: 'branch' as const, color: 'gold' as const, sub: 'funding + data auth both required to proceed' },
   { id: 'pilot', label: 'New Haven pilot launch',  kind: 'end'  as const, color: 'green' as const, sub: 'cool corridor program · geographically targeted' },
  ],
  },
  },
 },
 ],
 },
 // Trigger CT-CA: Bridgeport caution fires on Bridgeport data limitation mention
 {
 detect: (text) =>
 text.includes('bridgeport is thinner') || (text.includes('bridgeport') && text.includes('credibility problem')),
 detectAssist: (text) =>
 text.includes('credibility problem') ||
 text.includes("don't survive revision") ||
 text.includes('estimates don\'t survive'),
 needs: [
 {
  category: 'correction' as InformationNeed['category'],
  prompt: 'Bridgeport data is thinner citing both cities in the pitch risks a credibility problem',
  triggerPhrase: 'Bridgeport is thinner if you lead with both cities and those estimates shift, that\'s a credibility problem',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Bridgeport data is thinner citing both cities risks credibility with the adaptation office',
  summary: 'James has been framing this as a New Haven and Bridgeport study. Sarah just flagged that Bridgeport tract-level sample sizes are thinner and estimates less stable. If Bridgeport estimates shift in peer review after the pitch, the adaptation office\'s trust in the whole dataset is at risk.',
  kind: 'claim' as EvidenceKind,
  recencyLabel: 'ambi_data_effect_sizes.json · Chen Lab preprint v2',
  confidence: 0.96,
  verification: 'verified' as const,
  explainWhyNow: 'Sarah explicitly flagged that Bridgeport sample sizes are thinner while the preprint title implies equal data quality',
  attributions: [
  { sourceId: 'chen-lab-effect-sizes', sourceType: 'internal_structured' as const, title: 'Chen Lab preprint v2 · ambi_data_effect_sizes.json', snippet: 'Effect size estimates by trimester and income stratum for New Haven and Bridgeport census tracts. Uploaded 2026-03-18.', freshnessScore: 0.9, trustScore: 0.93 },
  { sourceId: 'ctdatahaven-bridgeport', sourceType: 'web' as const, title: 'DataHaven CT City Neighborhood Profiles', url: 'https://ctdatahaven.org/profiles/bridgeport/', snippet: 'Bridgeport has fewer census tracts and smaller per-tract birth populations than New Haven. Both cities are ~135-148K residents, but New Haven\'s denser footprint generates more births per census tract, giving the Chen Lab data more statistical power per tract and reducing uncertainty in effect estimates.', freshnessScore: 0.85, trustScore: 0.88 },
  { sourceId: 'ctdatahaven-newhaven', sourceType: 'web' as const, title: 'DataHaven New Haven Equity Profile (2021)', url: 'https://ctdatahaven.org/sites/ctdatahaven/files/new_haven_profile_v1.pdf', snippet: "Bridgeport's Q4 income quartile has very few births relative to its lower-income tracts, making income-stratified estimates especially unstable at the upper end. Bridgeport's income distribution is heavily skewed toward lower-income tracts, meaning Q4 estimates are based on a very small number of births — precisely the stratum flagged as most at risk in the preprint.", freshnessScore: 0.82, trustScore: 0.87 },
  { sourceId: 'ct-dph-mch-hrsa', sourceType: 'web' as const, title: 'CT DPH MCH Data Capacity — HRSA 2023', url: 'https://mchb.tvisdata.hrsa.gov/Narratives/Other%20MCH%20Data%20Capacity%20Efforts/403b9776-0fb7-432c-8b16-8e10a15cfbcc', snippet: "CT DPH's surveillance data acknowledges sample suppression in smaller geographic units. The CT-LLoVE longitudinal dataset notes small cell sizes in specific census tracts require suppression to prevent re-identification, particularly for preterm birth in specific income-heat exposure combinations. This applies more acutely to Bridgeport, where tract-level birth counts in specific exposure quintiles fall near or below standard suppression thresholds.", freshnessScore: 0.9, trustScore: 0.92 },
  ],
  richCorrectionBlock: {
  wrong: { label: '❌ Current framing', text: '"New Haven and Bridgeport" implies equivalent data quality across both cities' },
  right: { label: '✓ Correct framing', text: '"New Haven anchor, Bridgeport directional signal" honest about data weight difference' },
  riskItems: [
   { num: '01', title: 'Bridgeport tract-level sample sizes are thinner', body: 'Especially in Q4 income quartile. If estimates move in peer review, the adaptation office will have heard a two-city claim that the published paper doesn\'t support.' },
   { num: '02', title: 'Credibility is the pitch\'s only currency at this stage', body: 'The preprint hasn\'t cleared peer review. Any factual backpedaling after the June pitch damages Tobin Center\'s standing with DEEP and OPM for follow-on engagement.' },
   { num: '03', title: 'New Haven alone is sufficient for pilot justification', body: 'Effect sizes in New Haven are robust and stable across all model specifications. A New Haven pilot with directional Bridgeport evidence is the stronger, more defensible case.' },
  ],
  reframe: '"The strongest evidence base is New Haven, where census tract data is robust and effect sizes are stable across all model specifications. Bridgeport data is directionally consistent and will be addressed in the peer-reviewed publication."',
  },
  },
 },
 ],
 },
 // Trigger CT-PR: DEEP heat mapping proactive fires on New Haven anchor / deck build mention
 {
 detect: (text) =>
 text.includes('new haven is the anchor') || text.includes('build the deck that way'),
 detectAssist: (text) =>
 text.includes('new haven is the anchor') ||
 text.includes('bridgeport is directional') ||
 text.includes('build the deck that way'),
 needs: [
 {
  category: 'metric' as InformationNeed['category'],
  prompt: 'DEEP heat vulnerability mapping publishes this spring before the June session window',
  triggerPhrase: 'Neither party has mentioned it Ambi noticed',
  isProactiveDemoTrigger: true,
  proactiveHeadline: 'DEEP heat mapping publishes this spring before the June session',
  proactiveImportance: 9,
  demoEvidence: {
  title: 'DEEP heat vulnerability indices publish spring 2026 before the June session',
  summary: 'Neither James nor Sarah has mentioned the DEEP urban heat island mapping project. DEEP\'s census tract-level heat vulnerability indices are expected spring 2026 directly overlapping the Tobin pitch window. This could validate their geographic targeting or create a complication if the heat maps reframe the priority tracts.',
  kind: 'metric' as EvidenceKind,
  recencyLabel: 'web → CT DEEP heat mapping · legislative calendar',
  confidence: 0.88,
  verification: 'inferred' as const,
  explainWhyNow: 'Neither speaker has mentioned the DEEP heat mapping project; as they shift to pitch planning, timing overlap is directly relevant',
  attributions: [
  { sourceId: 'ct-deep-heat-mapping', sourceType: 'web' as const, title: 'CT DEEP urban heat island mapping project', freshnessScore: 0.85, trustScore: 0.82 },
  ],
  richMetricGrid: {
  metrics: [
   { label: 'DEEP heat mapping\npublication window', value: 'Spring 2026', sub: 'Before June session' },
   { label: 'CT census tracts\nmapped to date', value: '892', sub: 'DEEP urban heat island atlas' },
   { label: 'Overlap with\nNH preterm cohort', value: 'Direct', sub: 'Same tract boundaries' },
   { label: 'Time to June\nlegislative session', value: '~9 weeks', sub: 'Policy window is tight' },
  ],
  insightText: 'DEEP\'s census tract-level heat vulnerability indices are expected spring 2026 overlapping directly with the Tobin pitch window. If the heat maps align with the preterm clusters, they provide independent external validation of Sarah\'s geographic targeting. If they reframe the priority tracts, the pitch needs to account for that before June. Neither James nor Sarah has raised this but the adaptation office almost certainly knows about it.',
  },
  },
 },
 ],
 },
 // Trigger (Iridium): Diagram device decision flow
 {
 detect: (text) =>
 (text.includes('picks up') && (text.includes('extreme') || text.includes('voice'))) ||
 (text.includes('passively') && text.includes('sos')) ||
 (text.includes('extreme for voice') && text.includes('go')),
 detectAssist: (text) =>
 text.includes('extreme') && text.includes('passive') && text.includes('sos'),
 needs: [
 {
  category: 'comparison' as InformationNeed['category'],
  prompt: 'The device decision logic you described maps to a clear decision flowchart for the GTC slide',
  triggerPhrase: 'she picks up the Extreme for voice',
  isProactiveDemoTrigger: false,
  demoEvidence: {
  title: 'Device Decision Flow Iridium Extreme × GO!',
  summary: 'Consul identified a branching decision structure in what was just said when does Preet use the Extreme vs. rely on the GO!? This maps cleanly to a flowchart that could anchor the GTC slide.',
  kind: 'comparison' as EvidenceKind,
  recencyLabel: 'Generated from conversation context',
  confidence: 0.91,
  verification: 'inferred' as const,
  explainWhyNow: 'Person 2 described the complete device decision logic on the ice',
  attributions: [
  { sourceId: 'iridium-spec-combo', sourceType: 'product_doc' as const, title: 'Iridium device architecture docs', freshnessScore: 0.95, trustScore: 0.97 },
  ],
  richFlowDiagram: {
  chips: [
   { label: 'Need to communicate', kind: 'active' as const },
   { label: 'Voice or data?', kind: 'default' as const },
   { label: 'Emergency?', kind: 'default' as const },
   { label: 'SOS', kind: 'sos' as const },
  ],
  note: 'Consul generated from conversation context · Device decision logic based on Iridium Extreme spec + GO! architecture docs · For use in GTC Thursday prep deck',
  },
  },
 },
 ],
 },
];

export function inferInformationNeeds(event: TranscriptEvent, assistMode = false, presetActive = false): InformationNeed[] {
 const text = event.text.toLowerCase();
 const needs: InformationNeed[] = [];

 // Check demo triggers stateless, dedup is handled by applyAdditionalNeeds in the reducer
 for (const trigger of demoTriggers) {
 const matched = assistMode && trigger.detectAssist
 ? trigger.detectAssist(text)
 : trigger.detect(text);
 if (matched) {
 for (const t of trigger.needs) {
  needs.push({
  id: t.isProactiveDemoTrigger
  ? `proactive-demo-${event.segmentId}-${t.category}`
  : `need-${event.segmentId}-${t.category}-demo`,
  category: t.category,
  prompt: t.prompt,
  rationale: `Triggered by: "${event.text.slice(0, 80)}"`,
  triggeredBySegmentId: event.segmentId,
  triggerPhrase: t.triggerPhrase,
  confidence: 0.92,
  priority: 'p1',
  status: 'new',
  demoEvidence: t.demoEvidence,
  isProactiveDemoTrigger: t.isProactiveDemoTrigger,
  proactiveHeadline: t.proactiveHeadline,
  proactiveImportance: t.proactiveImportance,
  });
 }
 break; // at most one trigger per event
 }
 }

 // Skip keyword-based fallback inference during any preset session
 if (presetActive) return needs;

 if (comparisonHints.some((hint) => text.includes(hint))) {
 const topic = extractKeyPhrase(event.text);
 needs.push(buildNeed('comparison', `Compare options and alternatives${topic}`, event, 'p1', 0.88));
 }

 if (riskHints.some((hint) => text.includes(hint))) {
 const topic = extractKeyPhrase(event.text);
 needs.push(buildNeed('risk', `Identify risks and mitigation strategies${topic}`, event, 'p1', 0.82));
 }

 if (pricingHints.some((hint) => text.includes(hint))) {
 const topic = extractKeyPhrase(event.text);
 needs.push(buildNeed('open_question', `Resolve pricing and cost details${topic}`, event, 'p1', 0.9));
 }

 if (objectionHints.some((hint) => text.includes(hint))) {
 const topic = extractKeyPhrase(event.text);
 needs.push(buildNeed('objection', `Address objection with evidence${topic}`, event, 'p1', 0.86));
 }

 // Only return needs that matched a real keyword no catch-all filler
 return needs;
}

function buildNeed(
 category: InformationNeed['category'],
 prompt: string,
 event: TranscriptEvent,
 priority: InformationNeed['priority'],
 confidence: number
): InformationNeed {
 return {
 id: `need-${event.id}-${category}`,
 category,
 prompt,
 rationale: `Inferred from ${event.speaker} statement: "${event.text}"`,
 triggeredBySegmentId: event.segmentId,
 confidence,
 priority,
 status: 'new'
 };
}

function extractThemes(text: string): string[] {
 const tokens = text
 .toLowerCase()
 .replace(/[^a-z0-9\s-]/g, '')
 .split(/\s+/)
 .filter(Boolean);

 return [...new Set(tokens.filter((token) => token.length > 5))].slice(0, 4);
}

function extractKeyPhrase(text: string): string {
 const words = text.replace(/[^a-zA-Z0-9\s-]/g, '').split(/\s+/).filter((w) => w.length > 4);
 const phrase = words.slice(0, 6).join(' ');
 return phrase ? ` related to: ${phrase}` : '';
}
