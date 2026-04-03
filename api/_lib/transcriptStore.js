// Transcript store — uses Upstash Redis in production, in-memory fallback for local dev.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars.

import { Redis } from '@upstash/redis';

const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let redis = null;
if (useRedis) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const TRANSCRIPT_TTL_SECONDS = 60 * 60 * 4; // 4 hours
const redisKey = (botId) => `transcript:${botId}`;

// ── In-memory fallback (local dev only) ──
if (!globalThis.__transcriptStore) {
  globalThis.__transcriptStore = new Map();
}
function getLocalBuffer(botId) {
  const store = globalThis.__transcriptStore;
  if (!store.has(botId)) store.set(botId, { events: [], cursor: 0 });
  return store.get(botId);
}

// ── Public API ──

export async function getBotBuffer(botId) {
  if (!useRedis) return getLocalBuffer(botId);
  const data = await redis.get(redisKey(botId));
  return data ?? { events: [], cursor: 0 };
}

export async function appendTranscriptEvent(botId, event) {
  if (!useRedis) {
    const buf = getLocalBuffer(botId);
    buf.events.push(event);
    buf.cursor = buf.events.length;
    return;
  }
  const key = redisKey(botId);
  const current = (await redis.get(key)) ?? { events: [], cursor: 0 };
  current.events.push(event);
  current.cursor = current.events.length;
  await redis.set(key, current, { ex: TRANSCRIPT_TTL_SECONDS });
}

export async function clearBotBuffer(botId) {
  if (!useRedis) {
    globalThis.__transcriptStore.delete(botId);
    return;
  }
  await redis.del(redisKey(botId));
}
