import { hasApiKey, getRegion, getWebhookBaseUrl } from '../_lib/recallApi.js';
import { getBotBuffer } from '../_lib/transcriptStore.js';

export default async function handler(_req, res) {
  const webhookUrl = `${getWebhookBaseUrl()}/api/recall/webhook/transcript`;
  const useRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

  let storageStatus = 'memory:local-only';
  if (useRedis) {
    try {
      await getBotBuffer('__health__');
      storageStatus = 'redis:ok';
    } catch (err) {
      storageStatus = `redis:error:${err.message}`;
    }
  }

  res.json({
    ok: true,
    region: getRegion(),
    hasApiKey: hasApiKey(),
    webhookUrl,
    storage: storageStatus,
  });
}
