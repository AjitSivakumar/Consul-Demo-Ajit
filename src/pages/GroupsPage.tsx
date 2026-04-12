import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGroups } from '../hooks/useGroups';
import { NavBar } from '../components/common/NavBar';

export function GroupsPage(): React.JSX.Element {
  const { groups, loading, createGroup } = useGroups();
  const navigate = useNavigate();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    const { group, error } = await createGroup(newName.trim());
    setCreating(false);
    if (group) {
      setNewName('');
      setShowForm(false);
      navigate(`/groups/${group.id}`);
    } else {
      setCreateError(error ?? 'Something went wrong');
    }
  };

  return (
    <main className="dash-wrap">
      <NavBar active="groups" />

      <div className="grp-page">
        <div className="grp-header">
          <div>
            <h1 className="grp-title">My Groups</h1>
            <p className="grp-sub">Groups let you share meeting sessions and insights with your team.</p>
          </div>
          <button type="button" className="lp-cta" onClick={() => setShowForm(true)}>+ New Group</button>
        </div>

        {showForm && (
          <form className="grp-form" onSubmit={handleCreate}>
            <input
              className="grp-input"
              type="text"
              placeholder="Group name (e.g. Sales Team, Research Lab)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <div className="grp-form-actions">
              <button type="submit" className="lp-cta" disabled={creating}>
                {creating ? 'Creating…' : 'Create Group'}
              </button>
              <button type="button" className="grp-cancel-btn" onClick={() => { setShowForm(false); setCreateError(null); }}>Cancel</button>
            </div>
            {createError && <p className="grp-form-error">{createError}</p>}
          </form>
        )}

        {loading ? (
          <p className="grp-empty">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="grp-empty">No groups yet. Create one to get started.</p>
        ) : (
          <div className="grp-list">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className="grp-card"
                onClick={() => navigate(`/groups/${g.id}`)}
              >
                <div className="grp-card-icon">{g.name[0].toUpperCase()}</div>
                <div className="grp-card-info">
                  <div className="grp-card-name">{g.name}</div>
                  <div className="grp-card-meta">Created {new Date(g.created_at).toLocaleDateString()}</div>
                </div>
                <span className="grp-card-arrow">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
