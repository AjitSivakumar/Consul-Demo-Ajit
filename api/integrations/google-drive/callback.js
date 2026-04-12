export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error } = req.query;

  // Parse state early so we can redirect to the group page on error
  let groupId = null;
  let userId = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    groupId = decoded.groupId;
    userId = decoded.userId;
  } catch (err) {
    console.error('[Google Drive] Failed to parse state param:', err.message);
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const redirectBase = `/groups/${groupId}`;

  if (error) {
    console.error('[Google Drive] OAuth error from Google:', error);
    return res.redirect(`${redirectBase}?drive=error`);
  }

  if (!code) {
    console.error('[Google Drive] No authorization code received');
    return res.redirect(`${redirectBase}?drive=error`);
  }

  try {
    // Exchange authorization code for tokens
    const redirectUri = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/integrations/google-drive/callback`
      : 'http://localhost:3001/api/integrations/google-drive/callback';

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Google Drive] Token exchange failed:', errBody);
      return res.redirect(`${redirectBase}?drive=error`);
    }

    const { access_token, refresh_token, expires_in } = await tokenRes.json();

    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[Google Drive] Supabase env vars not configured');
      return res.redirect(`${redirectBase}?drive=error`);
    }

    // Upsert integration row in Supabase
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/group_integrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        group_id: groupId,
        provider: 'google_drive',
        access_token,
        refresh_token,
        token_expiry: tokenExpiry,
        status: 'connected',
      }),
    });

    if (!upsertRes.ok) {
      const errBody = await upsertRes.text();
      console.error('[Google Drive] Supabase upsert failed:', errBody);
      return res.redirect(`${redirectBase}?drive=error`);
    }

    console.log(`[Google Drive] Connected successfully for groupId=${groupId} userId=${userId}`);
    return res.redirect(`${redirectBase}?drive=connected`);
  } catch (err) {
    console.error('[Google Drive] Callback error:', err.message);
    return res.redirect(`${redirectBase}?drive=error`);
  }
}
