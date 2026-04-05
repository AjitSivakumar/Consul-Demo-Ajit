import { useCallback, useEffect, useRef, useState } from 'react';
import { generateLiveTranscriptTurns } from '../services/aiService';
import {
  createRecallBot,
  stopRecallBot,
  subscribeToTranscript,
  getRecallBotStatus,
  RecallTranscriptEvent,
} from '../services/recallService';
import { readBotSettings } from './useBotSettings';
import { useMeetingStore } from '../state/MeetingStore';
import { TranscriptEvent } from '../types/domain';

export type TranscriptStreamMode = 'ai-live' | 'microphone' | 'google-meet' | 'recall-bot';

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
  // Recall.ai bot
  recallBotId: string | null;
  recallBotStatus: string;
  recallError: string | null;
  recallMeetingUrl: string;
  recallPartials: Record<string, string>;
  setRecallMeetingUrl: (url: string) => void;
  sendRecallBot: () => Promise<void>;
  removeRecallBot: () => Promise<void>;
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
  const presetCursorRef = useRef(0);
  const [mode, setMode] = useState<TranscriptStreamMode>('recall-bot');
  const [upcomingTurn, setUpcomingTurn] = useState<{ speaker: string; text: string } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micInterimText, setMicInterimText] = useState('');
  const [micSpeaker, setMicSpeaker] = useState('Account Exec');

  // Recall.ai bot state
  const [recallBotId, setRecallBotId] = useState<string | null>(null);
  const [recallBotStatus, setRecallBotStatus] = useState('idle');
  const [recallError, setRecallError] = useState<string | null>(null);
  const [recallMeetingUrl, setRecallMeetingUrl] = useState('');
  const recallUnsubRef = useRef<(() => void) | null>(null);
  const recallStatusPollRef = useRef<number | null>(null);
  const [recallPartials, setRecallPartials] = useState<Record<string, string>>({});

  const RECALL_STORAGE_KEY = 'ambi_recall_bot';

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

  // Listen for captions from the Ambi Chrome extension (Google Meet connector)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'AMBI_CAPTION_FROM_EXTENSION') {
        const { speaker, text } = event.data;
        console.log('%c[Ambi App]', 'color:#63d2be;font-weight:bold',
          `Received from extension: ${speaker}: ${text?.substring(0, 60)}`);
        if (speaker && text) {
          // Auto-start listening if idle when captions arrive
          if (stateRef.current.liveStatus === 'idle') {
            console.log('%c[Ambi App]', 'color:#63d2be;font-weight:bold', 'Auto-starting from idle');
            dispatch({ type: 'START_LISTENING' });
          }
          dispatch({ type: 'PROCESS_EVENT', payload: makeEvent(speaker, text) });
        }
      }
    };

    window.addEventListener('message', handler);
    console.log('%c[Ambi App]', 'color:#63d2be;font-weight:bold', 'postMessage listener registered');
    return () => window.removeEventListener('message', handler);
  }, [dispatch]);

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

    if (mode === 'microphone' || mode === 'google-meet' || mode === 'recall-bot') {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        // Don't run ai-live generation during preset replay
        if (stateRef.current.presetTranscript !== null) return;

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

  // ── Preset replay: fire stored transcript events one-by-one when Start is pressed ──
  useEffect(() => {
    if (state.liveStatus !== 'listening' || !state.presetTranscript || state.presetTranscript.length === 0) {
      return;
    }

    presetCursorRef.current = 0;
    const events = state.presetTranscript;

    const timer = window.setInterval(() => {
      if (presetCursorRef.current >= events.length) {
        window.clearInterval(timer);
        dispatch({ type: 'CLEAR_PRESET_TRANSCRIPT' });
        return;
      }
      const evt = events[presetCursorRef.current];
      presetCursorRef.current += 1;
      dispatch({ type: 'PROCESS_EVENT', payload: evt });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [dispatch, state.liveStatus, state.presetTranscript]);

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

  // ── Recall.ai: start polling bot status from Recall.ai API ──
  const startStatusPoll = useCallback((botId: string) => {
    if (recallStatusPollRef.current) window.clearInterval(recallStatusPollRef.current);
    recallStatusPollRef.current = window.setInterval(async () => {
      try {
        const s = await getRecallBotStatus(botId);
        if (s.status === 'in_call_recording') {
          setRecallBotStatus('recording');
        } else if (s.status === 'in_call_not_recording') {
          setRecallBotStatus('in_call_waiting');
        } else if (s.status === 'joining_call') {
          setRecallBotStatus('joining');
        } else if (s.status === 'fatal' || s.status === 'done') {
          setRecallBotStatus(s.status === 'fatal' ? 'error' : 'idle');
          window.clearInterval(recallStatusPollRef.current!);
          recallStatusPollRef.current = null;
          localStorage.removeItem(RECALL_STORAGE_KEY);
        }
      } catch {
        // ignore transient errors
      }
    }, 4000);
  }, [RECALL_STORAGE_KEY]);

  // ── Recall.ai: persist bot state to localStorage ──
  useEffect(() => {
    if (recallBotId) {
      localStorage.setItem(RECALL_STORAGE_KEY, JSON.stringify({ botId: recallBotId, meetingUrl: recallMeetingUrl }));
    } else {
      localStorage.removeItem(RECALL_STORAGE_KEY);
    }
  }, [recallBotId, recallMeetingUrl, RECALL_STORAGE_KEY]);

  // ── Recall.ai: restore bot state on mount (survives page refresh) ──
  useEffect(() => {
    const saved = localStorage.getItem(RECALL_STORAGE_KEY);
    if (!saved) return;
    try {
      const { botId, meetingUrl } = JSON.parse(saved) as { botId: string; meetingUrl: string };
      if (!botId) return;
      setRecallBotId(botId);
      setRecallMeetingUrl(meetingUrl || '');
      setRecallBotStatus('joining');
      setMode('recall-bot');
      startStatusPoll(botId);
      if (readBotSettings().autoStartListening && stateRef.current.liveStatus === 'idle') {
        dispatch({ type: 'START_LISTENING' });
      }
    } catch {
      localStorage.removeItem(RECALL_STORAGE_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  // ── Recall.ai bot: send bot to meeting ──
  const sendRecallBot = async (): Promise<void> => {
    if (!recallMeetingUrl.trim()) {
      setRecallError('Please enter a meeting URL');
      return;
    }

    setRecallError(null);
    setRecallBotStatus('creating');

    try {
      const botSettings = readBotSettings();
      const result = await createRecallBot(recallMeetingUrl.trim(), {
        botName: botSettings.botName,
        languageCode: botSettings.languageCode,
        transcriptionMode: botSettings.transcriptionMode,
      });
      setRecallBotId(result.botId);
      setRecallBotStatus('joining');
      console.log('%c[Recall]', 'color:#63d2be;font-weight:bold', `Bot created: ${result.botId}`);

      if (botSettings.autoStartListening && stateRef.current.liveStatus === 'idle') {
        dispatch({ type: 'START_LISTENING' });
      }

      startStatusPoll(result.botId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create bot';
      setRecallError(msg);
      setRecallBotStatus('error');
    }
  };

  // ── Recall.ai bot: remove bot from meeting ──
  const removeRecallBot = async (): Promise<void> => {
    if (!recallBotId) return;

    try {
      await stopRecallBot(recallBotId);
    } catch {
      // Bot may already have left
    }

    recallUnsubRef.current?.();
    recallUnsubRef.current = null;
    if (recallStatusPollRef.current) {
      window.clearInterval(recallStatusPollRef.current);
      recallStatusPollRef.current = null;
    }
    setRecallBotId(null);
    setRecallBotStatus('idle');
  };

  // ── Recall.ai SSE subscription ──
  useEffect(() => {
    if (mode !== 'recall-bot' || !recallBotId) {
      recallUnsubRef.current?.();
      recallUnsubRef.current = null;
      return;
    }

    const handleEvent = (evt: RecallTranscriptEvent) => {
      const speaker = evt.speaker || 'Unknown';
      const text = evt.text?.trim();
      if (!text) return;

      if (stateRef.current.liveStatus === 'idle') {
        dispatch({ type: 'START_LISTENING' });
      }
      setRecallBotStatus('transcribing');

      if (evt.isPartial) {
        // Show live interim text per speaker
        setRecallPartials((prev) => ({ ...prev, [speaker]: text }));
      } else {
        // Final — clear this speaker's partial and process for AI
        setRecallPartials((prev) => { const n = { ...prev }; delete n[speaker]; return n; });
        console.log('%c[Recall]', 'color:#63d2be;font-weight:bold', `${speaker}: ${text.substring(0, 80)}`);
        dispatch({ type: 'PROCESS_EVENT', payload: makeEvent(speaker, text) });
      }
    };

    const handleError = (error: Error) => {
      console.error('[Recall] SSE error:', error.message);
      setRecallError(error.message);
    };

    recallUnsubRef.current = subscribeToTranscript(recallBotId, handleEvent, handleError);

    return () => {
      recallUnsubRef.current?.();
      recallUnsubRef.current = null;
    };
  }, [dispatch, mode, recallBotId]);

  return {
    start: () => dispatch({ type: 'START_LISTENING' }),
    pause: () => {
      stopMicrophone();
      dispatch({ type: 'PAUSE_LISTENING' });
    },
    reset: () => {
      stopMicrophone();
      recallUnsubRef.current?.();
      recallUnsubRef.current = null;
      cursorRef.current = 0;
      queueRef.current = [];
      setUpcomingTurn(null);
      setMicError(null);
      setRecallBotId(null);
      setRecallBotStatus('idle');
      setRecallError(null);
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
    setMicSpeaker,
    // Recall.ai bot
    recallBotId,
    recallBotStatus,
    recallError,
    recallMeetingUrl,
    recallPartials,
    setRecallMeetingUrl,
    sendRecallBot,
    removeRecallBot
  };
}
