import { appendTranscriptEvent } from '../../_lib/transcriptStore.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body;
  const event = payload?.event;
  const botId = payload?.data?.bot?.id;

  if (!botId) {
    return res.status(200).json({ ok: true });
  }

  if (event === 'transcript.data' || event === 'transcript.partial_data') {
    const words = payload.data?.data?.words || [];
    const participant = payload.data?.data?.participant;
    const text = words.map((w) => w.text).join(' ').trim();
    if (!text) return res.status(200).json({ ok: true });

    const speaker = participant?.name || 'Unknown';
    const isPartial = event === 'transcript.partial_data';

    console.log(`[Recall Webhook] ${isPartial ? 'partial' : 'final'} | ${speaker}: ${text.substring(0, 80)}`);

    await appendTranscriptEvent(botId, {
      speaker,
      text,
      isPartial,
      timestamp: Date.now(),
      participantId: participant?.id,
    });
  }

  return res.status(200).json({ ok: true });
}
