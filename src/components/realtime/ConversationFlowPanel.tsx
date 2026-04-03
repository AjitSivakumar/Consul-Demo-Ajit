import { useCallback, useMemo, useState } from 'react';
import { resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../../types/domain';

interface InsightsFeedProps {
  selectedNeedId: string | null;
  onSelectNeed: (id: string | null) => void;
}

export function InsightsFeed({ selectedNeedId, onSelectNeed }: InsightsFeedProps): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  /* ── Derived data ── */

  const visibleNeeds = useMemo(
    () => state.needs.filter((n) => n.status !== 'dismissed'),
    [state.needs]
  );

  // Map needs to their triggering transcript line
  const needTriggerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const need of state.needs) {
      const event = state.transcript.find((t) => t.segmentId === need.triggeredBySegmentId);
      if (event) {
        map.set(need.id, event.text.slice(0, 80) + (event.text.length > 80 ? '…' : ''));
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

  const handleKeep = useCallback(
    (needId: string) => dispatch({ type: 'KEEP_NEED', payload: needId }),
    [dispatch]
  );

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

  /* ── Category colors ── */
  const categoryColor: Record<string, string> = {
    comparison: '#1D9E75', risk: '#FF0050', pricing: '#e8a948',
    objection: '#B400FF', claim: '#1D9E75', decision: '#1D9E75',
    open_question: '#e8a948', topic: '#3B6D11', entity: '#185FA5',
    metric: '#1D9E75', action_item: '#e8a948',
  };

  /* ── Render insight card ── */
  const renderInsightCard = (need: InformationNeed, idx: number) => {
    const trigger = needTriggerMap.get(need.id);
    const evidence = needEvidenceMap.get(need.id);
    const isSelected = selectedNeedId === need.id;
    const isRetrying = retryingId === need.id;
    const isCaution = need.category === 'risk' || need.priority === 'p1';
    const isProactive = need.category === 'objection' && evidence;
    const sourceColor = categoryColor[need.category] ?? '#3B6D11';

    return (
      <div
        key={need.id}
        className={`irow ${isSelected ? 'selected' : ''} ${isProactive ? 'proactive' : ''}`}
        style={{ animationDelay: `${idx * 80}ms` }}
        onClick={() => onSelectNeed(isSelected ? null : need.id)}
      >
        {/* Caution / Diagram tags */}
        {isCaution && (
          <div className="caution-tag">
            <div className="caution-dot" />
            Caution
          </div>
        )}
        {need.category === 'comparison' && evidence && (
          <div className="diagram-tag">
            <div className="diagram-dot" />
            Diagram Suggested
          </div>
        )}

        {/* Proactive label */}
        {isProactive && <div className="pro-label">PROACTIVE</div>}

        {/* Trigger pill */}
        {trigger && (
          <div className="trigger-pill">
            <span className="trigger-word">Triggered</span>
            <span className="trigger-quote">"{trigger}"</span>
          </div>
        )}

        {/* Status badge */}
        {need.status === 'retrieving' && <span className="irow-status resolving">Resolving…</span>}
        {(need.status === 'failed' || need.status === 'unresolved') && <span className="irow-status failed">Unresolved</span>}
        {need.status === 'kept' && <span className="irow-status kept">★ Kept</span>}

        {/* Question */}
        <div className="irow-q">{need.prompt}</div>

        {/* Answer (if resolved) */}
        {evidence && (
          <div className="irow-a">{evidence.summary.slice(0, 120)}{evidence.summary.length > 120 ? '…' : ''}</div>
        )}

        {/* Footer: source + time */}
        <div className="irow-foot">
          <div className="irow-src">
            <div className="sdot" style={{ background: sourceColor }} />
            <span className="sname">
              {evidence?.attributions[0]?.title ?? need.category.replace('_', ' ')}
            </span>
          </div>
          <span className="irow-time">{need.status === 'new' ? 'just now' : need.status}</span>
        </div>

        {/* Action buttons for resolved/failed needs */}
        {(need.status === 'resolved' || need.status === 'failed' || need.status === 'unresolved') && (
          <div className="irow-actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="irow-action-btn keep" onClick={() => handleKeep(need.id)}>
              ✓ Keep
            </button>
            <button type="button" className="irow-action-btn dismiss" onClick={() => handleDismiss(need.id)}>
              ✗ Dismiss
            </button>
            {(need.status === 'failed' || need.status === 'unresolved') && (
              <button
                type="button"
                className="irow-action-btn retry"
                disabled={isRetrying}
                onClick={() => void handleRetry(need)}
              >
                {isRetrying ? 'Retrying…' : '↻ Retry'}
              </button>
            )}
          </div>
        )}
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
            {state.needs.length === 0
              ? 'Insights will appear as the conversation unfolds…'
              : 'All insights reviewed ✓'}
          </div>
        )}

        {/* AI Suggestions as proactive cards */}
        {state.ambientSuggestions.slice().reverse().slice(0, 3).map((item, idx) => {
          const isSelected = selectedNeedId === item.needId;
          const need = state.needs.find((n) => n.id === item.needId);
          const evidence = state.evidence.find((e) => e.needId === item.needId);
          return (
            <div
              key={`sug-${item.timestamp}-${idx}`}
              className={`irow proactive${isSelected ? ' selected' : ''}`}
              style={{ animationDelay: `${idx * 80}ms` }}
              onClick={() => onSelectNeed(isSelected ? null : item.needId)}
            >
              <div className="pro-label">⬡ PROACTIVE</div>
              <div className="irow-q">{item.headline}</div>
              {need && (
                <div className="irow-a" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                  {need.rationale}
                </div>
              )}
              <div className="irow-foot">
                <div className="irow-src">
                  <div className="sdot" style={{ background: 'rgba(255,255,255,0.8)' }} />
                  <span className="sname">
                    {evidence ? (evidence.verification === 'verified' ? '✓ Resolved' : '~ Inferred') : need?.status === 'retrieving' ? 'Researching…' : 'AI Suggestion'}
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
    </>
  );
}
