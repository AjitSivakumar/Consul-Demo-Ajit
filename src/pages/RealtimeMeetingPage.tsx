import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConversationFlowPanel } from '../components/realtime/ConversationFlowPanel';
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
  const [sidebarTab, setSidebarTab] = useState<'transcript' | 'docs'>('transcript');

  useEffect(() => {
    if (state.liveStatus === 'ended') {
      navigate('/deliverables');
    }
  }, [navigate, state.liveStatus]);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(state.context.title);
    }
  }, [isEditingTitle, state.context.title]);

  const referencedTitles = useMemo(
    () => new Set(state.evidence.flatMap((item) => item.attributions.map((attr) => attr.title.toLowerCase()))),
    [state.evidence]
  );

  const liveBadge =
    state.liveStatus === 'listening'
      ? 'LIVE'
      : state.liveStatus === 'paused'
        ? 'PAUSED'
        : state.liveStatus === 'ending'
          ? 'ENDING'
          : 'IDLE';

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

  const uniqueParticipants = useMemo(() => {
    const fromTranscript = state.transcript.map((t) => t.speaker);
    const all = [...state.context.participants, ...fromTranscript];
    return [...new Set(all)].filter(Boolean);
  }, [state.context.participants, state.transcript]);

  const activeNeeds = state.needs.filter((n) => n.status !== 'dismissed');
  const resolvedCount = activeNeeds.filter((n) => n.status === 'resolved' || n.status === 'kept').length;
  const pendingCount = activeNeeds.filter((n) => n.status === 'new' || n.status === 'retrieving').length;

  return (
    <main className="ambient-shell">
      {/* ── Top Bar ── */}
      <header className="ambient-topbar">
        <div className="ambient-logo">
          <span className="ambient-logo-dot" />
          ambi
        </div>

        <div className="ambient-meeting-info">
          <div className="ambient-title-edit-wrap">
            {isEditingTitle ? (
              <input
                className="ambient-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                autoFocus
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitle();
                  }

                  if (e.key === 'Escape') {
                    setTitleDraft(state.context.title);
                    setIsEditingTitle(false);
                  }
                }}
              />
            ) : (
              <>
                <div className="ambient-meeting-title">{state.context.title || 'New Meeting'}</div>
                <button
                  type="button"
                  className="ambient-title-edit-btn"
                  onClick={() => setIsEditingTitle(true)}
                  aria-label="Edit meeting title"
                >
                  Edit
                </button>
              </>
            )}
          </div>
          <div className="ambient-live-badge">
            <span className="ambient-rec-dot" />
            {liveBadge}
          </div>
        </div>

        <div className="ambient-topbar-right">
          <button type="button" className="ambient-btn ghost" onClick={runner.pause}>
            Pause
          </button>
          <button
            type="button"
            className="ambient-btn"
            disabled={state.isGenerating || state.liveStatus === 'ending' || state.liveStatus === 'ended'}
            onClick={() => void ambientAI.endMeeting()}
          >
            {state.isGenerating ? 'Generating...' : 'End Meeting'}
          </button>
          <Link to="/deliverables" className="ambient-btn ghost">
            Deliverables
          </Link>
        </div>
      </header>

      {/* ── Context Strip ── */}
      <div className="ambient-context-strip">
        <div className="ambient-context-group">
          <span className="ambient-context-label">Participants</span>
          <div className="ambient-participant-pills">
            {uniqueParticipants.length === 0 && <span className="ambient-context-value dim">None yet</span>}
            {uniqueParticipants.map((p) => (
              <span key={p} className="ambient-participant-pill">{p}</span>
            ))}
          </div>
        </div>
        <div className="ambient-context-divider" />
        <div className="ambient-context-group">
          <span className="ambient-context-label">Themes</span>
          <span className="ambient-context-value">{state.context.discussedThemes.length}</span>
        </div>
        <div className="ambient-context-divider" />
        <div className="ambient-context-group">
          <span className="ambient-context-label">Transcript</span>
          <span className="ambient-context-value">{state.transcript.length} lines</span>
        </div>
        <div className="ambient-context-divider" />
        <div className="ambient-context-group">
          <span className="ambient-context-label">Gaps</span>
          <span className="ambient-context-value">
            <span className="ctx-gap-pending">{pendingCount} open</span>
            {resolvedCount > 0 && <span className="ctx-gap-resolved"> · {resolvedCount} resolved</span>}
          </span>
        </div>
        <div className="ambient-context-divider" />
        <div className="ambient-context-group">
          <span className="ambient-context-label">Docs</span>
          <span className="ambient-context-value">{docs.length} loaded</span>
        </div>

        <div className="ambient-context-controls">
          <select
            value=""
            onChange={(e) => {
              const preset = meetingPresets.find((p) => p.id === e.target.value);
              if (preset) {
                dispatch({ type: 'LOAD_PRESET', payload: { context: preset.context, transcript: preset.transcript } });
              }
            }}
          >
            <option value="" disabled>Load preset…</option>
            {meetingPresets.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select value={runner.mode} onChange={(e) => runner.setMode(e.target.value as typeof runner.mode)}>
            <option value="ai-live">AI Live</option>
            <option value="microphone">Microphone</option>
          </select>
          <button type="button" className="ambient-ctx-btn" onClick={runner.start}>Start</button>
          <button type="button" className="ambient-ctx-btn" onClick={runner.reset}>Reset</button>
        </div>
      </div>

      {/* ── Main Grid: Gaps (hero) | Sidebar (transcript + docs) ── */}
      <section className="ambient-main-grid">
        <ConversationFlowPanel />

        <aside className="ambient-sidebar">
          <div className="ambient-sidebar-tabs">
            <button
              type="button"
              className={`ambient-sidebar-tab ${sidebarTab === 'transcript' ? 'active' : ''}`}
              onClick={() => setSidebarTab('transcript')}
            >
              Transcript ({state.transcript.length})
            </button>
            <button
              type="button"
              className={`ambient-sidebar-tab ${sidebarTab === 'docs' ? 'active' : ''}`}
              onClick={() => setSidebarTab('docs')}
            >
              Docs ({docs.length})
            </button>
          </div>

          {sidebarTab === 'transcript' && (
            <div className="ambient-sidebar-content">
              {runner.micError ? <p className="ambient-mic-error">{runner.micError}</p> : null}
              {runner.mode === 'microphone' && runner.micInterimText ? (
                <p className="ambient-mic-live">Listening: {runner.micInterimText}</p>
              ) : null}

              <div className="ambient-transcript-feed">
                {state.transcript.length === 0 ? (
                  <p className="ambient-empty">Transcript will appear when stream starts.</p>
                ) : null}
                {state.transcript.map((line) => (
                  <div key={line.id} className="ambient-transcript-line compact">
                    <div className="ambient-speaker">{line.speaker}</div>
                    <div className="ambient-text">{line.text}</div>
                  </div>
                ))}
              </div>

              <div className="ambient-transcript-footer compact">
                <input
                  value={injectSpeaker}
                  onChange={(e) => setInjectSpeaker(e.target.value)}
                  placeholder="Speaker"
                  className="ambient-speaker-input"
                />
                <input
                  value={injectText}
                  onChange={(e) => setInjectText(e.target.value)}
                  placeholder="Inject a live line..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && injectText.trim()) {
                      handleAskInject();
                    }
                  }}
                />
                <button type="button" onClick={handleAskInject} disabled={!injectText.trim()}>
                  Add
                </button>
              </div>
            </div>
          )}

          {sidebarTab === 'docs' && (
            <div className="ambient-sidebar-content">
              <div className="ambient-docs-header-row">
                <button type="button" className="ambient-ctx-btn" onClick={onUploadClick}>
                  + Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void onUploadFile(file);
                    }
                  }}
                />
              </div>
              <div className="ambient-doc-list">
                {docs.length === 0 ? <p className="ambient-empty">No documents uploaded yet.</p> : null}
                {docs.map((doc) => {
                  const referenced = referencedTitles.has(doc.name.toLowerCase());
                  return (
                    <article className={`ambient-doc-item ${referenced ? 'referenced' : ''}`} key={doc.id}>
                      <div className="ambient-doc-icon">{doc.type === 'pdf' ? 'PDF' : 'TXT'}</div>
                      <div className="ambient-doc-meta">
                        <div className="ambient-doc-name">{doc.name}</div>
                        <div className="ambient-doc-sub">
                          {referenced ? 'Referenced in evidence' : `Uploaded ${new Date(doc.uploadedAt).toLocaleTimeString()}`}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
