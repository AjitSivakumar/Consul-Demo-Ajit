import { getBotBuffer } from '../../_lib/transcriptStore.js';
import { recallFetch } from '../../_lib/recallApi.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { botId } = req.query;
  const cursor = parseInt(req.query.cursor || '0', 10);

  const buf = getBotBuffer(botId);

  // Serve from in-memory buffer if webhook has populated it
  if (buf.events.length > 0) {
    return res.json({ events: buf.events.slice(cursor), cursor: buf.events.length });
  }

  // Fallback: pull transcript directly from Recall.ai API
  // (handles serverless cold instances where webhook landed on a different instance)
  try {
    const data = await recallFetch(`/bot/${botId}/transcript/`);
    const segments = Array.isArray(data) ? data : (data?.results ?? []);

    const events = [];
    for (const seg of segments) {
      const words = seg.words ?? [];
      if (words.length === 0) continue;
      const text = words.map((w) => w.text).join(' ').trim();
      if (!text) continue;
      events.push({
        speaker: seg.speaker ?? 'Unknown',
        text,
        isPartial: false,
        timestamp: seg.start_timestamp ? Math.floor(seg.start_timestamp * 1000) : Date.now(),
        participantId: seg.participant?.id,
      });
    }

    buf.events = events;
    return res.json({ events: events.slice(cursor), cursor: events.length });
  } catch {
    return res.json({ events: [], cursor: 0 });
  }
}
