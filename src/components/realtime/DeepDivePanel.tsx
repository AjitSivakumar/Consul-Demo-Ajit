import { useMemo, useRef, useEffect, useState } from 'react';
import { resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard } from '../../types/domain';

interface DeepDivePanelProps {
  selectedNeedId: string | null;
}

interface QueryEntry {
  question: string;
  answer: string | null;
  source: 'document' | 'web' | null;
}

export function DeepDivePanel({ selectedNeedId }: DeepDivePanelProps): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [queryText, setQueryText] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryEntry[]>([]);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const noteKey = selectedNeedId ?? '__general__';
  const currentNote = state.notes[noteKey] ?? '';

  const handleNoteChange = (value: string): void => {
    dispatch({ type: 'SET_NOTE', payload: { key: noteKey, text: value } });
  };

  const selectedNeed = useMemo(
    () => (selectedNeedId ? state.needs.find((n) => n.id === selectedNeedId) ?? null : null),
    [selectedNeedId, state.needs]
  );

  const evidence: EvidenceCard | null = useMemo(() => {
    if (!selectedNeedId) return null;
    return state.evidence.find((e) => e.needId === selectedNeedId) ?? null;
  }, [selectedNeedId, state.evidence]);

  const trigger = useMemo(() => {
    if (!selectedNeed) return null;
    const event = state.transcript.find((t) => t.segmentId === selectedNeed.triggeredBySegmentId);
    return event ? `${event.speaker}: "${event.text}"` : null;
  }, [selectedNeed, state.transcript]);

  const isCaution = selectedNeed?.category === 'correction';
  const isDiagram = selectedNeed?.category === 'comparison';

  const keyNumbers = useMemo(() => {
    if (!evidence) return [];
    const matches = evidence.summary.match(/\d+[\d.,]*[%×x]?/g);
    if (!matches) return [];
    return matches.slice(0, 3).map((val, i) => ({
      value: val,
      label: i === 0 ? 'Primary metric' : i === 1 ? 'Comparison' : 'Reference',
      color: i === 0 ? '#1D9E75' : i === 1 ? 'var(--dl-purple)' : '#D85A30',
    }));
  }, [evidence]);

  const topicNodes = useMemo(() => {
    if (!isDiagram || !selectedNeed) return [];
    const cats = [...new Set(state.needs.filter((n) => n.status !== 'dismissed').map((n) => n.category))];
    return cats.slice(0, 5);
  }, [isDiagram, selectedNeed, state.needs]);

  // Scroll body to bottom when query history updates
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [queryHistory]);

  const handleQuery = async (overrideQ?: string): Promise<void> => {
    const q = (overrideQ ?? queryText).trim();
    if (!q || isQuerying) return;

    setQueryText('');
    setIsQuerying(true);
    setQueryHistory((prev) => [...prev, { question: q, answer: null, source: null }]);

    const transcriptContext = state.transcript
      .slice(-10)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n');

    // Include resolved prior exchanges as conversation context
    const priorExchanges = queryHistory
      .filter((e) => e.answer)
      .slice(-4)
      .map((e) => `Q: ${e.question}\nA: ${e.answer}`)
      .join('\n\n');

    const fullContext = [
      transcriptContext && `Meeting transcript:\n${transcriptContext}`,
      priorExchanges && `Previous conversation:\n${priorExchanges}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    let answer = '';
    let source: 'document' | 'web' = 'web';

    // Try uploaded documents first
    const docs = getAllDocuments();
    if (docs.length > 0) {
      const chunks = extractRelevantChunks(q, 8, 1500);
      if (chunks.length > 0) {
        const docCtx = chunks.map((c) => `[Source: ${c.docName}]\n${c.chunk}`).join('\n\n---\n\n');
        const docResult = await resolveGapFromDocuments(q, docCtx);
        if (docResult.confidence >= 0.5) {
          answer = docResult.answer;
          source = 'document';
        }
      }
    }

    // Fall back to internet/GPT knowledge
    if (!answer) {
      const webResult = await resolveGapFromInternet(q, fullContext);
      answer = webResult.answer;
      source = 'web';
    }

    setQueryHistory((prev) =>
      prev.map((item, i) =>
        i === prev.length - 1 ? { ...item, answer, source } : item
      )
    );
    setIsQuerying(false);
  };

  const queryBar = (
    <div className="qbar">
      <div className="qwrap">
        <span style={{ fontSize: 16, color: 'var(--text-tertiary)', flexShrink: 0 }}>◎</span>
        <input
          className="qinput"
          placeholder="Ask Ambi anything about this meeting…"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && queryText.trim()) void handleQuery(undefined);
          }}
          disabled={isQuerying}
        />
        <button
          type="button"
          onClick={() => void handleQuery()}
          disabled={!queryText.trim() || isQuerying}
          style={{
            flexShrink: 0,
            padding: '5px 14px',
            borderRadius: 8,
            border: '1px solid var(--dl-teal-mid)',
            background: isQuerying ? 'var(--bg-subtle)' : 'var(--dl-teal-bg)',
            color: 'var(--dl-teal)',
            fontSize: 12,
            cursor: isQuerying || !queryText.trim() ? 'not-allowed' : 'pointer',
            opacity: !queryText.trim() ? 0.5 : 1,
          }}
        >
          {isQuerying ? '…' : 'Ask'}
        </button>
      </div>
    </div>
  );

  if (!selectedNeed) {
    return (
      <>
        <div className="ev-body" ref={bodyRef}>
          <div className="ev-header-inline">
            <div className="deep-dive-label">Deep Dive <span /></div>
            <div className="ev-question" style={{ color: 'var(--text-tertiary)' }}>Select an insight to explore</div>
          </div>
          {queryHistory.length === 0 && (
            <div className="deep-dive-empty">
              <div className="deep-dive-empty-icon">◎</div>
              <div className="deep-dive-empty-text">
                Click any insight card in the feed<br />to see a detailed breakdown here,<br />or ask Ambi anything below.
              </div>
            </div>
          )}
          <NotesSection note={currentNote} onChange={handleNoteChange} />
          {queryHistory.map((entry, i) => (
            <QueryThread key={i} entry={entry} />
          ))}
        </div>
        {queryBar}
      </>
    );
  }

  return (
    <>
      {/* Body — header scrolls with content */}
      <div className="ev-body" ref={bodyRef}>
        <div className="ev-header-inline">
          <div className="deep-dive-label">Deep Dive <span /></div>
          <div className="ev-question">{selectedNeed.prompt}</div>
          {evidence && (
            <>
              <div className="ev-answer">{evidence.summary}</div>
              <div className="ev-src-row">
                {evidence.attributions.map((attr) => (
                  <div key={attr.sourceId} className="ev-src-badge">
                    <div className="sdot" style={{
                      background: attr.sourceType === 'web' ? '#185FA5' : '#3B6D11',
                      width: 8, height: 8, borderRadius: '50%',
                    }} />
                    {attr.title}
                  </div>
                ))}
                <div className="ev-conf">
                  Match <b>{(evidence.confidence * 100).toFixed(0)}%</b>
                </div>
              </div>
            </>
          )}
          {!evidence && selectedNeed.status === 'retrieving' && (
            <div className="ev-answer" style={{ color: 'var(--dl-teal)' }}>Resolving this insight…</div>
          )}
          {!evidence && (selectedNeed.status === 'failed' || selectedNeed.status === 'unresolved') && (
            <div className="ev-answer" style={{ color: 'var(--danger)' }}>Could not resolve this insight. Try retrying or uploading relevant docs.</div>
          )}
          {!evidence && selectedNeed.status === 'new' && (
            <div className="ev-answer" style={{ color: 'var(--text-tertiary)' }}>Waiting for AI to process this insight…</div>
          )}
        </div>
        {isCaution && evidence && (
          <div className="caution-banner">
            <div className="caution-banner-head">
              <div className="caution-icon">!</div>
              <div className="caution-title">Caution</div>
            </div>
            <div className="caution-body">
              This insight involves <strong>{selectedNeed.category}</strong> data that should be verified against primary sources before making decisions.
            </div>
          </div>
        )}

        {isDiagram && evidence && topicNodes.length > 0 && (
          <div className="diagram-banner">
            <div className="diagram-banner-head">
              <div className="diagram-icon">→</div>
              <div className="diagram-title">Diagram Suggested</div>
            </div>
            <div className="diagram-body-text">
              Ambi identified a comparison flow in this data that may be clearer as a diagram.
            </div>
            <div className="diagram-nodes">
              {topicNodes.map((node, i) => (
                <span key={node}>
                  {i > 0 && <span className="diagram-arr">→</span>}
                  <span className="diagram-node">{node.replace('_', ' ')}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {trigger && (
          <div>
            <div className="ev-section-label">Triggered by</div>
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
              background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 14px',
              border: '1px solid var(--border)', fontStyle: 'italic',
            }}>
              {trigger}
            </div>
          </div>
        )}

        {keyNumbers.length > 0 && (
          <div>
            <div className="ev-section-label">Key numbers</div>
            <div className="stat-row">
              {keyNumbers.map((stat, i) => (
                <div key={i} className="stat">
                  <div className="stat-val" style={{ color: stat.color }}>{stat.value}</div>
                  <div className="stat-lbl">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {evidence && (
          <div>
            <div className="ev-section-label">Full analysis</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {evidence.summary}
            </div>
          </div>
        )}

        {evidence && (
          <div className="dig-row">
            <button
              type="button"
              className="dig-btn primary"
              onClick={() => {
                const followUp = `What are the key implications and details of: "${selectedNeed.prompt}"?`;
                void handleQuery(followUp);
                if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
              }}
            >
              Dig deeper
            </button>
            <button
              type="button"
              className={`dig-btn ${savedConfirm ? 'saved' : ''}`}
              disabled={savedConfirm}
              onClick={() => {
                dispatch({
                  type: 'SAVE_INSIGHT',
                  payload: {
                    question: selectedNeed.prompt,
                    answer: evidence.summary,
                    source: evidence.attributions.map((a) => a.title).join(', ') || 'AI research',
                  },
                });
                setSavedConfirm(true);
                setTimeout(() => setSavedConfirm(false), 2500);
              }}
            >
              {savedConfirm ? '✓ Saved' : 'Save to deliverables'}
            </button>
          </div>
        )}

        <NotesSection note={currentNote} onChange={handleNoteChange} />
        {queryHistory.map((entry, i) => (
          <QueryThread key={i} entry={entry} />
        ))}
      </div>

      {queryBar}
    </>
  );
}

function NotesSection({ note, onChange }: { note: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <div className="dd-notes">
      <div className="dd-notes-label">Notes</div>
      <textarea
        className="dd-notes-input"
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add notes for this insight…"
        rows={3}
      />
    </div>
  );
}

function QueryThread({ entry }: { entry: QueryEntry }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Question bubble */}
      <div style={{
        alignSelf: 'flex-end',
        background: 'var(--bg-blue)',
        border: '1px solid var(--border-blue)',
        borderRadius: '10px 10px 2px 10px',
        padding: '8px 13px',
        fontSize: 13,
        color: 'var(--accent-blue)',
        maxWidth: '85%',
      }}>
        {entry.question}
      </div>

      {/* Answer bubble */}
      <div style={{
        alignSelf: 'flex-start',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: '10px 10px 10px 2px',
        padding: '8px 13px',
        fontSize: 13,
        color: entry.answer ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        maxWidth: '90%',
        lineHeight: 1.6,
        fontStyle: entry.answer ? 'normal' : 'italic',
      }}>
        {entry.answer ?? 'Thinking…'}
        {entry.answer && entry.source && (
          <div style={{
            marginTop: 6,
            fontSize: 10,
            color: entry.source === 'document' ? 'var(--dl-teal)' : 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '50%',
              background: entry.source === 'document' ? 'var(--dl-teal-mid)' : 'var(--accent-blue-mid)',
            }} />
            {entry.source === 'document' ? 'From uploaded documents' : 'From AI knowledge'}
          </div>
        )}
      </div>
    </div>
  );
}
