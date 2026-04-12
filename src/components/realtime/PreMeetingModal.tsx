import { useEffect, useRef, useState } from 'react';
import type { Group } from '../../hooks/useGroups';
import { buildPreMeetingBrief, loadGroupKnowledge } from '../../services/knowledgeService';
import type { KnowledgeDoc } from '../../services/knowledgeService';

interface PreMeetingModalProps {
  groups: Group[];
  currentGroupId: string | null;
  currentTitle: string;
  onStart: (title: string, groupId: string | null, context: string) => void;
  onClose: () => void;
}

export function PreMeetingModal({ groups, currentGroupId, currentTitle, onStart, onClose }: PreMeetingModalProps): React.JSX.Element {
  const [title, setTitle] = useState(currentTitle || '');
  const [groupId, setGroupId] = useState<string | null>(currentGroupId);
  const [context, setContext] = useState('');
  const [brief, setBrief] = useState<string>('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const briefTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load group knowledge docs when group changes
  useEffect(() => {
    if (!groupId) { setKnowledgeDocs([]); setBrief(''); return; }
    loadGroupKnowledge(groupId).then(setKnowledgeDocs).catch(() => setKnowledgeDocs([]));
  }, [groupId]);

  // Debounce brief generation when context changes
  useEffect(() => {
    if (briefTimerRef.current) clearTimeout(briefTimerRef.current);
    setBrief('');
    if (!context.trim() || !groupId || knowledgeDocs.length === 0) return;

    briefTimerRef.current = setTimeout(async () => {
      setBriefLoading(true);
      try {
        const result = await buildPreMeetingBrief(groupId, context.trim(), knowledgeDocs);
        setBrief(result);
      } catch {
        setBrief('');
      } finally {
        setBriefLoading(false);
      }
    }, 800);

    return () => { if (briefTimerRef.current) clearTimeout(briefTimerRef.current); };
  }, [context, groupId, knowledgeDocs]);

  const handleStart = () => {
    onStart(title.trim() || 'Untitled Meeting', groupId, context.trim());
  };

  return (
    <div className="bot-settings-overlay" onClick={onClose}>
      <div className="bot-settings-modal pre-meeting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bot-settings-header">
          <span className="bot-settings-title">New Meeting</span>
          <button type="button" className="bot-settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="bot-settings-body">
          <div className="bot-settings-field">
            <label className="bot-settings-label">Meeting name</label>
            <input
              className="bot-settings-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q2 discovery call with Acme"
              autoFocus
            />
          </div>

          {groups.length > 0 && (
            <div className="bot-settings-field">
              <label className="bot-settings-label">Group</label>
              <select
                className="bot-settings-select"
                value={groupId ?? ''}
                onChange={(e) => setGroupId(e.target.value || null)}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <span className="bot-settings-hint">Session will be saved to this group's history</span>
            </div>
          )}

          <div className="bot-settings-field">
            <label className="bot-settings-label">Meeting context</label>
            <textarea
              className="bot-settings-input pre-meeting-textarea"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Enterprise SaaS deal, prospect is evaluating us vs. Competitor X, key stakeholder is the VP of Sales..."
              rows={4}
            />
            <span className="bot-settings-hint">Ambi uses this to tailor proactive suggestions during the meeting</span>
          </div>

          {/* Pre-meeting brief from knowledge base */}
          {groupId && knowledgeDocs.length > 0 && (context.trim().length > 10) && (
            <div className="pre-meeting-brief">
              <div className="pre-meeting-brief-header">
                <span className="pre-meeting-brief-title">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 5 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Knowledge brief
                </span>
                <span className="pre-meeting-brief-source">{knowledgeDocs.length} doc{knowledgeDocs.length !== 1 ? 's' : ''} indexed</span>
              </div>
              {briefLoading ? (
                <p className="pre-meeting-brief-loading">Searching knowledge base…</p>
              ) : brief ? (
                <div className="pre-meeting-brief-content">
                  {brief.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i} className="pre-meeting-brief-line">{line.replace(/^[-•]\s*/, '')}</p>
                  ))}
                </div>
              ) : (
                <p className="pre-meeting-brief-loading">No relevant documents found for this context.</p>
              )}
            </div>
          )}
        </div>

        <div className="bot-settings-footer">
          <button type="button" className="bot-settings-btn cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="bot-settings-btn save" onClick={handleStart}>
            Launch meeting →
          </button>
        </div>
      </div>
    </div>
  );
}
