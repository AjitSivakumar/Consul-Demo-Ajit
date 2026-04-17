import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { fetchDocumentContent, loadGroupKnowledge, searchByEntities, searchByTags, semanticSearch, type KnowledgeDoc } from '../../services/knowledgeService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../../types/domain';

interface InsightsFeedProps {
  selectedNeedId: string | null;
  onSelectNeed: (id: string | null) => void;
  resetKey?: number;
}

type TagModal = { type: 'caution' | 'diagram'; need: InformationNeed } | null;

export function InsightsFeed({ selectedNeedId, onSelectNeed, resetKey }: InsightsFeedProps): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [tagModal, setTagModal] = useState<TagModal>(null);
  const [confirmedNeedIds, setConfirmedNeedIds] = useState<Set<string>>(new Set());
  const shownCriticalIds = useRef<Set<string>>(new Set());
  const groupKnowledgeRef = useRef<KnowledgeDoc[]>([]);

  useEffect(() => {
    if (!state.groupId) { groupKnowledgeRef.current = []; return; }
    loadGroupKnowledge(state.groupId).then((docs) => { groupKnowledgeRef.current = docs; }).catch(() => {});
  }, [state.groupId]);

  useEffect(() => {
    if (!resetKey) return;
    setTagModal(null);
    setConfirmedNeedIds(new Set());
    shownCriticalIds.current = new Set();
  }, [resetKey]);

  const confirmNeed = (id: string): void =>
    setConfirmedNeedIds((prev) => new Set([...prev, id]));

  // Auto-show caution popup — only for needs with a richCorrectionBlock demo evidence
  useEffect(() => {
    const cautionResolved = state.needs.find((n) => {
      if (shownCriticalIds.current.has(n.id)) return false;
      if (n.status !== 'resolved') return false;
      if (!n.demoEvidence?.richCorrectionBlock) return false;
      return state.evidence.some((e) => e.needId === n.id);
    });
    if (cautionResolved && !tagModal) {
      shownCriticalIds.current.add(cautionResolved.id);
      setTagModal({ type: 'caution', need: cautionResolved });
    }
  }, [state.needs, state.evidence, tagModal]);

  // Auto-show diagram popup — only for needs with a richFlowDiagram demo evidence
  useEffect(() => {
    const diagramResolved = state.needs.find((n) => {
      if (shownCriticalIds.current.has(n.id)) return false;
      if (n.status !== 'resolved') return false;
      if (!n.demoEvidence?.richFlowDiagram) return false;
      return state.evidence.some((e) => e.needId === n.id);
    });
    if (diagramResolved && !tagModal) {
      shownCriticalIds.current.add(diagramResolved.id);
      setTagModal({ type: 'diagram', need: diagramResolved });
    }
  }, [state.needs, state.evidence, tagModal]);

  /* ── Derived data ── */

  const visibleNeeds = useMemo(
    () => state.needs.filter((n) => {
      if (n.status === 'dismissed' || n.isProactiveDemoTrigger) return false;
      if ((n.category === 'correction' || n.category === 'comparison') && !confirmedNeedIds.has(n.id)) return false;
      return true;
    }).slice(0, 5),
    [state.needs, confirmedNeedIds]
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

      // 2) Try knowledge base
      const knowledgeDocs = groupKnowledgeRef.current;
      if (knowledgeDocs.length > 0) {
        const localMatches = [
          ...searchByEntities(need.prompt, knowledgeDocs),
          ...searchByTags(need.prompt, knowledgeDocs),
        ].sort((a, b) => b.score - a.score).slice(0, 3);
        const semanticMatches = state.groupId
          ? await semanticSearch(need.prompt, state.groupId).catch(() => [])
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
          const kbResult = await resolveGapFromDocuments(need.prompt, kbCtx);
          if (kbResult.confidence >= 0.65) {
            const evidence: EvidenceCard = {
              id: `evidence-retry-${need.id}-${Date.now()}`,
              needId: need.id,
              title: `Resolved: ${need.prompt.slice(0, 60)}`,
              summary: kbResult.answer,
              kind: 'claim',
              recencyLabel: 'Just resolved',
              confidence: kbResult.confidence,
              attributions: [{ sourceId: `src-kb-${Date.now()}`, sourceType: 'internal_document', title: kbResult.source, freshnessScore: 0.9, trustScore: 0.85 }],
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

      // 3) Fallback: internet
      const internetResult = await resolveGapFromInternet(need.prompt, transcriptContext, state.context.meetingType ?? 'sales');
      if (internetResult.confidence >= 0.5) {
        const evidence: EvidenceCard = {
          id: `evidence-retry-${need.id}-${Date.now()}`,
          needId: need.id,
          title: `Resolved: ${need.prompt.slice(0, 60)}`,
          summary: internetResult.answer,
          kind: 'claim',
          recencyLabel: 'Just resolved',
          confidence: internetResult.confidence,
          attributions: (internetResult.citations && internetResult.citations.length > 0
            ? internetResult.citations.map((c, i) => ({
                sourceId: `src-web-${Date.now()}-${i}`,
                sourceType: 'web' as const,
                title: c.title,
                url: c.url,
                freshnessScore: 0.9,
                trustScore: 0.7,
              }))
            : [{
                sourceId: `src-web-${Date.now()}`,
                sourceType: 'web' as const,
                title: internetResult.source,
                url: internetResult.sourceUrl ?? undefined,
                freshnessScore: 0.9,
                trustScore: 0.7,
              }]),
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
    const isDirectQuery = need.category === 'direct_query';
    const triggerPhrase = need.triggerPhrase ?? needTriggerMap.get(need.id);

    return (
      <div
        key={need.id}
        className={`irow ${isSelected ? 'selected' : ''} ${isDirectQuery ? 'irow--direct' : ''}`}
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
          {isDirectQuery && (
            <div className="direct-query-tag">
              <div className="direct-query-dot" />
              You asked
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

        {/* Footer: source links (web) or retry button */}
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
          {evidence && (() => {
            const webAttrs = evidence.attributions.filter(a => a.sourceType === 'web' && a.url);
            if (webAttrs.length === 0) return null;
            return (
              <div className="irow-src-links" onClick={e => e.stopPropagation()}>
                {webAttrs.slice(0, 3).map((attr, i) => (
                  <a key={i} href={attr.url} target="_blank" rel="noopener noreferrer" className="irow-src-link">
                    {(() => { try { return new URL(attr.url!).hostname.replace(/^www\./, ''); } catch { return attr.title; } })()}↗
                  </a>
                ))}
              </div>
            );
          })()}
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
                <div className="caut-popup-header">
                  <div className="caut-popup-header-left">
                    <div className="caut-popup-icon">⚠</div>
                    <span className="caut-popup-title">Caution</span>
                  </div>
                </div>
                <div className="caut-popup-body">
                  <div className="caut-popup-label">⚠ Positioning risk flagged</div>
                  <div className="caut-popup-headline">{tagModal.need.prompt}</div>
                  {tagModal.need.demoEvidence?.richCorrectionBlock && (
                    <>
                      <div className="caut-correction-block">
                        <div className="caut-correction-row">
                          <div className="caut-correction-col caut-wrong">
                            <div className="caut-correction-label">{tagModal.need.demoEvidence.richCorrectionBlock.wrong.label}</div>
                            <div className="caut-correction-text">{tagModal.need.demoEvidence.richCorrectionBlock.wrong.text}</div>
                          </div>
                          <div className="caut-correction-col caut-right">
                            <div className="caut-correction-label">{tagModal.need.demoEvidence.richCorrectionBlock.right.label}</div>
                            <div className="caut-correction-text">{tagModal.need.demoEvidence.richCorrectionBlock.right.text}</div>
                          </div>
                        </div>
                      </div>
                      <div className="caut-source-tag">product → Extreme spec · GO! architecture docs</div>
                    </>
                  )}
                </div>
                <div className="caut-popup-actions">
                  <button type="button" className="caut-popup-btn-expand" onClick={() => { confirmNeed(tagModal.need.id); onSelectNeed(tagModal.need.id); setTagModal(null); }}>Expand ↑</button>
                  <button type="button" className="caut-popup-btn-remove" onClick={() => { dispatch({ type: 'DISMISS_NEED', payload: tagModal.need.id }); setTagModal(null); }}>Remove</button>
                </div>
              </>
            ) : (
              <>
                <div className="diag-popup-header">
                  <div className="diag-popup-header-left">
                    <div className="diag-popup-icon">↗</div>
                    <span className="diag-popup-title">Diagram Suggested</span>
                  </div>
                </div>
                <div className="diag-popup-body">
                  <div className="diag-popup-label">↗ Consul identified a flow</div>
                  <div className="diag-popup-headline">{tagModal.need.prompt}</div>
                  <div className="diag-popup-desc">{tagModal.need.demoEvidence?.summary ?? tagModal.need.rationale}</div>
                </div>
                <div className="diag-popup-actions">
                  <button type="button" className="diag-popup-btn-expand" onClick={() => { confirmNeed(tagModal.need.id); onSelectNeed(tagModal.need.id); setTagModal(null); }}>Expand ↗</button>
                  <button type="button" className="diag-popup-btn-remove" onClick={() => { dispatch({ type: 'DISMISS_NEED', payload: tagModal.need.id }); setTagModal(null); }}>Remove</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </>
  );
}
