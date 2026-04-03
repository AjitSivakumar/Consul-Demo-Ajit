// Transcript store — uses Upstash Redis in production, in-memory fallback for local dev.
// Required Vercel env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Redis layout: each bot uses a LIST key `transcript:{botId}`.
// RPUSH appends atomically — no read-modify-write race under concurrent webhook calls.

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
const listKey = (botId) => `transcript:${botId}`;

// ── In-memory fallback (local dev only) ──
if (!globalThis.__transcriptStore) {
  globalThis.__transcriptStore = new Map();
}
function getLocalBuffer(botId) {
  const store = globalThis.__transcriptStore;
  if (!store.has(botId)) store.set(botId, []);
  return store.get(botId);
}

// ── Public API ──

// Returns { events: [...], length: N }
export async function getBotBuffer(botId) {
  if (!useRedis) {
    const events = getLocalBuffer(botId);
    return { events, length: events.length };
  }
  const key = listKey(botId);
  // LRANGE 0 -1 returns all elements atomically
  const raw = await redis.lrange(key, 0, -1);
  const events = raw.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
  return { events, length: events.length };
}

// Atomically appends a single event — safe under concurrent webhook calls
export async function appendTranscriptEvent(botId, event) {
  if (!useRedis) {
    getLocalBuffer(botId).push(event);
    return;
  }
  const key = listKey(botId);
  await redis.rpush(key, JSON.stringify(event));
  // Reset TTL on every append so active meetings don't expire
  await redis.expire(key, TRANSCRIPT_TTL_SECONDS);
}

export async function clearBotBuffer(botId) {
  if (!useRedis) {
    globalThis.__transcriptStore.delete(botId);
    return;
  }
  await redis.del(listKey(botId));
}
