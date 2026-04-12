export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const userToken = authHeader.slice(7);

  const { groupId } = req.query;
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase env vars not configured' });
  }

  // Verify user token
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  try {
    // Fetch integration row
    const integrationRes = await fetch(
      `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive&limit=1`,
      { headers: supabaseHeaders }
    );

    if (!integrationRes.ok) {
      const errBody = await integrationRes.text();
      console.error('[Google Drive Status] Failed to fetch integration:', errBody);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }

    const integrations = await integrationRes.json();

    if (!integrations.length) {
      return res.status(200).json({ integration: null, documents: [] });
    }

    const integration = integrations[0];

    // Strip sensitive fields before returning
    const { access_token, refresh_token, ...safeIntegration } = integration;

    // Fetch active documents (no content or embedding)
    const docsRes = await fetch(
      `${supabaseUrl}/rest/v1/group_documents?group_id=eq.${encodeURIComponent(groupId)}&is_active=eq.true&select=id,name,summary,tags,entities,category,drive_modified_at,synced_at`,
      { headers: supabaseHeaders }
    );

    if (!docsRes.ok) {
      const errBody = await docsRes.text();
      console.error('[Google Drive Status] Failed to fetch documents:', errBody);
      return res.status(500).json({ error: 'Failed to fetch documents' });
    }

    const documents = await docsRes.json();

    console.log(
      `[Google Drive Status] groupId=${groupId} integration=${safeIntegration.status} docs=${documents.length}`
    );

    return res.status(200).json({ integration: safeIntegration, documents });
  } catch (err) {
    console.error('[Google Drive Status] Unexpected error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
