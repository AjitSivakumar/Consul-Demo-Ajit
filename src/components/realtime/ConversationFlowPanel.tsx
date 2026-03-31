import { useCallback, useMemo, useState } from 'react';
import { resolveGapFromDocuments, resolveGapFromInternet } from '../../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../../services/documentService';
import { useMeetingStore } from '../../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../../types/domain';

export function ConversationFlowPanel(): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  /* ── Derived data ── */

  const topicNodes = useMemo(() => {
    const catMap = new Map<string, { count: number; open: number }>();
    for (const need of state.needs) {
      if (need.status === 'dismissed') continue;
      const prev = catMap.get(need.category) ?? { count: 0, open: 0 };
      catMap.set(need.category, {
        count: prev.count + 1,
        open: prev.open + (['resolved', 'kept'].includes(need.status) ? 0 : 1),
      });
    }
    return [...catMap.entries()].map(([cat, info]) => ({ category: cat, ...info }));
  }, [state.needs]);

  // Needs visible to user (not dismissed)
  const visibleNeeds = useMemo(
    () => state.needs.filter((n) => n.status !== 'dismissed'),
    [state.needs]
  );

  // Separate by resolution state
  const pendingNeeds = useMemo(
    () => visibleNeeds.filter((n) => n.status === 'new' || n.status === 'retrieving'),
    [visibleNeeds]
  );
  const resolvedNeeds = useMemo(
    () => visibleNeeds.filter((n) => n.status === 'resolved'),
    [visibleNeeds]
  );
  const failedNeeds = useMemo(
    () => visibleNeeds.filter((n) => n.status === 'failed' || n.status === 'unresolved'),
    [visibleNeeds]
  );
  const keptNeeds = useMemo(
    () => visibleNeeds.filter((n) => n.status === 'kept'),
    [visibleNeeds]
  );

  const keptCount = keptNeeds.length;
  const openCount = pendingNeeds.length + resolvedNeeds.length + failedNeeds.length;

  // Map needs to their triggering transcript line
  const needTriggerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const need of state.needs) {
      const event = state.transcript.find((t) => t.segmentId === need.triggeredBySegmentId);
      if (event) {
        map.set(need.id, `${event.speaker}: "${event.text.slice(0, 80)}${event.text.length > 80 ? '…' : ''}"`);
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

      // 1) Try documents FIRST — primary source
      const docs = getAllDocuments();
      if (docs.length > 0) {
        const chunks = extractRelevantChunks(need.prompt, 8, 1500);
        if (chunks.length > 0) {
          const docCtx = chunks
            .map((c) => `[Source: ${c.docName}]\n${c.chunk}`)
            .join('\n\n---\n\n');
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

      // 2) Fallback: try internet
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

  /* ── Render helpers ── */

  const categoryColor: Record<string, string> = {
    comparison: '#63d2be', risk: '#ff6b6b', pricing: '#e8a948',
    objection: '#a9a0ff', claim: '#7bb8f0', decision: '#63d2be',
    open_question: '#e8a948', topic: '#8f98a7', entity: '#7bb8f0',
    metric: '#63d2be', action_item: '#e8a948',
  };

  const renderCard = (need: InformationNeed, idx: number) => {
    const trigger = needTriggerMap.get(need.id);
    const evidence = needEvidenceMap.get(need.id);
    const color = categoryColor[need.category] ?? '#8f98a7';
    const isExpanded = expandedId === need.id;
    const isRetrying = retryingId === need.id;

    const statusClass =
      need.status === 'retrieving' ? 'resolving' :
      need.status === 'resolved' ? 'resolved' :
      need.status === 'failed' || need.status === 'unresolved' ? 'failed' :
      need.status === 'kept' ? 'kept' : '';

    return (
      <article
        className={`cflow-gap-card ${statusClass}`}
        key={need.id}
        style={{ animationDelay: `${idx * 150}ms` }}
      >
        {/* Header row */}
        <div className="cflow-gap-top">
          <span className={`cflow-priority ${need.priority}`}>{need.priority.toUpperCase()}</span>
          <span className="cflow-category" style={{ color, borderColor: color }}>
            {need.category.replace('_', ' ')}
          </span>

          {/* Status indicator */}
          {need.status === 'retrieving' && <span className="cflow-status-pill resolving">Resolving…</span>}
          {need.status === 'resolved' && <span className="cflow-status-pill resolved">✓ Resolved</span>}
          {(need.status === 'failed' || need.status === 'unresolved') && (
            <span className="cflow-status-pill failed">✗ Unresolved</span>
          )}
          {need.status === 'kept' && <span className="cflow-status-pill kept">★ Kept</span>}

          <span className="cflow-confidence">{(need.confidence * 100).toFixed(0)}%</span>
        </div>

        <p className="cflow-gap-question">{need.prompt}</p>

        {trigger && <p className="cflow-gap-trigger">{trigger}</p>}

        {/* Resolved evidence block — expandable */}
        {evidence && need.status === 'resolved' && (
          <div className={`cflow-resolved ${isExpanded ? 'expanded' : ''}`}>
            <button
              type="button"
              className="cflow-resolved-toggle"
              onClick={() => setExpandedId(isExpanded ? null : need.id)}
            >
              <span className="cflow-resolved-via">
                {evidence.attributions[0]?.sourceType === 'web' ? '🌐' : '📁'}{' '}
                {evidence.attributions[0]?.title ?? 'Source'}
              </span>
              <span className="cflow-toggle-arrow">{isExpanded ? '▾' : '▸'}</span>
            </button>
            {isExpanded && (
              <div className="cflow-resolved-body">
                <p>{evidence.summary}</p>
              </div>
            )}
          </div>
        )}

        {/* Failed notice */}
        {(need.status === 'failed' || need.status === 'unresolved') && (
          <div className="cflow-failed-notice">
            <p>Could not find a confident answer from internet or uploaded documents.</p>
            <button
              type="button"
              className="cflow-retry-btn"
              disabled={isRetrying}
              onClick={() => void handleRetry(need)}
            >
              {isRetrying ? 'Retrying…' : '↻ Retry'}
            </button>
          </div>
        )}

        {/* Keep / Dismiss selection — for resolved and failed needs */}
        {(need.status === 'resolved' || need.status === 'failed' || need.status === 'unresolved') && (
          <div className="cflow-selection-bar">
            <button
              type="button"
              className="cflow-select-btn keep"
              onClick={() => handleKeep(need.id)}
            >
              ✓ Keep
            </button>
            <button
              type="button"
              className="cflow-select-btn dismiss"
              onClick={() => handleDismiss(need.id)}
            >
              ✗ Dismiss
            </button>
          </div>
        )}

        {/* Kept evidence — always show expanded */}
        {evidence && need.status === 'kept' && (
          <div className="cflow-resolved expanded">
            <div className="cflow-resolved-body">
              <p>{evidence.summary}</p>
              <span className="cflow-resolved-via kept-source">
                {evidence.attributions[0]?.sourceType === 'web' ? '🌐' : '📁'}{' '}
                {evidence.attributions[0]?.title ?? 'Source'}
              </span>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="cflow-panel hero">
      {/* ── Summary Dashboard ── */}
      <div className="cflow-dashboard">
        <div className="cflow-dash-stat">
          <span className="cflow-dash-number pending">{pendingNeeds.length}</span>
          <span className="cflow-dash-label">Open Gaps</span>
        </div>
        <div className="cflow-dash-stat">
          <span className="cflow-dash-number resolving">
            {visibleNeeds.filter((n) => n.status === 'retrieving').length}
          </span>
          <span className="cflow-dash-label">Resolving</span>
        </div>
        <div className="cflow-dash-stat">
          <span className="cflow-dash-number resolved">{resolvedNeeds.length}</span>
          <span className="cflow-dash-label">Resolved</span>
        </div>
        <div className="cflow-dash-stat">
          <span className="cflow-dash-number kept">{keptCount}</span>
          <span className="cflow-dash-label">Kept</span>
        </div>
        <div className="cflow-dash-stat">
          <span className="cflow-dash-number failed">{failedNeeds.length}</span>
          <span className="cflow-dash-label">Failed</span>
        </div>
      </div>

      {/* ── Topic Flow ── */}
      {topicNodes.length > 0 && (
        <div className="cflow-topics">
          {topicNodes.map((node, idx) => (
            <div className="cflow-topic-wrap" key={node.category}>
              {idx > 0 && <div className="cflow-topic-connector" />}
              <div className={`cflow-topic-node ${node.open > 0 ? 'has-open' : 'all-resolved'}`}>
                <div
                  className="cflow-topic-dot"
                  style={{ borderColor: categoryColor[node.category] ?? '#8f98a7' }}
                />
                <span className="cflow-topic-label">{node.category.replace('_', ' ')}</span>
                <span className="cflow-topic-count">{node.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Scrollable gap area ── */}
      <div className="cflow-scroll-area">
        {/* ── Active (pending + resolved waiting for user selection + failed) ── */}
        <div className="cflow-section">
          <div className="cflow-section-head">
            <span>Live Gaps</span>
            <span className="cflow-section-count">{openCount}</span>
          </div>
          <div className="cflow-card-list">
            {openCount === 0 && (
              <div className="cflow-empty">
                {state.needs.length === 0
                  ? 'Information gaps will appear as the conversation unfolds…'
                  : 'All gaps reviewed ✓'}
              </div>
            )}
            {[...pendingNeeds, ...resolvedNeeds, ...failedNeeds].map(renderCard)}
          </div>
        </div>

        {/* ── Kept items ── */}
        {keptNeeds.length > 0 && (
          <div className="cflow-section">
            <div className="cflow-section-head">
              <span>Kept</span>
              <span className="cflow-section-count resolved">{keptNeeds.length}</span>
            </div>
            <div className="cflow-card-list">
              {keptNeeds.map(renderCard)}
            </div>
          </div>
        )}

        {/* ── AI Suggestions ── */}
        {state.ambientSuggestions.length > 0 && (
          <div className="cflow-section">
            <div className="cflow-section-head">
              <span>AI Suggestions</span>
              <span className="cflow-section-count">{state.ambientSuggestions.length}</span>
            </div>
            <div className="cflow-card-list">
              {state.ambientSuggestions
                .slice()
                .reverse()
                .slice(0, 6)
                .map((item, idx) => (
                  <article className="cflow-suggestion" key={`${item.timestamp}-${idx}`}>
                    <div className="cflow-suggestion-top">
                      <span>Action</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p>{item.text}</p>
                  </article>
                ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
