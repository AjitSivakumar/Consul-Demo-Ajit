/** Structured types for AI-generated deliverable elements. */

/** Element 01 — Research summary with supporting data visualizations */
export interface ResearchElement {
  question: string;
  answer: string;
  comparisonTable?: {
    columns: string[];
    rows: string[][];
  };
  barChart?: Array<{
    label: string;
    value: number;
    style: 'primary' | 'muted';
  }>;
  barChartNote?: string;
  keyFinding?: {
    text: string;
    source: string;
  };
  sources: string[];
}

/** Element 02 — Proactive Q&A grouped by category */
export interface QAElement {
  categories: Array<{
    label: string;
    items: Array<{
      tag: string;
      question: string;
      answer: string;
      source: string;
    }>;
  }>;
}

/** Element 03 — Action items with gap pills and intel blocks */
export interface ActionElement {
  items: Array<{
    num: string;
    title: string;
    description: string;
    gapTags?: string[];
    intel?: {
      label: string;
      text: string;
      source: string;
    };
  }>;
}

/** Element 04 — Leave-behind slide deck thumbnails */
export interface SlideElement {
  slides: Array<{
    num: number;
    label: string;
    title: string;
    bullets: string[];
    chips?: Array<{ text: string; style: 'teal' | 'blue' | 'gray' }>;
    miniChart?: Array<{ label: string; value: number; style: 'primary' | 'muted' }>;
    status: 'resolved' | 'pending';
    pendingNote?: string;
  }>;
  summary: string;
}

/** Complete generated deliverables package */
export interface GeneratedDeliverables {
  research?: ResearchElement;
  qa?: QAElement;
  actions?: ActionElement;
  slides?: SlideElement;
  generatedAt?: string;
  /** Set when deliverable is generated from a hardcoded preset — used by DeliverablesPage to pick the right component */
  presetId?: string;
}
