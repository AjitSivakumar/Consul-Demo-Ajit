// Transcript store — Upstash Redis in production, in-memory fallback for local dev.
// Required Vercel env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Redis layout:
//   transcript:{botId}          → LIST of final transcript events (RPUSH, atomic)
//   transcript:{botId}:partial  → HASH of latest partial per speaker (HSET, atomic)

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
const partialKey = (botId) => `transcript:${botId}:partial`;

// ── In-memory fallback (local dev only) ──
if (!globalThis.__transcriptStore) {
  globalThis.__transcriptStore = new Map();
}
function getLocalBuffer(botId) {
  const store = globalThis.__transcriptStore;
  if (!store.has(botId)) store.set(botId, { finals: [], partials: {} });
  return store.get(botId);
}

// ── Public API ──

// Returns { events: [...finals, ...currentPartials], length: N }
// length only counts finals so cursor stays stable
export async function getBotBuffer(botId) {
  if (!useRedis) {
    const buf = getLocalBuffer(botId);
    const partialEvents = Object.values(buf.partials);
    return { events: [...buf.finals, ...partialEvents], length: buf.finals.length };
  }

  const [raw, partialHash] = await Promise.all([
    redis.lrange(listKey(botId), 0, -1),
    redis.hgetall(partialKey(botId)),
  ]);

  const finals = raw.map((item) => (typeof item === 'string' ? JSON.parse(item) : item));
  const partials = partialHash
    ? Object.values(partialHash).map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
    : [];

  return { events: [...finals, ...partials], length: finals.length };
}

export async function appendTranscriptEvent(botId, event) {
  if (!useRedis) {
    const buf = getLocalBuffer(botId);
    if (event.isPartial) {
      buf.partials[event.speaker] = event;
    } else {
      delete buf.partials[event.speaker];
      buf.finals.push(event);
    }
    return;
  }

  if (event.isPartial) {
    // Overwrite latest partial for this speaker atomically
    await redis.hset(partialKey(botId), { [event.speaker]: JSON.stringify(event) });
    await redis.expire(partialKey(botId), TRANSCRIPT_TTL_SECONDS);
  } else {
    // Finalized: append to list and clear speaker's partial
    await Promise.all([
      redis.rpush(listKey(botId), JSON.stringify(event)),
      redis.hdel(partialKey(botId), event.speaker),
    ]);
    await redis.expire(listKey(botId), TRANSCRIPT_TTL_SECONDS);
  }
}

export async function clearBotBuffer(botId) {
  if (!useRedis) {
    globalThis.__transcriptStore.delete(botId);
    return;
  }
  await Promise.all([redis.del(listKey(botId)), redis.del(partialKey(botId))]);
}
