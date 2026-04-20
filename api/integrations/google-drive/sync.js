const SUPABASE_HEADERS = (key) => ({
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
});

// ── Concurrency limiter (no external deps) ────────────────────────────────────

async function runConcurrent(tasks, limit) {
  const results = [];
  const active = [];
  for (const task of tasks) {
    const p = task().finally(() => active.splice(active.indexOf(p), 1));
    results.push(p);
    active.push(p);
    if (active.length >= limit) await Promise.race(active);
  }
  return Promise.allSettled(results);
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

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

// ── Drive API ─────────────────────────────────────────────────────────────────

async function fetchDriveFiles(accessToken, changesPageToken, folderIds) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // Build folder filter — null means entire Drive
  const folderFilter = folderIds && folderIds.length > 0
    ? `(${folderIds.map((id) => `'${id}' in parents`).join(' or ')}) and trashed=false`
    : 'trashed=false';

  if (changesPageToken) {
    const url = `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(changesPageToken)}&fields=nextPageToken,newStartPageToken,changes(file(id,name,mimeType,modifiedTime,trashed))`;
    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) throw new Error(`Drive changes API failed: ${await res.text()}`);
    const data = await res.json();
    let files = (data.changes || [])
      .filter((c) => c.file && !c.file.trashed)
      .map((c) => c.file);

    // Apply folder filter to incremental results (changes API doesn't support q param)
    if (folderIds && folderIds.length > 0) {
      files = await filterFilesByFolders(files, folderIds, accessToken);
    }

    return { files, newStartPageToken: data.newStartPageToken || changesPageToken };
  } else {
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderFilter)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=200`;
    const res = await fetch(url, { headers: authHeader });
    if (!res.ok) throw new Error(`Drive files list failed: ${await res.text()}`);
    const data = await res.json();

    const tokenRes = await fetch(
      'https://www.googleapis.com/drive/v3/changes/startPageToken',
      { headers: authHeader }
    );
    const tokenData = tokenRes.ok ? await tokenRes.json() : {};
    return { files: data.files || [], newStartPageToken: tokenData.startPageToken || null };
  }
}

// For incremental syncs: verify files still live in selected folders
async function filterFilesByFolders(files, folderIds, accessToken) {
  if (!files.length) return files;
  const folderSet = new Set(folderIds);
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const checked = await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?fields=parents`,
          { headers: authHeader }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const parents = data.parents ?? [];
        return parents.some((p) => folderSet.has(p)) ? file : null;
      } catch {
        return null;
      }
    })
  );

  return checked.filter(Boolean);
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

  return null;
}

// ── AI helpers ────────────────────────────────────────────────────────────────

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

// ── Per-file processor ────────────────────────────────────────────────────────

async function processFile(file, integration, supabaseUrl, serviceRoleKey, existingMap) {
  // Skip if file hasn't changed since last sync
  if (existingMap.get(file.id) === file.modifiedTime) {
    return { status: 'skipped', name: file.name };
  }

  const rawContent = await fetchFileContent(file.id, file.mimeType, integration.access_token);

  if (rawContent === null) {
    return { status: 'skipped', name: file.name, reason: 'unsupported type' };
  }

  const content = rawContent.slice(0, 8000);

  if (!content.trim()) {
    return { status: 'skipped', name: file.name, reason: 'empty content' };
  }

  const { summary, tags, entities, category } = await generateKnowledgeMap(file.name, content);

  // Embed name + summary + tags + actual content — not just metadata summary
  const embeddingInput = [
    file.name,
    summary,
    Array.isArray(tags) ? tags.join(' ') : '',
    content.slice(0, 6000),
  ].filter(Boolean).join('\n\n');

  const embedding = await generateEmbedding(embeddingInput);

  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/group_documents`, {
    method: 'POST',
    headers: {
      ...SUPABASE_HEADERS(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      group_id: integration.group_id,
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
    throw new Error(`Upsert failed for ${file.name}: ${errBody}`);
  }

  return { status: 'synced', name: file.name };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

  if (!userRes.ok) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }

  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  // Load integration row (includes sync_folder_ids if set)
  const integrationRes = await fetch(
    `${supabaseUrl}/rest/v1/group_integrations?group_id=eq.${encodeURIComponent(groupId)}&provider=eq.google_drive&limit=1`,
    { headers: SUPABASE_HEADERS(serviceRoleKey) }
  );

  if (!integrationRes.ok) {
    return res.status(500).json({ error: 'Failed to fetch integration' });
  }

  const integrations = await integrationRes.json();
  if (!integrations.length) {
    return res.status(404).json({ error: 'No Google Drive integration found for this group' });
  }

  let integration = integrations[0];

  // Refresh token if expiring within 5 minutes
  const expiresAt = new Date(integration.token_expiry).getTime();
  if (Date.now() + 5 * 60 * 1000 >= expiresAt) {
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

  // Fetch existing docs to build skip map (drive_file_id → drive_modified_at)
  let existingMap = new Map();
  try {
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/group_documents?group_id=eq.${encodeURIComponent(groupId)}&select=drive_file_id,drive_modified_at`,
      { headers: SUPABASE_HEADERS(serviceRoleKey) }
    );
    if (existingRes.ok) {
      const existing = await existingRes.json();
      existingMap = new Map(existing.map((d) => [d.drive_file_id, d.drive_modified_at]));
    }
  } catch {
    // Non-fatal — will re-process all files
  }

  // Fetch Drive files (with folder filter if configured)
  let files = [];
  let newStartPageToken = integration.changes_page_token || null;
  const folderIds = integration.sync_folder_ids ?? null;

  try {
    const result = await fetchDriveFiles(integration.access_token, integration.changes_page_token, folderIds);
    files = result.files;
    newStartPageToken = result.newStartPageToken;
  } catch (err) {
    return res.status(500).json({ error: `Drive fetch failed: ${err.message}` });
  }

  const filesToProcess = files.slice(0, 200);
  let synced = 0;
  let skipped = 0;

  // Process up to 5 files concurrently
  const tasks = filesToProcess.map((file) => () =>
    processFile(file, integration, supabaseUrl, serviceRoleKey, existingMap)
      .catch((err) => ({ status: 'error', name: file.name, error: err.message }))
  );

  const outcomes = await runConcurrent(tasks, 5);

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      const r = outcome.value;
      if (r.status === 'synced') synced++;
      else skipped++;
    } else {
      skipped++;
    }
  }

  // Update integration metadata
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

  return res.status(200).json({ synced, skipped, total: filesToProcess.length });
}
