import { getBotBuffer } from '../../_lib/transcriptStore.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { botId } = req.query;
  const cursor = parseInt(req.query.cursor || '0', 10);

  try {
    const { finals, cursor: newCursor, partials } = await getBotBuffer(botId);
    return res.json({
      events: finals.slice(cursor),   // new final events since last poll
      cursor: newCursor,              // stable — only counts finals
      partials: Object.values(partials), // latest partial per speaker (replace on each poll)
    });
  } catch (err) {
    console.error('[Recall] Transcript fetch error:', err.message);
    return res.json({ events: [], cursor: 0, partials: [] });
  }
}
