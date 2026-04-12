import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

function UserDropdown({ active }: { active?: 'dashboard' | 'groups' | 'realtime' }): React.JSX.Element {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase();

  const go = (path: string) => { setOpen(false); navigate(path); };

  return (
    <div className="dash-dropdown-wrap" ref={ref}>
      <button type="button" className="dash-avatar-btn" onClick={() => setOpen((o) => !o)}>
        <div className="dash-avatar">
          {user?.user_metadata?.avatar_url
            ? <img src={user.user_metadata.avatar_url} alt="" />
            : initials}
        </div>
        <svg className={`dash-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="dash-dropdown">
          <div className="dash-dropdown-header">
            <div className="dash-dropdown-name">{user?.user_metadata?.full_name ?? 'User'}</div>
            <div className="dash-dropdown-email">{user?.email}</div>
          </div>
          <div className="dash-dropdown-divider" />
          <button
            type="button"
            className={`dash-dropdown-item${active === 'dashboard' ? ' active' : ''}`}
            onClick={() => go('/dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`dash-dropdown-item${active === 'groups' ? ' active' : ''}`}
            onClick={() => go('/groups')}
          >
            Groups
          </button>
          <button
            type="button"
            className={`dash-dropdown-item${active === 'realtime' ? ' active' : ''}`}
            onClick={() => go('/realtime')}
          >
            Meeting Room
          </button>
          <div className="dash-dropdown-divider" />
          <button type="button" className="dash-dropdown-item" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface NavBarProps {
  /** Content in the center slot (e.g. meeting title or marketing links) */
  centerSlot?: React.ReactNode;
  /** Shown in the right section before the avatar (e.g. meeting controls) */
  rightSlot?: React.ReactNode;
  /** Shown on the right when the user is NOT logged in */
  loggedOutSlot?: React.ReactNode;
  /** Active link highlight */
  active?: 'dashboard' | 'groups' | 'realtime';
  /** Override the header element className (default: 'dash-nav') */
  headerClassName?: string;
}

export function NavBar({
  centerSlot,
  rightSlot,
  loggedOutSlot,
  active,
  headerClassName = 'dash-nav',
}: NavBarProps): React.JSX.Element {
  const { user, loading } = useAuth();

  return (
    <header className={headerClassName}>
      <div className="dash-nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
        <img src="/logo.svg" alt="Ambi" className="lp-logo" />
        <span className="lp-wordmark">ambi</span>
      </div>

      {centerSlot && (
        <div className="dash-nav-center">
          {centerSlot}
        </div>
      )}

      <div className="dash-nav-right">
        {rightSlot}
        {!loading && (user
          ? <UserDropdown active={active} />
          : loggedOutSlot ?? null
        )}
      </div>
    </header>
  );
}
