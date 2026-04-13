import { useEffect, useRef } from 'react';
import {
  generateActionItems,
  generateAmbientSuggestion,
  generateQAAnswers,
  generateResearchSummary,
  generateSlideDeck,
  inferNeedsWithAI,
  resolveGapFromDocuments,
  resolveGapFromInternet,
  type MeetingContextPacket,
} from '../services/aiService';
import { extractRelevantChunks, getAllDocuments } from '../services/documentService';
import { fetchDocumentContent, loadGroupKnowledge, searchByEntities, searchByTags, semanticSearch } from '../services/knowledgeService';
import type { KnowledgeDoc } from '../services/knowledgeService';
import { useMeetingStore } from '../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../types/domain';

const CHEN_LAB_PRESET_IDS = new Set(['chen-tobin-heat', 'chen-tobin-heat-auto']);

const GENERATION_TIMEOUT_MS = 30000;

function buildEvidenceFromResult(
  need: InformationNeed,
  result: { answer: string; source: string; sourceUrl?: string | null; confidence: number },
  sourceType: 'web' | 'internal_document'
): EvidenceCard {
  return {
    id: `evidence-auto-${need.id}-${Date.now()}`,
    needId: need.id,
    title: `Auto-resolved: ${need.prompt.slice(0, 60)}`,
    summary: result.answer,
    kind: 'claim',
    recencyLabel: 'Just resolved',
    confidence: result.confidence,
    attributions: [
      {
        sourceId: `src-${sourceType}-${Date.now()}`,
        sourceType,
        title: result.source,
        url: result.sourceUrl ?? undefined,
        freshnessScore: 0.9,
        trustScore: sourceType === 'web' ? 0.7 : 0.85,
      },
    ],
    triggeredBySegmentId: need.triggeredBySegmentId,
    explainWhyNow: 'Auto-resolved by Ambi during meeting',
    verification: sourceType === 'web' ? 'inferred' : 'verified',
  };
}

export function useAmbientMeetingAI(): {
  endMeeting: () => Promise<void>;
} {
  const { state, dispatch } = useMeetingStore();
  const lastTranscriptIdRef = useRef<string | null>(null);
  const autoEndStartedRef = useRef(false);
  const autoResolveQueue = useRef<Set<string>>(new Set());
  const groupKnowledgeRef = useRef<KnowledgeDoc[]>([]);
  const lastInferenceTimeRef = useRef<number>(0);
  const eventsSinceLastInference = useRef<number>(0);

  // Load group knowledge docs when groupId is set
  useEffect(() => {
    if (!state.groupId) { groupKnowledgeRef.current = []; return; }
    loadGroupKnowledge(state.groupId).then((docs) => { groupKnowledgeRef.current = docs; }).catch(() => {});
  }, [state.groupId]);

  // Cooldown: require at least 35s AND 7 transcript events between AI inferences
  const AI_INFERENCE_COOLDOWN_MS = 35_000;
  const AI_INFERENCE_MIN_EVENTS = 7;
  // Max active information gaps (non-dismissed)
  const MAX_ACTIVE_GAPS = 5;
  // Cooldown between ambient suggestion calls: 15s minimum
  const AMBIENT_SUGGESTION_COOLDOWN_MS = 15_000;
  const lastAmbientTsRef = useRef<number>(0);

  // Auto-resolve: when new needs appear, try docs → internet → mark failed
  // Stagger by 3s per need so each gets fully processed before the next starts
  useEffect(() => {
    const newNeeds = state.needs.filter(
      (n) => n.status === 'new' && !autoResolveQueue.current.has(n.id)
    );
    if (newNeeds.length === 0) return;

    for (let i = 0; i < newNeeds.length; i++) {
      const need = newNeeds[i];
      autoResolveQueue.current.add(need.id);

      // 3s stagger per gap so each is fully resolved before the next shows progress
      const delay = i * 3000;

      setTimeout(() => {
        void (async () => {
          // Short-circuit for demo needs — use pre-built evidence immediately
          if (need.demoEvidence) {
            const evidence: EvidenceCard = {
              ...need.demoEvidence,
              id: `evidence-demo-${need.id}`,
              needId: need.id,
              triggeredBySegmentId: need.triggeredBySegmentId,
            };
            dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
            dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
            if (need.isProactiveDemoTrigger && need.proactiveHeadline) {
              dispatch({ type: 'ADD_AMBIENT_SUGGESTION', payload: {
                headline: need.proactiveHeadline,
                needId: need.id,
                importance: need.proactiveImportance ?? 9,
              }});
            }
            return;
          }

          dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'retrieving' } });

          const transcriptContext = state.transcript
            .slice(-10)
            .map((t) => `${t.speaker}: ${t.text}`)
            .join('\n');

          // 1) Try uploaded documents FIRST — they are the primary source
          const docs = getAllDocuments();
          if (docs.length > 0) {
            // Extract the most relevant chunks from all docs for this specific question
            const chunks = extractRelevantChunks(need.prompt, 8, 1500);
            if (chunks.length > 0) {
              const docCtx = chunks
                .map((c) => `[Source: ${c.docName}]\n${c.chunk}`)
                .join('\n\n---\n\n');
              const docResult = await resolveGapFromDocuments(need.prompt, docCtx);
              if (docResult.confidence >= 0.65) {
                const evidence = buildEvidenceFromResult(need, docResult, 'internal_document');
                dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
                dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
                return;
              }
            }
          }

          // 2) Try group knowledge base (indexed Drive docs)
          const knowledgeDocs = groupKnowledgeRef.current;
          if (knowledgeDocs.length > 0) {
            // Fast local search first (entity + tag), then semantic if needed
            const localMatches = [
              ...searchByEntities(need.prompt, knowledgeDocs),
              ...searchByTags(need.prompt, knowledgeDocs),
            ].sort((a, b) => b.score - a.score).slice(0, 2);

            const semanticMatches = state.groupId
              ? await semanticSearch(need.prompt, state.groupId).catch(() => [])
              : [];

            const topMatches = [...localMatches, ...semanticMatches]
              .filter((m, i, arr) => arr.findIndex((x) => x.doc.id === m.doc.id) === i)
              .sort((a, b) => b.score - a.score)
              .slice(0, 2);

            if (topMatches.length > 0) {
              const contents = await Promise.all(
                topMatches.map((m) => fetchDocumentContent(m.doc.id))
              );
              const knowledgeCtx = topMatches
                .map((m, i) => `[Source: ${m.doc.name}]\n${contents[i]?.slice(0, 2000) ?? m.doc.summary}`)
                .join('\n\n---\n\n');

              const knowledgeResult = await resolveGapFromDocuments(need.prompt, knowledgeCtx);
              if (knowledgeResult.confidence >= 0.65) {
                const evidence = buildEvidenceFromResult(need, knowledgeResult, 'internal_document');
                dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
                dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
                return;
              }
            }
          }

          // 3) Fallback: try internet (GPT general knowledge)
          const internetResult = await resolveGapFromInternet(need.prompt, transcriptContext);
          if (internetResult.confidence >= 0.65) {
            const evidence = buildEvidenceFromResult(need, internetResult, 'web');
            dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
            dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
            return;
          }

          // Both failed
          dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'failed' } });
        })();
      }, delay);
    }
  }, [dispatch, state.needs, state.transcript]);

  useEffect(() => {
    if (state.liveStatus !== 'listening' || state.transcript.length === 0) {
      return;
    }
    // Skip all AI inference/suggestions when a preset is active — only hardcoded triggers fire
    if (state.presetActive) return;

    const latest = state.transcript[state.transcript.length - 1];
    if (latest.id === lastTranscriptIdRef.current) {
      return;
    }

    lastTranscriptIdRef.current = latest.id;
    eventsSinceLastInference.current += 1;

    void (async () => {
      // Build context packet shared across both AI calls in this tick
      const startTime = state.transcript[0]
        ? Math.round((Date.now() - new Date(state.transcript[0].timestampIso).getTime()) / 60000)
        : 0;
      const ctxPacket: MeetingContextPacket = {
        meetingTitle: state.context.title || '',
        accountContext: state.context.accountContext || '',
        detectedThemes: state.context.discussedThemes ?? [],
        resolvedTopics: state.evidence.map((e) => e.title),
        unresolvedQuestions: state.context.unresolvedQuestions ?? [],
        recentTranscript: state.transcript
          .slice(-10)
          .map((s) => `${s.speaker}: ${s.text}`)
          .join('\n'),
        elapsedMinutes: startTime,
      };

      // Only call ambient suggestion if: enough time has passed AND enough words spoken
      const wordCount = latest.text.trim().split(/\s+/).length;
      const ambientElapsed = Date.now() - lastAmbientTsRef.current;
      if (wordCount >= 15 && ambientElapsed >= AMBIENT_SUGGESTION_COOLDOWN_MS) {
        lastAmbientTsRef.current = Date.now();
        const previousHeadlines = state.ambientSuggestions.map((s) => s.headline);
        // Pass last 2-3 turns as the recentSegments string
        const recentSegments = state.transcript
          .slice(-3)
          .map((s) => `${s.speaker}: ${s.text}`)
          .join('\n');
        const suggestion = await generateAmbientSuggestion(recentSegments, previousHeadlines, ctxPacket);
        if (suggestion) {
          const needId = `proactive-${Date.now()}`;
          const need: InformationNeed = {
            id: needId,
            category: suggestion.category as InformationNeed['category'],
            prompt: suggestion.prompt,
            rationale: suggestion.rationale,
            triggeredBySegmentId: latest.id,
            confidence: 0.8,
            priority: 'p1',
            status: 'new',
          };
          dispatch({ type: 'ADD_AI_NEEDS', payload: [need] });
          dispatch({ type: 'ADD_AMBIENT_SUGGESTION', payload: { headline: suggestion.headline, needId, importance: suggestion.importance } });
        }
      }

      // Throttle AI inference: wait for cooldown period AND minimum events
      const now = Date.now();
      const elapsed = now - lastInferenceTimeRef.current;
      if (elapsed < AI_INFERENCE_COOLDOWN_MS || eventsSinceLastInference.current < AI_INFERENCE_MIN_EVENTS) {
        return;
      }

      lastInferenceTimeRef.current = now;
      eventsSinceLastInference.current = 0;

      // Don't add more gaps if already at the cap
      const activeGaps = state.needs.filter((n) => n.status !== 'dismissed').length;
      if (activeGaps >= MAX_ACTIVE_GAPS) return;

      const aiNeeds = await inferNeedsWithAI(latest.text, ctxPacket);
      if (aiNeeds.length > 0) {
        // Only keep critical needs (p1 only, high confidence)
        const filtered = aiNeeds
          .filter((n) => n.priority === 'p1' && n.confidence >= 0.80)
          .slice(0, MAX_ACTIVE_GAPS - activeGaps); // never exceed cap
        if (filtered.length > 0) {
          dispatch({ type: 'ADD_AI_NEEDS', payload: filtered });
        }
      }
    })();
  }, [dispatch, state.ambientSuggestions, state.liveStatus, state.transcript, state.presetActive, state.evidence, state.context]);

  useEffect(() => {
    if (state.liveStatus !== 'ending' || state.transcript.length === 0 || autoEndStartedRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoEndStartedRef.current = true;
      void endMeetingInternal();
    }, GENERATION_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [state.liveStatus, state.transcript.length]);

  const endMeetingInternal = async (): Promise<void> => {
    if (state.isGenerating || state.liveStatus === 'ending' || state.liveStatus === 'ended') {
      return;
    }

    dispatch({ type: 'END_MEETING' });
    dispatch({ type: 'SET_GENERATING', payload: true });

    // Inject hardcoded deliverable for Chen Lab presets — component is self-contained
    if (state.activePresetId && CHEN_LAB_PRESET_IDS.has(state.activePresetId)) {
      setTimeout(() => {
        dispatch({ type: 'SET_GENERATED_CONTENT', payload: { generatedAt: new Date().toISOString() } });
      }, 1800);
      return;
    }

    const transcriptText = state.transcript
      .map((segment) => `${segment.speaker}: ${segment.text}`)
      .join('\n');

    const docs = getAllDocuments();
    const docContext = docs.length
      ? docs.map((doc) => `[${doc.name}]\n${doc.content.slice(0, 3000)}`).join('\n\n---\n\n')
      : '';

    const openGaps: Array<{ label: string; missingQuestion: string }> = state.needs
      .filter((n) => n.status === 'new' || n.status === 'retrieving')
      .map((n) => ({ label: n.category, missingQuestion: n.prompt }));

    try {
      const accountContext = state.context.accountContext || '';
      const [research, qa, actions, slides] = await Promise.all([
        generateResearchSummary(transcriptText, state.evidence, docContext, accountContext),
        generateQAAnswers(transcriptText, state.evidence, docContext, accountContext),
        generateActionItems(transcriptText, openGaps, docContext, accountContext),
        generateSlideDeck(transcriptText, state.evidence, docContext, accountContext)
      ]);

      dispatch({
        type: 'SET_GENERATED_CONTENT',
        payload: { research, qa, actions, slides }
      });
    } catch {
      dispatch({ type: 'SET_GENERATING', payload: false });
    }
  };

  return {
    endMeeting: async () => {
      autoEndStartedRef.current = true;
      await endMeetingInternal();
    }
  };
}
