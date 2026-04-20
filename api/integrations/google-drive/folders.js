const SUPABASE_HEADERS = (key) => ({
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
});

async function refreshAccessToken(integration) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!tokenRes.ok) throw new Error(`Token refresh failed: ${await tokenRes.text()}`);
  const { access_token, expires_in } = await tokenRes.json();
  return {
    access_token,
    token_expiry: new Date(Date.now() + expires_in * 1000).toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const userToken = authHeader.slice(7);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${userToken}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Unauthorized' });

  const { groupId } = req.query;
  if (!groupId) return res.status(400).json({ error: 'groupId is required' });

  const integrationRes = await fetch(
    `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive&limit=1`,
    { headers: SUPABASE_HEADERS(serviceRoleKey) }
  );

  if (!integrationRes.ok) return res.status(500).json({ error: 'Failed to fetch integration' });

  const integrations = await integrationRes.json();
  if (!integrations.length) return res.status(404).json({ error: 'No Drive integration found' });

  let integration = integrations[0];

  // Refresh token if expiring within 5 minutes
  if (Date.now() + 5 * 60 * 1000 >= new Date(integration.token_expiry).getTime()) {
    try {
      const refreshed = await refreshAccessToken(integration);
      integration = { ...integration, ...refreshed };
      await fetch(
        `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive`,
        {
          method: 'PATCH',
          headers: SUPABASE_HEADERS(serviceRoleKey),
          body: JSON.stringify({ access_token: refreshed.access_token, token_expiry: refreshed.token_expiry }),
        }
      );
    } catch (err) {
      return res.status(500).json({ error: `Token refresh failed: ${err.message}` });
    }
  }

  // Fetch root folder's actual ID (so it can be used in parent queries)
  let rootFolder = null;
  try {
    const rootRes = await fetch(
      'https://www.googleapis.com/drive/v3/files/root?fields=id',
      { headers: { Authorization: `Bearer ${integration.access_token}` } }
    );
    if (rootRes.ok) {
      const rootData = await rootRes.json();
      rootFolder = { id: rootData.id, name: 'My Drive', isRoot: true };
    }
  } catch { /* non-fatal */ }

  // List all Drive folders
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false");
  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=100&orderBy=name`,
    { headers: { Authorization: `Bearer ${integration.access_token}` } }
  );

  if (!driveRes.ok) {
    return res.status(502).json({ error: `Drive API failed: ${await driveRes.text()}` });
  }

  const data = await driveRes.json();
  const subFolders = (data.files ?? []).map((f) => ({ ...f, isRoot: false }));
  // Root comes first so the UI can pin it at the top
  const folders = rootFolder ? [rootFolder, ...subFolders] : subFolders;
  return res.status(200).json({ folders });
}
