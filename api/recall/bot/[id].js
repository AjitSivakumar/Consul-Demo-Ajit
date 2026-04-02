import { recallFetch } from '../../_lib/recallApi.js';
import { clearBotBuffer } from '../../_lib/transcriptStore.js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const bot = await recallFetch(`/bot/${id}/`);
      const latestStatus = bot.status_changes?.length
        ? bot.status_changes[bot.status_changes.length - 1]
        : null;
      res.json({
        id: bot.id,
        meetingUrl: bot.meeting_url,
        botName: bot.bot_name,
        status: latestStatus?.code || 'unknown',
        statusSub: latestStatus?.sub_code || null,
        statusChanges: bot.status_changes,
      });
    } catch (err) {
      console.error('[Recall] Get bot error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      await recallFetch(`/bot/${id}/leave/`, { method: 'POST' });
      clearBotBuffer(id);
      console.log(`[Recall] Bot ${id} asked to leave`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Recall] Leave bot error:', err.message);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
