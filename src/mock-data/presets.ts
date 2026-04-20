import { MeetingContext, TranscriptEvent } from '../types/domain';
import { researchPresets } from './researchPresets';

export interface MeetingPreset {
 id: string;
 label: string;
 context: MeetingContext;
 transcript: TranscriptEvent[];
 autoPlay?: boolean;
 /** When true: transcript replays as a script but AI inference runs live (no hardcoded demoEvidence) */
 liveAI?: boolean;
 /** When true: transcript events still fire (triggering hardcoded popups) but lines are hidden from the transcript panel */
 silentTranscript?: boolean;
 /** When true: disables the preset auto-replay timer so real speech (Recall.ai / inject bar) drives triggers */
 voiceActivated?: boolean;
}

export const meetingPresets: MeetingPreset[] = [
 {
 id: 'gtc-iridium',
 label: 'GTC × Iridium Demo',
 context: {
 meetingId: 'meeting-iridium-gtc',
 title: 'Iridium × GTC',
 participants: ['Account Exec', 'Sales Engineer', 'GTC Buyer'],
 accountContext: 'GTC',
 projectContext: 'Preet Chandi South Pole expedition',
 discussedThemes: [],
 unresolvedQuestions: [],

 confidenceByTheme: {}
 },
 transcript: [
 {
  id: 'evt-1',
  timestampIso: '2026-03-29T17:00:05Z',
  speaker: 'GTC Buyer',
  text: 'Why do we need both devices for Preet? It sounds redundant.',
  segmentId: 'seg-1'
 },
 {
  id: 'evt-2',
  timestampIso: '2026-03-29T17:00:22Z',
  speaker: 'Account Exec',
  text: 'Extreme covers voice and SOS. GO supports photo upload. They solve different constraints.',
  segmentId: 'seg-2'
 },
 {
  id: 'evt-3',
  timestampIso: '2026-03-29T17:00:49Z',
  speaker: 'GTC Buyer',
  text: 'Do we have deployment evidence that dual-device setups succeed more often?',
  segmentId: 'seg-3'
 },
 {
  id: 'evt-4',
  timestampIso: '2026-03-29T17:01:12Z',
  speaker: 'Sales Engineer',
  text: 'We should compare mission completion and comms uptime for dual versus single-device teams.',
  segmentId: 'seg-4'
 },
 {
  id: 'evt-5',
  timestampIso: '2026-03-29T17:01:31Z',
  speaker: 'GTC Buyer',
  text: 'What pricing bundle would we propose Thursday? That seems unresolved.',
  segmentId: 'seg-5'
 },
 {
  id: 'evt-6',
  timestampIso: '2026-03-29T17:01:55Z',
  speaker: 'Account Exec',
  text: "My instinct is they're complementary not redundant the Iridium Extreme handles all voice and SOS natively, and the GO! handles photos and data uploads. But GTC might push back and say two devices complicates the story for a solo expedition.",
  segmentId: 'seg-6'
 },
 {
  id: 'evt-7',
  timestampIso: '2026-03-29T17:02:20Z',
  speaker: 'Account Exec',
  text: "That chart is the answer. We're not walking into Thursday asking GTC to trust our instinct we're showing them the data. Ninety-four versus seventy-one percent is not a marginal difference. And the capability gap is black and white you literally cannot do voice blogs on the GO! alone.",
  segmentId: 'seg-7'
 },
 {
  id: 'evt-8',
  timestampIso: '2026-03-29T17:02:55Z',
  speaker: 'Sales Engineer',
  text: "Exactly. And honestly the passive setup is the biggest differentiator for solo expeditions specifically. The content delivery number is where it really shows. The GO! keeping that data pipeline open without Preet ever touching it that's why the content numbers are so much higher with the dual-device setup.",
  segmentId: 'seg-8'
 },
 {
  id: 'evt-9',
  timestampIso: '2026-03-29T17:03:25Z',
  speaker: 'Sales Engineer',
  text: "I think we should actually lead with the GO! as the primary device in our pitch it handles the photos and data that audiences actually engage with, and the Extreme is kind of backup voice.",
  segmentId: 'seg-9'
 },
 {
  id: 'evt-10',
  timestampIso: '2026-03-29T17:03:58Z',
  speaker: 'Sales Engineer',
  text: "Either way, we're not asking Preet to make a decision on the ice she picks up the Extreme for voice and the GO! runs passively for everything else. And if something goes wrong she hits SOS on the Extreme.",
  segmentId: 'seg-10'
 },
 {
  id: 'evt-11',
  timestampIso: '2026-03-29T17:04:20Z',
  speaker: 'Account Exec',
  text: "Let's build the slide around this.",
  segmentId: 'seg-11'
 }
 ]
 },
 {
 id: 'chen-tobin-heat-auto',
 label: 'Chen Lab × Tobin Center (Auto)',
 autoPlay: true,
 context: {
 meetingId: 'meeting-chen-tobin-heat-auto',
 title: 'Chen Lab × Tobin Center',
 meetingType: 'research' as const,
 participants: ['Sarah Chen', 'James Okafor'],
 accountContext: 'Tobin Center for Economic Policy',
 projectContext: 'Heat exposure / preterm birth CT climate adaptation pitch, June session',
 discussedThemes: [],
 unresolvedQuestions: [],

 confidenceByTheme: {}
 },
 transcript: [
 {
  id: 'evt-cta-1',
  segmentId: 'seg-cta-1',
  timestampIso: '2026-04-10T14:00:05Z',
  speaker: 'James Okafor',
  text: "I want to build the economic case before the June session. We take your effect sizes, model out prevented preterm births across New Haven, put a dollar figure on it NICHD puts average direct cost at around fifty thousand dollars per preterm birth. If your data holds, we have something the adaptation office can act on."
 },
 {
  id: 'evt-cta-2',
  segmentId: 'seg-cta-2',
  timestampIso: '2026-04-10T14:00:38Z',
  speaker: 'Sarah Chen',
  text: "I want to help you get there but I need to flag something first the preprint isn't peer reviewed yet and we're still working through a confounder around AC access that could affect the effect size. I don't want to hand you a number that shifts in the revision and becomes a liability for the Tobin pitch."
 },
 {
  id: 'evt-cta-3',
  segmentId: 'seg-cta-3',
  timestampIso: '2026-04-10T14:01:10Z',
  speaker: 'James Okafor',
  text: "Okay so if we anchor only on the numbers you're confident in, the lower-bound estimate still gets us somewhere meaningful. What's the effect size for extreme heat days in the third trimester, low-income tracts, even with conservative assumptions?"
 },
 {
  id: 'evt-cta-4',
  segmentId: 'seg-cta-4',
  timestampIso: '2026-04-10T14:01:44Z',
  speaker: 'Sarah Chen',
  text: "The association is around 1.4 relative risk in that stratum. But look even if the AC confounder shaves that down, the directionality is stable. What I'd say to the adaptation office is: the evidence is strong enough to justify piloting. What it can't support yet is a city-wide cost-benefit number with a single point estimate."
 },
 {
  id: 'evt-cta-5',
  segmentId: 'seg-cta-5',
  timestampIso: '2026-04-10T14:02:18Z',
  speaker: 'James Okafor',
  text: "That's actually a cleaner story for the adaptation office anyway pilot justification with a credible lower bound, rather than a city-wide projection they'll pick apart. Let me think about the stakeholder pathway. The adaptation office reports to DEEP, but the funding for cool corridors probably runs through OPM and we'd need DPH sign-off to use the maternal outcomes data in any public-facing materials. This could get complicated fast."
 },
 {
  id: 'evt-cta-6',
  segmentId: 'seg-cta-6',
  timestampIso: '2026-04-10T14:02:58Z',
  speaker: 'Sarah Chen',
  text: "And honestly before we even get to the pathway I want to make sure we're not inadvertently overstating the geographic precision of this. The census tract-level data is solid for New Haven. Bridgeport is thinner. If James leads with New Haven and Bridgeport the way the preprint title reads, and the Bridgeport estimates don't survive revision, that's a credibility problem."
 },
 {
  id: 'evt-cta-7',
  segmentId: 'seg-cta-7',
  timestampIso: '2026-04-10T14:03:24Z',
  speaker: 'James Okafor',
  text: "You're right. New Haven is the anchor. Bridgeport is directional. Let's build the deck that way."
 },
 {
  id: 'evt-cta-8',
  segmentId: 'seg-cta-8',
  timestampIso: '2026-04-10T14:03:42Z',
  speaker: 'Sarah Chen',
  text: "Let's get it in front of the adaptation office before they're locked into summer priorities."
 }
 ]
 },
 {
 id: 'chen-tobin-heat',
 label: 'Chen Lab × Tobin Center',
 silentTranscript: true,
 context: {
 meetingId: 'meeting-chen-tobin-heat',
 title: 'Chen Lab × Tobin Center',
 meetingType: 'research' as const,
 participants: ['Sarah Chen', 'James Okafor'],
 accountContext: 'Tobin Center for Economic Policy',
 projectContext: 'Heat exposure / preterm birth CT climate adaptation pitch, June session',
 discussedThemes: [],
 unresolvedQuestions: [],

 confidenceByTheme: {}
 },
 transcript: [
 {
  id: 'evt-ct-1',
  segmentId: 'seg-ct-1',
  timestampIso: '2026-04-10T14:00:05Z',
  speaker: 'James Okafor',
  text: "I want to build the economic case before the June session. We take your effect sizes, model out prevented preterm births across New Haven, put a dollar figure on it NICHD puts average direct cost at around fifty thousand dollars per preterm birth. If your data holds, we have something the adaptation office can act on."
 },
 {
  id: 'evt-ct-2',
  segmentId: 'seg-ct-2',
  timestampIso: '2026-04-10T14:00:38Z',
  speaker: 'Sarah Chen',
  text: "I want to help you get there but I need to flag something first the preprint isn't peer reviewed yet and we're still working through a confounder around AC access that could affect the effect size. I don't want to hand you a number that shifts in the revision and becomes a liability for the Tobin pitch."
 },
 {
  id: 'evt-ct-3',
  segmentId: 'seg-ct-3',
  timestampIso: '2026-04-10T14:01:10Z',
  speaker: 'James Okafor',
  text: "Okay so if we anchor only on the numbers you're confident in, the lower-bound estimate still gets us somewhere meaningful. What's the effect size for extreme heat days in the third trimester, low-income tracts, even with conservative assumptions?"
 },
 {
  id: 'evt-ct-4',
  segmentId: 'seg-ct-4',
  timestampIso: '2026-04-10T14:01:44Z',
  speaker: 'Sarah Chen',
  text: "The association is around 1.4 relative risk in that stratum. But look even if the AC confounder shaves that down, the directionality is stable. What I'd say to the adaptation office is: the evidence is strong enough to justify piloting. What it can't support yet is a city-wide cost-benefit number with a single point estimate."
 },
 {
  id: 'evt-ct-5',
  segmentId: 'seg-ct-5',
  timestampIso: '2026-04-10T14:02:18Z',
  speaker: 'James Okafor',
  text: "That's actually a cleaner story for the adaptation office anyway pilot justification with a credible lower bound, rather than a city-wide projection they'll pick apart. Let me think about the stakeholder pathway. The adaptation office reports to DEEP, but the funding for cool corridors probably runs through OPM and we'd need DPH sign-off to use the maternal outcomes data in any public-facing materials. This could get complicated fast."
 },
 {
  id: 'evt-ct-6',
  segmentId: 'seg-ct-6',
  timestampIso: '2026-04-10T14:02:58Z',
  speaker: 'Sarah Chen',
  text: "And honestly before we even get to the pathway I want to make sure we're not inadvertently overstating the geographic precision of this. The census tract-level data is solid for New Haven. Bridgeport is thinner. If James leads with New Haven and Bridgeport the way the preprint title reads, and the Bridgeport estimates don't survive revision, that's a credibility problem."
 },
 {
  id: 'evt-ct-7',
  segmentId: 'seg-ct-7',
  timestampIso: '2026-04-10T14:03:24Z',
  speaker: 'James Okafor',
  text: "You're right. New Haven is the anchor. Bridgeport is directional. Let's build the deck that way."
 },
 {
  id: 'evt-ct-8',
  segmentId: 'seg-ct-8',
  timestampIso: '2026-04-10T14:03:42Z',
  speaker: 'Sarah Chen',
  text: "Let's get it in front of the adaptation office before they're locked into summer priorities."
 }
 ]
 },
 // ── Patel Lab × Children's Hospital Foundation — Mobile vaccine clinic rollout ──
 {
 id: 'patel-lab-vaccine',
 label: 'Patel Lab × Children\'s Hospital',
 voiceActivated: true,
 context: {
  meetingId: 'meeting-patel-vaccine',
  title: 'Patel Lab × Children\'s Hospital Foundation',
  meetingType: 'research' as const,
  participants: ['James', 'Priya'],
  accountContext: 'Children\'s Hospital Foundation',
  projectContext: 'Mobile vaccine clinic rollout — Chicago zip code targeting for board pitch, fall pilot sites',
  discussedThemes: [],
  unresolvedQuestions: [],

  confidenceByTheme: {}
 },
 transcript: []
 },
 ...researchPresets,
];
