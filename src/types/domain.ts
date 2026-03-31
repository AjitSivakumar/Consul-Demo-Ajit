export type Confidence = 'low' | 'medium' | 'high';

export type NeedCategory =
  | 'entity'
  | 'topic'
  | 'goal'
  | 'open_question'
  | 'comparison'
  | 'risk'
  | 'objection'
  | 'decision'
  | 'action_item'
  | 'metric';

export type SourceType = 'internal_structured' | 'internal_document' | 'product_doc' | 'prior_notes' | 'web';

export interface TranscriptEvent {
  id: string;
  timestampIso: string;
  speaker: string;
  text: string;
  segmentId: string;
}

export interface MeetingContext {
  meetingId: string;
  title: string;
  participants: string[];
  accountContext: string;
  projectContext: string;
  discussedThemes: string[];
  unresolvedQuestions: string[];
  deliverableTargets: string[];
  confidenceByTheme: Record<string, number>;
  lastSegmentId?: string;
}

export interface InformationNeed {
  id: string;
  category: NeedCategory;
  prompt: string;
  rationale: string;
  triggeredBySegmentId: string;
  confidence: number;
  priority: 'p1' | 'p2' | 'p3';
  status: 'new' | 'retrieving' | 'resolved' | 'unresolved' | 'kept' | 'dismissed' | 'failed';
}

export interface RetrievalTask {
  id: string;
  informationNeedId: string;
  query: string;
  sourceTypes: SourceType[];
  createdAtIso: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
}

export interface SourceAttribution {
  sourceId: string;
  sourceType: SourceType;
  title: string;
  snippet?: string;
  url?: string;
  freshnessScore: number;
  trustScore: number;
}

export type EvidenceKind = 'claim' | 'metric' | 'comparison' | 'trend' | 'summary';

export interface EvidenceCard {
  id: string;
  needId: string;
  title: string;
  summary: string;
  kind: EvidenceKind;
  value?: string | number;
  values?: Array<{ label: string; value: number }>;
  comparison?: Array<Record<string, string | number>>;
  recencyLabel: string;
  confidence: number;
  attributions: SourceAttribution[];
  triggeredBySegmentId: string;
  explainWhyNow: string;
  verification: 'verified' | 'inferred' | 'missing';
}

export interface DeliverableRequirement {
  id: string;
  sectionId: string;
  label: string;
  questionToAnswer: string;
  requiredEvidenceKinds: EvidenceKind[];
  status: 'satisfied' | 'partial' | 'blocked';
}

export interface Gap {
  id: string;
  requirementId: string;
  status: 'open' | 'partial' | 'blocked' | 'resolved';
  priority: 'high' | 'medium' | 'low';
  missingQuestion: string;
  suggestedNextQuery: string;
  likelySource: SourceType;
  affectedDeliverableSection: string;
}

export interface Deliverable {
  id: string;
  title: string;
  outline: string[];
  requirements: DeliverableRequirement[];
  draftContent: string;
  citations: SourceAttribution[];
  blockers: string[];
}
