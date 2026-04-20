import { extractRelevantChunks, getAllDocuments } from './documentService';
import {
  fetchDocumentContent,
  loadGroupKnowledge,
  searchByEntities,
  searchByTags,
  semanticSearch,
  type KnowledgeDoc,
} from './knowledgeService';
import type { DocumentProvider, SourceAttribution } from '../types/domain';

export interface UnifiedDocument {
  id: string;
  name: string;
  content: string;
  provider: DocumentProvider;
  score: number;
  matchReason: 'chunk' | 'entity' | 'tag' | 'semantic' | 'full';
}

export interface SearchOptions {
  maxChunks?: number;
  maxDriveDocs?: number;
}

// ── Drive doc cache ───────────────────────────────────────────────────────────
let _knowledgeCache: KnowledgeDoc[] = [];
let _cacheGroupId: string | null = null;

// ── Uploaded doc vector store (in-memory, same model as Drive) ────────────────
interface ChunkVector {
  docId: string;
  docName: string;
  chunk: string;
  embedding: number[];
}

let _chunkVectors: ChunkVector[] = [];
let _indexedDocIds = new Set<string>();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function embedTexts(inputs: string[]): Promise<number[][] | null> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey || inputs.length === 0) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: inputs }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.data as Array<{ embedding: number[] }>).map((d) => d.embedding);
  } catch {
    return null;
  }
}

function chunkText(text: string, maxCharsPerChunk = 1500): string[] {
  const rawChunks = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buffer = '';
  for (const raw of rawChunks) {
    if (buffer.length + raw.length > maxCharsPerChunk && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = raw;
    } else {
      buffer += (buffer ? '\n\n' : '') + raw;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

async function ensureUploadedDocsIndexed(): Promise<void> {
  const docs = getAllDocuments();

  // Auto-clear if docs were reset (e.g. meeting reset)
  if (docs.length === 0 && _indexedDocIds.size > 0) {
    _chunkVectors = [];
    _indexedDocIds = new Set();
    return;
  }

  const newDocs = docs.filter((d) => !_indexedDocIds.has(d.id));
  if (newDocs.length === 0) return;

  const allChunks: Array<{ docId: string; docName: string; chunk: string }> = [];
  for (const doc of newDocs) {
    for (const chunk of chunkText(doc.content)) {
      allChunks.push({ docId: doc.id, docName: doc.name, chunk });
    }
  }

  if (allChunks.length > 0) {
    const embeddings = await embedTexts(allChunks.map((c) => c.chunk));
    if (embeddings) {
      for (let i = 0; i < allChunks.length; i++) {
        _chunkVectors.push({ ...allChunks[i], embedding: embeddings[i] });
      }
    }
  }

  // Mark indexed regardless — avoids re-attempting on API failure
  newDocs.forEach((d) => _indexedDocIds.add(d.id));
}

async function semanticSearchUploads(
  query: string,
  maxChunks: number
): Promise<UnifiedDocument[]> {
  if (_chunkVectors.length === 0) return [];

  const queryEmbeddings = await embedTexts([query]);
  if (!queryEmbeddings) return [];

  const queryVec = queryEmbeddings[0];
  return _chunkVectors
    .map((cv) => ({ cv, score: cosineSimilarity(queryVec, cv.embedding) * 100 }))
    .filter((s) => s.score > 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(({ cv, score }) => ({
      id: `upload-${cv.docId}`,
      name: cv.docName,
      content: cv.chunk,
      provider: 'upload' as const,
      score,
      matchReason: 'semantic' as const,
    }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function initRegistry(groupId: string): Promise<void> {
  if (_cacheGroupId === groupId) return;
  _knowledgeCache = await loadGroupKnowledge(groupId);
  _cacheGroupId = groupId;
}

export function clearUploadIndex(): void {
  _chunkVectors = [];
  _indexedDocIds = new Set();
}

export async function search(
  query: string,
  groupId: string | null,
  opts: SearchOptions = {}
): Promise<UnifiedDocument[]> {
  const { maxChunks = 8, maxDriveDocs = 3 } = opts;

  // Index any new uploaded docs (generates embeddings via same model as Drive)
  await ensureUploadedDocsIndexed();

  // Upload semantic search — falls back to keyword if embeddings unavailable
  const uploadDocs: UnifiedDocument[] = _chunkVectors.length > 0
    ? await semanticSearchUploads(query, maxChunks)
    : extractRelevantChunks(query, maxChunks, 1500).map((c) => ({
        id: `upload-${c.docName}`,
        name: c.docName,
        content: c.chunk,
        provider: 'upload' as const,
        score: c.score,
        matchReason: 'chunk' as const,
      }));

  // Drive: entity + tag (sync) + semantic (async, pgvector)
  const entityMatches = searchByEntities(query, _knowledgeCache);
  const tagMatches = searchByTags(query, _knowledgeCache);
  const semanticMatches = groupId
    ? await semanticSearch(query, groupId).catch(() => [])
    : [];

  const driveMatchMap = new Map<string, { doc: KnowledgeDoc; score: number; reason: string }>();
  for (const m of [...entityMatches, ...tagMatches, ...semanticMatches]) {
    const existing = driveMatchMap.get(m.doc.id);
    if (!existing || m.score > existing.score) {
      driveMatchMap.set(m.doc.id, { doc: m.doc, score: m.score, reason: m.reason });
    }
  }

  const topDriveMatches = Array.from(driveMatchMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDriveDocs);

  const driveContents = await Promise.all(
    topDriveMatches.map((m) => fetchDocumentContent(m.doc.id).catch(() => null))
  );

  const driveDocs: UnifiedDocument[] = topDriveMatches.map((m, i) => ({
    id: m.doc.id,
    name: m.doc.name,
    content: driveContents[i]?.slice(0, 2500) ?? m.doc.summary,
    provider: 'google_drive' as const,
    score: m.score,
    matchReason: m.reason as UnifiedDocument['matchReason'],
  }));

  return [...uploadDocs, ...driveDocs].sort((a, b) => b.score - a.score);
}

export function buildContext(docs: UnifiedDocument[]): string {
  return docs
    .map((d) => `[Source: ${d.name}]\n${d.content}`)
    .join('\n\n---\n\n');
}

export function toAttribution(
  doc: UnifiedDocument,
  overrides?: Partial<SourceAttribution>
): SourceAttribution {
  return {
    sourceId: `src-${doc.provider}-${doc.id}-${Date.now()}`,
    sourceType: 'internal_document',
    title: overrides?.title ?? doc.name,
    freshnessScore: 0.9,
    trustScore: 0.85,
    provider: doc.provider,
    docId: doc.id,
    ...overrides,
  };
}

export function buildUploadedContext(maxCharsPerDoc = 3000): string {
  const docs = getAllDocuments();
  if (!docs.length) return '';
  return docs
    .map((d) => `[${d.name}]\n${d.content.slice(0, maxCharsPerDoc)}`)
    .join('\n\n---\n\n');
}

export async function buildDriveContext(
  _groupId: string,
  topN = 5,
  maxCharsPerDoc = 2500
): Promise<string> {
  const top = _knowledgeCache.slice(0, topN);
  if (!top.length) return '';
  const contents = await Promise.all(
    top.map((d) => fetchDocumentContent(d.id).catch(() => null))
  );
  return top
    .map((d, i) => (contents[i] || d.summary ? `[${d.name}]\n${(contents[i] ?? d.summary).slice(0, maxCharsPerDoc)}` : null))
    .filter(Boolean)
    .join('\n\n---\n\n');
}
