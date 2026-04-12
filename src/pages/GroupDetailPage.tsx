import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGroupDetail } from '../hooks/useGroups';

export function GroupDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { group, members, sessions, loading, inviteByEmail, removeMember } = useGroupDetail(id!);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    const result = await inviteByEmail(inviteEmail.trim().toLowerCase());
    setInviting(false);
    if (result === 'added') setInviteStatus(`${inviteEmail} added to the group.`);
    else if (result === 'invited') setInviteStatus(`Invite sent — ${inviteEmail} will be added when they sign up.`);
    else setInviteStatus('Something went wrong. Check the email and try again.');
    setInviteEmail('');
  };

  const isOwner = group?.owner_id === user?.id;

  if (loading) return <main className="lp-wrap"><div className="lp-body"><p className="lp-sub">Loading…</p></div></main>;

  return (
    <main className="lp-wrap">
      <header className="lp-nav">
        <div className="lp-nav-left">
          <button type="button" className="grp-back-btn" onClick={() => navigate('/groups')}>← Groups</button>
        </div>
        <div className="grp-nav-right">
          <button type="button" className="grp-nav-btn" onClick={() => navigate('/realtime')}>Meeting Room</button>
        </div>
      </header>

      <div className="grp-page">
        <div className="grp-header">
          <div>
            <h1 className="grp-title">{group?.name ?? 'Group'}</h1>
            <p className="grp-sub">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Members */}
        <section className="grp-section">
          <h2 className="grp-section-title">Members</h2>
          <div className="grp-member-list">
            {members.map((m) => (
              <div key={m.user_id} className="grp-member-row">
                <div className="grp-member-avatar">
                  {(m.profiles.display_name ?? m.profiles.email)[0].toUpperCase()}
                </div>
                <div className="grp-member-info">
                  <div className="grp-member-name">{m.profiles.display_name ?? m.profiles.email}</div>
                  <div className="grp-member-email">{m.profiles.email}</div>
                </div>
                <span className="grp-member-role">{m.role}</span>
                {isOwner && m.user_id !== user?.id && (
                  <button type="button" className="grp-remove-btn" onClick={() => removeMember(m.user_id)}>Remove</button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Invite */}
        {isOwner && (
          <section className="grp-section">
            <h2 className="grp-section-title">Invite by Email</h2>
            <form className="grp-invite-form" onSubmit={handleInvite}>
              <input
                className="grp-input"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <button type="submit" className="lp-cta" disabled={inviting}>
                {inviting ? 'Inviting…' : 'Invite'}
              </button>
            </form>
            {inviteStatus && <p className="grp-invite-status">{inviteStatus}</p>}
          </section>
        )}

        {/* Meeting history */}
        <section className="grp-section">
          <h2 className="grp-section-title">Meeting Sessions</h2>
          {sessions.length === 0 ? (
            <p className="grp-empty">No sessions yet. Start a meeting and associate it with this group.</p>
          ) : (
            <div className="grp-session-list">
              {sessions.map((s) => (
                <div key={s.id} className="grp-session-row">
                  <div className="grp-session-info">
                    <div className="grp-session-title">{s.title ?? 'Untitled Meeting'}</div>
                    <div className="grp-session-meta">
                      {new Date(s.started_at).toLocaleString()}
                      {s.ended_at && ` · ${Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)} min`}
                    </div>
                  </div>
                  {s.state_snapshot && (
                    <button
                      type="button"
                      className="grp-nav-btn"
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
      </div>
    </main>
  );
}
