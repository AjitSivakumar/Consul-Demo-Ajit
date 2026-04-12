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

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`Token refresh failed: ${errBody}`);
  }

  const { access_token, expires_in } = await tokenRes.json();
  const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();
  return { access_token, token_expiry: tokenExpiry };
}

async function fetchDriveFiles(accessToken, changesPageToken) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  if (changesPageToken) {
    const url = `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(changesPageToken)}&fields=nextPageToken,newStartPageToken,changes(file(id,name,mimeType,modifiedTime,trashed))`;
    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) throw new Error(`Drive changes API failed: ${await res.text()}`);
    const data = await res.json();
    const files = (data.changes || [])
      .filter((c) => c.file && !c.file.trashed)
      .map((c) => c.file);
    return { files, newStartPageToken: data.newStartPageToken || changesPageToken };
  } else {
    const url = `https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse&fields=files(id,name,mimeType,modifiedTime)&pageSize=50`;
    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) throw new Error(`Drive files list failed: ${await res.text()}`);
    const data = await res.json();
    // Also fetch a start page token for future incremental syncs
    const tokenRes = await fetch(
      'https://www.googleapis.com/drive/v3/changes/startPageToken',
      { headers: authHeader }
    );
    const tokenData = tokenRes.ok ? await tokenRes.json() : {};
    return { files: data.files || [], newStartPageToken: tokenData.startPageToken || null };
  }
}

async function fetchFileContent(fileId, mimeType, accessToken) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  if (mimeType === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`,
      { headers: authHeader }
    );
    if (!res.ok) throw new Error(`Export doc failed: ${res.status}`);
    return await res.text();
  }

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv`,
      { headers: authHeader }
    );
    if (!res.ok) throw new Error(`Export sheet failed: ${res.status}`);
    return await res.text();
  }

  if (mimeType === 'application/vnd.google-apps.presentation') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`,
      { headers: authHeader }
    );
    if (!res.ok) throw new Error(`Export slides failed: ${res.status}`);
    return await res.text();
  }

  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: authHeader }
    );
    if (!res.ok) throw new Error(`Download file failed: ${res.status}`);
    return await res.text();
  }

  return null; // Skip PDFs and binary files
}

async function generateKnowledgeMap(name, content) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `Analyze this document and return JSON with these fields:
- summary: string (2-3 sentences describing what this document contains and its purpose)
- tags: string[] (5-10 lowercase keywords)
- entities: { people: string[], companies: string[], products: string[], amounts: string[], dates: string[] }
- category: one of: battlecard|pricing|account_plan|case_study|contract|notes|other

Document name: ${name}
Content: ${content.slice(0, 4000)}

Return ONLY valid JSON.`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI knowledge map failed: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function generateEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VITE_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Step 1: Verify auth
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
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${userToken}`,
    },
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  // Step 2: Get group integration row
  const integrationRes = await fetch(
    `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive&limit=1`,
    { headers: SUPABASE_HEADERS(serviceRoleKey) }
  );

  if (!integrationRes.ok) {
    const errBody = await integrationRes.text();
    console.error('[Google Drive Sync] Failed to fetch integration:', errBody);
    return res.status(500).json({ error: 'Failed to fetch integration' });
  }

  const integrations = await integrationRes.json();
  if (!integrations.length) {
    return res.status(404).json({ error: 'No Google Drive integration found for this group' });
  }

  let integration = integrations[0];

  // Step 3: Refresh token if expiring within 5 minutes
  const expiresAt = new Date(integration.token_expiry).getTime();
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() + fiveMinutes >= expiresAt) {
    try {
      console.log(`[Google Drive Sync] Refreshing access token for groupId=${groupId}`);
      const refreshed = await refreshAccessToken(integration);
      integration = { ...integration, ...refreshed };

      // Persist updated token
      await fetch(
        `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive`,
        {
          method: 'PATCH',
          headers: SUPABASE_HEADERS(serviceRoleKey),
          body: JSON.stringify({
            access_token: refreshed.access_token,
            token_expiry: refreshed.token_expiry,
          }),
        }
      );
    } catch (err) {
      console.error('[Google Drive Sync] Token refresh error:', err.message);
      return res.status(500).json({ error: `Token refresh failed: ${err.message}` });
    }
  }

  // Step 4: Fetch Drive files
  let files = [];
  let newStartPageToken = integration.changes_page_token || null;

  try {
    const result = await fetchDriveFiles(integration.access_token, integration.changes_page_token);
    files = result.files;
    newStartPageToken = result.newStartPageToken;
    console.log(`[Google Drive Sync] Fetched ${files.length} files for groupId=${groupId}`);
  } catch (err) {
    console.error('[Google Drive Sync] Drive fetch error:', err.message);
    return res.status(500).json({ error: `Drive fetch failed: ${err.message}` });
  }

  // Limit to 20 files per sync
  const filesToProcess = files.slice(0, 20);
  let synced = 0;
  let skipped = 0;

  // Steps 5-8: Process each file
  for (const file of filesToProcess) {
    try {
      // Step 5: Fetch file content
      const rawContent = await fetchFileContent(file.id, file.mimeType, integration.access_token);

      if (rawContent === null) {
        console.log(`[Google Drive Sync] Skipping file (unsupported type): ${file.name} (${file.mimeType})`);
        skipped++;
        continue;
      }

      const content = rawContent.slice(0, 8000);

      if (!content.trim()) {
        console.log(`[Google Drive Sync] Skipping file (empty content): ${file.name}`);
        skipped++;
        continue;
      }

      // Step 6: Generate knowledge map
      const { summary, tags, entities, category } = await generateKnowledgeMap(file.name, content);

      // Step 7: Generate embedding
      const embeddingInput = `${file.name}. ${summary}. ${Array.isArray(tags) ? tags.join(' ') : ''}`;
      const embedding = await generateEmbedding(embeddingInput);

      // Step 8: Upsert to group_documents
      const upsertRes = await fetch(`${supabaseUrl}/rest/v1/group_documents`, {
        method: 'POST',
        headers: {
          ...SUPABASE_HEADERS(serviceRoleKey),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          group_id: groupId,
          integration_id: integration.id,
          drive_file_id: file.id,
          name: file.name,
          summary,
          tags,
          entities,
          category,
          content,
          embedding,
          mime_type: file.mimeType,
          drive_modified_at: file.modifiedTime,
          synced_at: new Date().toISOString(),
          is_active: true,
        }),
      });

      if (!upsertRes.ok) {
        const errBody = await upsertRes.text();
        console.error(`[Google Drive Sync] Failed to upsert doc ${file.name}:`, errBody);
        skipped++;
        continue;
      }

      console.log(`[Google Drive Sync] Synced: ${file.name}`);
      synced++;
    } catch (err) {
      console.error(`[Google Drive Sync] Error processing file ${file.name}:`, err.message);
      skipped++;
    }
  }

  // Step 9: Update group_integrations metadata
  try {
    await fetch(
      `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive`,
      {
        method: 'PATCH',
        headers: SUPABASE_HEADERS(serviceRoleKey),
        body: JSON.stringify({
          changes_page_token: newStartPageToken,
          last_synced_at: new Date().toISOString(),
          doc_count: synced,
          status: 'connected',
        }),
      }
    );
  } catch (err) {
    console.error('[Google Drive Sync] Failed to update integration metadata:', err.message);
  }

  console.log(`[Google Drive Sync] Done for groupId=${groupId}: synced=${synced}, skipped=${skipped}`);
  return res.status(200).json({ synced, skipped, total: filesToProcess.length });
}
