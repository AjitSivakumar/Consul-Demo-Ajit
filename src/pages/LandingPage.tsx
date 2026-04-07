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
        <div className="lp-eyebrow">Real-time meeting intelligence</div>

        <h1 className="lp-headline">
          Your meeting&apos;s<br />
          <em className="lp-headline-em">second brain</em>
        </h1>

        <p className="lp-sub">
          Ambi listens, surfaces evidence gaps, and delivers<br />
          research-backed insights live, as the conversation unfolds.
        </p>

        <button
          type="button"
          className="lp-cta"
          onClick={() => navigate('/realtime')}
        >
          Open Meeting Room →
        </button>

        <div className="lp-chips">
          <span className="lp-chip">Live transcription</span>
          <span className="lp-chip">Auto gap-fill</span>
          <span className="lp-chip">Post-meeting deliverables</span>
        </div>
      </div>
    </main>
  );
}
