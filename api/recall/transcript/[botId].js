import { getBotBuffer } from '../../_lib/transcriptStore.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { botId } = req.query;
  const cursor = parseInt(req.query.cursor || '0', 10);

  try {
    const { events, length } = await getBotBuffer(botId);
    return res.json({ events: events.slice(cursor), cursor: length });
  } catch (err) {
    console.error('[Recall] Transcript fetch error:', err.message);
    return res.json({ events: [], cursor: 0 });
  }
}
