import { recallFetch, getWebhookBaseUrl, hasApiKey } from '../_lib/recallApi.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!hasApiKey()) {
    return res.status(500).json({ error: 'RECALL_API_KEY not configured on server' });
  }

  const { meetingUrl, botName } = req.body;
  if (!meetingUrl) {
    return res.status(400).json({ error: 'meetingUrl is required' });
  }

  try {
    const webhookBase = getWebhookBaseUrl();
    const bot = await recallFetch('/bot/', {
      method: 'POST',
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: botName || 'Ambi Notetaker',
        recording_config: {
          transcript: {
            provider: { recallai_streaming: {} },
          },
          realtime_endpoints: [
            {
              type: 'webhook',
              url: `${webhookBase}/api/recall/webhook/transcript`,
              events: ['transcript.data', 'transcript.partial_data'],
            },
          ],
        },
      }),
    });

    console.log(`[Recall] Bot created: ${bot.id} for meeting ${meetingUrl}`);
    res.json({ botId: bot.id, status: 'created' });
  } catch (err) {
    console.error('[Recall] Create bot error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
