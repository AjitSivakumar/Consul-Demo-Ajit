import {
  createContext,
  Dispatch,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer
} from 'react';
import {
  initialMeetingState,
  MeetingAction,
  meetingReducer,
  MeetingState
} from './meetingState';

const STORAGE_KEY = 'ambi_meeting_state';

function loadState(): MeetingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialMeetingState;
    const parsed = JSON.parse(raw) as MeetingState;
    // Reset transient statuses so a refresh doesn't leave a stale "listening" state
    return {
      ...parsed,
      liveStatus: parsed.liveStatus === 'listening' || parsed.liveStatus === 'ending' ? 'paused' : parsed.liveStatus,
      isGenerating: false,
      notes: parsed.notes ?? {},
      presetTranscript: null, // always reset — never replay a stale preset on refresh
    };
  } catch {
    return initialMeetingState;
  }
}

interface MeetingStoreValue {
  state: MeetingState;
  dispatch: Dispatch<MeetingAction>;
}

const MeetingStoreContext = createContext<MeetingStoreValue | undefined>(undefined);

export function MeetingStoreProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(meetingReducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <MeetingStoreContext.Provider value={value}>{children}</MeetingStoreContext.Provider>;
}

export function useMeetingStore(): MeetingStoreValue {
  const value = useContext(MeetingStoreContext);

  if (!value) {
    throw new Error('useMeetingStore must be used inside MeetingStoreProvider');
  }

  return value;
}
