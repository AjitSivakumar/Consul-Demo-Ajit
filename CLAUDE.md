# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (Vite, localhost:5173)
npm run dev

# Backend server only (Express, localhost:3001) — needed for Recall.ai bot features
npm run dev:recall

# Both frontend + backend concurrently
npm run dev:all

# Type-check + production build
npm run build

# Preview production build
npm run preview
```

There are no test commands configured in this project.

## Architecture

This is **Ambi** — a real-time B2B sales meeting copilot. It's a React 19 SPA (Vite) with an Express backend, deployed to Vercel with serverless functions.

### Two runtimes

| Runtime | Entry | Purpose |
|---|---|---|
| Frontend | `src/main.tsx` → `src/App.tsx` | React SPA — live meeting UI + post-meeting deliverables |
| Backend | `server/index.js` | Express proxy for Recall.ai bot API (avoids CORS + hides key) |
| Vercel functions | `api/recall/` | Serverless equivalents of the Express routes for production |

### State management

All meeting state lives in a single React Context + `useReducer` store:
- **`src/state/meetingState.ts`** — `MeetingState` type, `MeetingAction` union, and `meetingReducer`
- **`src/state/MeetingStore.tsx`** — Context provider wrapping the reducer
- `liveStatus` drives the entire meeting lifecycle: `idle → listening → paused → ending → ended`
- `ended` triggers navigation to `/deliverables` (see `RealtimeMeetingPage.tsx` line ~51)

### Meeting types

Ambi supports two meeting types: `sales` (default) and `research`. Set via `SET_MEETING_CONTEXT` from `PreMeetingModal`. Lives in `MeetingState.context.meetingType` and flows through `MeetingContextPacket` into every AI prompt.

### Two main pages

**`/` — `RealtimeMeetingPage`**: 3-column layout (Insights Feed | Deep Dive | Sources + Transcript). Meeting starts via `runner.start()`, ends via `ambientAI.endMeeting()`.

**`/deliverables` — `DeliverablesPage`**: Displays post-meeting generated content (research, Q&A, actions, slides) from `state.generatedContent`.

### AI pipeline — two parallel tracks

Both run from `src/hooks/useAmbientMeetingAI.ts`, triggered on every new transcript event while `liveStatus === 'listening'`:

**Proactive track** (`generateAmbientSuggestion`):
- Fires every 10s minimum, only for segments ≥15 words
- Returns structured `{ headline, prompt, rationale, category }` or `null`
- Creates a real `InformationNeed` (id: `proactive-{timestamp}`) via `ADD_AI_NEEDS`
- Links it via `ADD_AMBIENT_SUGGESTION` → renders as neon purple `PROACTIVE` card in Insights Feed
- Clicking the card opens the same `DeepDivePanel` as triggered needs

**Triggered track** (`inferNeedsWithAI`):
- Fires every 20s minimum, only after 5+ transcript events
- Returns 0–2 `InformationNeed` items (p1/p2 only, confidence ≥ 0.70)
- Auto-resolve pipeline immediately tries: uploaded docs → GPT knowledge → mark failed
- Confidence threshold for resolve: ≥ 0.65
- **Research system prompt** hunts for: `hypothesis`, `methodology`, `contradiction`, `correction`, `metric`, `open_question` categories (vs. sales categories)

### Demo presets

Presets live in `src/mock-data/` and are loaded via `LOAD_PRESET`. When `presetActive: true`, **all AI inference is blocked** — only `inferenceEngine.ts` runs, checking `demoTriggers`. Each trigger fires at most once (first match wins).

**Sales presets:** existing presets in `meetingPresets.ts`

**Research presets** (`src/mock-data/researchPresets.ts`):
- `axel-02-phase2` — Phase II clinical trial safety review (NSCLC, anti-PD-L1)
- `momentum-q1-validation` — Quant finance live vs backtest Sharpe divergence *(autoPlay: true)*
- `crispr-offtarget-m6` — CRISPR delivery comparison for Nature Methods paper
- `chen-tobin-heat` / `chen-tobin-heat-auto` — Climate/epidemiology (existing; no `demoEvidence` → auto-resolves via AI, handled by `CHEN_LAB_PRESET_IDS` special case)

All 3 new research presets have full `demoEvidence` and work correctly in preset mode.

### End-of-meeting deliverables

All four generators in `aiService.ts` branch on `meetingType`:
- **Sales**: deal gap analysis, objection responses, AE/SE actions, discovery→ROI slides
- **Research**: findings summary + data quality flags, methodology Q&A, PI/team actions, background→next-steps slides

### Transcript input modes

Controlled by `src/hooks/useTranscriptRunner.ts`:
- **`ai-live`** — calls `generateLiveTranscriptTurns` (OpenAI) every 3200ms to simulate a B2B sales call
- **`microphone`** — Web Speech API
- **`google-meet`** — Chrome extension (`chrome-extension/`) posts captions via `window.postMessage`
- **`recall-bot`** — Recall.ai bot polls every 1500ms via `src/services/recallService.ts`

### Key design constraints

- **Pause bug**: `PAUSE_LISTENING` sets `liveStatus: 'paused'`. Auto-end only triggers on `'ending'` (not `'paused'`). The navigation to `/deliverables` only fires when `SET_GENERATED_CONTENT` sets `liveStatus: 'ended'`.
- **All AI calls use `gpt-4o-mini`** with `dangerouslyAllowBrowser: true` — the OpenAI key is exposed to the browser. This is intentional for the demo; production should route through the Express/Vercel backend.
- **PDF parsing is stubbed** in `documentService.ts` — returns a placeholder string. pdfjs is not installed. Uploaded PDFs yield no useful doc context for research queries.
- **`src/lib/inferenceEngine.ts`** is a keyword-based fallback inference engine (no AI calls). It runs synchronously on every `PROCESS_EVENT` to update `state.context` (themes, unresolved questions, confidence scores).
- **Chen Lab presets** have no `demoEvidence` on triggers — needs auto-resolve via AI. If `presetActive` is true, AI inference is blocked, so those needs stay `'new'` unless auto-resolve runs first. Special-cased via `CHEN_LAB_PRESET_IDS` in `useAmbientMeetingAI.ts`.
- **Direct Ambi queries** fire when trigger word (`ambi`, `amby`, `hambi`, `ambee`) + question is detected — bypasses normal inference, uses `generateDirectAmbiResponse()`, creates a `direct_query` category need.

### Environment variables

Defined in `.env` / `.env.local`:
- `VITE_OPENAI_API_KEY` — required for all AI features
- `RECALL_API_KEY` + `RECALL_REGION` — required for Recall.ai bot mode
- `VITE_RECALL_SERVER_URL` — set to `http://localhost:3001` for local dev with Express; leave unset on Vercel (uses same-origin `/api/` routes)
