export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { groupId, userId } = req.query;

  if (!groupId || !userId) {
    return res.status(400).json({ error: 'groupId and userId are required' });
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured on server' });
  }

  const redirectUri = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/integrations/google-drive/callback`
    : 'http://localhost:3001/api/integrations/google-drive/callback';

  const state = Buffer.from(JSON.stringify({ groupId, userId })).toString('base64');

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  console.log(`[Google Drive] Redirecting groupId=${groupId} userId=${userId} to OAuth consent screen`);
  res.redirect(oauthUrl);
}
