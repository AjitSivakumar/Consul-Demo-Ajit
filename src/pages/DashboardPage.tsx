import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PreMeetingModal } from '../components/realtime/PreMeetingModal';
import { useAuth } from '../hooks/useAuth';
import { useGroups, useRecentSessions } from '../hooks/useGroups';
import { NavBar } from '../components/common/NavBar';
import { getAllDocuments } from '../services/documentService';
import { useMeetingStore } from '../state/MeetingStore';

export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const { sessions, stats, loading: sessionsLoading } = useRecentSessions();
  const { dispatch } = useMeetingStore();
  const [showPreMeeting, setShowPreMeeting] = useState(false);

  const handleStartMeeting = (title: string, groupId: string | null, context: string, meetingType: 'sales' | 'research') => {
    dispatch({ type: 'SET_MEETING_CONTEXT', payload: { title, groupId, accountContext: context, meetingType } });
    // docs were loaded into documentService by the modal — sync done, navigate
    void getAllDocuments(); // ensures module is initialised
    navigate('/realtime', { state: { autoStart: true } });
  };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there';

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

  return (
    <main className="dash-wrap">
      <NavBar active="dashboard" />

      <div className="dash-body">

        {/* Greeting */}
        <div className="dash-greeting">
          <h1 className="dash-greeting-title">Good to see you, {firstName}.</h1>
          <button type="button" className="dash-start-btn" onClick={() => setShowPreMeeting(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="7" cy="7" r="2.5" fill="currentColor"/>
            </svg>
            Start a Meeting
          </button>
        </div>

        {/* Stats bar */}
        <div className="dash-stats-bar">
          <div className="dash-stat">
            <div className="dash-stat-value">{sessionsLoading ? '—' : stats.total}</div>
            <div className="dash-stat-label">Total meetings</div>
          </div>
          <div className="dash-stat-divider" />
          <div className="dash-stat">
            <div className="dash-stat-value">{sessionsLoading ? '—' : fmtHours(stats.totalMinutes)}</div>
            <div className="dash-stat-label">Time in meetings</div>
          </div>
          <div className="dash-stat-divider" />
          <div className="dash-stat">
            <div className="dash-stat-value">{sessionsLoading ? '—' : stats.thisWeek}</div>
            <div className="dash-stat-label">This week</div>
          </div>
        </div>

        {/* Recent meetings */}
        <section className="dash-card dash-card-wide">
          <div className="dash-card-header">
            <div className="dash-card-label">Recent Meetings</div>
          </div>
          {sessionsLoading ? (
            <p className="dash-muted">Loading…</p>
          ) : sessions.length === 0 ? (
            <div className="dash-empty-block">
              <p className="dash-muted">No meetings yet.</p>
              <button type="button" className="dash-inline-btn" onClick={() => setShowPreMeeting(true)}>Start your first meeting →</button>
            </div>
          ) : (
            <div className="dash-session-list">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="dash-session-row">
                  <div className="dash-session-dot" />
                  <div className="dash-session-info">
                    <div className="dash-session-title">{s.title ?? 'Untitled Meeting'}</div>
                    <div className="dash-session-meta">
                      <span className="dash-session-group">{s.group_name}</span>
                      <span className="dash-session-sep">·</span>
                      <span>{fmtDate(s.started_at)}</span>
                      {s.duration_min !== null && (
                        <><span className="dash-session-sep">·</span><span>{s.duration_min}m</span></>
                      )}
                    </div>
                  </div>
                  {s.state_snapshot && (
                    <button
                      type="button"
                      className="dash-session-view"
                      onClick={() => navigate('/deliverables', { state: { snapshot: s.state_snapshot } })}
                    >
                      View →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Card grid */}
        <div className="dash-grid">

          {/* Account card */}
          <section className="dash-card">
            <div className="dash-card-label">Account</div>
            <div className="dash-account-row">
              <div className="dash-avatar dash-avatar-lg">
                {user?.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="" />
                  : (user?.user_metadata?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?')}
              </div>
              <div className="dash-account-info">
                <div className="dash-account-name">{user?.user_metadata?.full_name ?? 'No name'}</div>
                <div className="dash-account-email">{user?.email}</div>
                <div className="dash-account-badge">Google</div>
              </div>
            </div>
          </section>

          {/* Groups card */}
          <section className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-label">Groups</div>
              <button type="button" className="dash-card-action" onClick={() => navigate('/groups')}>Manage →</button>
            </div>
            {groupsLoading ? (
              <p className="dash-muted">Loading…</p>
            ) : groups.length === 0 ? (
              <div className="dash-empty-block">
                <p className="dash-muted">No groups yet.</p>
                <button type="button" className="dash-inline-btn" onClick={() => navigate('/groups')}>Create a group →</button>
              </div>
            ) : (
              <div className="dash-group-list">
                {groups.slice(0, 5).map((g) => (
                  <button key={g.id} type="button" className="dash-group-row" onClick={() => navigate(`/groups/${g.id}`)}>
                    <div className="dash-group-icon">{g.name[0].toUpperCase()}</div>
                    <span className="dash-group-name">{g.name}</span>
                    <span className="dash-row-arrow">→</span>
                  </button>
                ))}
                {groups.length > 5 && (
                  <button type="button" className="dash-card-action" onClick={() => navigate('/groups')}>
                    +{groups.length - 5} more
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Configuration card */}
          <section className="dash-card">
            <div className="dash-card-label">Configuration</div>
            <div className="dash-config-list">
              <div className="dash-config-row">
                <span className="dash-config-key">AI model</span>
                <span className="dash-config-val">GPT-4o mini</span>
              </div>
              <div className="dash-config-row">
                <span className="dash-config-key">Transcription</span>
                <span className="dash-config-val">Recall.ai / Web Speech</span>
              </div>
              <div className="dash-config-row">
                <span className="dash-config-key">Data retention</span>
                <span className="dash-config-val">Session only</span>
              </div>
              <div className="dash-config-row">
                <span className="dash-config-key">Plan</span>
                <span className="dash-config-val">Demo</span>
              </div>
            </div>
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
