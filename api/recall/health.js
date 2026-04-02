import { hasApiKey, getRegion, getWebhookBaseUrl } from '../_lib/recallApi.js';

export default function handler(_req, res) {
  res.json({
    ok: true,
    region: getRegion(),
    hasApiKey: hasApiKey(),
    webhookUrl: `${getWebhookBaseUrl()}/api/recall/webhook/transcript`,
  });
}
