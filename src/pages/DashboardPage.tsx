import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PreMeetingModal, type MeetingMode } from '../components/realtime/PreMeetingModal';
import { useAuth } from '../hooks/useAuth';
import { useGroups, useRecentSessions } from '../hooks/useGroups';
import { NavBar } from '../components/common/NavBar';
import { meetingPresets } from '../mock-data/presets';
import { supabase } from '../lib/supabase';
import { useMeetingStore } from '../state/MeetingStore';

const PRESET_ICONS: Record<string, string> = {
  'chen-tobin-heat': '🔬',
  'chen-tobin-heat-auto': '🔬',
};

const DEFAULT_ICON = '⚡';

export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const { sessions, stats, loading: sessionsLoading } = useRecentSessions();
  const { dispatch } = useMeetingStore();
  const [showPreMeeting, setShowPreMeeting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set());
  const [defaultMeetingType, setDefaultMeetingType] = useState<'sales' | 'research'>(
    () => (localStorage.getItem('ambi_default_meeting_type') as 'sales' | 'research') ?? 'sales'
  );
  const [showTranscript, setShowTranscript] = useState(
    () => localStorage.getItem('ambi_show_transcript') !== 'false'
  );
  const [proactiveInsights, setProactiveInsights] = useState(
    () => localStorage.getItem('ambi_proactive') !== 'false'
  );

  const handleStartMeeting = (title: string, groupId: string | null, context: string, meetingType: 'sales' | 'research', mode: MeetingMode, presetId: string | null) => {
    dispatch({ type: 'RESET' });
    if (presetId) {
      const preset = meetingPresets.find((p) => p.id === presetId);
      if (preset) {
        dispatch({ type: 'LOAD_PRESET', payload: { id: preset.id, context: preset.context, transcript: preset.transcript, autoPlay: preset.autoPlay, liveAI: preset.liveAI, silentTranscript: preset.silentTranscript } });
        navigate('/realtime', { state: { autoStart: true, mode: 'ai-live', presetId } });
        return;
      }
    }
    dispatch({ type: 'SET_MEETING_CONTEXT', payload: { title, groupId, accountContext: context, meetingType } });
    navigate('/realtime', { state: { autoStart: true, mode } });
  };

  const fmtHours = (min: number) => {
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const visibleSessions = sessions.filter((s) => !localDeleted.has(s.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSession = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    if (supabase) {
      await supabase.from('meeting_sessions').delete().eq('id', id);
    }
    setLocalDeleted((prev) => new Set(prev).add(id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setDeletingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    for (const id of ids) await deleteSession(id);
    setSelectedIds(new Set());
    setConfirmDeleteAll(false);
  };

  const setSetting = (key: string, val: string) => {
    localStorage.setItem(key, val);
  };

  const withDeliverables = visibleSessions.filter((s) => s.state_snapshot).length;

  return (
    <main className="dash-wrap">
      <NavBar active="dashboard" />

      {/* ── Two-column body ── */}
      <div className="db-content">

        {/* ── LEFT sidebar ── */}
        <aside className="db-sidebar">

          {/* Account */}
          <section className="db-panel">
            <div className="db-panel-hdr">
              <span className="db-panel-label">Account</span>
            </div>
            <div className="db-account-block">
              <div className="db-avatar-lg">
                {user?.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" />
                  : (user?.user_metadata?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?')}
              </div>
              <div className="db-account-info">
                <div className="db-account-name">{user?.user_metadata?.full_name ?? 'No name'}</div>
                <div className="db-account-email">{user?.email}</div>
              </div>
            </div>
            <div className="db-account-meta-row">
              <span className="db-account-badge">Google OAuth</span>
              <span className="db-account-badge db-account-badge--plan">Demo plan</span>
            </div>
            <div className="db-sidebar-stats">
              {[
                { num: sessionsLoading ? '—' : String(stats.total), label: 'Meetings' },
                { num: sessionsLoading ? '—' : fmtHours(stats.totalMinutes), label: 'Hours' },
                { num: sessionsLoading ? '—' : String(stats.thisWeek), label: 'This week' },
                { num: sessionsLoading ? '—' : String(withDeliverables), label: 'Deliverables' },
              ].map((s, i) => (
                <div key={i} className="db-sidebar-stat">
                  <span className="db-sidebar-stat-num">{s.num}</span>
                  <span className="db-sidebar-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
            <button type="button" className="db-start-cta db-start-cta--full" onClick={() => setShowPreMeeting(true)}>
              Start a Meeting →
            </button>
          </section>

          {/* Groups */}
          <section className="db-panel">
            <div className="db-panel-hdr">
              <span className="db-panel-label">Groups</span>
              <button type="button" className="db-panel-action" onClick={() => navigate('/groups')}>Manage →</button>
            </div>
            {groupsLoading ? (
              <span className="db-muted">Loading…</span>
            ) : groups.length === 0 ? (
              <div className="db-empty-state">
                <span className="db-muted">No groups yet.</span>
                <button type="button" className="db-ghost-btn" onClick={() => navigate('/groups')}>Create a group →</button>
              </div>
            ) : (
              <div className="db-group-list">
                {groups.slice(0, 6).map((g) => (
                  <button key={g.id} type="button" className="db-group-row" onClick={() => navigate(`/groups/${g.id}`)}>
                    <div className="db-group-icon">{g.name[0].toUpperCase()}</div>
                    <span className="db-group-name">{g.name}</span>
                    <span className="db-row-arrow">→</span>
                  </button>
                ))}
                {groups.length > 6 && (
                  <button type="button" className="db-ghost-btn" onClick={() => navigate('/groups')}>
                    +{groups.length - 6} more
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Settings */}
          <section className="db-panel">
            <div className="db-panel-hdr">
              <span className="db-panel-label">Settings</span>
            </div>
            <div className="db-settings-list">

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">Default meeting type</span>
                  <span className="db-setting-desc">Sets the AI inference mode for new meetings</span>
                </div>
                <div className="db-setting-toggle-group">
                  <button
                    type="button"
                    className={`db-toggle-btn${defaultMeetingType === 'sales' ? ' db-toggle-btn--active' : ''}`}
                    onClick={() => { setDefaultMeetingType('sales'); setSetting('ambi_default_meeting_type', 'sales'); }}
                  >Sales</button>
                  <button
                    type="button"
                    className={`db-toggle-btn${defaultMeetingType === 'research' ? ' db-toggle-btn--active' : ''}`}
                    onClick={() => { setDefaultMeetingType('research'); setSetting('ambi_default_meeting_type', 'research'); }}
                  >Research</button>
                </div>
              </div>

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">Live transcript</span>
                  <span className="db-setting-desc">Show/hide transcript panel by default</span>
                </div>
                <button
                  type="button"
                  className={`db-switch${showTranscript ? ' db-switch--on' : ''}`}
                  onClick={() => { const v = !showTranscript; setShowTranscript(v); setSetting('ambi_show_transcript', String(v)); }}
                >
                  <span className="db-switch-thumb" />
                </button>
              </div>

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">Proactive insights</span>
                  <span className="db-setting-desc">Ambi surfaces unprompted insights during meetings</span>
                </div>
                <button
                  type="button"
                  className={`db-switch${proactiveInsights ? ' db-switch--on' : ''}`}
                  onClick={() => { const v = !proactiveInsights; setProactiveInsights(v); setSetting('ambi_proactive', String(v)); }}
                >
                  <span className="db-switch-thumb" />
                </button>
              </div>

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">AI model</span>
                  <span className="db-setting-desc">Inference engine for insights and answers</span>
                </div>
                <span className="db-setting-val">GPT-4o mini</span>
              </div>

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">Transcription</span>
                  <span className="db-setting-desc">Audio capture method for live meetings</span>
                </div>
                <span className="db-setting-val">Recall.ai / Web Speech</span>
              </div>

              <div className="db-setting-row">
                <div className="db-setting-info">
                  <span className="db-setting-key">Data retention</span>
                  <span className="db-setting-desc">How long session data is stored</span>
                </div>
                <span className="db-setting-val">Session only</span>
              </div>

            </div>
          </section>

        </aside>

        {/* ── RIGHT main content ── */}
        <div className="db-main">

          {/* Quick start presets */}
          <section className="db-panel">
            <div className="db-panel-hdr">
              <span className="db-panel-label">Quick Start</span>
              <button type="button" className="db-panel-action" onClick={() => setShowPreMeeting(true)}>Custom setup →</button>
            </div>
            <div className="db-preset-grid">
              <button
                type="button"
                className="db-preset-card db-preset-card--blank"
                onClick={() => setShowPreMeeting(true)}
              >
                <span className="db-preset-icon">+</span>
                <span className="db-preset-name">New meeting</span>
                <span className="db-preset-desc">Start with custom title, group, and type</span>
              </button>
              {meetingPresets.slice(0, 3).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="db-preset-card"
                  onClick={() => handleStartMeeting('', null, '', defaultMeetingType, 'ai-live', preset.id)}
                >
                  <span className="db-preset-icon">{PRESET_ICONS[preset.id] ?? DEFAULT_ICON}</span>
                  <span className="db-preset-name">{preset.context.title}</span>
                  <span className="db-preset-desc">{preset.context.accountContext?.slice(0, 80)}…</span>
                  <span className="db-preset-cta">Run demo →</span>
                </button>
              ))}
            </div>
          </section>

          {/* Meeting history */}
          <section className="db-panel db-panel--flush">
            <div className="db-panel-hdr db-panel-hdr--padded">
              <span className="db-panel-label">Meeting History</span>
              <div className="db-session-actions">
                {selectedIds.size > 0 && !confirmDeleteAll && (
                  <button type="button" className="db-danger-btn" onClick={() => setConfirmDeleteAll(true)}>
                    Delete {selectedIds.size} selected
                  </button>
                )}
                {confirmDeleteAll && (
                  <>
                    <span className="db-confirm-label">Are you sure?</span>
                    <button type="button" className="db-danger-btn" onClick={deleteSelected}>Yes, delete</button>
                    <button type="button" className="db-ghost-btn" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
                  </>
                )}
                {selectedIds.size === 0 && visibleSessions.length > 0 && (
                  <button
                    type="button"
                    className="db-ghost-btn"
                    onClick={() => setSelectedIds(new Set(visibleSessions.map((s) => s.id)))}
                  >
                    Select all
                  </button>
                )}
              </div>
            </div>

            {sessionsLoading ? (
              <div className="db-panel-hdr--padded"><span className="db-muted">Loading…</span></div>
            ) : visibleSessions.length === 0 ? (
              <div className="db-empty-sessions">
                <span className="db-muted">No meetings recorded yet.</span>
                <button type="button" className="db-ghost-btn" onClick={() => setShowPreMeeting(true)}>Start your first meeting →</button>
              </div>
            ) : (
              <div className="db-session-table">
                <div className="db-session-thead">
                  <span className="db-th db-th--check" />
                  <span className="db-th db-th--title">Title</span>
                  <span className="db-th">Group</span>
                  <span className="db-th">Date</span>
                  <span className="db-th">Duration</span>
                  <span className="db-th db-th--actions" />
                </div>
                {visibleSessions.map((s) => (
                  <div key={s.id} className={`db-session-row${selectedIds.has(s.id) ? ' db-session-row--selected' : ''}`}>
                    <span className="db-td db-td--check">
                      <button
                        type="button"
                        className={`db-checkbox${selectedIds.has(s.id) ? ' db-checkbox--checked' : ''}`}
                        onClick={() => toggleSelect(s.id)}
                      />
                    </span>
                    <span className="db-td db-td--title">
                      <span className="db-session-dot" />
                      {s.title ?? 'Untitled Meeting'}
                    </span>
                    <span className="db-td db-session-group">{s.group_name}</span>
                    <span className="db-td db-session-date">{fmtDate(s.started_at)}</span>
                    <span className="db-td db-session-dur">{s.duration_min !== null ? `${s.duration_min}m` : '—'}</span>
                    <span className="db-td db-td--actions">
                      {s.state_snapshot && (
                        <button
                          type="button"
                          className="db-row-btn"
                          onClick={() => navigate('/deliverables', { state: { snapshot: s.state_snapshot } })}
                        >View</button>
                      )}
                      <button
                        type="button"
                        className="db-row-btn db-row-btn--danger"
                        disabled={deletingIds.has(s.id)}
                        onClick={() => deleteSession(s.id)}
                      >
                        {deletingIds.has(s.id) ? '…' : 'Delete'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>

      {showPreMeeting && (
        <PreMeetingModal
          groups={groups}
          currentGroupId={null}
          currentTitle=""
          onStart={handleStartMeeting}
          onClose={() => setShowPreMeeting(false)}
        />
      )}
    </main>
  );
}
