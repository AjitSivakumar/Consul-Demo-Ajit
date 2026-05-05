import { useState } from 'react';

const APP_PASSWORD = 'ambi';
const STORAGE_KEY = 'ambi_app_unlocked';

interface PasswordGateProps {
  children: React.ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps): React.JSX.Element {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(STORAGE_KEY) === 'true');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === APP_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setUnlocked(true);
    } else {
      setError(true);
      setInput('');
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="pg-overlay">
      <div className="pg-modal">
        <div className="pg-logo-wrap">
          <img src="/logo.svg" alt="ambi" className="pg-nav-logo" />
          <span className="pg-wordmark">ambi</span>
        </div>
        <h2 className="pg-title">Demo Access</h2>
        <p className="pg-sub">Enter the access code to continue.</p>
        <form className="pg-form" onSubmit={handleSubmit}>
          <input
            type="password"
            className={`pg-input${error ? ' pg-input-error' : ''}`}
            placeholder="Access code"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false); }}
            autoFocus
          />
          {error && <p className="pg-error">Incorrect access code.</p>}
          <button type="submit" className="pg-btn">Enter</button>
        </form>
        <a href="/" className="pg-back">← Back to site</a>
      </div>
    </div>
  );
}
