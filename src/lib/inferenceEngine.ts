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
  needs: Array<{ category: InformationNeed['category']; prompt: string; triggerPhrase: string; demoEvidence: DemoEvidence; isProactiveDemoTrigger?: boolean; proactiveHeadline?: string; proactiveImportance?: number; }>;
  fired: boolean;
}> = [
  // Trigger 1: Proactive — passive setup + content delivery
  {
    detect: (text) =>
      text.includes('passive') &&
      (text.includes('solo') || text.includes('content') || text.includes('differentiator')),
    needs: [
      {
        category: 'metric' as InformationNeed['category'],
        prompt: 'Passive setup correlates with higher content delivery — 91% vs 43%',
        triggerPhrase: 'passive setup is the biggest differentiator',
        isProactiveDemoTrigger: true,
        proactiveHeadline: 'Passive setup correlates with higher content delivery — 91% vs 43%',
        proactiveImportance: 9,
        demoEvidence: {
          title: 'Passive setup correlates with higher content delivery — 91% vs 43%',
          summary: 'Content delivery gap between dual and single-device setups is the largest performance delta across all four metrics — bigger than mission completion or comms uptime. The GO!\'s always-on passive mode keeps the data pipeline open even when the athlete is physically occupied.',
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
            insightText: 'The passive architecture of the GO! is the mechanism behind the content delivery advantage. Unlike voice comms — which require active device handling — data and photo pipelines run silently in the background via Iridium SBD. In solo expeditions specifically, athletes can\'t spare cognitive bandwidth for device management, so a passive data layer isn\'t just convenient, it\'s structurally necessary for consistent content output. This is the lead sales argument for GTC: not "two devices," but "one active device, one silent pipeline."',
          },
        },
      },
    ],
    fired: false,
  },
  // Trigger 3: Caution — leading with GO! as primary
  {
    detect: (text) =>
      (text.includes('lead with') && (text.includes('go!') || text.includes('go!'))) ||
      (text.includes('primary device') && text.includes('go')) ||
      (text.includes('go!') && text.includes('primary') && text.includes('backup')),
    needs: [
      {
        category: 'correction' as InformationNeed['category'],
        prompt: 'Leading with the GO! as primary inverts the device hierarchy — and misrepresents the safety story',
        triggerPhrase: 'lead with the GO! as the primary device',
        isProactiveDemoTrigger: false,
        demoEvidence: {
          title: 'Leading with the GO! as primary inverts the device hierarchy',
          summary: 'Framing the GO! as the primary device is a critical positioning error for this client. The GO! has no standalone SOS capability and cannot make voice calls without a paired device. In an expedition context, leading with it as primary exposes GTC to liability questions and undermines Iridium\'s safety narrative. The Extreme is the primary device — not because of voice, but because it carries the SOS button.',
          kind: 'claim' as EvidenceKind,
          recencyLabel: 'Product · Extreme spec · GO! architecture docs',
          confidence: 0.97,
          verification: 'verified' as const,
          explainWhyNow: 'Person 2 suggested leading with GO! as primary device',
          attributions: [
            { sourceId: 'iridium-spec-extreme-sos', sourceType: 'product_doc' as const, title: 'Iridium Extreme spec sheet', freshnessScore: 0.95, trustScore: 0.99 },
          ],
          richCorrectionBlock: {
            wrong: { label: '❌ Avoid framing', text: '"GO! primary, Extreme backup" — implies SOS is non-essential' },
            right: { label: '✓ Correct framing', text: '"Extreme primary, GO! passive layer" — safety-first narrative' },
            riskItems: [
              { num: '01', title: 'No standalone SOS on the GO!', body: 'The GO! has no physical SOS button. In an emergency, if the Extreme is lost or damaged, a solo athlete has no distress signaling capability. Leading with GO! as primary erases this from the client\'s mental model.' },
              { num: '02', title: 'Voice requires the Extreme — GO! cannot call independently', body: 'The GO! routes voice through a paired smartphone app, which requires a charged phone and local Wi-Fi to the GO!. In polar conditions, this dependency is a failure point.' },
              { num: '03', title: "GTC's technical team will catch this", body: 'GTC knows the hardware. Entering Thursday with an inverted hierarchy will signal that the sales counterpart doesn\'t understand the product stack — damaging credibility on the most important technical sale point.' },
            ],
            reframe: 'Lead with safety first: "One device handles every emergency scenario — SOS, voice, GPS. The GO! runs silently alongside it to add a content layer without asking Preet to do anything extra." This keeps the Extreme as the anchor and positions the GO! as an additive benefit, not a replacement.',
          },
        },
      },
    ],
    fired: false,
  },
  // Trigger 3: Diagram — device decision flow
  {
    detect: (text) =>
      (text.includes('picks up') && (text.includes('extreme') || text.includes('voice'))) ||
      (text.includes('passively') && text.includes('sos')) ||
      (text.includes('extreme for voice') && text.includes('go')),
    needs: [
      {
        category: 'comparison' as InformationNeed['category'],
        prompt: 'The device decision logic you described maps to a clear decision flowchart for the GTC slide',
        triggerPhrase: 'she picks up the Extreme for voice',
        isProactiveDemoTrigger: false,
        demoEvidence: {
          title: 'Device Decision Flow — Iridium Extreme × GO!',
          summary: 'Consul identified a branching decision structure in what was just said — when does Preet use the Extreme vs. rely on the GO!? This maps cleanly to a flowchart that could anchor the GTC slide.',
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
    fired: false,
  },
];

export function resetDemoTriggers(): void {
  for (const t of demoTriggers) {
    t.fired = false;
  }
}

export function inferInformationNeeds(event: TranscriptEvent): InformationNeed[] {
  const text = event.text.toLowerCase();
  const needs: InformationNeed[] = [];

  // Check demo triggers first
  for (const trigger of demoTriggers) {
    if (!trigger.fired && trigger.detect(text)) {
      trigger.fired = true;
      for (const t of trigger.needs) {
        needs.push({
          id: t.isProactiveDemoTrigger
            ? `proactive-demo-${event.id}-${t.category}`
            : `need-${event.id}-${t.category}-demo`,
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
      break;
    }
  }

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

  // Only return needs that matched a real keyword — no catch-all filler
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
