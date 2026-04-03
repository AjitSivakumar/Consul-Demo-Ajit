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
  if (process.env.RECALL_WEBHOOK_BASE_URL) return process.env.RECALL_WEBHOOK_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3001';
}

export function hasApiKey() {
  return Boolean(RECALL_API_KEY);
}

export function getRegion() {
  return RECALL_REGION;
}

export function detectPlatform(url) {
  if (/zoom\.us\/j\//i.test(url)) return 'zoom';
  if (/meet\.google\.com\//i.test(url)) return 'google_meet';
  if (/teams\.microsoft\.com\//i.test(url)) return 'teams';
  return 'unknown';
}

export function getPlatformCredentials(platform) {
  const googleId = process.env.RECALL_GOOGLE_CREDENTIAL_ID;
  const zoomId = process.env.RECALL_ZOOM_OAUTH_CREDENTIAL_ID;
  if (platform === 'google_meet' && googleId) {
    return { google_meet: { login_required: true, google_login_group_id: googleId } };
  }
  if (platform === 'zoom' && zoomId) {
    return { zoom: { oauth_credential_id: zoomId } };
  }
  return {};
}
