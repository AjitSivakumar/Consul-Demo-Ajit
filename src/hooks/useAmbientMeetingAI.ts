import { useEffect, useRef } from 'react';
import {
  detectAmbiTrigger,
  generateActionItems,
  generateAmbientSuggestion,
  generateDirectAmbiResponse,
  generateQAAnswers,
  generateResearchSummary,
  inferNeedsWithAI,
  resolveGapFromDocuments,
  resolveGapFromInternet,
  type MeetingContextPacket,
} from '../services/aiService';
import { buildContext, buildDriveContext, buildUploadedContext, initRegistry, search } from '../services/documentRegistry';
import { useMeetingStore } from '../state/MeetingStore';
import type { EvidenceCard, InformationNeed } from '../types/domain';

const CHEN_LAB_PRESET_IDS = new Set(['chen-tobin-heat', 'chen-tobin-heat-auto', 'patel-lab-vaccine']);

const GENERATION_TIMEOUT_MS = 30000;

type RichFields = Pick<EvidenceCard, 'richChart' | 'richMetricGrid' | 'richCorrectionBlock' | 'richFlowDiagram'>;

function buildEvidenceFromResult(
  need: InformationNeed,
  result: { answer: string; source: string; sourceUrl?: string | null; citations?: Array<{ title: string; url: string }>; confidence: number; provenance?: 'web_search' | 'model_inference'; rich?: Partial<RichFields> },
  fallbackSourceType: 'web' | 'internal_document'
): EvidenceCard {
  const sourceType: EvidenceCard['attributions'][number]['sourceType'] =
    result.provenance === 'model_inference' ? 'model_inference'
    : result.provenance === 'web_search' ? 'web'
    : fallbackSourceType;

  const trustScore = sourceType === 'model_inference' ? 0.55 : sourceType === 'web' ? 0.7 : 0.85;

  // Build one attribution per citation (if available), else fall back to single entry
  const citations = result.citations && result.citations.length > 0 ? result.citations : null;
  const attributions: EvidenceCard['attributions'] = citations
    ? citations.map((c, i) => ({
        sourceId: `src-${sourceType}-${Date.now()}-${i}`,
        sourceType,
        title: c.title,
        url: c.url,
        freshnessScore: 0.9,
        trustScore,
      }))
    : [
        {
          sourceId: `src-${sourceType}-${Date.now()}`,
          sourceType,
          title: result.source,
          url: result.sourceUrl ?? undefined,
          freshnessScore: 0.9,
          trustScore,
        },
      ];

  return {
    id: `evidence-auto-${need.id}-${Date.now()}`,
    needId: need.id,
    title: `Auto-resolved: ${need.prompt.slice(0, 60)}`,
    summary: result.answer,
    kind: 'claim',
    recencyLabel: 'Just resolved',
    confidence: result.confidence,
    attributions,
    triggeredBySegmentId: need.triggeredBySegmentId,
    explainWhyNow: 'Auto-resolved by Ambi during meeting',
    verification: (sourceType === 'web' || sourceType === 'model_inference') ? 'inferred' : 'verified',
    ...result.rich,
  };
}

export function useAmbientMeetingAI(): {
  endMeeting: () => Promise<void>;
} {
  const { state, dispatch } = useMeetingStore();
  const lastTranscriptIdRef = useRef<string | null>(null);
  const autoEndStartedRef = useRef(false);
  const autoResolveQueue = useRef<Set<string>>(new Set());
  const lastInferenceTimeRef = useRef<number>(0);
  const eventsSinceLastInference = useRef<number>(0);

  useEffect(() => {
    if (!state.groupId) return;
    initRegistry(state.groupId).catch(() => {});
  }, [state.groupId]);

  // In liveAI preset mode the transcript replays at 2500ms/event (~32s total for 13 events).
  // Use tight cooldowns so the AI fires multiple times across the script instead of just once.
  const isLiveAIPreset = state.liveAIPreset;
  const AI_INFERENCE_COOLDOWN_MS = isLiveAIPreset ? 5_000 : 20_000;
  const AI_INFERENCE_MIN_EVENTS = isLiveAIPreset ? 2 : 4;
  // Max active information gaps (non-dismissed)
  const MAX_ACTIVE_GAPS = 5;
  // Cooldown between ambient suggestion calls
  const AMBIENT_SUGGESTION_COOLDOWN_MS = isLiveAIPreset ? 6_000 : 10_000;
  const lastAmbientTsRef = useRef<number>(0);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

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
      // For demo needs, also honour resolveDelayMs from the trigger definition
      const delay = need.demoEvidence ? (need.resolveDelayMs ?? 0) : i * 3000;

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

          // 1) Try documents (uploads + Drive) via unified registry
          const docMatches = await search(need.prompt, state.groupId ?? null);
          if (docMatches.length > 0) {
            const docResult = await resolveGapFromDocuments(need.prompt, buildContext(docMatches));
            if (docResult.confidence >= 0.65) {
              const primary = docMatches[0];
              const evidence = buildEvidenceFromResult(need, { ...docResult, source: primary.name }, 'internal_document');
              evidence.attributions = evidence.attributions.map((a) => ({
                ...a, provider: primary.provider, docId: primary.id,
              }));
              dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
              dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId: need.id, status: 'resolved' } });
              return;
            }
          }

          // 2) Fallback: try internet (GPT general knowledge)
          const internetResult = await resolveGapFromInternet(need.prompt, transcriptContext, state.context.meetingType ?? 'sales');
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
  }, [dispatch, state.needs, state.transcript, state.groupId]);

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
        projectContext: state.context.projectContext || '',
        detectedThemes: state.context.discussedThemes ?? [],
        resolvedTopics: state.evidence.map((e) => e.title),
        unresolvedQuestions: state.context.unresolvedQuestions ?? [],
        recentTranscript: (() => {
          // Character-budget window: walk back until we have ~1200 chars of context.
          // More reliable than slice(-10) when Recall.ai produces short/choppy lines.
          const BUDGET = 1200;
          let chars = 0;
          const lines = [...state.transcript]
            .reverse()
            .filter((s) => { chars += s.text.length + s.speaker.length + 2; return chars <= BUDGET; })
            .reverse()
            .map((s) => `${s.speaker}: ${s.text}`);
          return lines.join('\n');
        })(),
        elapsedMinutes: startTime,
        meetingType: state.context.meetingType ?? 'sales',
      };

      // ── Direct Ambi trigger ──────────────────────────────────────────────────
      // If someone says "Ambi, ..." or "Hey Ambi ..." with a question, answer immediately
      const ambiQuestion = detectAmbiTrigger(latest.text);
      if (ambiQuestion) {
        const needId = `ambi-direct-${Date.now()}`;
        // Use 'retrieving' immediately so the auto-resolve useEffect never double-picks this up
        autoResolveQueue.current.add(needId);
        dispatch({
          type: 'ADD_AI_NEEDS',
          payload: [{
            id: needId,
            category: 'direct_query',
            prompt: ambiQuestion,
            rationale: 'Direct question addressed to Ambi',
            triggeredBySegmentId: latest.id,
            confidence: 1.0,
            priority: 'p1',
            status: 'retrieving',
          }],
        });
        void (async () => {
          // Search uploads + Drive via unified registry
          const docMatches = await search(ambiQuestion, state.groupId ?? null, { maxChunks: 6, maxDriveDocs: 3 });
          const docCtx = buildContext(docMatches);

          // Step 1: Try to answer strictly from documents
          const docResult = await generateDirectAmbiResponse(
            ambiQuestion,
            docCtx,
            ctxPacket.recentTranscript,
            ctxPacket.meetingType
          );

          let finalAnswer = docResult.answer;
          let finalSource = docResult.source;
          let finalConfidence = docResult.confidence;
          let finalUsedDocs = docResult.usedDocs;
          let finalSourceUrl: string | undefined = undefined;
          let finalRich: Partial<RichFields> = docResult.rich ?? {};

          // Step 2: If docs didn't have the answer, do a real web search
          if (docResult.confidence < 0.65) {
            const webResult = await resolveGapFromInternet(
              ambiQuestion,
              ctxPacket.recentTranscript,
              ctxPacket.meetingType
            );
            if (webResult.confidence >= 0.65) {
              finalAnswer = webResult.answer;
              finalSource = webResult.source;
              finalConfidence = webResult.confidence;
              finalUsedDocs = false;
              finalSourceUrl = webResult.sourceUrl ?? undefined;
              finalRich = webResult.rich ?? {};
            } else {
              // Neither docs nor web search had a confident answer
              dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId, status: 'failed' } });
              return;
            }
          }

          const evidence: EvidenceCard = {
            id: `evidence-direct-${needId}`,
            needId,
            title: `Ambi: ${ambiQuestion.slice(0, 60)}`,
            summary: finalAnswer,
            kind: 'claim',
            recencyLabel: 'Just answered',
            confidence: finalConfidence,
            attributions: [{
              sourceId: `src-ambi-${Date.now()}`,
              sourceType: finalUsedDocs ? 'internal_document' : 'web',
              title: finalSource,
              url: finalSourceUrl,
              freshnessScore: 1.0,
              trustScore: finalUsedDocs ? 0.9 : 0.75,
              ...(finalUsedDocs && docMatches.length > 0 ? {
                provider: docMatches[0].provider,
                docId: docMatches[0].id,
              } : {}),
            }],
            triggeredBySegmentId: latest.id,
            explainWhyNow: 'You asked Ambi directly',
            verification: finalUsedDocs ? 'verified' : 'inferred',
            ...finalRich,
          };

          dispatch({ type: 'ADD_RESOLVED_EVIDENCE', payload: evidence });
          dispatch({ type: 'UPDATE_NEED_STATUS', payload: { needId, status: 'resolved' } });
        })();
        return; // skip normal inference this tick
      }

      // Only call ambient suggestion if: enough time has passed AND enough words spoken
      const wordCount = latest.text.trim().split(/\s+/).length;
      const ambientElapsed = Date.now() - lastAmbientTsRef.current;
      if (wordCount >= 8 && ambientElapsed >= AMBIENT_SUGGESTION_COOLDOWN_MS) {
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
        // Research gaps are often subtle — allow lower confidence so sanity-check questions surface
        const minConf = ctxPacket.meetingType === 'research' ? 0.55 : 0.70;
        const filtered = aiNeeds
          .filter((n) => n.priority === 'p1' && n.confidence >= minConf)
          .slice(0, MAX_ACTIVE_GAPS - activeGaps); // never exceed cap
        if (filtered.length > 0) {
          dispatch({ type: 'ADD_AI_NEEDS', payload: filtered });
        }
      }
    })();
  }, [dispatch, state.ambientSuggestions, state.liveStatus, state.transcript, state.presetActive, state.liveAIPreset, state.evidence, state.context]);

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
    const s = stateRef.current;
    if (s.isGenerating || s.liveStatus === 'ending' || s.liveStatus === 'ended') {
      return;
    }

    dispatch({ type: 'END_MEETING' });
    dispatch({ type: 'SET_GENERATING', payload: true });

    // Inject hardcoded deliverable for Chen Lab / Patel Lab presets — component is self-contained
    if (s.activePresetId && CHEN_LAB_PRESET_IDS.has(s.activePresetId)) {
      const presetId = s.activePresetId;
      setTimeout(() => {
        dispatch({ type: 'SET_GENERATED_CONTENT', payload: { generatedAt: new Date().toISOString(), presetId } });
      }, 1800);
      return;
    }

    const transcriptText = s.transcript
      .map((segment) => `${segment.speaker}: ${segment.text}`)
      .join('\n');

    const [uploadedCtx, kbCtx] = await Promise.all([
      Promise.resolve(buildUploadedContext(3000)),
      s.groupId ? buildDriveContext(s.groupId, 5, 2500) : Promise.resolve(''),
    ]);
    const docContext = [kbCtx, uploadedCtx].filter(Boolean).join('\n\n---\n\n');

    const openGaps: Array<{ label: string; missingQuestion: string }> = s.needs
      .filter((n) => n.status === 'new' || n.status === 'retrieving')
      .map((n) => ({ label: n.category, missingQuestion: n.prompt }));

    try {
      const accountContext = s.context.accountContext || '';
      const projectContext = s.context.projectContext || '';
      const meetingType = s.context.meetingType ?? 'sales';
      const [research, qa, actions] = await Promise.all([
        generateResearchSummary(transcriptText, s.evidence, docContext, accountContext, meetingType, projectContext),
        generateQAAnswers(transcriptText, s.evidence, docContext, accountContext, meetingType, projectContext),
        generateActionItems(transcriptText, openGaps, docContext, accountContext, meetingType, projectContext),
      ]);

      dispatch({
        type: 'SET_GENERATED_CONTENT',
        payload: { research, qa, actions }
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
