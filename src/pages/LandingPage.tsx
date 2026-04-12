import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NavBar } from '../components/common/NavBar';
import { GraphCanvas } from '../components/common/GraphCanvas';

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LandingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();

  const goApp = () => navigate(user ? '/dashboard' : '/login');

  return (
    <main className="lp-wrap">

      {/* ── Nav ── */}
      <NavBar
        headerClassName="lp-nav"
        loggedOutSlot={
          <button type="button" className="lp-nav-btn" onClick={() => navigate('/login')}>Sign in</button>
        }
      />

      {/* ── Hero ── */}
      <section className="lp-hero">
        <GraphCanvas />
        <div className="lp-hero-left">
          <h1 className="lp-headline">
            Your meeting's<br />
            <em className="lp-headline-em">second brain.</em>
          </h1>

          <div className="lp-hero-bottom">
            <p className="lp-sub">
            <span style={{ color: '#a855f7' }}>Ambi</span> transforms collaboration with proactive intelligence that integrates with your systems
            </p>
            <div className="lp-hero-actions">
              <button type="button" className="lp-cta" onClick={goApp}>
                {user ? 'Go to Dashboard' : 'Get started free'} →
              </button>
              <button type="button" className="lp-cta-ghost" onClick={() => scrollTo('features')}>Features</button>
              <button type="button" className="lp-cta-ghost" onClick={() => scrollTo('how-it-works')}>How it works</button>
            </div>
          </div>

          <div className="lp-integrations">
            <span className="lp-int-label">Works with</span>

            <span className="lp-int-chip">
              <img src="/icons/googlemeet.svg" width="16" height="16" alt="Google Meet" />
              Google Meet
            </span>

            <span className="lp-int-chip">
              <img src="/icons/zoom.svg" width="16" height="16" alt="Zoom" />
              Zoom
            </span>

            <span className="lp-int-chip">
              <img src="/icons/microsoftteams.svg" width="16" height="16" alt="Teams" />
              Teams
            </span>

            <span className="lp-int-chip">
              <img src="/icons/googledrive.svg" width="16" height="16" alt="Google Drive" />
              Google Drive
            </span>

            <span className="lp-int-chip">
              <img src="/icons/microsoftsharepoint.svg" width="16" height="16" alt="SharePoint" />
              SharePoint
            </span>

            <span className="lp-int-chip">
              <img src="/icons/microsoftonedrive.svg" width="16" height="16" alt="OneDrive" />
              OneDrive
            </span>
          </div>
        </div>

      </section>

      {/* ── Features ── */}
      <section className="lp-section" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <span className="lp-section-num">01</span>
            <span className="lp-section-name">Features</span>
            <span className="lp-section-rule" />
          </div>

          <div className="lp-feature-grid">
            {[
              { n: '01', title: 'Live intelligence', desc: 'Proactive insights surface every few seconds as your conversation evolves — no searching, no interrupting your flow.' },
              { n: '02', title: 'Evidence-backed answers', desc: 'Every insight is sourced — from your uploaded docs, internal data, or the web. No hallucinations, no guesswork.' },
              { n: '03', title: 'Post-meeting deliverables', desc: 'When the call ends, Ambi generates a full package — research summaries, Q&A, action items, and slide-ready content.' },
              { n: '04', title: 'Shared team context', desc: 'Group every meeting by team. All members see the same insights and history — no context lost between calls.' },
              { n: '05', title: 'Deep dive on demand', desc: 'Click any insight to open a full research panel — additional context, sources, and follow-up angles, instantly.' },
              { n: '06', title: 'Your documents as context', desc: 'Upload pitch decks, case studies, and product docs. Ambi searches them first before reaching out to the web.' },
            ].map((f) => (
              <div key={f.n} className="lp-feature-card">
                <span className="lp-feature-card-num">{f.n}</span>
                <h3 className="lp-feature-card-title">{f.title}</h3>
                <p className="lp-feature-card-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-section" id="how-it-works">
        <div className="lp-section-inner">
          <div className="lp-section-header">
            <span className="lp-section-num">02</span>
            <span className="lp-section-name">Process</span>
            <span className="lp-section-rule" />
          </div>

          <div className="lp-process-grid">
            <div className="lp-process-step">
              <div className="lp-process-num">01</div>
              <h3 className="lp-process-title">Join your meeting</h3>
              <p className="lp-process-desc">Paste your Google Meet, Zoom, or Teams link. Ambi's bot joins silently and starts listening — no app install required for participants.</p>
            </div>
            <div className="lp-process-step">
              <div className="lp-process-num">02</div>
              <h3 className="lp-process-title">Ambi listens live</h3>
              <p className="lp-process-desc">As the conversation unfolds, Ambi detects knowledge gaps, surfaces competitive data, and answers objections in real time.</p>
            </div>
            <div className="lp-process-step">
              <div className="lp-process-num">03</div>
              <h3 className="lp-process-title">Get your deliverables</h3>
              <p className="lp-process-desc">End the meeting and receive a full research package — summaries, action items, Q&A, and slides. Ready to share in seconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-final-cta">
            <div className="lp-final-left">
              <h2 className="lp-final-title">Ready to walk into<br />every meeting prepared?</h2>
              <p className="lp-final-sub">Sign in with Google and run your first meeting free.</p>
            </div>
            <button type="button" className="lp-cta lp-cta-light" onClick={goApp}>
              {user ? 'Go to Dashboard →' : 'Get started free →'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer-meta">
          <div className="lp-footer-brand">
            <img src="/logo.svg" alt="Ambi" className="lp-footer-logo" />
            <span className="lp-footer-wordmark">ambi</span>
          </div>
          <div className="lp-footer-right">
            <span className="lp-footer-copy">© {new Date().getFullYear()} Ambi</span>
            <span className="lp-footer-sep">·</span>
            <span className="lp-footer-copy">All rights reserved</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
