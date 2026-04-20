import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useGroupDetail, useGroups } from '../hooks/useGroups';
import { useDriveIntegration } from '../hooks/useDriveIntegration';
import { NavBar } from '../components/common/NavBar';
import { DriveIntegrationPanel } from '../components/groups/DriveIntegrationPanel';
import { PreMeetingModal, type MeetingMode } from '../components/realtime/PreMeetingModal';
import { useMeetingStore } from '../state/MeetingStore';

// ── Per-group settings (localStorage) ─────────────────────────────────────────

interface GrpSettings {
  description: string;
  emoji: string;
  color: string;
  defaultMeetingType: 'sales' | 'research';
}

const EMOJIS = ['◈', '◉', '▲', '◆', '★', '⊕', '⊞', '⬡', '⌬', '⬢', '❯', '⊗'];
const COLORS = ['#1e0a3c', '#0f1f4a', '#064e3b', '#7c2d12', '#374151', '#1e3a5f'];

function loadGrpSettings(groupId: string): GrpSettings {
  try {
    const raw = localStorage.getItem(`grp_${groupId}`);
    if (raw) return { description: '', emoji: '◈', color: '#1e0a3c', defaultMeetingType: 'sales', ...JSON.parse(raw) };
  } catch {}
  return { description: '', emoji: '◈', color: '#1e0a3c', defaultMeetingType: 'sales' };
}

function saveGrpSettings(groupId: string, s: GrpSettings) {
  localStorage.setItem(`grp_${groupId}`, JSON.stringify(s));
}

// ── Integration definitions ────────────────────────────────────────────────────

const INTEGRATIONS = [
  { id: 'google_drive', name: 'Google Drive', desc: 'Sync and index team documents into the knowledge base', abbr: 'GD', status: 'managed' as const },
  { id: 'salesforce',   name: 'Salesforce',   desc: 'Pull live deal and account context into every meeting', abbr: 'SF', status: 'soon' as const },
  { id: 'hubspot',      name: 'HubSpot',      desc: 'Surface contacts, deals, and pipeline data in-meeting', abbr: 'HS', status: 'soon' as const },
  { id: 'slack',        name: 'Slack',        desc: 'Post meeting summaries and action items to channels', abbr: 'SL', status: 'soon' as const },
  { id: 'gong',         name: 'Gong',         desc: 'Import and cross-reference recorded call intelligence', abbr: 'GG', status: 'soon' as const },
  { id: 'notion',       name: 'Notion',       desc: 'Sync team wikis and internal knowledge pages', abbr: 'NO', status: 'soon' as const },
  { id: 'confluence',   name: 'Confluence',   desc: 'Index engineering and product documentation', abbr: 'CF', status: 'soon' as const },
  { id: 'linear',       name: 'Linear',       desc: 'Surface active issues and project context live', abbr: 'LN', status: 'soon' as const },
  { id: 'onedrive',     name: 'OneDrive',     desc: 'Sync files from Microsoft OneDrive and SharePoint', abbr: 'OD', status: 'soon' as const },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return null;
  const min = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

type TabId = 'overview' | 'members' | 'knowledge' | 'history' | 'settings';

// ── Main component ────────────────────────────────────────────────────────────

export function GroupDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { dispatch } = useMeetingStore();
  const { groups } = useGroups();
  const { group, members, sessions, loading, inviteByEmail, removeMember, deleteGroup } = useGroupDetail(id!);
  const { integration } = useDriveIntegration(id!);

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Settings — always-editable draft in Settings tab
  const [settings, setSettings] = useState<GrpSettings>(() => loadGrpSettings(id!));
  const [draft, setDraft] = useState<GrpSettings>(() => loadGrpSettings(id!));
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Session search
  const [sessionSearch, setSessionSearch] = useState('');

  // Pre-meeting modal
  const [showPreMeeting, setShowPreMeeting] = useState(false);

  const isOwner = group?.owner_id === user?.id;
  const driveConnected = integration !== null && integration.status !== 'disconnected';
  const docCount = integration?.doc_count ?? 0;

  const filteredSessions = sessions.filter((s) =>
    !sessionSearch.trim() || (s.title ?? '').toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const handleStartMeeting = (
    title: string, groupId: string | null, context: string,
    projectContext: string, meetingType: 'sales' | 'research',
    mode: MeetingMode, _presetId: string | null
  ) => {
    dispatch({ type: 'RESET' });
    dispatch({ type: 'SET_MEETING_CONTEXT', payload: { title, groupId, accountContext: context, projectContext, meetingType } });
    navigate('/realtime', { state: { autoStart: true, mode } });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    const result = await inviteByEmail(inviteEmail.trim().toLowerCase());
    setInviting(false);
    setInviteStatus(
      result === 'added' ? `${inviteEmail} added.`
      : result === 'invited' ? `Invite sent to ${inviteEmail}.`
      : 'Could not invite — check the email and try again.'
    );
    setInviteEmail('');
  };

  const handleDelete = async () => {
    if (deleteConfirm !== group?.name) return;
    setDeleting(true);
    const { error } = await deleteGroup();
    setDeleting(false);
    if (error) { setDeleteError(error); return; }
    navigate('/groups');
  };

  const saveSettings = () => {
    saveGrpSettings(id!, draft);
    setSettings(draft);
    setEmojiOpen(false);
  };

  if (loading) {
    return (
      <main className="dash-wrap">
        <NavBar active="groups" />
        <div className="gp2-wrap"><p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</p></div>
      </main>
    );
  }

  return (
    <main className="dash-wrap">
      <NavBar active="groups" />
      <div className="gp2-wrap">

        {/* Back */}
        <button type="button" className="grp-back-btn" onClick={() => navigate('/groups')}>← Groups</button>

        {/* ── Header card ──────────────────────────────────────────────────── */}
        <div className="gp2-header">
          <div className="gp2-avatar" style={{ background: settings.color }}>{settings.emoji}</div>

          <div className="gp2-header-info">
            <div className="gp2-name">{group?.name ?? 'Group'}</div>
            {settings.description
              ? <div className="gp2-desc">{settings.description}</div>
              : <div className="gp2-desc gp2-desc--empty">No description · add one in Settings</div>}
            <div className="gp2-meta">
              Created {group?.created_at ? fmtDate(group.created_at) : '—'}
              <span className="gp2-type-chip">
                {settings.defaultMeetingType === 'sales' ? '⚡ Sales' : '🔬 Research'}
              </span>
            </div>
          </div>

          <div className="gp2-header-end">
            <div className="gp2-hstats">
              <div className="gp2-hstat">
                <span className="gp2-hstat-val">{members.length}</span>
                <span className="gp2-hstat-lbl">Members</span>
              </div>
              <div className="gp2-hstat-sep" />
              <div className="gp2-hstat">
                <span className="gp2-hstat-val">{sessions.length}</span>
                <span className="gp2-hstat-lbl">Meetings</span>
              </div>
              <div className="gp2-hstat-sep" />
              <div className="gp2-hstat">
                <span className="gp2-hstat-val">{docCount}</span>
                <span className="gp2-hstat-lbl">Docs</span>
              </div>
            </div>
            <button type="button" className="gp2-cta" onClick={() => setShowPreMeeting(true)}>
              ⚡ Start Meeting
            </button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="gp2-tabbar">
          {([
            { id: 'overview' as TabId,   label: 'Overview',        badge: null },
            { id: 'members' as TabId,    label: 'Members',         badge: members.length || null },
            { id: 'knowledge' as TabId,  label: 'Knowledge Base',  badge: docCount || null },
            { id: 'history' as TabId,    label: 'History',         badge: sessions.length || null },
            { id: 'settings' as TabId,   label: 'Settings',        badge: null },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`gp2-tab ${activeTab === t.id ? 'gp2-tab--active' : ''}`}
              style={activeTab === t.id ? { '--tab-accent': settings.color } as React.CSSProperties : {}}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {t.badge !== null && <span className="gp2-tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        <div className="gp2-content">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="gp2-ov">
              <div className="gp2-ov-row">
                {[
                  { icon: '👥', val: members.length,  lbl: 'Members',      tab: 'members'   as TabId },
                  { icon: '🎙', val: sessions.length, lbl: 'Meetings',     tab: 'history'   as TabId },
                  { icon: '📄', val: docCount,        lbl: 'Docs Indexed', tab: 'knowledge' as TabId },
                  { icon: '🔗', val: driveConnected ? 1 : 0, lbl: 'Integrations', tab: null },
                ].map((s) => (
                  <div
                    key={s.lbl}
                    className="gp2-ov-stat-card"
                    onClick={() => s.tab && setActiveTab(s.tab)}
                    style={{ cursor: s.tab ? 'pointer' : 'default' }}
                  >
                    <div className="gp2-ov-stat-icon">{s.icon}</div>
                    <div className="gp2-ov-stat-val">{s.val}</div>
                    <div className="gp2-ov-stat-lbl">{s.lbl}</div>
                  </div>
                ))}
              </div>

              <div className="gp2-card">
                <div className="gp2-card-hd">
                  <span className="gp2-card-title">Integrations</span>
                  <span className="gp2-card-sub">{driveConnected ? '1 connected' : '0 connected'}</span>
                </div>
                <div className="grp-int-grid">
                  {INTEGRATIONS.map((int) => {
                    const isDrive = int.id === 'google_drive';
                    const isConn = isDrive && driveConnected;
                    const isSoon = int.status === 'soon';
                    return (
                      <div key={int.id} className={`grp-int-tile ${isSoon ? 'grp-int-tile--soon' : ''}`}>
                        <div className="grp-int-tile-top">
                          <div className="grp-int-icon" style={isConn ? { background: 'rgba(29,158,117,0.08)', borderColor: 'rgba(29,158,117,0.25)', color: 'var(--dl-teal-mid)' } : isSoon ? { color: '#ccc' } : {}}>
                            {int.abbr}
                          </div>
                          <span className={`grp-int-badge ${isConn ? 'grp-int-badge--connected' : isSoon ? 'grp-int-badge--soon' : 'grp-int-badge--available'}`}>
                            {isConn ? 'Connected' : isSoon ? 'Soon' : 'Available'}
                          </span>
                        </div>
                        <div>
                          <div className="grp-int-name">{int.name}</div>
                          <div className="grp-int-desc">{int.desc}</div>
                        </div>
                        {isDrive ? (
                          <button type="button" className="grp-int-action grp-int-action--manage" onClick={() => setActiveTab('knowledge')}>
                            {isConn ? 'Manage →' : 'Connect →'}
                          </button>
                        ) : (
                          <button type="button" className="grp-int-action grp-int-action--soon" disabled>Coming soon</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="gp2-card">
                <div className="gp2-card-hd">
                  <span className="gp2-card-title">Recent Meetings</span>
                  {sessions.length > 0 && (
                    <button type="button" className="gp2-card-link" onClick={() => setActiveTab('history')}>View all →</button>
                  )}
                </div>
                {sessions.length === 0 ? (
                  <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>No meetings yet.</p>
                    <button type="button" className="grp-hero-btn" onClick={() => setShowPreMeeting(true)}>⚡ Start Meeting</button>
                  </div>
                ) : (
                  <div className="grp-session-table">
                    <div className="grp-session-thead">
                      <span className="grp-th">Title</span>
                      <span className="grp-th">Date</span>
                      <span className="grp-th">Duration</span>
                      <span className="grp-th" />
                    </div>
                    {sessions.slice(0, 4).map((s) => (
                      <div key={s.id} className="grp-session-row-v2">
                        <div className="grp-session-title-cell">
                          <span className="grp-session-dot" />
                          <span className="grp-session-name">{s.title ?? 'Untitled Meeting'}</span>
                        </div>
                        <span className="grp-session-date">{fmtDate(s.started_at)}</span>
                        <span className="grp-session-dur">{fmtDuration(s.started_at, s.ended_at) ?? '—'}</span>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          {s.state_snapshot
                            ? <button type="button" className="db-row-btn" onClick={() => navigate('/deliverables', { state: { snapshot: s.state_snapshot } })}>View →</button>
                            : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No deliverables</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Members ── */}
          {activeTab === 'members' && (
            <div className="gp2-card">
              <div className="gp2-card-hd">
                <span className="gp2-card-title">Members</span>
                <span className="gp2-card-sub">{members.length} total</span>
              </div>
              <div className="grp-member-list" style={{ padding: '6px 0' }}>
                {members.map((m) => {
                  const displayName = m.profiles.display_name ?? m.profiles.email;
                  const isMe = m.user_id === user?.id;
                  return (
                    <div key={m.user_id} className="grp-member-row" style={{ padding: '10px 20px' }}>
                      <div className="grp-member-avatar" style={{ fontSize: 13, background: m.role === 'owner' ? 'linear-gradient(135deg,#4c1d95,#1e0a3c)' : undefined }}>
                        {displayName[0].toUpperCase()}
                      </div>
                      <div className="grp-member-info">
                        <div className="grp-member-name">
                          {displayName}
                          {isMe && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>you</span>}
                        </div>
                        <div className="grp-member-email">{m.profiles.email}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span className={`grp-role-badge ${m.role === 'owner' ? 'grp-role-badge--owner' : ''}`}>{m.role}</span>
                        {isOwner && !isMe && (
                          <button type="button" className="grp-remove-btn" onClick={() => removeMember(m.user_id)}>Remove</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {isOwner && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  <form className="grp-invite-row" onSubmit={handleInvite}>
                    <input className="grp-input" type="email" placeholder="Invite by email…" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
                    <button type="submit" className="grp-hero-btn" disabled={inviting} style={{ flexShrink: 0 }}>{inviting ? 'Inviting…' : 'Invite'}</button>
                  </form>
                  {inviteStatus && (
                    <p style={{ fontSize: 12, color: inviteStatus.includes('not') ? 'var(--danger)' : 'var(--dl-teal-mid)', margin: '8px 0 0' }}>{inviteStatus}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Knowledge Base ── */}
          {activeTab === 'knowledge' && (
            <DriveIntegrationPanel groupId={id!} />
          )}

          {/* ── History ── */}
          {activeTab === 'history' && (
            <div className="gp2-card">
              <div className="gp2-card-hd">
                <span className="gp2-card-title">Meeting History</span>
                <input className="grp-search-input" type="text" placeholder="Search sessions…" value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} />
              </div>
              {filteredSessions.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 14px' }}>
                    {sessionSearch ? 'No sessions match.' : 'No sessions yet.'}
                  </p>
                  {!sessionSearch && <button type="button" className="grp-hero-btn" onClick={() => setShowPreMeeting(true)}>⚡ Start Meeting</button>}
                </div>
              ) : (
                <div className="grp-session-table">
                  <div className="grp-session-thead">
                    <span className="grp-th">Title</span>
                    <span className="grp-th">Date</span>
                    <span className="grp-th">Duration</span>
                    <span className="grp-th" />
                  </div>
                  {filteredSessions.map((s) => (
                    <div key={s.id} className="grp-session-row-v2">
                      <div className="grp-session-title-cell">
                        <span className="grp-session-dot" />
                        <span className="grp-session-name">{s.title ?? 'Untitled Meeting'}</span>
                      </div>
                      <span className="grp-session-date">{fmtDate(s.started_at)}</span>
                      <span className="grp-session-dur">{fmtDuration(s.started_at, s.ended_at) ?? '—'}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {s.state_snapshot
                          ? <button type="button" className="db-row-btn" onClick={() => navigate('/deliverables', { state: { snapshot: s.state_snapshot } })}>View →</button>
                          : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>No deliverables</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Settings ── */}
          {activeTab === 'settings' && (
            <div className="gp2-settings">
              {!isOwner ? (
                <div className="gp2-card">
                  <div className="gp2-card-hd"><span className="gp2-card-title">Group Settings</span></div>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div className="grp-settings-label">Default meeting type</div>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{settings.defaultMeetingType === 'sales' ? '⚡ Sales' : '🔬 Research'}</p>
                    </div>
                    <div>
                      <div className="grp-settings-label">Description</div>
                      <p style={{ margin: '6px 0 0', fontSize: 13, color: settings.description ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>{settings.description || 'No description'}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Only the group owner can edit settings.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="gp2-settings-grid">
                    {/* Appearance card */}
                    <div className="gp2-card">
                      <div className="gp2-card-hd"><span className="gp2-card-title">Appearance</span></div>
                      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                        <div>
                          <div className="grp-settings-label" style={{ marginBottom: 10 }}>Icon</div>
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <div
                              onClick={() => setEmojiOpen((v) => !v)}
                              title="Click to change"
                              style={{ width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: draft.color, fontSize: 24, color: 'rgba(255,255,255,0.9)', cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)' }}
                            >
                              {draft.emoji}
                            </div>
                            {emojiOpen && (
                              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 4, width: 180 }}>
                                {EMOJIS.map((e) => (
                                  <button key={e} type="button"
                                    onClick={(ev) => { ev.stopPropagation(); setDraft((d) => ({ ...d, emoji: e })); setEmojiOpen(false); }}
                                    style={{ fontSize: 18, background: draft.emoji === e ? 'var(--bg-blue)' : 'none', border: 'none', borderRadius: 4, cursor: 'pointer', padding: 4 }}>
                                    {e}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="grp-settings-label" style={{ marginBottom: 10 }}>Color</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {COLORS.map((c) => (
                              <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, color: c }))}
                                style={{ width: 28, height: 28, borderRadius: 6, background: c, border: draft.color === c ? '2.5px solid var(--text-primary)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Description + meeting type */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="gp2-card">
                        <div className="gp2-card-hd"><span className="gp2-card-title">Description</span></div>
                        <div style={{ padding: '12px 16px' }}>
                          <textarea className="grp-input" placeholder="What does this group work on?" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} rows={3} style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div className="gp2-card">
                        <div className="gp2-card-hd"><span className="gp2-card-title">Default Meeting Type</span></div>
                        <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                          {(['sales', 'research'] as const).map((t) => {
                            const active = draft.defaultMeetingType === t;
                            return (
                              <button key={t} type="button" onClick={() => setDraft((d) => ({ ...d, defaultMeetingType: t }))}
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: active ? '1.5px solid var(--text-primary)' : '1px solid var(--border)', background: active ? 'var(--text-primary)' : 'none', color: active ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'Work Sans, sans-serif' }}>
                                {t === 'sales' ? '⚡ Sales' : '🔬 Research'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button type="button" className="grp-hero-btn" onClick={saveSettings} style={{ alignSelf: 'flex-start' }}>
                    Save changes
                  </button>

                  {/* Danger zone */}
                  <div className="gp2-card gp2-danger-card">
                    <div className="gp2-card-hd">
                      <span className="gp2-card-title" style={{ color: '#b41e1e' }}>Danger Zone</span>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                      {!showDelete ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                            Permanently delete <strong>{group?.name}</strong> and all its members, sessions, and knowledge base.
                          </p>
                          <button type="button" className="grp-delete-btn" style={{ flexShrink: 0 }} onClick={() => setShowDelete(true)}>Delete group</button>
                        </div>
                      ) : (
                        <div className="grp-delete-confirm">
                          <p className="grp-delete-warning">This will permanently delete <strong>{group?.name}</strong>, all its members, sessions, and invites. Type the group name to confirm.</p>
                          <input className="grp-input" type="text" placeholder={group?.name} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
                          <div className="grp-form-actions">
                            <button type="button" className="grp-delete-btn" onClick={handleDelete} disabled={deleteConfirm !== group?.name || deleting}>
                              {deleting ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button type="button" className="grp-cancel-btn" onClick={() => { setShowDelete(false); setDeleteConfirm(''); setDeleteError(null); }}>Cancel</button>
                          </div>
                          {deleteError && <p className="grp-form-error">{deleteError}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {showPreMeeting && (
        <PreMeetingModal
          groups={groups}
          currentGroupId={id!}
          currentTitle=""
          onStart={handleStartMeeting}
          onClose={() => setShowPreMeeting(false)}
        />
      )}
    </main>
  );
}
