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
const PORT = process.env.RECALL_SERVER_PORT || 3001;

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

    const bot = await recallFetch('/bot/', {
      method: 'POST',
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: botName || 'Ambi Notetaker',
        recording_config: {
          transcript: {
            provider: { recallai_streaming: {} },
          },
          realtime_endpoints: [
            {
              type: 'webhook',
              url: `${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`,
              events: ['transcript.data', 'transcript.partial_data'],
            },
          ],
        },
      }),
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

// ── GET /api/recall/transcript/:botId — Polling endpoint (matches Vercel API) ──
app.get('/api/recall/transcript/:botId', (req, res) => {
  const { botId } = req.params;
  const cursor = parseInt(req.query.cursor || '0', 10);
  const buf = getBotBuffer(botId);
  const newEvents = buf.events.slice(cursor);
  res.json({ events: newEvents, cursor: buf.events.length });
});

// ── Health check ──
app.get('/api/recall/health', (_req, res) => {
  res.json({
    ok: true,
    region: RECALL_REGION,
    hasApiKey: Boolean(RECALL_API_KEY),
    webhookUrl: `${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`,
  });
});

app.listen(PORT, () => {
  console.log(`\n🤖 Ambi Recall.ai server running on http://localhost:${PORT}`);
  console.log(`   Region: ${RECALL_REGION}`);
  console.log(`   Webhook URL: ${WEBHOOK_BASE_URL}/api/recall/webhook/transcript`);
  console.log(`   API Key: ${RECALL_API_KEY ? '✓ configured' : '✗ MISSING — set RECALL_API_KEY'}`);
  console.log(`\n   For local dev, expose this server with ngrok:`);
  console.log(`   ngrok http ${PORT}`);
  console.log(`   Then set RECALL_WEBHOOK_BASE_URL to the ngrok URL\n`);
});
