import { useState } from 'react';
import type { BotSettings } from '../../hooks/useBotSettings';

interface BotSettingsModalProps {
  settings: BotSettings;
  onSave: (next: BotSettings) => void;
  onClose: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
];

export function BotSettingsModal({ settings, onSave, onClose }: BotSettingsModalProps): React.JSX.Element {
  const [draft, setDraft] = useState<BotSettings>({ ...settings });

  const handleSave = (): void => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="bot-settings-overlay" onClick={onClose}>
      <div className="bot-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bot-settings-header">
          <span className="bot-settings-title">Bot Settings</span>
          <button type="button" className="bot-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="bot-settings-body">
          {/* Bot name */}
          <div className="bot-settings-field">
            <label className="bot-settings-label">Bot display name</label>
            <input
              className="bot-settings-input"
              value={draft.botName}
              onChange={(e) => setDraft((d) => ({ ...d, botName: e.target.value }))}
              placeholder="Ambi Notetaker"
            />
            <span className="bot-settings-hint">How the bot appears in the meeting participants list</span>
          </div>

          {/* Language */}
          <div className="bot-settings-field">
            <label className="bot-settings-label">Transcription language</label>
            <select
              className="bot-settings-select"
              value={draft.languageCode}
              onChange={(e) => setDraft((d) => ({ ...d, languageCode: e.target.value }))}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Transcription mode */}
          <div className="bot-settings-field">
            <label className="bot-settings-label">Transcription mode</label>
            <div className="bot-settings-radio-group">
              <label className="bot-settings-radio">
                <input
                  type="radio"
                  name="transcriptionMode"
                  value="prioritize_low_latency"
                  checked={draft.transcriptionMode === 'prioritize_low_latency'}
                  onChange={() => setDraft((d) => ({ ...d, transcriptionMode: 'prioritize_low_latency' }))}
                />
                <span className="bot-settings-radio-label">
                  Low latency
                  <span className="bot-settings-radio-hint">Faster, slight accuracy trade-off</span>
                </span>
              </label>
              <label className="bot-settings-radio">
                <input
                  type="radio"
                  name="transcriptionMode"
                  value="prioritize_quality"
                  checked={draft.transcriptionMode === 'prioritize_quality'}
                  onChange={() => setDraft((d) => ({ ...d, transcriptionMode: 'prioritize_quality' }))}
                />
                <span className="bot-settings-radio-label">
                  High quality
                  <span className="bot-settings-radio-hint">More accurate, slightly delayed</span>
                </span>
              </label>
            </div>
          </div>

          {/* Auto-start */}
          <div className="bot-settings-field">
            <label className="bot-settings-toggle-row">
              <span className="bot-settings-label" style={{ marginBottom: 0 }}>Auto-start listening</span>
              <input
                type="checkbox"
                className="bot-settings-checkbox"
                checked={draft.autoStartListening}
                onChange={(e) => setDraft((d) => ({ ...d, autoStartListening: e.target.checked }))}
              />
            </label>
            <span className="bot-settings-hint">Automatically begin AI processing when the bot joins the call</span>
          </div>
        </div>

        <div className="bot-settings-footer">
          <button type="button" className="bot-settings-btn cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="bot-settings-btn save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
