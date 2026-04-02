// Global in-memory transcript store
// Persists across warm function invocations on the same Vercel instance.
// For production at scale, replace with Vercel KV or Upstash Redis.

if (!globalThis.__transcriptStore) {
  globalThis.__transcriptStore = new Map(); // botId → { events: [], cursor: 0 }
}

export function getBotBuffer(botId) {
  const store = globalThis.__transcriptStore;
  if (!store.has(botId)) {
    store.set(botId, { events: [], cursor: 0 });
  }
  return store.get(botId);
}

export function clearBotBuffer(botId) {
  globalThis.__transcriptStore.delete(botId);
}
