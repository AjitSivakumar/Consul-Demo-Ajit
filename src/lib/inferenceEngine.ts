import { InformationNeed, MeetingContext, TranscriptEvent } from '../types/domain';

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

export function inferInformationNeeds(event: TranscriptEvent): InformationNeed[] {
  const text = event.text.toLowerCase();
  const needs: InformationNeed[] = [];

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
