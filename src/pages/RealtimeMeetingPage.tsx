import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InsightsFeed } from '../components/realtime/ConversationFlowPanel';
import { DeepDivePanel } from '../components/realtime/DeepDivePanel';
import { useAmbientMeetingAI } from '../hooks/useAmbientMeetingAI';
import { useTranscriptRunner } from '../hooks/useTranscriptRunner';
import { extractTextFromFile, getAllDocuments, uploadDocument, UploadedDocument } from '../services/documentService';
import { meetingPresets } from '../mock-data/presets';
import { useMeetingStore } from '../state/MeetingStore';

export function RealtimeMeetingPage(): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const runner = useTranscriptRunner();
  const ambientAI = useAmbientMeetingAI();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<UploadedDocument[]>(() => getAllDocuments());
  const [injectText, setInjectText] = useState('');
  const [injectSpeaker, setInjectSpeaker] = useState('Account Exec');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(state.context.title);
  const [selectedNeedId, setSelectedNeedId] = useState<string | null>(null);
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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

  const webSources = useMemo(() => {
    const seen = new Set<string>();
    const sources: Array<{ title: string; url: string | undefined; needId: string }> = [];
    for (const ev of state.evidence) {
      for (const attr of ev.attributions) {
        if (attr.sourceType === 'web' && !seen.has(attr.title)) {
          seen.add(attr.title);
          sources.push({ title: attr.title, url: attr.url, needId: ev.needId });
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

  const handleAskInject = (): void => {
    runner.injectLine(injectSpeaker, injectText);
    setInjectText('');
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

  const activeNeeds = state.needs.filter((n) => n.status !== 'dismissed');
  const pendingCount = activeNeeds.filter((n) => n.status === 'new' || n.status === 'retrieving').length;
  const resolvedCount = activeNeeds.filter((n) => n.status === 'resolved' || n.status === 'kept').length;

  return (
    <main className="db-wrap">
      {/* ── Top Navigation ── */}
      <header className="topnav">
        <div className="nav-left">
          <div className="consul-mark">
            <div className="mark-ring"><div className="mark-dot" /></div>
            <span className="wordmark">AMBI</span>
          </div>
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
          <option value="recall-bot">Recall.ai Bot</option>
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
        <button type="button" className="ctrl-btn" onClick={runner.reset}>Reset</button>

        <div className="ctrl-divider" />
        <span className="ctrl-label">Gaps</span>
        <span className="ctrl-stat pending">{pendingCount} open</span>
        <span className="ctrl-stat resolved">{resolvedCount} resolved</span>

        <div className="ctrl-divider" />
        <span className="ctrl-label">Docs</span>
        <span className="ctrl-stat">{docs.length}</span>
      </div>

      {/* ── 3‑Column Body ── */}
      <section className="neon-body">
        {/* LEFT — Insights Feed */}
        <div className="col-left">
          <InsightsFeed
            selectedNeedId={selectedNeedId}
            onSelectNeed={setSelectedNeedId}
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
              accept=".txt,.md,.pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUploadFile(file);
              }}
            />
          </div>

          <div className="source-list">
            {docs.length === 0 && webSources.length === 0 && (
              <div className="feed-empty">No documents uploaded yet.</div>
            )}
            {docs.map((doc) => {
              const referenced = referencedTitles.has(doc.name.toLowerCase());
              return (
                <div key={doc.id} className={`src-item ${referenced ? 'referenced' : ''}`}>
                  <div className="src-header">
                    <div className="src-type-dot" style={{ background: doc.type === 'pdf' ? '#185FA5' : '#3B6D11' }} />
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
                  <div className="src-type-dot" style={{ background: '#185FA5' }} />
                  <span className="src-title">{src.title}</span>
                  {src.url && <span className="src-ext-icon">↗</span>}
                </div>
                <div className="src-meta">
                  Web · {src.url ? src.url.replace(/^https?:\/\//, '').split('/')[0] : 'AI research'}
                </div>
              </div>
            ))}
          </div>

          {/* Recall.ai Panel — always visible */}
          <div className="recall-panel">
            <div className="col-header" style={{ marginBottom: '8px' }}>
              <span className="col-title">Bot</span>
            </div>
            <div className="recall-url-row">
              <input
                className="recall-url-input"
                value={runner.recallMeetingUrl}
                onChange={(e) => runner.setRecallMeetingUrl(e.target.value)}
                placeholder="Paste meeting URL (Meet, Zoom, Teams…)"
                disabled={runner.recallBotId !== null}
              />
              {!runner.recallBotId ? (
                <button
                  type="button"
                  className="recall-send-btn"
                  onClick={() => { runner.setMode('recall-bot'); void runner.sendRecallBot(); }}
                  disabled={!runner.recallMeetingUrl.trim() || runner.recallBotStatus === 'creating'}
                >
                  {runner.recallBotStatus === 'creating' ? 'Sending…' : 'Send Bot'}
                </button>
              ) : (
                <button type="button" className="recall-stop-btn" onClick={() => void runner.removeRecallBot()}>
                  Remove Bot
                </button>
              )}
            </div>
            <div className="recall-status">
              <span className={`recall-status-dot ${
                (runner.recallBotStatus === 'transcribing' || runner.recallBotStatus === 'recording')
                  ? 'active'
                  : runner.recallBotStatus === 'error'
                  ? 'error'
                  : ''
              }`} />
              <span>
                {runner.recallBotStatus === 'idle' && 'Paste a meeting URL to send bot'}
                {runner.recallBotStatus === 'creating' && 'Creating bot…'}
                {runner.recallBotStatus === 'joining' && 'Bot joining meeting…'}
                {runner.recallBotStatus === 'in_call_waiting' && 'In call — waiting for host recording permission'}
                {runner.recallBotStatus === 'recording' && 'Bot recording — transcript incoming…'}
                {runner.recallBotStatus === 'transcribing' && 'Transcribing live'}
                {runner.recallBotStatus === 'error' && (runner.recallError ?? 'Bot error')}
              </span>
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

            <div className="inject-bar">
              <input
                value={injectSpeaker}
                onChange={(e) => setInjectSpeaker(e.target.value)}
                placeholder="Speaker"
              />
              <input
                value={injectText}
                onChange={(e) => setInjectText(e.target.value)}
                placeholder="Inject a live line..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && injectText.trim()) handleAskInject();
                }}
              />
              <button type="button" onClick={handleAskInject} disabled={!injectText.trim()}>
                Add
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
