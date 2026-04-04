const RECALL_SERVER = import.meta.env.VITE_RECALL_SERVER_URL ?? '';

// ── Types ──

export interface RecallBotInfo {
  botId: string;
  status: string;
}

export interface RecallBotStatus {
  id: string;
  meetingUrl: string;
  botName: string;
  status: string;
  statusSub: string | null;
  statusChanges: Array<{ code: string; sub_code?: string; created_at: string }>;
}

export interface RecallTranscriptEvent {
  speaker: string;
  text: string;
  isPartial: boolean;
  timestamp: number;
  participantId?: number;
}

// ── API calls ──

export interface CreateBotOptions {
  botName?: string;
  languageCode?: string;
  transcriptionMode?: 'prioritize_low_latency' | 'prioritize_quality';
}

export async function createRecallBot(
  meetingUrl: string,
  options?: CreateBotOptions
): Promise<RecallBotInfo> {
  const res = await fetch(`${RECALL_SERVER}/api/recall/bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingUrl, ...options }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to create bot: ${res.status}`);
  }

  return res.json();
}

export async function getRecallBotStatus(botId: string): Promise<RecallBotStatus> {
  const res = await fetch(`${RECALL_SERVER}/api/recall/bot/${encodeURIComponent(botId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to get bot status: ${res.status}`);
  }

  return res.json();
}

export async function stopRecallBot(botId: string): Promise<void> {
  const res = await fetch(`${RECALL_SERVER}/api/recall/bot/${encodeURIComponent(botId)}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Failed to stop bot: ${res.status}`);
  }
}

export async function checkRecallHealth(): Promise<{
  ok: boolean;
  region: string;
  hasApiKey: boolean;
  webhookUrl: string;
}> {
  const res = await fetch(`${RECALL_SERVER}/api/recall/health`);
  if (!res.ok) throw new Error('Recall server not reachable');
  return res.json();
}

// ── Polling-based transcript subscription (works on Vercel serverless) ──

export function subscribeToTranscript(
  botId: string,
  onEvent: (event: RecallTranscriptEvent) => void,
  onError?: (error: Error) => void
): () => void {
  let cursor = 0;
  let active = true;

  const poll = async (): Promise<void> => {
    while (active) {
      try {
        const res = await fetch(
          `${RECALL_SERVER}/api/recall/transcript/${encodeURIComponent(botId)}?cursor=${cursor}`
        );
        if (res.ok) {
          const data: {
            events: RecallTranscriptEvent[];
            cursor: number;
            partials: RecallTranscriptEvent[];
          } = await res.json();

          // Emit final events (advance cursor)
          for (const evt of data.events) {
            onEvent(evt);
          }
          if (data.cursor !== undefined) cursor = data.cursor;

          // Emit latest partials (marked isPartial=true, used for live display)
          for (const partial of data.partials ?? []) {
            onEvent({ ...partial, isPartial: true });
          }
        }
      } catch (err) {
        if (active) {
          onError?.(err instanceof Error ? err : new Error('Polling error'));
        }
      }

      await new Promise((r) => setTimeout(r, 400));
    }
  };

  void poll();

  return () => {
    active = false;
  };
}
