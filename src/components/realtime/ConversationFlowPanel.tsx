import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../../types/domain';

interface InsightsFeedProps {
  selectedNeedId: string | null;
  onSelectNeed: (id: string | null) => void;
}

type TagModal = { type: 'caution' | 'diagram'; need: InformationNeed } | null;
type ConfirmedPanel = { type: 'caution' | 'diagram'; need: InformationNeed } | null;

export function InsightsFeed({ selectedNeedId, onSelectNeed }: InsightsFeedProps): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState<TagModal>(null);
  const [confirmedPanel, setConfirmedPanel] = useState<ConfirmedPanel>(null);
  const shownCriticalIds = useRef<Set<string>>(new Set());

  // Auto-show caution popup only when a misleading/incorrect claim has been resolved with corrective evidence
  useEffect(() => {
    const misleadingResolved = state.needs.find((n) => {
      if (shownCriticalIds.current.has(n.id)) return false;
      if (n.status !== 'resolved') return false;
      if (n.category !== 'correction') return false;
      return state.evidence.some((e) => e.needId === n.id);
    });
    if (misleadingResolved && !confirmedPanel && !tagModal) {
      shownCriticalIds.current.add(misleadingResolved.id);
      setConfirmedPanel({ type: 'caution', need: misleadingResolved });
    }
  }, [state.needs, state.evidence, confirmedPanel, tagModal]);

  // Auto-show diagram popup when a comparison need with evidence appears
  useEffect(() => {
    const diagramResolved = state.needs.find((n) => {
      if (shownCriticalIds.current.has(n.id)) return false;
      if (n.status !== 'resolved') return false;
      if (n.category !== 'comparison') return false;
      return state.evidence.some((e) => e.needId === n.id);
    });
    if (diagramResolved && !confirmedPanel && !tagModal) {
      shownCriticalIds.current.add(diagramResolved.id);
      setTagModal({ type: 'diagram', need: diagramResolved });
    }
  }, [state.needs, state.evidence, confirmedPanel, tagModal]);

  /* ── Derived data ── */

  const visibleNeeds = useMemo(
    () => state.needs.filter((n) => n.status !== 'dismissed').slice(0, 5),
    [state.needs]
  );

  // Map needs to a short trigger phrase from transcript (fallback if AI didn't return one)
  const needTriggerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const need of state.needs) {
      const event = state.transcript.find((t) => t.segmentId === need.triggeredBySegmentId);
      if (event) {
        const words = event.text.trim().split(/\s+/);
        map.set(need.id, words.slice(0, 4).join(' '));
      }
    }
    return map;
  }, [state.needs, state.transcript]);

  // Map resolved needs to their evidence
  const needEvidenceMap = useMemo(() => {
    const map = new Map<string, EvidenceCard>();
    for (const ev of state.evidence) {
      if (!map.has(ev.needId)) {
        map.set(ev.needId, ev);
      }
    }
    return map;
  }, [state.evidence]);

  /* ── Handlers ── */

  const handleDismiss = useCallback(
    (needId: string) => dispatch({ type: 'DISMISS_NEED', payload: needId }),
    [dispatch]
  );

  const handleRetry = useCallback(
    async (need: InformationNeed) => {
      setRetryingId(need.id);
      dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'retrieving' } });

      const transcriptContext = state.transcript
        .slice(-10)
        .map((t) => `${t.speaker}: ${t.text}`)
        .join('\n');

      // 1) Try documents FIRST
      const docs = getAllDocuments();
      if (docs.length > 0) {
        const chunks = extractRelevantChunks(need.prompt, 8, 1500);
        if (chunks.length > 0) {
          const docCtx = chunks.map((c) => `[Source: ${c.docName}]\n${c.chunk}`).join('\n\n---\n\n');
          const docResult = await resolveGapFromDocuments(need.prompt, docCtx);
          if (docResult.confidence >= 0.5) {
            const evidence: EvidenceCard = {
              id: `evidence-retry-${need.id}-${Date.now()}`,
              needId: need.id,
              title: `Resolved: ${need.prompt.slice(0, 60)}`,
              summary: docResult.answer,
              kind: 'claim',
              recencyLabel: 'Just resolved',
              confidence: docResult.confidence,
              attributions: [{
                sourceId: `src-doc-${Date.now()}`,
                sourceType: 'internal_document',
                title: docResult.source,
                freshnessScore: 0.9,
                trustScore: 0.85,
              }],
              triggeredBySegmentId: need.triggeredBySegmentId,
              explainWhyNow: 'Retried by user',
              verification: 'verified',
            };
            dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
            dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
            setRetryingId(null);
            return;
          }
        }
      }

      // 2) Fallback: internet
      const internetResult = await resolveGapFromInternet(need.prompt, transcriptContext);
      if (internetResult.confidence >= 0.5) {
        const evidence: EvidenceCard = {
          id: `evidence-retry-${need.id}-${Date.now()}`,
          needId: need.id,
          title: `Resolved: ${need.prompt.slice(0, 60)}`,
          summary: internetResult.answer,
          kind: 'claim',
          recencyLabel: 'Just resolved',
          confidence: internetResult.confidence,
          attributions: [{
            sourceId: `src-web-${Date.now()}`,
            sourceType: 'web',
            title: internetResult.source,
            url: internetResult.sourceUrl ?? undefined,
            freshnessScore: 0.9,
            trustScore: 0.7,
          }],
          triggeredBySegmentId: need.triggeredBySegmentId,
          explainWhyNow: 'Retried by user',
          verification: 'inferred',
        };
        dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
        dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
        setRetryingId(null);
        return;
      }

      dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'failed' } });
      setRetryingId(null);
    },
    [dispatch, state.transcript]
  );

  /* ── Time ago helper ── */
  const timeAgo = (timestamp: number): string => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 120) return '1 min ago';
    return `${Math.floor(diff / 60)} min ago`;
  };

  /* ── Render insight card ── */
  const renderInsightCard = (need: InformationNeed, idx: number) => {
    const evidence = needEvidenceMap.get(need.id);
    const isSelected = selectedNeedId === need.id;
    const isRetrying = retryingId === need.id;
    const isCaution = need.category === 'correction';
    const triggerPhrase = need.triggerPhrase ?? needTriggerMap.get(need.id);

    return (
      <div
        key={need.id}
        className={`irow ${isSelected ? 'selected' : ''}`}
        style={{ animationDelay: `${idx * 80}ms`, position: 'relative' }}
        onClick={() => onSelectNeed(isSelected ? null : need.id)}
      >
        <button
          type="button"
          className="irow-dismiss-btn"
          onClick={(e) => { e.stopPropagation(); handleDismiss(need.id); }}
          title="Dismiss"
        >✕</button>

        {/* Trigger row */}
        {triggerPhrase && (
          <div className="irow-trigger-row">
            <span className="irow-trigger-label">TRIGGERED</span>
            <span className="irow-trigger-pill">"{triggerPhrase}"</span>
          </div>
        )}

        {/* Tags row */}
        <div className="irow-tags">
          {isCaution && (
            <div className="caution-tag caution-tag-btn" onClick={(e) => { e.stopPropagation(); setTagModal({ type: 'caution', need }); }}>
              <div className="caution-dot" />
              Caution
            </div>
          )}
          {need.category === 'comparison' && evidence && (
            <div className="diagram-tag diagram-tag-btn" onClick={(e) => { e.stopPropagation(); setTagModal({ type: 'diagram', need }); }}>
              <div className="diagram-dot" />
              Diagram
            </div>
          )}
        </div>

        {/* Question */}
        <div className="irow-q">{need.prompt}</div>

        {/* One-liner answer snippet when resolved */}
        {evidence && (
          <div className="irow-snippet">
            {evidence.summary.split(/[.!?]/)[0].trim()}
          </div>
        )}
        {need.status === 'retrieving' && !evidence && (
          <div className="irow-snippet irow-snippet-loading">Researching…</div>
        )}

        {/* Footer: retry button */}
        <div className="irow-foot">
          {(need.status === 'failed' || need.status === 'unresolved') && (
            <button
              type="button"
              className="irow-action-btn retry"
              disabled={isRetrying}
              onClick={(e) => { e.stopPropagation(); void handleRetry(need); }}
            >
              {isRetrying ? '…' : '↻'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="col-header">
        <span className="col-title">Insights Feed</span>
        <span className="col-count">{visibleNeeds.length}</span>
      </div>
      <div className="feed-body">
        {visibleNeeds.length === 0 && (
          <div className="feed-empty">
            <img src="/logo-grey.svg" alt="" className="feed-empty-logo" />
            <div>{state.needs.length === 0
              ? 'Insights will appear as the conversation unfolds…'
              : 'All insights reviewed ✓'}</div>
          </div>
        )}

        {/* AI Suggestions as proactive cards — top 2 by importance */}
        {state.ambientSuggestions
          .slice()
          .sort((a, b) => b.importance - a.importance)
          .slice(0, 2)
          .map((item, idx) => {
          const isSelected = selectedNeedId === item.needId;
          const need = state.needs.find((n) => n.id === item.needId);
          const evidence = state.evidence.find((e) => e.needId === item.needId);
          return (
            <div
              key={`sug-${item.timestamp}-${idx}`}
              className={`irow proactive${isSelected ? ' selected' : ''}`}
              style={{ animationDelay: `${idx * 80}ms`, position: 'relative' }}
              onClick={() => onSelectNeed(isSelected ? null : item.needId)}
            >
              <button
                type="button"
                className="irow-dismiss-btn irow-dismiss-btn-proactive"
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DISMISS_AMBIENT_SUGGESTION', payload: item.needId }); }}
                title="Dismiss"
              >✕</button>
              <div className="pro-label">⬡ PROACTIVE</div>
              <div className="irow-q">{item.headline}</div>
              <div className="irow-foot">
                <div className="irow-src">
                  <div className="sdot" style={{ background: 'rgba(255,255,255,0.8)' }} />
                  <span className="sname">
                    {evidence ? '✓ Resolved' : need?.status === 'retrieving' ? 'Researching…' : 'AI'}
                  </span>
                </div>
                <span className="irow-time">{timeAgo(new Date(item.timestamp).getTime())}</span>
              </div>
            </div>
          );
        })}

        {/* Insight cards from needs */}
        {visibleNeeds.map(renderInsightCard)}
      </div>

      {/* ── Tag Modals ── */}
      {tagModal && (
        <div className="tag-modal-overlay">
          <div className={`tag-modal-box tag-modal-box-${tagModal.type}`}>
            {tagModal.type === 'caution' ? (
              <>
                <div className="tag-modal-header caution">
                  <div className="caution-dot" />
                  Caution
                </div>
                <div className="tag-modal-body">
                  <div className="tag-modal-question">{tagModal.need.prompt}</div>
                  {tagModal.need.demoEvidence?.richCorrectionBlock ? (
                    <div className="popup-correction-block">
                      <div className="popup-correction-row">
                        <div className="popup-correction-col popup-correction-wrong">
                          <div className="popup-correction-label">{tagModal.need.demoEvidence.richCorrectionBlock.wrong.label}</div>
                          <div className="popup-correction-text">{tagModal.need.demoEvidence.richCorrectionBlock.wrong.text}</div>
                        </div>
                        <div className="popup-correction-col popup-correction-right">
                          <div className="popup-correction-label">{tagModal.need.demoEvidence.richCorrectionBlock.right.label}</div>
                          <div className="popup-correction-text">{tagModal.need.demoEvidence.richCorrectionBlock.right.text}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    tagModal.need.rationale && <div className="tag-modal-detail">{tagModal.need.rationale}</div>
                  )}
                  {!tagModal.need.demoEvidence?.richCorrectionBlock && (
                    <div className="tag-modal-hint">Ambi detected potentially incorrect or misleading information in the conversation and found evidence that addresses it.</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="tag-modal-header diagram">
                  <div className="diagram-dot" />
                  Diagram Suggested
                </div>
                <div className="tag-modal-body">
                  <div className="tag-modal-question">{tagModal.need.prompt}</div>
                  {tagModal.need.demoEvidence?.richFlowDiagram ? (
                    <div className="popup-flow-preview">
                      <div className="popup-flow-preview-label">Suggested flow</div>
                      <div className="popup-flow-chips">
                        {tagModal.need.demoEvidence.richFlowDiagram.chips.map((chip, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {i > 0 && <span className="popup-flow-arrow">→</span>}
                            <span className={`popup-flow-chip popup-flow-chip-${chip.kind ?? 'default'}`}>{chip.label}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {tagModal.need.rationale && <div className="tag-modal-detail">{tagModal.need.rationale}</div>}
                      <div className="tag-modal-hint">A visual comparison or diagram would help clarify this topic. Confirm to expand it.</div>
                    </>
                  )}
                </div>
              </>
            )}
            <div className="tag-modal-actions">
              <button
                type="button"
                className="tag-modal-btn confirm"
                onClick={() => {
                  if (tagModal.type === 'diagram') {
                    onSelectNeed(tagModal.need.id);
                    setTagModal(null);
                  } else {
                    setConfirmedPanel({ type: tagModal.type, need: tagModal.need });
                    setTagModal(null);
                  }
                }}
              >
                {tagModal.type === 'diagram' ? 'Open in Deep Dive →' : 'Confirm'}
              </button>
              <button
                type="button"
                className="tag-modal-btn remove"
                onClick={() => {
                  dispatch({ type: 'DISMISS_NEED', payload: tagModal.need.id });
                  setTagModal(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmed Center Panel ── */}
      {confirmedPanel && (() => {
        const evidence = state.evidence.find((e) => e.needId === confirmedPanel.need.id);
        const triggerEvent = state.transcript.find((t) => t.segmentId === confirmedPanel.need.triggeredBySegmentId);
        return (
          <div className="confirmed-overlay">
            <div className={`confirmed-panel confirmed-panel-${confirmedPanel.type}`}>
              <button type="button" className="confirmed-close" onClick={() => setConfirmedPanel(null)}>✕</button>
              <div className={`confirmed-header ${confirmedPanel.type}`}>
                {confirmedPanel.type === 'caution'
                  ? <><div className="caution-dot" /> Caution</>
                  : <><div className="diagram-dot" /> Diagram Suggested</>
                }
              </div>
              {triggerEvent && (
                <div className="confirmed-trigger">
                  <span className="confirmed-trigger-label">Triggered by</span>
                  <span className="confirmed-trigger-quote">"{triggerEvent.speaker}: {triggerEvent.text}"</span>
                </div>
              )}
              <div className="confirmed-question">{confirmedPanel.need.prompt}</div>
              {confirmedPanel.need.rationale && (
                <div className="confirmed-rationale">{confirmedPanel.need.rationale}</div>
              )}
              {evidence && (
                <div className="confirmed-answer">
                  <div className="confirmed-answer-label">Research</div>
                  <div className="confirmed-answer-text">{evidence.summary}</div>
                </div>
              )}
              <button
                type="button"
                className="confirmed-deepdive-btn"
                onClick={() => { onSelectNeed(confirmedPanel.need.id); setConfirmedPanel(null); }}
              >
                Open in Deep Dive →
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
}
