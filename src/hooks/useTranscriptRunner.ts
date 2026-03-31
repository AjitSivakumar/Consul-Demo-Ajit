import { useEffect, useRef, useState } from 'react';
import { generateLiveTranscriptTurns } from '../services/aiService';
import { useMeetingStore } from '../state/MeetingStore';
import { TranscriptEvent } from '../types/domain';

export type TranscriptStreamMode = 'ai-live' | 'microphone';

export function useTranscriptRunner(): {
  start: () => void;
  pause: () => void;
  reset: () => void;
  mode: TranscriptStreamMode;
  setMode: (mode: TranscriptStreamMode) => void;
  injectLine: (speaker: string, text: string) => void;
  upcomingTurn: { speaker: string; text: string } | null;
  micSupported: boolean;
  micError: string | null;
  micInterimText: string;
  micSpeaker: string;
  setMicSpeaker: (speaker: string) => void;
} {
  const { state, dispatch } = useMeetingStore();
  const stateRef = useRef(state);
  const cursorRef = useRef(0);
  const queueRef = useRef<Array<{ speaker: string; text: string }>>([]);
  const generatingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const manuallyStoppingMicRef = useRef(false);
  const micRetryTimerRef = useRef<number | null>(null);
  const micRestartAttemptsRef = useRef(0);
  const eventCounterRef = useRef(1000);
  const [mode, setMode] = useState<TranscriptStreamMode>('ai-live');
  const [upcomingTurn, setUpcomingTurn] = useState<{ speaker: string; text: string } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micInterimText, setMicInterimText] = useState('');
  const [micSpeaker, setMicSpeaker] = useState('Account Exec');

  const speechCtor =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition || null
      : null;
  const micSupported = Boolean(speechCtor);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const makeEvent = (speaker: string, text: string): TranscriptEvent => {
    eventCounterRef.current += 1;
    return {
      id: `evt-live-${eventCounterRef.current}`,
      timestampIso: new Date().toISOString(),
      speaker,
      text,
      segmentId: `seg-live-${eventCounterRef.current}`
    };
  };

  const injectLine = (speaker: string, text: string): void => {
    const trimmedText = text.trim();
    const trimmedSpeaker = speaker.trim();
    if (!trimmedText || !trimmedSpeaker) {
      return;
    }

    dispatch({ type: 'PROCESS_EVENT', payload: makeEvent(trimmedSpeaker, trimmedText) });
  };

  const stopMicrophone = (): void => {
    manuallyStoppingMicRef.current = true;
    if (micRetryTimerRef.current) {
      window.clearTimeout(micRetryTimerRef.current);
      micRetryTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setMicInterimText('');
  };

  useEffect(() => {
    if (state.liveStatus !== 'listening') {
      return;
    }

    if (mode === 'microphone') {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        if (generatingRef.current) {
          return;
        }

        if (queueRef.current.length === 0) {
          generatingRef.current = true;
          const recentTranscript = stateRef.current.transcript
            .slice(-6)
            .map((segment) => `${segment.speaker}: ${segment.text}`)
            .join('\n');

          const turns = await generateLiveTranscriptTurns({
            recentTranscript,
            participants: stateRef.current.context.participants,
            accountContext: stateRef.current.context.accountContext,
            projectContext: stateRef.current.context.projectContext,
            count: 2
          });

          queueRef.current = turns;
          generatingRef.current = false;
        }

        const next = queueRef.current.shift();
        setUpcomingTurn(queueRef.current[0] ?? null);

        if (!next) {
          return;
        }

        dispatch({ type: 'PROCESS_EVENT', payload: makeEvent(next.speaker, next.text) });
      })();
    }, 3200);

    return () => window.clearInterval(timer);
  }, [dispatch, mode, state.liveStatus]);

  useEffect(() => {
    if (mode !== 'microphone') {
      stopMicrophone();
      setMicError(null);
      micRestartAttemptsRef.current = 0;
      return;
    }

    if (!micSupported || !speechCtor) {
      setMicError('Microphone speech recognition is not supported in this browser.');
      return;
    }

    if (state.liveStatus !== 'listening') {
      stopMicrophone();
      micRestartAttemptsRef.current = 0;
      return;
    }

    if (recognitionRef.current) {
      return;
    }

    const scheduleRestart = (delayMs: number): void => {
      if (micRetryTimerRef.current) {
        window.clearTimeout(micRetryTimerRef.current);
      }

      micRetryTimerRef.current = window.setTimeout(() => {
        micRetryTimerRef.current = null;

        if (mode !== 'microphone' || stateRef.current.liveStatus !== 'listening' || recognitionRef.current) {
          return;
        }

        startRecognition();
      }, delayMs);
    };

    const startRecognition = (): void => {
      manuallyStoppingMicRef.current = false;
      const recognition = new speechCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript?.trim() || '';
          if (!transcript) {
            continue;
          }

          if (event.results[i].isFinal) {
            dispatch({ type: 'PROCESS_EVENT', payload: makeEvent(micSpeaker, transcript) });
          } else {
            interim = transcript;
          }
        }

        if (interim.length > 0) {
          setMicInterimText(interim);
        }

        micRestartAttemptsRef.current = 0;
        setMicError(null);
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicError('Microphone permission denied. Please allow microphone access and restart listening.');
          dispatch({ type: 'PAUSE_LISTENING' });
          return;
        }

        if (event.error === 'network') {
          micRestartAttemptsRef.current += 1;

          if (micRestartAttemptsRef.current >= 3) {
            setMicError('Microphone network error persisted. Switched to AI live transcript mode.');
            setMode('ai-live');
            return;
          }

          setMicError('Microphone network error. Retrying speech capture...');
          stopMicrophone();
          scheduleRestart(1200 * micRestartAttemptsRef.current);
          return;
        }

        setMicError(`Speech recognition error: ${event.error}`);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setMicInterimText('');

        if (manuallyStoppingMicRef.current) {
          manuallyStoppingMicRef.current = false;
          return;
        }

        if (mode === 'microphone' && stateRef.current.liveStatus === 'listening') {
          scheduleRestart(500);
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch {
        setMicError('Unable to start microphone recognition in this browser session.');
      }
    };

    startRecognition();

    return () => {
      stopMicrophone();
    };
  }, [dispatch, micSpeaker, micSupported, mode, speechCtor, state.liveStatus]);

  return {
    start: () => dispatch({ type: 'START_LISTENING' }),
    pause: () => {
      stopMicrophone();
      dispatch({ type: 'PAUSE_LISTENING' });
    },
    reset: () => {
      stopMicrophone();
      cursorRef.current = 0;
      queueRef.current = [];
      setUpcomingTurn(null);
      setMicError(null);
      dispatch({ type: 'RESET' });
    },
    mode,
    setMode,
    injectLine,
    upcomingTurn,
    micSupported,
    micError,
    micInterimText,
    micSpeaker,
    setMicSpeaker
  };
}
