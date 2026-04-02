import { getBotBuffer } from '../../_lib/transcriptStore.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body;
  const event = payload?.event;
  const botId = payload?.data?.bot?.id;

  if (!botId) {
    console.warn('[Recall Webhook] No botId in payload');
    return res.sendStatus(200);
  }

  if (event === 'transcript.data' || event === 'transcript.partial_data') {
    const words = payload.data?.data?.words || [];
    const participant = payload.data?.data?.participant;
    const text = words.map((w) => w.text).join(' ');
    const speaker = participant?.name || 'Unknown';
    const isPartial = event === 'transcript.partial_data';

    const transcriptEvent = {
      speaker,
      text,
      isPartial,
      timestamp: Date.now(),
      participantId: participant?.id,
    };

    console.log(
      `[Recall Webhook] ${isPartial ? 'partial' : 'final'} | ${speaker}: ${text.substring(0, 80)}`
    );

    // Only store final transcripts
    if (!isPartial) {
      const buf = getBotBuffer(botId);
      buf.events.push(transcriptEvent);
      buf.cursor += 1;
    }
  }

  res.status(200).json({ ok: true });
}
