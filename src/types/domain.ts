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
  | 'metric'
  | 'correction';

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
  triggerPhrase?: string;
  triggeredBySegmentId: string;
  confidence: number;
  priority: 'p1' | 'p2' | 'p3';
  status: 'new' | 'retrieving' | 'resolved' | 'unresolved' | 'kept' | 'dismissed' | 'failed';
  demoEvidence?: Omit<EvidenceCard, 'id' | 'needId' | 'triggeredBySegmentId'>;
  isProactiveDemoTrigger?: boolean;
  proactiveHeadline?: string;
  proactiveImportance?: number;
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
  // Rich demo content
  richTable?: {
    devices: Array<{
      name: string;
      subtitle: string;
      badge: string;
      isPrimary: boolean;
      features: Array<{ name: string; val: string; kind: 'yes' | 'no' | 'neu' }>;
    }>;
  };
  richChart?: {
    labels: string[];
    datasets: Array<{ label: string; data: number[]; color: string; dashed?: boolean }>;
    note: string;
    chartType?: 'bar' | 'line';
    yAxisLabel?: string;
  };
  richMetricGrid?: {
    metrics: Array<{ label: string; value: string; sub: string }>;
    insightText?: string;
  };
  richCorrectionBlock?: {
    wrong: { label: string; text: string };
    right: { label: string; text: string };
    riskItems?: Array<{ num: string; title: string; body: string }>;
    reframe?: string;
  };
  richFlowDiagram?: {
    chips: Array<{ label: string; kind?: 'active' | 'sos' | 'default' }>;
    note?: string;
    badges?: Array<{ label: string; color: 'teal' | 'navy' | 'red' | 'green' | 'blue' | 'gold' | 'gray' }>;
    nodes?: Array<{
      id: string;
      label: string;
      sub?: string;
      kind: 'start' | 'default' | 'branch' | 'warning' | 'end';
      color?: 'gray' | 'teal' | 'gold' | 'navy' | 'red' | 'green' | 'blue';
      /** id of the branch node this is a child of */
      parentId?: string;
      /** groups sequential nodes within the same branch column */
      trackId?: string;
      /** label shown above the track column */
      trackLabel?: string;
    }>;
  };
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
