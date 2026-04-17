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
  // Preset replay: transcript queued for step-by-step playback on Start
  presetTranscript: TranscriptEvent[] | null;
  // True for the entire session once a preset is loaded — blocks AI inference
  presetActive: boolean;
  // True when preset has liveAI:true — transcript replays but full AI pipeline runs
  liveAIPreset: boolean;
  // ID of the loaded preset — used to scope demo triggers to the right preset
  activePresetId: string | null;
  // When true, auto-timer always runs regardless of mode (no script-assist)
  presetAutoPlay: boolean;
  // Script-assist: preset loaded + recall-bot mode — disables auto-timer, uses looser trigger matching
  scriptAssistMode: boolean;
  // When true, events still fire (triggering popups) but lines are not added to the visible transcript
  silentReplay: boolean;
  // When true, disables preset auto-replay so real speech drives triggers (transcript still visible)
  presetVoiceActivated: boolean;
  // Group this session is associated with
  groupId: string | null;
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
  | { type: 'LOAD_PRESET'; payload: { id: string; context: MeetingContext; transcript: TranscriptEvent[]; autoPlay?: boolean; liveAI?: boolean; silentTranscript?: boolean; voiceActivated?: boolean } }
  | { type: 'CLEAR_PRESET_TRANSCRIPT' }
  | { type: 'SET_SCRIPT_ASSIST'; payload: boolean }
  | { type: 'SET_NOTE'; payload: { key: string; text: string } }
  | { type: 'SAVE_INSIGHT'; payload: { question: string; answer: string; source: string } }
  | { type: 'SET_GROUP'; payload: string | null }
  | { type: 'SET_MEETING_CONTEXT'; payload: { title: string; groupId: string | null; accountContext: string; meetingType: 'sales' | 'research' } }
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
    confidenceByTheme: {},
    meetingType: 'sales',
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
  notes: {},
  presetTranscript: null,
  presetActive: false,
  liveAIPreset: false,
  activePresetId: null,
  presetAutoPlay: false,
  scriptAssistMode: false,
  silentReplay: false,
  presetVoiceActivated: false,
  groupId: null,
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
    case 'PROCESS_EVENT': {
      const presetMode = state.presetTranscript !== null && !state.scriptAssistMode;
      const assistMode = state.scriptAssistMode;
      return applyTranscriptEvent(state, action.payload, presetMode, assistMode, state.presetActive, state.activePresetId);
    }
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
      return {
        ...initialMeetingState,
        // liveAI presets replay the transcript but let the full AI pipeline run (no hardcoded triggers)
        presetActive: !action.payload.liveAI,
        liveAIPreset: action.payload.liveAI ?? false,
        activePresetId: action.payload.id,
        presetAutoPlay: action.payload.autoPlay ?? false,
        silentReplay: action.payload.silentTranscript ?? false,
        presetVoiceActivated: action.payload.voiceActivated ?? false,
        context: { ...initialMeetingState.context, ...action.payload.context },
        presetTranscript: action.payload.transcript,
        liveStatus: 'paused',
      };
    }
    case 'CLEAR_PRESET_TRANSCRIPT':
      return { ...state, presetTranscript: null };
    case 'SET_SCRIPT_ASSIST':
      return { ...state, scriptAssistMode: action.payload };
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
    case 'SET_GROUP':
      return { ...state, groupId: action.payload };
    case 'SET_MEETING_CONTEXT':
      return {
        ...state,
        groupId: action.payload.groupId,
        context: { ...state.context, title: action.payload.title, accountContext: action.payload.accountContext, meetingType: action.payload.meetingType },
      };
    case 'RESET':
      return initialMeetingState;
    default:
      return state;
  }
}

function applyTranscriptEvent(state: MeetingState, event: TranscriptEvent, presetMode = false, assistMode = false, presetActive = false, activePresetId: string | null = null): MeetingState {
  const context = updateMeetingContext(state.context, event);
  // silentReplay: still run inference (so hardcoded popups fire) but don't show lines in transcript panel
  const withTranscript = {
    ...state,
    context,
    transcript: state.silentReplay ? state.transcript : [...state.transcript, event]
  };

  // Keep deterministic local inference as fallback when API calls are unavailable.
  return applyAdditionalNeeds(withTranscript, inferInformationNeeds(event, assistMode, presetActive, activePresetId), presetMode || presetActive);
}

function applyAdditionalNeeds(state: MeetingState, incomingNeeds: InformationNeed[], presetMode = false): MeetingState {
  if (incomingNeeds.length === 0) {
    return state;
  }

  // During preset replay, only admit demo-triggered needs (suppress keyword-based noise)
  const presetFiltered = presetMode
    ? incomingNeeds.filter((need) => need.demoEvidence !== undefined)
    : incomingNeeds;

  if (presetFiltered.length === 0) return state;

  // Quality gate: only admit p1 needs with confidence >= 0.65
  const qualityFiltered = presetFiltered.filter(
    (need) => need.priority === 'p1' && need.confidence >= 0.65
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
