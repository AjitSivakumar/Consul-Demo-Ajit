import { hasApiKey, getRegion, getWebhookBaseUrl } from '../_lib/recallApi.js';
import { getBotBuffer } from '../_lib/transcriptStore.js';

export default async function handler(_req, res) {
  const webhookUrl = `${getWebhookBaseUrl()}/api/recall/webhook/transcript`;
  const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  let redisOk = false;
  let redisError = null;
  if (useRedis) {
    try {
      // Test Redis connectivity with a benign read
      await getBotBuffer('__health_check__');
      redisOk = true;
    } catch (err) {
      redisError = err.message;
    }
  }

  res.json({
    ok: true,
    region: getRegion(),
    hasApiKey: hasApiKey(),
    webhookUrl,
    storage: useRedis ? (redisOk ? 'redis:ok' : `redis:error:${redisError}`) : 'memory:local-only',
  });
}
