import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InsightsFeed } from '../components/realtime/ConversationFlowPanel';
import { DeepDivePanel } from '../components/realtime/DeepDivePanel';
import { BotSettingsModal } from '../components/realtime/BotSettingsModal';
import { useAmbientMeetingAI } from '../hooks/useAmbientMeetingAI';
import { useBotSettings } from '../hooks/useBotSettings';
import { useTranscriptRunner } from '../hooks/useTranscriptRunner';
import { extractTextFromFile, getAllDocuments, uploadDocument, UploadedDocument } from '../services/documentService';
import { meetingPresets } from '../mock-data/presets';
import { useMeetingStore } from '../state/MeetingStore';

export function RealtimeMeetingPage(): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const runner = useTranscriptRunner();
  const ambientAI = useAmbientMeetingAI();
  const { settings: botSettings, save: saveBotSettings } = useBotSettings();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<UploadedDocument[]>(() => getAllDocuments());
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(state.context.title);
  const [selectedNeedId, setSelectedNeedId] = useState<string | null>(null);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showBotSettings, setShowBotSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (state.liveStatus === 'listening' && !timerRef.current) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    }
    if (state.liveStatus === 'paused' || state.liveStatus === 'ended') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.liveStatus]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (state.liveStatus === 'ended') navigate('/deliverables');
  }, [navigate, state.liveStatus]);

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(state.context.title);
  }, [isEditingTitle, state.context.title]);

  const referencedTitles = useMemo(
    () => new Set(state.evidence.flatMap((item) => item.attributions.map((attr) => attr.title.toLowerCase()))),
    [state.evidence]
  );

  // Script Guide: full preset transcript snapshot (captured when preset loads)
  const scriptGuideEventsRef = useRef<Array<{ id: string; segmentId: string; speaker: string; text: string }>>([]);
  const prevPresetRef = useRef(state.presetTranscript);
  if (state.presetTranscript !== null && prevPresetRef.current !== state.presetTranscript) {
    scriptGuideEventsRef.current = state.presetTranscript;
  }
  prevPresetRef.current = state.presetTranscript;

  // Count how many demo-triggered needs have fired so far (each = one script line done)
  const firedDemoCount = useMemo(
    () => state.needs.filter((n) => n.demoEvidence !== undefined).length,
    [state.needs]
  );

  const handleManualTrigger = (evt: { id: string; segmentId: string; speaker: string; text: string }): void => {
    dispatch({
      type: 'PROCESS_EVENT',
      payload: { ...evt, timestampIso: new Date().toISOString() },
    });
  };

  const SOURCE_TYPE_LABEL: Record<string, string> = {
    web: 'Web',
    internal_structured: 'Internal data',
    internal_document: 'Internal doc',
    product_doc: 'Product doc',
    prior_notes: 'Prior notes',
  };

  const webSources = useMemo(() => {
    const seen = new Set<string>();
    const sources: Array<{ title: string; url: string | undefined; needId: string; sourceType: string; recencyLabel: string }> = [];
    for (const ev of state.evidence) {
      for (const attr of ev.attributions) {
        if (!seen.has(attr.title)) {
          seen.add(attr.title);
          sources.push({ title: attr.title, url: attr.url, needId: ev.needId, sourceType: attr.sourceType, recencyLabel: ev.recencyLabel });
        }
      }
    }
    return sources;
  }, [state.evidence]);

  const liveBadgeText =
    state.liveStatus === 'listening' ? 'Live'
    : state.liveStatus === 'paused' ? 'Paused'
    : state.liveStatus === 'ending' ? 'Ending'
    : 'Idle';

  const livePillClass =
    state.liveStatus === 'listening' ? ''
    : state.liveStatus === 'paused' ? 'paused'
    : 'idle';

  const onUploadClick = (): void => fileRef.current?.click();

  const onUploadFile = async (file: File): Promise<void> => {
    const content = await extractTextFromFile(file);
    await uploadDocument(file.name, content, file.name.endsWith('.pdf') ? 'pdf' : 'text');
    setDocs(getAllDocuments());
  };

  const commitTitle = (): void => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(state.context.title);
      setIsEditingTitle(false);
      return;
    }
    dispatch({ type: 'SET_MEETING_TITLE', payload: nextTitle });
    setIsEditingTitle(false);
  };

  return (
    <main className="db-wrap">
      {/* ── Top Navigation ── */}
      <header className="topnav">
        <div className="nav-left">
          <img src="/logo.svg" alt="Ambi" className="nav-logo" />
          <span className="wordmark">ambi</span>
        </div>

        <div className="nav-center">
          {isEditingTitle ? (
            <input
              className="title-edit-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                if (e.key === 'Escape') { setTitleDraft(state.context.title); setIsEditingTitle(false); }
              }}
            />
          ) : (
            <div className="title-edit-wrap" onClick={() => setIsEditingTitle(true)}>
              <div className="meeting-title">{state.context.title || 'New Meeting'}</div>
              <button type="button" className="title-edit-btn">Edit</button>
            </div>
          )}
          <div className="meeting-sub">{state.context.discussedThemes.slice(0, 3).join(' · ') || 'Meeting in progress'}</div>
        </div>

        <div className="nav-right">
          <div className={`live-pill ${livePillClass}`}>
            <div className="live-dot" />
            {liveBadgeText}
          </div>
          <span className="timer">{formatTime(elapsedSeconds)}</span>
          <button type="button" className="pause-btn" onClick={runner.pause}>
            <div className="pause-icon"><div className="pause-bar" /><div className="pause-bar" /></div>
            Pause
          </button>
          <Link to="/deliverables" className="nav-btn deliver">Deliverables</Link>
          <button
            type="button"
            className="nav-btn end"
            disabled={state.isGenerating || state.liveStatus === 'ending' || state.liveStatus === 'ended'}
            onClick={() => void ambientAI.endMeeting()}
          >
            {state.isGenerating ? 'Generating…' : 'End meeting'}
          </button>
        </div>
      </header>

      {/* ── Controls Strip ── */}
      <div className="controls-strip">
        <span className="ctrl-label">Mode</span>
        <select value={runner.mode} onChange={(e) => runner.setMode(e.target.value as typeof runner.mode)}>
          <option value="ai-live">AI Live</option>
          <option value="microphone">Microphone</option>
          <option value="google-meet">Google Meet</option>
          <option value="recall-bot">Ambi Agent</option>
        </select>

        <div className="ctrl-divider" />
        <span className="ctrl-label">Preset</span>
        <select
          value=""
          onChange={(e) => {
            const preset = meetingPresets.find((p) => p.id === e.target.value);
            if (preset) dispatch({ type: 'LOAD_PRESET', payload: { context: preset.context, transcript: preset.transcript } });
          }}
        >
          <option value="" disabled>Load preset…</option>
          {meetingPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <div className="ctrl-divider" />
        <button type="button" className="ctrl-btn" onClick={runner.start}>Start</button>
        {showResetConfirm ? (
          <>
            <span className="ctrl-label" style={{ color: 'var(--danger)' }}>Confirm reset?</span>
            <button type="button" className="ctrl-btn ctrl-btn-danger" onClick={() => {
              runner.reset();
              setElapsedSeconds(0);
              setResetKey((k) => k + 1);
              setSelectedNeedId(null);
              setShowResetConfirm(false);
            }}>Reset</button>
            <button type="button" className="ctrl-btn" onClick={() => setShowResetConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="ctrl-btn" onClick={() => setShowResetConfirm(true)}>Reset</button>
        )}

      </div>

      {/* ── 3‑Column Body ── */}
      <section className="neon-body">
        {/* LEFT — Insights Feed */}
        <div className="col-left">
          <InsightsFeed
            selectedNeedId={selectedNeedId}
            onSelectNeed={setSelectedNeedId}
            resetKey={resetKey}
          />
        </div>

        {/* CENTER — Deep Dive */}
        <div className="col-center">
          <DeepDivePanel selectedNeedId={selectedNeedId} />
        </div>

        {/* RIGHT — Sources + Popup Tray + Transcript */}
        <div className="col-right">
          <div className="col-header">
            <span className="col-title">Sources</span>
            <button type="button" className="upload-btn" onClick={onUploadClick}>
              ↑ Upload doc
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUploadFile(file);
              }}
            />
          </div>

          <div className="source-list-wrap">
          <div className="source-list">
            {docs.length === 0 && webSources.length === 0 && (
              <div className="feed-empty">No documents uploaded yet.</div>
            )}
            {docs.map((doc) => {
              const referenced = referencedTitles.has(doc.name.toLowerCase());
              return (
                <div key={doc.id} className={`src-item ${referenced ? 'referenced' : ''}`}>
                  <div className="src-header">
                    <span className="src-title">{doc.name}</span>
                  </div>
                  <div className="src-meta">
                    {doc.type === 'pdf' ? 'PDF' : 'Text'} · Uploaded {new Date(doc.uploadedAt).toLocaleTimeString()}
                  </div>
                  <div className="src-excerpt">{doc.content.slice(0, 100)}…</div>
                  {referenced && (
                    <div className="src-conf-bar">
                      <div className="src-conf-fill" style={{ width: '88%', background: '#1D9E75' }} />
                    </div>
                  )}
                </div>
              );
            })}
            {webSources.map((src, idx) => (
              <div
                key={`web-${idx}`}
                className={`src-item${src.url ? ' src-item-link' : ''}`}
                onClick={() => src.url && window.open(src.url, '_blank', 'noopener,noreferrer')}
                style={{ cursor: src.url ? 'pointer' : 'default' }}
              >
                <div className="src-header">
                  <span className="src-title">{src.title}</span>
                  {src.url && <span className="src-ext-icon">↗</span>}
                </div>
                <div className="src-meta">
                  {SOURCE_TYPE_LABEL[src.sourceType] ?? 'Source'} · {src.url ? src.url.replace(/^https?:\/\//, '').split('/')[0] : src.recencyLabel}
                </div>
              </div>
            ))}
          </div>
          </div>

          {/* Script Guide — visible only in script-assist mode */}
          {runner.scriptAssistMode && scriptGuideEventsRef.current.length > 0 && (
            <div className="script-guide">
              <div className="script-guide-header">
                <span>Script Guide</span>
                <span className="script-guide-badge">◎ Assist mode</span>
              </div>
              {scriptGuideEventsRef.current.map((evt, idx) => {
                const isDone = idx < firedDemoCount;
                const isCurrent = idx === firedDemoCount;
                const lineClass = isDone ? 'done' : isCurrent ? 'current' : 'upcoming';
                return (
                  <div
                    key={evt.id}
                    className={`script-line ${lineClass}`}
                    onClick={() => !isDone && handleManualTrigger(evt)}
                    title={!isDone ? 'Click to fire this trigger manually' : undefined}
                  >
                    <span className="script-line-status">
                      {isDone ? '✓' : isCurrent ? '→' : '·'}
                    </span>
                    <span className="script-line-speaker">{evt.speaker}</span>
                    <span className="script-line-text">{evt.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ambi Agent Panel */}
          <div className="agent-panel">
            <div className="agent-panel-header">
              <span className="col-title">Ambi Agent</span>
              <button
                type="button"
                className="bot-settings-gear"
                onClick={() => setShowBotSettings(true)}
                title="Agent settings"
              >⚙</button>
            </div>
            <div className="agent-panel-body">
              <input
                className="recall-url-input"
                value={runner.recallMeetingUrl}
                onChange={(e) => runner.setRecallMeetingUrl(e.target.value)}
                placeholder="Paste Zoom link"
                disabled={runner.recallBotId !== null}
              />
              {!runner.recallBotId ? (
                <button
                  type="button"
                  className="recall-send-btn"
                  onClick={() => { runner.setMode('recall-bot'); void runner.sendRecallBot(); }}
                  disabled={!runner.recallMeetingUrl.trim() || runner.recallBotStatus === 'creating'}
                >
                  {runner.recallBotStatus === 'creating' ? 'Sending…' : 'Send Agent'}
                </button>
              ) : (
                <button type="button" className="recall-stop-btn" onClick={() => void runner.removeRecallBot()}>
                  Remove Agent
                </button>
              )}
            </div>
            {runner.recallError && <p className="recall-error">{runner.recallError}</p>}
          </div>

          {/* Live Transcript */}
          <div className="transcript-section">
            <div className="transcript-header">
              <span className="col-title">Live Transcript</span>
              <button type="button" className="toggle-btn" onClick={() => setTranscriptVisible((v) => !v)}>
                {transcriptVisible ? 'Hide' : 'Show'}
              </button>
            </div>

            {runner.micError && <p className="mic-error">{runner.micError}</p>}
            {runner.mode === 'microphone' && runner.micInterimText && (
              <p className="mic-live">Listening: {runner.micInterimText}</p>
            )}

            {transcriptVisible && (
              <div className="transcript-lines">
                {state.transcript.length === 0 && (
                  <div className="feed-empty">Transcript will appear when stream starts.</div>
                )}
                {state.transcript.slice(-20).map((line) => (
                  <div key={line.id} className="tline">
                    <span className="tspk">{line.speaker}</span>
                    <span className="ttxt">{line.text}</span>
                  </div>
                ))}
                {/* Live partial (interim) text per speaker */}
                {Object.entries(runner.recallPartials).map(([speaker, text]) => (
                  <div key={`partial-${speaker}`} className="tline tline-partial">
                    <span className="tspk">{speaker}</span>
                    <span className="ttxt active">
                      <span className="tmarker" />{text}
                    </span>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </section>

      {showBotSettings && (
        <BotSettingsModal
          settings={botSettings}
          onSave={saveBotSettings}
          onClose={() => setShowBotSettings(false)}
        />
      )}
    </main>
  );
}
