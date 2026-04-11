import { useNavigate } from 'react-router-dom';

export function LandingPage(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <main className="lp-wrap">
      <header className="lp-nav">
        <div className="lp-nav-left">
          <img src="/logo.svg" alt="Ambi" className="lp-logo" />
          <span className="lp-wordmark">ambi</span>
        </div>
      </header>

      <div className="lp-body">
        <h1 className="lp-headline">
          Your meeting&apos;s<br />
          <em className="lp-headline-em">second brain</em>
        </h1>

        <p className="lp-sub">
          Ambi listens, surfaces evidence gaps, and delivers
          research-backed insights live, as the conversation unfolds.
        </p>

        <button
          type="button"
          className="lp-cta"
          onClick={() => navigate('/realtime')}
        >
          Open Meeting Room →
        </button>
      </div>

      <footer className="lp-footer">
        <div className="lp-footer-left">
          <img src="/logo-grey.svg" alt="Ambi" className="lp-footer-logo" />
          <span className="lp-footer-wordmark">ambi</span>
        </div>
        <div className="lp-footer-right">
          © {new Date().getFullYear()} Ambi. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
