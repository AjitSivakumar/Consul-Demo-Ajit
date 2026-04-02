const RECALL_API_KEY = process.env.RECALL_API_KEY;
const RECALL_REGION = process.env.RECALL_REGION || 'us-west-2';
const RECALL_BASE = `https://${RECALL_REGION}.recall.ai/api/v1`;

export async function recallFetch(path, options = {}) {
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

export function getWebhookBaseUrl() {
  return process.env.RECALL_WEBHOOK_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3001';
}

export function hasApiKey() {
  return Boolean(RECALL_API_KEY);
}

export function getRegion() {
  return RECALL_REGION;
}
