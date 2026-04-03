import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env.local so the server can share the same env file as Vite
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env.local is optional */ }

const app = express();
app.use(cors());
app.use(express.json());

const RECALL_API_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = process.env.RECALL_REGION || 'us-west-2';
const RECALL_BASE = `https://${RECALL_REGION}.recall.ai/api/v1`;
const WEBHOOK_BASE_URL = process.env.RECALL_WEBHOOK_BASE_URL || 'http://localhost:3001';
const RECALL_GOOGLE_CREDENTIAL_ID = process.env.RECALL_GOOGLE_CREDENTIAL_ID;
const RECALL_ZOOM_OAUTH_CREDENTIAL_ID = process.env.RECALL_ZOOM_OAUTH_CREDENTIAL_ID;
const PORT = process.env.RECALL_SERVER_PORT || 3001;

// ── Detect meeting platform from URL ──
function detectPlatform(url) {
  if (/zoom\.us\/j\//i.test(url)) return 'zoom';
  if (/meet\.google\.com\//i.test(url)) return 'google_meet';
  if (/teams\.microsoft\.com\//i.test(url)) return 'teams';
  return 'unknown';
}

// ── In-memory transcript store keyed by botId ──
const transcriptBuffers = new Map(); // botId → { events: [], clients: Set<res> }

function getBotBuffer(botId) {
  if (!transcriptBuffers.has(botId)) {
    transcriptBuffers.set(botId, { events: [], clients: new Set() });
  }
  return transcriptBuffers.get(botId);
}

// ── Helper: call Recall.ai API ──
async function recallFetch(path, options = {}) {
  const res = await fetch(`${RECALL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${RECALL_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Recall API ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── POST /api/recall/bot — Create a bot & send to meeting ──
app.post('/api/recall/bot', async (req, res) => {
  try {
    if (!RECALL_API_KEY) {
      return res.status(500).json({ error: 'RECALL_API_KEY not configured on server' });
    }

    const { meetingUrl, botName } = req.body;
    if (!meetingUrl) {
      return res.status(400).json({ error: 'meetingUrl is required' });
    }

    const hasPublicWebhook = WEBHOOK_BASE_URL && !WEBHOOK_BASE_URL.includes('localhost');
    const platform = detectPlatform(meetingUrl);

    console.log(`[Recall] Detected platform: ${platform} for ${meetingUrl}`);

    const botPayload = {
      meeting_url: meetingUrl,
      bot_name: botName || 'Ambi Notetaker',
      recording_config: {
        transcript: {
          provider: { recallai_streaming: { mode: 'prioritize_low_latency', language_code: 'en' } },
        },
        ...(hasPublicWebhook && {
          realtime_endpoints: [
            {
              type: 'webhook',
              url: `${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`,
              events: ['transcript.data', 'transcript.partial_data'],
            },
          ],
        }),
      },
      // Google Meet: use OAuth login group if configured
      ...(platform === 'google_meet' && RECALL_GOOGLE_CREDENTIAL_ID && {
        google_meet: {
          login_required: true,
          google_login_group_id: RECALL_GOOGLE_CREDENTIAL_ID,
        },
      }),
      // Zoom: use OAuth credential if configured, otherwise bot joins anonymously
      ...(platform === 'zoom' && RECALL_ZOOM_OAUTH_CREDENTIAL_ID && {
        zoom: {
          oauth_credential_id: RECALL_ZOOM_OAUTH_CREDENTIAL_ID,
        },
      }),
    };

    const bot = await recallFetch('/bot/', {
      method: 'POST',
      body: JSON.stringify(botPayload),
    });

    console.log(`[Recall] Bot created: ${bot.id} for meeting ${meetingUrl}`);
    res.json({ botId: bot.id, status: 'created' });
  } catch (err) {
    console.error('[Recall] Create bot error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/recall/bot/:id — Get bot status ──
app.get('/api/recall/bot/:id', async (req, res) => {
  try {
    const bot = await recallFetch(`/bot/${req.params.id}/`);
    const latestStatus = bot.status_changes?.length
      ? bot.status_changes[bot.status_changes.length - 1]
      : null;
    res.json({
      id: bot.id,
      meetingUrl: bot.meeting_url,
      botName: bot.bot_name,
      status: latestStatus?.code || 'unknown',
      statusSub: latestStatus?.sub_code || null,
      statusChanges: bot.status_changes,
    });
  } catch (err) {
    console.error('[Recall] Get bot error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/recall/bot/:id — Remove bot from meeting ──
app.delete('/api/recall/bot/:id', async (req, res) => {
  try {
    await recallFetch(`/bot/${req.params.id}/leave/`, { method: 'POST' });
    console.log(`[Recall] Bot ${req.params.id} asked to leave`);
    // Clean up SSE clients
    const buf = transcriptBuffers.get(req.params.id);
    if (buf) {
      for (const client of buf.clients) {
        client.end();
      }
      transcriptBuffers.delete(req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Recall] Leave bot error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/recall/webhook/transcript — Receive real-time transcript from Recall.ai ──
app.post('/api/recall/webhook/transcript', (req, res) => {
  const payload = req.body;
  const event = payload?.event;
  const botId = payload?.data?.bot?.id;

  if (!botId) {
    console.warn('[Recall Webhook] No botId in payload');
    return res.sendStatus(200);
  }

  if (event === 'transcript.data' || event === 'transcript.partial_data') {
    const words = payload.data?.data?.words || [];
    const participant = payload.data?.data?.participant;
    const text = words.map((w) => w.text).join(' ');
    const speaker = participant?.name || 'Unknown';
    const isPartial = event === 'transcript.partial_data';

    const transcriptEvent = {
      speaker,
      text,
      isPartial,
      timestamp: Date.now(),
      participantId: participant?.id,
    };

    console.log(
      `[Recall Webhook] ${isPartial ? 'partial' : 'final'} | ${speaker}: ${text.substring(0, 80)}`
    );

    const buf = getBotBuffer(botId);
    if (!isPartial) {
      buf.events.push(transcriptEvent);
    }

    // Push to all SSE clients for this bot
    const sseData = JSON.stringify(transcriptEvent);
    for (const client of buf.clients) {
      client.write(`event: transcript\ndata: ${sseData}\n\n`);
    }
  }

  res.sendStatus(200);
});

// ── GET /api/recall/transcript-stream/:botId — SSE stream ──
app.get('/api/recall/transcript-stream/:botId', (req, res) => {
  const { botId } = req.params;
  console.log(`[SSE] Client connected for bot ${botId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send any buffered events
  const buf = getBotBuffer(botId);
  for (const evt of buf.events) {
    res.write(`event: transcript\ndata: ${JSON.stringify(evt)}\n\n`);
  }

  buf.clients.add(res);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    console.log(`[SSE] Client disconnected for bot ${botId}`);
    clearInterval(heartbeat);
    buf.clients.delete(res);
  });
});

// ── GET /api/recall/transcript/:botId — Polling endpoint ──
// Primary: in-memory buffer (filled by webhook in production)
// Fallback: poll Recall.ai API directly (works on localhost without public webhook)
app.get('/api/recall/transcript/:botId', async (req, res) => {
  const { botId } = req.params;
  const cursor = parseInt(req.query.cursor || '0', 10);
  const buf = getBotBuffer(botId);

  // If we have webhook-sourced events, serve those
  if (buf.events.length > 0) {
    const newEvents = buf.events.slice(cursor);
    return res.json({ events: newEvents, cursor: buf.events.length });
  }

  // Fallback: fetch transcript directly from Recall.ai API
  try {
    const data = await recallFetch(`/bot/${botId}/transcript/`);
    const segments = Array.isArray(data) ? data : (data?.results ?? []);

    // Flatten into our RecallTranscriptEvent shape, skipping partials
    const events = [];
    for (const seg of segments) {
      const words = seg.words ?? [];
      if (words.length === 0) continue;
      const text = words.map((w) => w.text).join(' ').trim();
      if (!text) continue;
      events.push({
        speaker: seg.speaker ?? 'Unknown',
        text,
        isPartial: false,
        timestamp: seg.start_timestamp
          ? Math.floor(seg.start_timestamp * 1000)
          : Date.now(),
        participantId: seg.participant?.id,
      });
    }

    // Sync into buffer so SSE clients also receive it
    buf.events = events;

    const newEvents = events.slice(cursor);
    return res.json({ events: newEvents, cursor: events.length });
  } catch (err) {
    console.error('[Recall] Transcript fallback fetch error:', err.message);
    return res.json({ events: [], cursor: 0 });
  }
});

// ── Health check ──
app.get('/api/recall/health', (_req, res) => {
  res.json({
    ok: true,
    region: RECALL_REGION,
    hasApiKey: Boolean(RECALL_API_KEY),
    hasGoogleCredential: Boolean(RECALL_GOOGLE_CREDENTIAL_ID),
    hasZoomCredential: Boolean(RECALL_ZOOM_OAUTH_CREDENTIAL_ID),
    supportedPlatforms: ['google_meet', 'zoom', 'teams'],
    webhookUrl: `${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`,
  });
});

app.listen(PORT, () => {
  console.log(`\n🤖 Ambi Recall.ai server running on http://localhost:${PORT}`);
  console.log(`   Region: ${RECALL_REGION}`);
  console.log(`   Webhook URL: ${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`);
  console.log(`   API Key: ${RECALL_API_KEY ? '✓ configured' : '✗ MISSING — set RECALL_API_KEY'}`);
  console.log(`   Google Meet credential: ${RECALL_GOOGLE_CREDENTIAL_ID ? '✓ configured' : '— not set (bot joins anonymously)'}`);
  console.log(`   Zoom credential: ${RECALL_ZOOM_OAUTH_CREDENTIAL_ID ? '✓ configured' : '— not set (bot joins anonymously)'}`);
  console.log(`\n   For local dev, expose this server with ngrok:`);
  console.log(`   ngrok http ${PORT}`);
  console.log(`   Then set RECALL_WEBHOOK_BASE_URL to the ngrok URL\n`);
});
