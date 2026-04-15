import { useMemo, useRef, useEffect, useState } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { enrichResolutionOutput, resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { fetchDocumentContent, loadGroupKnowledge, searchByEntities, searchByTags, semanticSearch, type KnowledgeDoc } from '../../services/knowledgeService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard } from '../../types/domain';

interface DeepDivePanelProps {
  selectedNeedId: string | null;
}

interface QueryEntry {
  question: string;
  answer: string | null;
  source: 'document' | 'web' | null;
  rich?: Partial<Pick<EvidenceCard, 'richChart' | 'richMetricGrid' | 'richCorrectionBlock' | 'richFlowDiagram'>>;
}

export function DeepDivePanel({ selectedNeedId }: DeepDivePanelProps): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [queryText, setQueryText] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryEntry[]>([]);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const groupKnowledgeRef = useRef<KnowledgeDoc[]>([]);

  useEffect(() => {
    if (!state.groupId) { groupKnowledgeRef.current = []; return; }
    loadGroupKnowledge(state.groupId).then((docs) => { groupKnowledgeRef.current = docs; }).catch(() => {});
  }, [state.groupId]);

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
  const isDirectQuery = selectedNeed?.category === 'direct_query';

  const keyNumbers = useMemo(() => {
    if (!evidence) return [];
    // Only show key numbers for internal documents — web search returns prose where
    // dates and years are extracted as false positives (e.g. "15", "2026", "8.3").
    const isWebSource = evidence.attributions.every((a) => a.sourceType === 'web');
    if (isWebSource) return [];

    // Match numbers with explicit units/context: %, x, ×, $, or followed by scale words
    const metricPattern = /\$?(\d[\d.,]*)\s*(?:%|×|x\b|\bB\b|\bM\b|bn|mn|billion|million|thousand|k\b)/gi;
    const seen = new Set<string>();
    const results: { value: string; label: string; color: string }[] = [];
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = metricPattern.exec(evidence.summary)) !== null && results.length < 3) {
      const raw = match[0].trim();
      if (!seen.has(raw)) {
        seen.add(raw);
        const i = results.length;
        results.push({
          value: raw,
          label: i === 0 ? 'Primary metric' : i === 1 ? 'Comparison' : 'Reference',
          color: i === 0 ? '#1D9E75' : i === 1 ? 'var(--dl-purple)' : '#D85A30',
        });
      }
    }
    return results;
  }, [evidence]);


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
    let rich: QueryEntry['rich'] = {};

    // 1) Try uploaded documents first
    const docs = getAllDocuments();
    if (docs.length > 0) {
      const chunks = extractRelevantChunks(q, 8, 1500);
      if (chunks.length > 0) {
        const docCtx = chunks.map((c) => `[Source: ${c.docName}]\n${c.chunk}`).join('\n\n---\n\n');
        const docResult = await resolveGapFromDocuments(q, docCtx);
        if (docResult.confidence >= 0.65) {
          answer = docResult.answer;
          source = 'document';
          rich = docResult.rich ?? {};
        }
      }
    }

    // 2) Try Google Drive / Supabase knowledge base
    if (!answer) {
      const knowledgeDocs = groupKnowledgeRef.current;
      if (knowledgeDocs.length > 0) {
        const localMatches = [
          ...searchByEntities(q, knowledgeDocs),
          ...searchByTags(q, knowledgeDocs),
        ].sort((a, b) => b.score - a.score).slice(0, 3);

        const semanticMatches = state.groupId
          ? await semanticSearch(q, state.groupId).catch(() => [])
          : [];

        const topMatches = [...localMatches, ...semanticMatches]
          .filter((m, i, arr) => arr.findIndex((x) => x.doc.id === m.doc.id) === i)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (topMatches.length > 0) {
          const contents = await Promise.all(topMatches.map((m) => fetchDocumentContent(m.doc.id)));
          const kbCtx = topMatches
            .map((m, i) => `[Source: ${m.doc.name}]\n${contents[i]?.slice(0, 2500) ?? m.doc.summary}`)
            .join('\n\n---\n\n');
          const kbResult = await resolveGapFromDocuments(q, kbCtx);
          if (kbResult.confidence >= 0.65) {
            answer = kbResult.answer;
            source = 'document';
            rich = kbResult.rich ?? {};
          }
        }
      }
    }

    // 3) Fall back to GPT general knowledge
    if (!answer) {
      const webResult = await resolveGapFromInternet(q, fullContext, state.context.meetingType ?? 'sales');
      answer = webResult.answer;
      source = 'web';
      rich = webResult.rich ?? {};
    }

    // Enrich if not yet enriched (fallback path for doc results that skipped it)
    if (answer && (!rich || Object.keys(rich).length === 0)) {
      rich = await enrichResolutionOutput(q, answer);
    }

    setQueryHistory((prev) =>
      prev.map((item, i) =>
        i === prev.length - 1 ? { ...item, answer, source, rich } : item
      )
    );
    setIsQuerying(false);
  };

  const queryBar = (
    <div className="qbar">
      <div className="qwrap">
        <img src="/logo-grey.svg" alt="" style={{ width: 18, height: 'auto', opacity: 0.45, flexShrink: 0 }} />
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
              <img src="/logo-grey.svg" alt="" className="deep-dive-empty-icon" />
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
          <div className="deep-dive-label">
            Deep Dive <span />
            {isDirectQuery && <span className="ev-direct-badge">You asked Ambi</span>}
          </div>
          <div className="ev-question">{selectedNeed.prompt}</div>
          {evidence && (
            <>
              {!isCaution && !isDiagram && (
                <div className="ev-answer"><AnswerText text={evidence.summary} /></div>
              )}
              {(isCaution || isDiagram) ? (
                <div className="ev-src-row">
                  <div className="ev-conf">Match <b>{(evidence.confidence * 100).toFixed(0)}%</b></div>
                </div>
              ) : (
                <div className="ev-src-row">
                  {evidence.attributions.map((attr) => (
                    <div key={attr.sourceId} className="ev-src-badge">
                      <div className={`src-type-dot src-type-dot--${attr.sourceType}`} />
                      {attr.title}
                    </div>
                  ))}
                  <div className="ev-conf">Match <b>{(evidence.confidence * 100).toFixed(0)}%</b></div>
                </div>
              )}
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
            <div className="caution-body">{evidence.summary}</div>
          </div>
        )}

        {isDiagram && evidence && (
          <div className="diagram-banner">
            <div className="diagram-banner-head">
              <div className="diagram-icon">→</div>
              <div className="diagram-title">Diagram</div>
            </div>
            <div className="diagram-body">{evidence.summary}</div>
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

        {keyNumbers.length > 0 && !evidence?.richTable && !evidence?.richChart && (
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

        {evidence?.richTable && <RichTable table={evidence.richTable} />}
        {evidence?.richChart && <RichChart chart={evidence.richChart} />}
        {evidence?.richMetricGrid && <MetricGrid grid={evidence.richMetricGrid} />}
        {evidence?.richCorrectionBlock && <CorrectionBlock block={evidence.richCorrectionBlock} />}
        {evidence?.richFlowDiagram && <FlowDiagram flow={evidence.richFlowDiagram} />}

        {isCaution && evidence && evidence.attributions.length > 0 && (
          <div className="caution-sources">
            <div className="cs-label">Sources</div>
            {evidence.attributions.map((attr, i) => (
              <div key={attr.sourceId} className="cs-item">
                <span className="cs-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="cs-text">
                  <strong>{attr.title}</strong>
                  {attr.snippet}
                  {attr.url && (
                    <a className="cs-link" href={attr.url} target="_blank" rel="noopener noreferrer">
                      {attr.url.replace(/^https?:\/\//, '').split('/')[0]}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isDiagram && evidence && evidence.attributions.length > 0 && (
          <div className="src-notes">
            <div className="src-note-label">Sources backing each pathway node</div>
            {evidence.attributions.map((attr) => {
              const id = attr.sourceId;
              const tagCls = id.includes('exec') || id.includes('deep') ? 'sn-teal'
                : id.includes('ohs') || id.includes('dph') ? 'sn-red'
                : 'sn-navy';
              const tagLabel = tagCls === 'sn-teal' ? 'DEEP · policy track'
                : tagCls === 'sn-red' ? 'DPH · data auth track'
                : 'OPM · funding track';
              return (
                <div key={attr.sourceId} className="src-note-item">
                  <span className={`src-node-tag ${tagCls}`}>{tagLabel}</span>
                  {attr.snippet && <span> {attr.snippet}</span>}
                  {attr.url && (
                    <> <a className="src-link" href={attr.url} target="_blank" rel="noopener noreferrer">
                      {attr.url.replace(/^https?:\/\//, '').split('/')[0]}
                    </a></>
                  )}
                </div>
              );
            })}
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

/** Renders a single line of text, converting **bold** markers. */
function InlineText({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong>
          : part
      )}
    </>
  );
}

/** Renders answer text: handles markdown tables, newlines, and **bold**. */
function AnswerText({ text }: { text: string }): React.JSX.Element {
  const rawLines = text.split('\n');

  // Group consecutive markdown table lines into table blocks
  type Block = { type: 'text'; lines: string[] } | { type: 'table'; rows: string[][] };
  const blocks: Block[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    // A table line contains at least one pipe that isn't just whitespace
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
        tableLines.push(rawLines[i]);
        i++;
      }
      // Parse: split by | and strip cells; skip separator rows (---|---)
      const rows: string[][] = tableLines
        .filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l))
        .map((l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()));
      if (rows.length > 0) blocks.push({ type: 'table', rows });
    } else {
      const textLine = line.trim();
      if (textLine) {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'text') last.lines.push(textLine);
        else blocks.push({ type: 'text', lines: [textLine] });
      }
      i++;
    }
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === 'table') {
          const [header, ...bodyRows] = block.rows;
          return (
            <div key={bi} style={{ overflowX: 'auto', margin: '8px 0' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: 12,
                color: 'var(--text-secondary)',
              }}>
                {header && (
                  <thead>
                    <tr>
                      {header.map((cell, ci) => (
                        <th key={ci} style={{
                          padding: '5px 10px', textAlign: 'left', fontWeight: 600,
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--text-primary)', whiteSpace: 'nowrap',
                        }}>{cell}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {bodyRows.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', verticalAlign: 'top' }}>
                          <InlineText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return block.lines.map((line, li) => (
          <p key={`${bi}-${li}`} style={{ margin: bi === 0 && li === 0 ? 0 : '6px 0 0 0' }}>
            <InlineText text={line} />
          </p>
        ));
      })}
    </>
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
        {entry.answer ? <AnswerText text={entry.answer} /> : 'Thinking…'}
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

      {/* Rich visuals — rendered below the bubble, not inside it */}
      {entry.answer && entry.rich?.richMetricGrid && <MetricGrid grid={entry.rich.richMetricGrid} />}
      {entry.answer && entry.rich?.richChart && <RichChart chart={entry.rich.richChart} />}
      {entry.answer && entry.rich?.richCorrectionBlock && <CorrectionBlock block={entry.rich.richCorrectionBlock} />}
      {entry.answer && entry.rich?.richFlowDiagram && <FlowDiagram flow={entry.rich.richFlowDiagram} />}
    </div>
  );
}

function MetricGrid({ grid }: { grid: NonNullable<EvidenceCard['richMetricGrid']> }): React.JSX.Element {
  return (
    <div className="metric-grid-wrap">
      <div className="metric-grid">
        {grid.metrics.map((m, i) => (
          <div key={i} className="metric-grid-item">
            <div className="metric-grid-label">{m.label}</div>
            <div className="metric-grid-value">{m.value}</div>
            <div className="metric-grid-sub">{m.sub}</div>
          </div>
        ))}
      </div>
      {grid.insightText && (
        <div className="metric-grid-insight">{grid.insightText}</div>
      )}
    </div>
  );
}

function CorrectionBlock({ block }: { block: NonNullable<EvidenceCard['richCorrectionBlock']> }): React.JSX.Element {
  return (
    <div className="correction-wrap">
      <div className="correction-cols">
        <div className="correction-col correction-wrong">
          <div className="correction-col-label">{block.wrong.label}</div>
          <div className="correction-col-text">{block.wrong.text}</div>
        </div>
        <div className="correction-col correction-right">
          <div className="correction-col-label">{block.right.label}</div>
          <div className="correction-col-text">{block.right.text}</div>
        </div>
      </div>
      {block.riskItems && block.riskItems.length > 0 && (
        <div className="risk-list">
          {block.riskItems.map((item) => (
            <div key={item.num} className="risk-item">
              <span className="risk-num">{item.num}</span>
              <div className="risk-text">
                <strong>{item.title}</strong>
                {item.body}
              </div>
            </div>
          ))}
        </div>
      )}
      {block.reframe && (
        <div className="reframe-box">
          <div className="reframe-label">✓ Recommended reframe</div>
          <div className="reframe-text">{block.reframe}</div>
        </div>
      )}
    </div>
  );
}

function FlowDiagram({ flow }: { flow: NonNullable<EvidenceCard['richFlowDiagram']> }): React.JSX.Element {
  if (flow.nodes && flow.nodes.length > 0) {
    return <FlowDiagramData nodes={flow.nodes} note={flow.note} badges={flow.badges} />;
  }

  // Legacy hardcoded Iridium device decision tree
  return (
    <div className="fd-wrap">
      <div className="fd-badge-row">
        <span className="fd-badge fd-badge-blue">● Extreme</span>
        <span className="fd-badge fd-badge-green">● GO! passive</span>
        <span className="fd-badge fd-badge-red">● Emergency</span>
      </div>
      <div className="fd-chart-title">Preet's communication decision tree — on the ice</div>
      <div className="fd-chart">
        <div className="fd-row fd-centered">
          <div className="fd-node fd-node-gray">
            <div className="fd-node-title">Preet needs to communicate</div>
            <div className="fd-node-sub">trigger event</div>
          </div>
        </div>
        <div className="fd-v-connector"><div className="fd-v-line" /><div className="fd-v-arrow">▼</div></div>
        <div className="fd-row fd-centered">
          <div className="fd-node fd-node-diamond">
            <div className="fd-node-title">Is this an emergency?</div>
            <div className="fd-node-sub">lost, injured, critical failure</div>
          </div>
        </div>
        <svg width="100%" height="34" viewBox="0 0 100 34" preserveAspectRatio="none" className="fd-branch-svg">
          <line x1="50" y1="0" x2="20" y2="34" stroke="#eab308" strokeWidth="1.5" />
          <line x1="50" y1="0" x2="80" y2="34" stroke="#eab308" strokeWidth="1.5" />
        </svg>
        <div className="fd-label-row">
          <span className="fd-branch-label">Yes →</span>
          <span className="fd-branch-label">← No</span>
        </div>
        <div className="fd-branch-row">
          <div className="fd-node fd-node-red fd-node-wide">
            <div className="fd-node-title">SOS — Iridium Extreme</div>
            <div className="fd-node-sub">one-touch · no decision needed</div>
          </div>
          <div className="fd-node fd-node-diamond fd-node-wide">
            <div className="fd-node-title">Voice or data?</div>
            <div className="fd-node-sub">what type of comms</div>
          </div>
        </div>
        <div className="fd-lower-split">
          <div className="fd-split-col">
            <div className="fd-v-connector"><div className="fd-v-line" /><div className="fd-v-arrow">▼</div></div>
            <div className="fd-node fd-node-red" style={{ width: '100%' }}>
              <div className="fd-node-title">Alert dispatched</div>
              <div className="fd-node-sub">coordinates + SBD signal</div>
            </div>
          </div>
          <div className="fd-split-col">
            <svg width="100%" height="34" viewBox="0 0 100 34" preserveAspectRatio="none" className="fd-branch-svg">
              <line x1="50" y1="0" x2="20" y2="34" stroke="#eab308" strokeWidth="1.5" />
              <line x1="50" y1="0" x2="80" y2="34" stroke="#eab308" strokeWidth="1.5" />
            </svg>
            <div className="fd-label-row">
              <span className="fd-branch-label">Voice →</span>
              <span className="fd-branch-label">← Data</span>
            </div>
            <div className="fd-branch-row">
              <div className="fd-node fd-node-blue fd-node-wide">
                <div className="fd-node-title">Iridium Extreme</div>
                <div className="fd-node-sub">call · voice blog</div>
              </div>
              <div className="fd-node fd-node-green fd-node-wide">
                <div className="fd-node-title">GO! passive</div>
                <div className="fd-node-sub">photo · SBD · no touch</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {flow.note && <div className="fd-note">{flow.note}</div>}
    </div>
  );
}

type FlowNode = NonNullable<NonNullable<EvidenceCard['richFlowDiagram']>['nodes']>[number];

const NODE_COLOR_CLASS: Record<NonNullable<FlowNode['color']>, string> = {
  gray:  'fd-node-gray',
  teal:  'fd-node-teal',
  gold:  'fd-node-diamond',
  navy:  'fd-node-navy',
  red:   'fd-node-red',
  green: 'fd-node-green',
  blue:  'fd-node-blue',
};

function FlowDiagramData({ nodes, note, badges }: {
  nodes: FlowNode[];
  note?: string;
  badges?: NonNullable<EvidenceCard['richFlowDiagram']>['badges'];
}): React.JSX.Element {
  // Build ordered list of unique trackIds per branch parent
  const branchChildren = nodes.filter((n) => n.parentId);
  const mainNodes = nodes.filter((n) => !n.parentId);

  // Group branch children: parentId → trackId → ordered nodes
  const branchTracks = new Map<string, Map<string, FlowNode[]>>();
  for (const n of branchChildren) {
    if (!n.parentId) continue;
    if (!branchTracks.has(n.parentId)) branchTracks.set(n.parentId, new Map());
    const trackId = n.trackId ?? n.id;
    const tracks = branchTracks.get(n.parentId)!;
    if (!tracks.has(trackId)) tracks.set(trackId, []);
    tracks.get(trackId)!.push(n);
  }

  const BADGE_COLOR: Record<string, string> = {
    teal:  '#1a4a5a', navy: '#1a3a6a', red: '#b8291c',
    green: '#1a7a45', blue: '#185FA5', gold: '#7a5400', gray: '#6b6a66',
  };
  const BADGE_BG: Record<string, string> = {
    teal:  '#e8f4f8', navy: '#edf2fd', red: '#fdf2f0',
    green: '#edf7f1', blue: '#EEF5FD', gold: '#fdf7e8', gray: '#f5f4f0',
  };
  const BADGE_BORDER: Record<string, string> = {
    teal:  '#90c4d4', navy: '#90a8d4', red: '#eeb8b0',
    green: '#b8e0c8', blue: '#b5d4f4', gold: '#e0c878', gray: '#ccc9c0',
  };

  return (
    <div className="fd-wrap">
      {badges && badges.length > 0 && (
        <div className="fd-badge-row">
          {badges.map((b) => (
            <span key={b.label} style={{
              fontSize: 9, fontFamily: "'DM Mono', monospace", padding: '2px 8px',
              borderRadius: 4, background: BADGE_BG[b.color] ?? '#f5f4f0',
              color: BADGE_COLOR[b.color] ?? '#6b6a66',
              border: `1px solid ${BADGE_BORDER[b.color] ?? '#ccc9c0'}`,
            }}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="fd-chart">
        {mainNodes.map((node, i) => {
          const colorClass = NODE_COLOR_CLASS[node.color ?? 'gray'];
          const tracks = branchTracks.get(node.id);
          const hasChildren = tracks && tracks.size > 0;
          const nextMain = mainNodes[i + 1];

          return (
            <div key={node.id} style={{ display: 'contents' }}>
              {i > 0 && (
                <div className="fd-v-connector">
                  <div className="fd-v-line" />
                  <div className="fd-v-arrow">▼</div>
                </div>
              )}
              <div className="fd-row fd-centered">
                <div className={`fd-node ${colorClass}`} style={{ minWidth: 220 }}>
                  <div className="fd-node-title">{node.label}</div>
                  {node.sub && <div className="fd-node-sub">{node.sub}</div>}
                </div>
              </div>

              {hasChildren && (
                <>
                  <svg width="100%" height="26" viewBox="0 0 100 26" preserveAspectRatio="none" className="fd-branch-svg">
                    <line x1="50" y1="0" x2="22" y2="26" stroke="#e0c878" strokeWidth="1.5" />
                    <line x1="50" y1="0" x2="78" y2="26" stroke="#e0c878" strokeWidth="1.5" />
                  </svg>
                  <div className="fd-branch-row" style={{ alignItems: 'flex-start' }}>
                    {Array.from(tracks!.entries()).map(([, trackNodes]) => {
                      const firstNode = trackNodes[0];
                      return (
                        <div key={firstNode.trackId ?? firstNode.id} className="fd-split-col">
                          {firstNode.trackLabel && (
                            <div className="fd-branch-label">{firstNode.trackLabel}</div>
                          )}
                          {trackNodes.map((tn, ti) => (
                            <div key={tn.id} style={{ display: 'contents' }}>
                              {ti > 0 && (
                                <div className="fd-v-connector">
                                  <div className="fd-v-line" />
                                  <div className="fd-v-arrow">▼</div>
                                </div>
                              )}
                              <div className={`fd-node ${NODE_COLOR_CLASS[tn.color ?? 'gray']}`} style={{ width: '100%' }}>
                                <div className="fd-node-title">{tn.label}</div>
                                {tn.sub && <div className="fd-node-sub">{tn.sub}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {nextMain && (
                    <svg width="100%" height="26" viewBox="0 0 100 26" preserveAspectRatio="none" className="fd-branch-svg">
                      <line x1="22" y1="0" x2="50" y2="26" stroke="#e0c878" strokeWidth="1.5" />
                      <line x1="78" y1="0" x2="50" y2="26" stroke="#e0c878" strokeWidth="1.5" />
                    </svg>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {note && <div className="fd-note">{note}</div>}
    </div>
  );
}

function RichTable({ table }: { table: NonNullable<EvidenceCard['richTable']> }): React.JSX.Element {
  return (
    <div className="rich-table-wrap">
      <div className="rich-table-grid">
        {table.devices.map((device) => (
          <div key={device.name} className={`rich-device-card ${device.isPrimary ? 'primary' : ''}`}>
            <div className="rich-device-badge">{device.badge}</div>
            <div className="rich-device-name">{device.name}</div>
            <div className="rich-device-sub">{device.subtitle}</div>
            {device.features.map((f) => (
              <div key={f.name} className="rich-feature-row">
                <span className="rich-feature-name">{f.name}</span>
                <span className={`rich-feature-val ${f.kind}`}>{f.val}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Ambi line-chart palette — matches :root CSS vars exactly
// --neon-purple, --neon-blue, --neon-green, --diagram-yellow
const LINE_PALETTE = ['#c084fc', '#60a5fa', '#4ade80', '#eab308'];

function RichChart({ chart }: { chart: NonNullable<EvidenceCard['richChart']> }): React.JSX.Element {
  const data = chart.labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    for (const ds of chart.datasets) {
      row[ds.label] = ds.data[i];
    }
    return row;
  });

  const isLine = chart.chartType === 'line';

  const legend = (
    <div className="rich-chart-legend">
      {chart.datasets.map((ds, i) => {
        const lineColor = LINE_PALETTE[i % LINE_PALETTE.length];
        return (
          <div key={ds.label} className="rich-chart-leg-item">
            {isLine ? (
              <svg width="22" height="10" style={{ flexShrink: 0 }}>
                <line
                  x1="0" y1="5" x2="22" y2="5"
                  stroke={lineColor}
                  strokeWidth="2.5"
                  strokeDasharray={ds.dashed ? '5 3' : undefined}
                />
                {!ds.dashed && <circle cx="11" cy="5" r="3" fill={lineColor} />}
              </svg>
            ) : (
              <div className="rich-chart-leg-swatch" style={{ background: ds.color }} />
            )}
            <span>{ds.label}</span>
          </div>
        );
      })}
    </div>
  );

  if (isLine) {
    // Compute Y domain from data with a little padding
    const allValues = chart.datasets.flatMap((ds) => ds.data);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const pad = (maxVal - minVal) * 0.15;
    const yMin = Math.floor((minVal - pad) * 20) / 20;
    const yMax = Math.ceil((maxVal + pad) * 20) / 20;

    return (
      <div className="rich-chart-wrap">
        <div className="rich-chart-header">
          {chart.yAxisLabel && (
            <div className="rich-chart-y-label">{chart.yAxisLabel}</div>
          )}
          {legend}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              formatter={(v) => [typeof v === 'number' ? v.toFixed(2) : v, '']}
              contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}
            />
            <ReferenceLine y={1.0} stroke="var(--border)" strokeDasharray="4 2" />
            {chart.datasets.map((ds, i) => {
              const lineColor = LINE_PALETTE[i % LINE_PALETTE.length];
              return (
                <Line
                  key={ds.label}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={lineColor}
                  strokeWidth={2.5}
                  strokeDasharray={ds.dashed ? '6 3' : undefined}
                  dot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
        <div className="rich-chart-note">{chart.note}</div>
      </div>
    );
  }

  return (
    <div className="rich-chart-wrap">
      {legend}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barCategoryGap="30%" barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8 }} />
          {chart.datasets.map((ds) => (
            <Bar key={ds.label} dataKey={ds.label} fill={ds.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="rich-chart-note">{chart.note}</div>
    </div>
  );
}
