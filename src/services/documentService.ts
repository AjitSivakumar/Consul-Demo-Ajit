/**
 * Document Service
 * Handles uploading and retrieving documents during a meeting session
 * For production, this would use vector embeddings from OpenAI / Pinecone
 */

export interface UploadedDocument {
  id: string;
  name: string;
  content: string;
  uploadedAt: string;
  type: 'pdf' | 'text' | 'url';
}

let uploadedDocs: UploadedDocument[] = [];

/**
 * Upload a document (text or file)
 */
export async function uploadDocument(
  name: string,
  content: string,
  type: 'text' | 'pdf' = 'text'
): Promise<UploadedDocument> {
  const doc: UploadedDocument = {
    id: `doc-${Date.now()}`,
    name,
    content,
    uploadedAt: new Date().toISOString(),
    type,
  };

  uploadedDocs.push(doc);
  console.log(`Uploaded document: ${name} (${content.length} chars)`);
  return doc;
}

/**
 * Retrieve documents relevant to a query
 * Scores by keyword matches and returns the most relevant sections
 */
export function retrieveRelevantDocuments(query: string, maxResults = 3): UploadedDocument[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

  const scored = uploadedDocs.map((doc) => {
    const contentLower = doc.content.toLowerCase();
    const hits = queryTerms.filter((term) => contentLower.includes(term)).length;
    // Boost score by number of occurrences, not just presence
    const occurrences = queryTerms.reduce((sum, term) => {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return sum + (doc.content.match(regex)?.length ?? 0);
    }, 0);
    return { doc, score: hits * 10 + occurrences };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.doc);
}

/**
 * Extract the most relevant chunks from documents for a given question.
 * Splits each document into ~paragraph-sized chunks and returns the best-matching ones.
 */
export function extractRelevantChunks(
  question: string,
  maxChunks = 8,
  maxCharsPerChunk = 1500
): Array<{ docName: string; chunk: string; score: number }> {
  const queryTerms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

  const allChunks: Array<{ docName: string; chunk: string; score: number }> = [];

  for (const doc of uploadedDocs) {
    // Split into chunks by double-newline (section breaks) or every ~1500 chars
    const rawChunks = doc.content.split(/\n{2,}/);
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

    for (const chunk of chunks) {
      const lower = chunk.toLowerCase();
      const hits = queryTerms.filter((t) => lower.includes(t)).length;
      if (hits === 0) continue;
      const occurrences = queryTerms.reduce((sum, term) => {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        return sum + (chunk.match(regex)?.length ?? 0);
      }, 0);
      allChunks.push({ docName: doc.name, chunk, score: hits * 10 + occurrences });
    }
  }

  return allChunks.sort((a, b) => b.score - a.score).slice(0, maxChunks);
}

/**
 * Get all uploaded documents
 */
export function getAllDocuments(): UploadedDocument[] {
  return [...uploadedDocs];
}

/**
 * Clear all documents (for meeting reset)
 */
export function clearDocuments(): void {
  uploadedDocs = [];
}

/**
 * Extract text from a file
 * For production, use a proper PDF parser
 */
export async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (file.name.endsWith('.pdf')) {
        resolve(`[PDF] ${file.name}: Unable to parse PDF in browser. Replace with pdfjs.`);
      } else if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          resolve(JSON.stringify(parsed, null, 2));
        } catch {
          resolve(content); // fall back to raw text if invalid JSON
        }
      } else {
        resolve(content);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
