import { supabase } from '../lib/supabase';

export interface KnowledgeDoc {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  entities: {
    people: string[];
    companies: string[];
    products: string[];
    amounts: string[];
    dates: string[];
  };
  category: 'battlecard' | 'pricing' | 'account_plan' | 'case_study' | 'contract' | 'notes' | 'other';
  drive_modified_at: string | null;
  synced_at: string;
}

export interface KnowledgeMatch {
  doc: KnowledgeDoc;
  reason: string; // 'semantic' | 'entity' | 'tag'
  score: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Load all active documents for a group from Supabase.
 */
export async function loadGroupKnowledge(groupId: string): Promise<KnowledgeDoc[]> {
  const { data, error } = await supabase
    .from('group_documents')
    .select('id, name, summary, tags, entities, category, drive_modified_at, synced_at')
    .eq('group_id', groupId)
    .eq('is_active', true);

  if (error) {
    console.error('loadGroupKnowledge error:', error);
    return [];
  }

  return (data ?? []) as KnowledgeDoc[];
}

/**
 * Search documents by matching entities (people, companies, products) found in the text.
 */
export function searchByEntities(text: string, docs: KnowledgeDoc[]): KnowledgeMatch[] {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const matches: KnowledgeMatch[] = [];

  for (const doc of docs) {
    const entityList = [
      ...(doc.entities.people ?? []),
      ...(doc.entities.companies ?? []),
      ...(doc.entities.products ?? []),
    ];

    let score = 0;
    for (const entity of entityList) {
      if (entity && text.toLowerCase().includes(entity.toLowerCase())) {
        score += 20;
      }
    }

    // Also check word-level membership as a fallback
    if (score === 0) {
      for (const entity of entityList) {
        if (!entity) continue;
        const entityWords = entity.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        for (const ew of entityWords) {
          if (words.includes(ew)) {
            score += 20;
            break;
          }
        }
      }
    }

    if (score > 0) {
      matches.push({ doc, reason: 'entity', score });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Search documents by matching their tags against the query terms.
 */
export function searchByTags(query: string, docs: KnowledgeDoc[]): KnowledgeMatch[] {
  const terms = query.toLowerCase().split(/\s+/);

  const matches: KnowledgeMatch[] = [];

  for (const doc of docs) {
    let score = 0;
    for (const tag of doc.tags ?? []) {
      if (terms.includes(tag.toLowerCase())) {
        score += 10;
      }
    }

    if (score > 0) {
      matches.push({ doc, reason: 'tag', score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Semantic search using OpenAI embeddings + Supabase pgvector RPC.
 */
export async function semanticSearch(query: string, groupId: string): Promise<KnowledgeMatch[]> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  });

  if (!embeddingResponse.ok) {
    console.error('Embedding API error:', await embeddingResponse.text());
    return [];
  }

  const embeddingData = await embeddingResponse.json();
  const embedding: number[] = embeddingData.data[0].embedding;

  const { data, error } = await supabase.rpc('search_group_documents', {
    query_embedding: embedding,
    target_group_id: groupId,
    match_count: 5,
  });

  if (error) {
    console.error('semanticSearch RPC error:', error);
    return [];
  }

  return ((data ?? []) as Array<{ similarity: number } & KnowledgeDoc>)
    .filter((r) => r.similarity > 0.5)
    .map((r) => ({
      doc: {
        id: r.id,
        name: r.name,
        summary: r.summary,
        tags: r.tags,
        entities: r.entities,
        category: r.category,
        drive_modified_at: r.drive_modified_at,
        synced_at: r.synced_at,
      },
      reason: 'semantic',
      score: r.similarity * 100,
    }));
}

/**
 * Fetch the full text content of a single document.
 */
export async function fetchDocumentContent(docId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('group_documents')
    .select('content')
    .eq('id', docId)
    .single();

  if (error || !data) {
    console.error('fetchDocumentContent error:', error);
    return null;
  }

  return (data as { content: string | null }).content ?? null;
}

/**
 * Generate a pre-meeting brief using the most relevant docs for the given context.
 */
export async function buildPreMeetingBrief(
  _groupId: string,
  meetingContext: string,
  docs: KnowledgeDoc[]
): Promise<string> {
  if (!docs.length || !meetingContext.trim()) return '';

  // Combine entity + tag results, deduplicate by doc.id, take top 3
  const entityMatches = searchByEntities(meetingContext, docs);
  const tagMatches = searchByTags(meetingContext, docs);

  const seen = new Set<string>();
  const combined: KnowledgeMatch[] = [];
  for (const m of [...entityMatches, ...tagMatches]) {
    if (!seen.has(m.doc.id)) {
      seen.add(m.doc.id);
      combined.push(m);
    }
  }

  const topDocs = combined.slice(0, 3);
  if (!topDocs.length) return '';

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  const prompt = `You are preparing a sales rep for an upcoming meeting.
Meeting context: ${meetingContext}

Relevant internal documents found:
${topDocs.map((m) => `- ${m.doc.name} (${m.doc.category}): ${m.doc.summary}`).join('\n')}

Write 3-5 concise bullet points the rep should know going into this meeting. Be specific and actionable. No fluff.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.error('buildPreMeetingBrief API error:', await response.text());
    return '';
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

/**
 * Return documents that have not been updated or synced in the last 90 days.
 */
export function detectStaleDocuments(docs: KnowledgeDoc[]): KnowledgeDoc[] {
  const now = Date.now();

  return docs.filter((doc) => {
    const modifiedStale =
      doc.drive_modified_at !== null &&
      now - new Date(doc.drive_modified_at).getTime() > NINETY_DAYS_MS;

    const syncedStale = now - new Date(doc.synced_at).getTime() > NINETY_DAYS_MS;

    return modifiedStale || syncedStale;
  });
}
