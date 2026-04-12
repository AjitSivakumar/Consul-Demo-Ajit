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
              Ambi joins your meeting, transcribes in real time, and instantly
              surfaces the facts, research, and answers your team needs —
              before anyone has to ask.
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

            {/* Google Meet — simple-icons path */}
            <span className="lp-int-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#00897B">
                <path d="M5.53 2.13 0 7.75h5.53zm.398 0v5.62h7.608v3.65l5.47-4.45c-.014-1.22.031-2.25-.025-3.46-.148-1.09-1.287-1.47-2.236-1.36zM23.1 4.32c-.802.295-1.358.995-2.047 1.49-2.506 2.05-4.982 4.12-7.468 6.19 3.025 2.59 6.04 5.18 9.065 7.76 1.218.671 1.428-.814 1.328-1.64v-13a.828.828 0 0 0-.877-.825zM.038 8.15v7.7h5.53v-7.7zm13.577 8.1H6.008v5.62c3.864-.006 7.737.011 11.58-.009 1.02-.07 1.618-1.12 1.468-2.07v-2.51l-5.47-4.68v3.65zm-13.577 0c.02 1.44-.041 2.88.033 4.31.162.948 1.158 1.43 2.047 1.31h3.464v-5.62z"/>
              </svg>
              Google Meet
            </span>

            {/* Zoom — simple-icons path */}
            <span className="lp-int-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0B5CFF">
                <path d="M5.033 14.649H.743a.74.74 0 0 1-.686-.458.74.74 0 0 1 .16-.808L3.19 10.41H1.06A1.06 1.06 0 0 1 0 9.35h3.957c.301 0 .57.18.686.458a.74.74 0 0 1-.161.808L1.51 13.59h2.464c.585 0 1.06.475 1.06 1.06zM24 11.338c0-1.14-.927-2.066-2.066-2.066-.61 0-1.158.265-1.537.686a2.061 2.061 0 0 0-1.536-.686c-1.14 0-2.066.926-2.066 2.066v3.311a1.06 1.06 0 0 0 1.06-1.06v-2.251a1.004 1.004 0 0 1 2.013 0v2.251c0 .586.474 1.06 1.06 1.06v-3.311a1.004 1.004 0 0 1 2.012 0v2.251c0 .586.475 1.06 1.06 1.06zM16.265 12a2.728 2.728 0 1 1-5.457 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0zm-4.82 0a2.728 2.728 0 1 1-5.458 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0z"/>
              </svg>
              Zoom
            </span>

            {/* Microsoft Teams — official logo */}
            <span className="lp-int-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.25 7.5h-5.5a.75.75 0 0 0-.75.75v4.5c0 .69.31 1.31.8 1.73A4.48 4.48 0 0 1 13 18v1.5h-1.5A2.25 2.25 0 0 0 9.25 21.75v.75h7.5v-.75a2.25 2.25 0 0 0-2.25-2.25H13V18a4.5 4.5 0 0 0 4.5-4.5V9h2.75a.75.75 0 0 0 0-1.5z" fill="#5059C9"/>
                <circle cx="18.75" cy="4.5" r="1.75" fill="#5059C9"/>
                <circle cx="11.5" cy="3.5" r="2.5" fill="#7B83EB"/>
                <rect x="1" y="7" width="13" height="13" rx="1.75" fill="#7B83EB"/>
                <path d="M10.5 10.5H8v6H6.5v-6H4V9h6.5v1.5z" fill="#fff"/>
              </svg>
              Teams
            </span>

            {/* Microphone */}
            <span className="lp-int-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8" y1="22" x2="16" y2="22"/>
              </svg>
              Microphone
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
