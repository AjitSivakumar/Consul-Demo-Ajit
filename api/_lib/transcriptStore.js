// Transcript store — Upstash Redis in production, in-memory fallback for local dev.
// Required Vercel env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Redis layout:
//   transcript:{botId}          → LIST of final events (RPUSH, atomic append)
//   transcript:{botId}:partial  → HASH of latest partial per speaker (HSET, atomic overwrite)

import { Redis } from '@upstash/redis';

const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let redis = null;
if (useRedis) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const TTL = 60 * 60 * 4; // 4 hours
const listKey    = (id) => `transcript:${id}`;
const partialKey = (id) => `transcript:${id}:partial`;

// ── In-memory fallback (local dev) ──
if (!globalThis.__transcriptStore) globalThis.__transcriptStore = new Map();
function localBuf(botId) {
  if (!globalThis.__transcriptStore.has(botId))
    globalThis.__transcriptStore.set(botId, { finals: [], partials: {} });
  return globalThis.__transcriptStore.get(botId);
}

// ── Public API ──

// Returns { finals: [...], cursor: N, partials: { speaker: event } }
// cursor only counts finals — stable even as partials churn
export async function getBotBuffer(botId) {
  if (!useRedis) {
    const buf = localBuf(botId);
    return { finals: buf.finals, cursor: buf.finals.length, partials: buf.partials };
  }
  const [raw, partialHash] = await Promise.all([
    redis.lrange(listKey(botId), 0, -1),
    redis.hgetall(partialKey(botId)),
  ]);
  const finals = raw.map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
  const partials = {};
  if (partialHash) {
    for (const [speaker, v] of Object.entries(partialHash)) {
      partials[speaker] = typeof v === 'string' ? JSON.parse(v) : v;
    }
  }
  return { finals, cursor: finals.length, partials };
}

export async function appendTranscriptEvent(botId, event) {
  if (!useRedis) {
    const buf = localBuf(botId);
    if (event.isPartial) {
      buf.partials[event.speaker] = event;
    } else {
      delete buf.partials[event.speaker];
      buf.finals.push(event);
    }
    return;
  }
  if (event.isPartial) {
    await redis.hset(partialKey(botId), { [event.speaker]: JSON.stringify(event) });
    await redis.expire(partialKey(botId), TTL);
  } else {
    await Promise.all([
      redis.rpush(listKey(botId), JSON.stringify(event)),
      redis.hdel(partialKey(botId), event.speaker),
    ]);
    await redis.expire(listKey(botId), TTL);
  }
}

export async function clearBotBuffer(botId) {
  if (!useRedis) { globalThis.__transcriptStore.delete(botId); return; }
  await Promise.all([redis.del(listKey(botId)), redis.del(partialKey(botId))]);
}
