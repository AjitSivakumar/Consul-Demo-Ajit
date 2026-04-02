import { getBotBuffer } from '../../_lib/transcriptStore.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { botId } = req.query;
  const cursor = parseInt(req.query.cursor || '0', 10);

  const buf = getBotBuffer(botId);
  const newEvents = buf.events.slice(cursor);

  res.json({
    events: newEvents,
    cursor: buf.events.length,
  });
}
