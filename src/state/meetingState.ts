import { inferInformationNeeds, updateMeetingContext } from '../lib/inferenceEngine';
import { initialDeliverables } from '../mock-data/deliverables';
import {
  Deliverable,
  EvidenceCard,
  InformationNeed,
  MeetingContext,
  TranscriptEvent
} from '../types/domain';
import { GeneratedDeliverables } from '../types/deliverables';

export type { GeneratedDeliverables };

export interface MeetingState {
  context: MeetingContext;
  transcript: TranscriptEvent[];
  needs: InformationNeed[];
  evidence: EvidenceCard[];
  deliverables: Deliverable[];
  liveStatus: 'idle' | 'listening' | 'paused' | 'ending' | 'ended';
  // Ambient AI features
  ambientSuggestions: Array<{ timestamp: string; headline: string; needId: string; importance: number }>;
  lastSuggestionTime: number;
  // Deliverable generation
  generatedContent: GeneratedDeliverables;
  isGenerating: boolean;
  // Per-insight notes (keyed by needId or '__general__')
  notes: Record<string, string>;
}

export type MeetingAction =
  | { type: 'START_LISTENING' }
  | { type: 'PAUSE_LISTENING' }
  | { type: 'END_MEETING' }
  | { type: 'SET_MEETING_TITLE'; payload: string }
  | { type: 'PROCESS_EVENT'; payload: TranscriptEvent }
  | { type: 'ADD_AI_NEEDS'; payload: InformationNeed[] }
  | { type: 'ADD_AMBIENT_SUGGESTION'; payload: { headline: string; needId: string; importance: number } }
  | { type: 'DISMISS_AMBIENT_SUGGESTION'; payload: string }
  | { type: 'UPDATE_NEED_STATUS'; payload: { needId: string; status: InformationNeed['status'] } }
  | { type: 'KEEP_NEED'; payload: string }
  | { type: 'DISMISS_NEED'; payload: string }
  | { type: 'ADD_RESOLVED_EVIDENCE'; payload: EvidenceCard }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATED_CONTENT'; payload: GeneratedDeliverables }
  | { type: 'LOAD_PRESET'; payload: { context: MeetingContext; transcript: TranscriptEvent[] } }
  | { type: 'SET_NOTE'; payload: { key: string; text: string } }
  | { type: 'SAVE_INSIGHT'; payload: { question: string; answer: string; source: string } }
  | { type: 'RESET' };

export const initialMeetingState: MeetingState = {
  context: {
    meetingId: '',
    title: '',
    participants: [],
    accountContext: '',
    projectContext: '',
    discussedThemes: [],
    unresolvedQuestions: [],
    deliverableTargets: [],
    confidenceByTheme: {}
  },
  transcript: [],
  needs: [],
  evidence: [],
  deliverables: initialDeliverables,
  liveStatus: 'idle',
  ambientSuggestions: [],
  lastSuggestionTime: 0,
  generatedContent: {},
  isGenerating: false,
  notes: {}
};

export function meetingReducer(state: MeetingState, action: MeetingAction): MeetingState {
  switch (action.type) {
    case 'START_LISTENING':
      return { ...state, liveStatus: 'listening' };
    case 'PAUSE_LISTENING':
      return { ...state, liveStatus: 'paused' };
    case 'END_MEETING':
      return { ...state, liveStatus: 'ending' };
    case 'SET_MEETING_TITLE':
      return {
        ...state,
        context: {
          ...state.context,
          title: action.payload
        }
      };
    case 'PROCESS_EVENT':
      return applyTranscriptEvent(state, action.payload);
    case 'ADD_AI_NEEDS':
      return applyAdditionalNeeds(state, action.payload);
    case 'ADD_AMBIENT_SUGGESTION':
      return {
        ...state,
        ambientSuggestions: [
          ...state.ambientSuggestions,
          { timestamp: new Date().toISOString(), headline: action.payload.headline, needId: action.payload.needId, importance: action.payload.importance }
        ],
        lastSuggestionTime: Date.now()
      };
    case 'DISMISS_AMBIENT_SUGGESTION':
      return {
        ...state,
        ambientSuggestions: state.ambientSuggestions.filter((s) => s.needId !== action.payload),
      };
    case 'UPDATE_NEED_STATUS':
      return {
        ...state,
        needs: state.needs.map((n) =>
          n.id === action.payload.needId ? { ...n, status: action.payload.status } : n
        ),
      };
    case 'KEEP_NEED':
      return {
        ...state,
        needs: state.needs.map((n) =>
          n.id === action.payload ? { ...n, status: 'kept' as const } : n
        ),
      };
    case 'DISMISS_NEED':
      return {
        ...state,
        needs: state.needs.map((n) =>
          n.id === action.payload ? { ...n, status: 'dismissed' as const } : n
        ),
      };
    case 'ADD_RESOLVED_EVIDENCE': {
      const evidence = [...state.evidence, action.payload];
      return { ...state, evidence };
    }
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATED_CONTENT':
      return {
        ...state,
        generatedContent: { ...state.generatedContent, ...action.payload, generatedAt: new Date().toISOString() },
        isGenerating: false,
        liveStatus: 'ended'
      };
    case 'LOAD_PRESET': {
      const base = { ...initialMeetingState };
      let ctx = action.payload.context;
      for (const evt of action.payload.transcript) {
        ctx = updateMeetingContext(ctx, evt);
      }
      return {
        ...base,
        context: ctx,
        transcript: action.payload.transcript,
        liveStatus: 'listening'
      };
    }
    case 'SET_NOTE':
      return { ...state, notes: { ...state.notes, [action.payload.key]: action.payload.text } };
    case 'SAVE_INSIGHT': {
      const existingQA = state.generatedContent.qa;
      const newItem = { tag: 'INSIGHT', question: action.payload.question, answer: action.payload.answer, source: action.payload.source };
      let updatedQA: GeneratedDeliverables['qa'];
      if (!existingQA) {
        updatedQA = { categories: [{ label: 'Saved Insights', items: [newItem] }] };
      } else {
        const savedCat = existingQA.categories.find((c) => c.label === 'Saved Insights');
        if (savedCat) {
          updatedQA = { categories: existingQA.categories.map((c) => c.label === 'Saved Insights' ? { ...c, items: [...c.items, newItem] } : c) };
        } else {
          updatedQA = { categories: [...existingQA.categories, { label: 'Saved Insights', items: [newItem] }] };
        }
      }
      return { ...state, generatedContent: { ...state.generatedContent, qa: updatedQA } };
    }
    case 'RESET':
      return initialMeetingState;
    default:
      return state;
  }
}

function applyTranscriptEvent(state: MeetingState, event: TranscriptEvent): MeetingState {
  const context = updateMeetingContext(state.context, event);
  const withTranscript = {
    ...state,
    context,
    transcript: [...state.transcript, event]
  };

  // Keep deterministic local inference as fallback when API calls are unavailable.
  return applyAdditionalNeeds(withTranscript, inferInformationNeeds(event));
}

function applyAdditionalNeeds(state: MeetingState, incomingNeeds: InformationNeed[]): MeetingState {
  if (incomingNeeds.length === 0) {
    return state;
  }

  // Quality gate: only admit p1 needs with confidence >= 0.80
  const qualityFiltered = incomingNeeds.filter(
    (need) => need.priority === 'p1' && need.confidence >= 0.80
  );

  if (qualityFiltered.length === 0) {
    return state;
  }

  const dedupedNeeds = qualityFiltered.filter(
    (need) => !state.needs.some((existing) => existing.prompt === need.prompt && existing.category === need.category)
  );

  if (dedupedNeeds.length === 0) {
    return state;
  }

  const needs = [...state.needs, ...dedupedNeeds];

  return {
    ...state,
    needs
  };
}
