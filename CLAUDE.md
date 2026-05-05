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

There are no test commands configured in this project. No ESLint or Prettier configs exist — the only code quality gate is TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`). All imports use relative paths; there are no path aliases.

## Architecture

This is **Ambi** — a real-time B2B sales meeting copilot. It's a React 19 SPA (Vite) with an Express backend, deployed to Vercel with serverless functions.

### Two runtimes

| Runtime | Entry | Purpose |
|---|---|---|
| Frontend | `src/main.tsx` → `src/App.tsx` | React SPA — live meeting UI + post-meeting deliverables |
| Backend | `server/index.js` | Express proxy for Recall.ai bot API (avoids CORS + hides key) |
| Vercel functions | `api/recall/` | Serverless equivalents of the Express routes for production |

### Pages

| Route | Page | Notes |
|---|---|---|
| `/` | `LandingPage` | Entry; navigates to `/realtime` |
| `/realtime` | `RealtimeMeetingPage` | 3-column meeting UI — starts via `runner.start()`, ends via `ambientAI.endMeeting()` |
| `/deliverables` | `DeliverablesPage` | Post-meeting output from `state.generatedContent` |
| `/dashboard` | `DashboardPage` | Session history (requires Supabase) |
| `/groups` | `GroupsPage` | Group list (requires Supabase) |
| `/groups/:id` | `GroupDetailPage` | Group detail + sessions |
| `/login` | `LoginPage` | Supabase OAuth |
| `/auth/callback` | `AuthCallbackPage` | OAuth redirect handler |

Supabase auth is **optional** — `App.tsx` gracefully degrades if the client fails to init, and `/realtime` + `/deliverables` work without authentication.

### State management

All meeting state lives in a single React Context + `useReducer` store:
- **`src/state/meetingState.ts`** — `MeetingState` type, `MeetingAction` union, and `meetingReducer`
- **`src/state/MeetingStore.tsx`** — Context provider wrapping the reducer; persists entire state to `localStorage` under key `ambi_meeting_state`
- `liveStatus` drives the entire meeting lifecycle: `idle → listening → paused → ending → ended`
- `ended` triggers navigation to `/deliverables` (see `RealtimeMeetingPage.tsx` line ~51)

**localStorage recovery on refresh:**
- `liveStatus: 'listening'` or `'ending'` → reset to `'paused'` (prevents dangling live state)
- `liveStatus: 'ended'` → reset to `'idle'`
- `isGenerating`, `presetTranscript`, `presetActive`, `scriptAssistMode` always reset
- `notes`, `generatedContent`, `evidence`, and `needs` persist for session recovery
- State is deep-merged with `initialMeetingState` to avoid crashes from schema drift

### Meeting types

Ambi supports two meeting types: `sales` (default) and `research`. Set via `SET_MEETING_CONTEXT` from `PreMeetingModal`. Lives in `MeetingState.context.meetingType` and flows through `MeetingContextPacket` into every AI prompt.

### AI pipeline — three concurrent layers

All layers run from `src/hooks/useAmbientMeetingAI.ts` while `liveStatus === 'listening'`:

**Layer 1 — Sync inference** (`lib/inferenceEngine.ts`):
- Runs synchronously on every `PROCESS_EVENT`, zero latency
- Updates `state.context` (themes, confidence, unresolved questions)
- Contains demo triggers — keyword-based rules for preset mode
- Returns `InformationNeed[]` as fallback when AI is blocked

**Layer 2 — Triggered inference** (`inferNeedsWithAI`):
- Fires every 20s minimum, only after 5+ transcript events
- Returns 0–2 `InformationNeed` items (p1/p2 only, confidence ≥ 0.70)
- Max 5 active (non-dismissed) gaps at once
- **Research system prompt** hunts for: `hypothesis`, `methodology`, `contradiction`, `correction`, `metric`, `open_question` categories (vs. sales categories)

**Layer 3 — Proactive suggestions** (`generateAmbientSuggestion`):
- Fires every 10s minimum, only for segments ≥15 words
- Returns `{ headline, prompt, rationale, category }` or `null`
- Creates a `proactive-{timestamp}` need → renders as neon purple `PROACTIVE` card in Insights Feed

**Auto-resolve pipeline** (triggered immediately on any new `InformationNeed`):
1. Doc search via `documentRegistry` (uploaded + Drive files)
2. Internet search via `knowledgeService.ts` if confidence ≥ 0.65
3. GPT knowledge fallback
4. Mark `failed` if all exhausted
- Staggered by 3s per gap; demo needs honor custom `resolveDelayMs`
- Confidence threshold for resolve: ≥ 0.65

### Document registry

`src/services/documentRegistry.ts` provides a unified search API across document sources:
- **Uploaded files**: local IndexedDB via `documentService.ts` (PDF parsing is **stubbed** — returns a placeholder; pdfjs is not installed)
- **Google Drive**: OAuth-authenticated folder listing + metadata via `useDriveIntegration.ts`
- **OneDrive/SharePoint**: placeholder (not implemented)

Registry is scoped per group (`initRegistry(groupId)`) — groups are document context boundaries.

### Demo presets

Presets live in `src/mock-data/` and are loaded via `LOAD_PRESET` (which **fully resets** state, not merges). Five flags control replay behavior:

| Flag | Effect |
|---|---|
| `presetActive` | Blocks all AI inference; only `inferenceEngine.ts` demo triggers run |
| `liveAIPreset` | Reverses `presetActive` — transcript replays but full AI pipeline runs |
| `scriptAssistMode` | Disables auto-timer; real speech (Recall.ai / inject bar) drives keyword triggers |
| `silentReplay` | Events fire (triggering popups) but lines don't appear in transcript |
| `presetVoiceActivated` | Transcript visible but preset doesn't auto-replay; real speech drives triggers |

**Sales presets:** `src/mock-data/presets.ts`

**Research presets** (`src/mock-data/researchPresets.ts`):
- `axel-02-phase2` — Phase II clinical trial safety review (NSCLC, anti-PD-L1)
- `momentum-q1-validation` — Quant finance live vs backtest Sharpe divergence *(autoPlay: true)*
- `crispr-offtarget-m6` — CRISPR delivery comparison for Nature Methods paper
- `chen-tobin-heat` / `chen-tobin-heat-auto` — Climate/epidemiology; no `demoEvidence` → must auto-resolve via AI; special-cased via `CHEN_LAB_PRESET_IDS` in `useAmbientMeetingAI.ts`

All 3 new research presets have full `demoEvidence` and work correctly in preset mode.

**Need deduplication**: needs are deduplicated by `(prompt, category)` tuple, not by ID.

### End-of-meeting deliverables

All four generators in `aiService.ts` branch on `meetingType` (same function names, different prompts):
- **Sales**: deal gap analysis, objection responses, AE/SE actions, discovery→ROI slides
- **Research**: findings summary + data quality flags, methodology Q&A, PI/team actions, background→next-steps slides

All deliverable generators use temperature 0.1 for deterministic structured output.

### Transcript input modes

Controlled by `src/hooks/useTranscriptRunner.ts`:
- **`ai-live`** — calls `generateLiveTranscriptTurns` (OpenAI) every 3200ms to simulate a B2B sales call
- **`microphone`** — Web Speech API
- **`google-meet`** — Chrome extension (`chrome-extension/`) posts captions via `window.postMessage` with `type: 'ambi-transcript'`
- **`recall-bot`** — Recall.ai bot polls every 1500ms via `src/services/recallService.ts`; server prefers webhook-buffered events but polls API directly if no webhook URL is configured

Mode can be switched mid-session. The runner tracks an event counter starting at 1000 (for unique IDs) and a separate preset cursor for replay.

### Key design constraints

- **Pause bug**: `PAUSE_LISTENING` sets `liveStatus: 'paused'`. Auto-end only triggers on `'ending'` (not `'paused'`). Navigation to `/deliverables` only fires when `SET_GENERATED_CONTENT` sets `liveStatus: 'ended'`.
- **All AI calls use `gpt-4o-mini`** with `dangerouslyAllowBrowser: true` — the OpenAI key is exposed to the browser. This is intentional for the demo; production should route through the Express/Vercel backend.
- **Chen Lab presets** have no `demoEvidence` on triggers — needs auto-resolve via AI. If `presetActive` is true, AI inference is blocked, so those needs stay `'new'` unless auto-resolve runs first. Special-cased via `CHEN_LAB_PRESET_IDS` in `useAmbientMeetingAI.ts`.
- **Direct Ambi queries** fire when trigger word (`ambi`, `amby`, `hambi`, `ambee`) + question is detected — bypasses normal inference, uses `generateDirectAmbiResponse()`, creates a `direct_query` category need.
- **localStorage quota**: errors on write are silently caught; no quota management.

### Environment variables

Defined in `.env` / `.env.local`:
- `VITE_OPENAI_API_KEY` — required for all AI features
- `RECALL_API_KEY` + `RECALL_REGION` — required for Recall.ai bot mode
- `VITE_RECALL_SERVER_URL` — set to `http://localhost:3001` for local dev with Express; leave unset on Vercel (uses same-origin `/api/` routes)
- Supabase vars (see `src/lib/supabase.ts`) — optional; app works without them
