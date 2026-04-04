import { useState } from 'react';

export interface BotSettings {
  botName: string;
  languageCode: string;
  transcriptionMode: 'prioritize_low_latency' | 'prioritize_quality';
  autoStartListening: boolean;
}

const STORAGE_KEY = 'ambi_bot_settings';

const defaults: BotSettings = {
  botName: 'Ambi Notetaker',
  languageCode: 'en',
  transcriptionMode: 'prioritize_low_latency',
  autoStartListening: true,
};

export function readBotSettings(): BotSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function useBotSettings(): {
  settings: BotSettings;
  save: (next: BotSettings) => void;
} {
  const [settings, setSettings] = useState<BotSettings>(readBotSettings);

  const save = (next: BotSettings): void => {
    setSettings(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  return { settings, save };
}
