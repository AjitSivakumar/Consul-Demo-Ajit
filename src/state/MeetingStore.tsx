import {
  createContext,
  Dispatch,
  PropsWithChildren,
  useContext,
  useMemo,
  useReducer
} from 'react';
import {
  initialMeetingState,
  MeetingAction,
  meetingReducer,
  MeetingState
} from './meetingState';

interface MeetingStoreValue {
  state: MeetingState;
  dispatch: Dispatch<MeetingAction>;
}

const MeetingStoreContext = createContext<MeetingStoreValue | undefined>(undefined);

export function MeetingStoreProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [state, dispatch] = useReducer(meetingReducer, initialMeetingState);
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
