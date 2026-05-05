import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const orgPills = [
  { name: 'Yale School of Medicine', paid: true },
  { name: 'Proofpoint Capital', paid: true },
  { name: 'Emerald Pharmacy', paid: true },
  { name: 'UniCredit', paid: false },
  { name: 'PwC', paid: false },
  { name: 'Yale Wu Tsai Institute', paid: false },
  { name: 'K-12 Insight', paid: false },
];

const integrationGroups = [
  {
    category: 'Meeting Platforms',
    title: 'Where ambi lives',
    desc: 'ambi joins every major meeting platform as a silent participant, with no setup required from your team.',
    logos: ['Zoom', 'Google Meet', 'Microsoft Teams', 'Webex', 'Slack', 'GoTo Meeting'],
    muted: false,
  },
  {
    category: 'Knowledge Sources',
    title: 'What ambi queries',
    desc: 'ambi searches your internal documents and external research simultaneously, delivering cited answers within seconds.',
    logos: ['SharePoint', 'Google Drive', 'Notion', 'Internal Docs'],
    muted: false,
  },
  {
    category: 'Domain Data — Planned',
    title: 'Coming soon',
    desc: 'Deep integrations with vertical-specific data sources for healthcare, finance, and consulting.',
    logos: ['Salesforce', 'Epic / EHR', 'Bloomberg Terminal', 'PubMed / ClinicalTrials', 'Regulatory APIs'],
    muted: true,
  },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function MarketingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="mk-wrap">

      {/* ── Nav ── */}
      <nav className="mk-nav">
        <div className="mk-nav-inner">
          <a href="/" className="mk-logo-link">
            <span className="mk-wordmark">ambi</span>
          </a>
          <div className="mk-nav-links">
            <button type="button" className="mk-nav-link" onClick={() => scrollTo('product')}>Product</button>
            <button type="button" className="mk-nav-link" onClick={() => scrollTo('how-it-works')}>How It Works</button>
            <button type="button" className="mk-nav-link" onClick={() => scrollTo('integrations')}>Integrations</button>
            <button type="button" className="mk-nav-link" onClick={() => scrollTo('traction')}>Traction</button>
          </div>
          <div className="mk-nav-actions">
            <button type="button" className="mk-nav-demo" onClick={() => navigate('/app')}>Demo Access</button>
            <button type="button" className="mk-nav-waitlist" onClick={() => scrollTo('waitlist')}>Join Waitlist</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mk-hero" id="hero">
        <div className="mk-hero-glow" />
        <div className="mk-hero-content">
          <h1 className="mk-hero-headline">
            The intelligence<br />in the room.
          </h1>
          <p className="mk-hero-sub">
            ambi joins your meetings as a silent AI participant — detecting knowledge gaps in real time, surfacing evidence and insights the moment they matter. No prompting. No friction.
          </p>
          <div className="mk-hero-actions">
            <button type="button" className="mk-cta-primary" onClick={() => scrollTo('waitlist')}>Join Waitlist</button>
          </div>
          <p className="mk-social-proof">Trusted by teams at Yale School of Medicine, PwC, UniCredit, and more.</p>
          <div className="mk-org-pills">
            {orgPills.map(org => (
              <span key={org.name} className={`mk-org-pill ${org.paid ? 'mk-org-pill-paid' : 'mk-org-pill-loi'}`}>
                {org.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product ── */}
      <section className="mk-section" id="product">
        <div className="mk-section-inner">
          <span className="mk-eyebrow">What Is ambi</span>
          <h2 className="mk-section-heading">
            CRM captured what happened.<br />ambi changes what happens.
          </h2>
          <p className="mk-section-sub">
            Every other tool records. ambi researches. The bottleneck isn't meeting memory — it's the information gap that follows it.
          </p>
          <div className="mk-product-grid">
            <div className="mk-product-card">
              <span className="mk-card-num">01</span>
              <h3 className="mk-card-title">Proactive research, not passive transcription.</h3>
              <p className="mk-card-desc">ambi doesn't summarize what was said. It detects what's missing and surfaces the answer before the meeting ends — no query typed, no conversation paused.</p>
            </div>
            <div className="mk-product-card">
              <span className="mk-card-num">02</span>
              <h3 className="mk-card-title">Internal + external knowledge, unified instantly.</h3>
              <p className="mk-card-desc">Two AI instances run in parallel — one monitoring the conversation, one querying your documents and the web. Cited answers on a shared dashboard within seconds.</p>
            </div>
            <div className="mk-product-card">
              <span className="mk-card-num">03</span>
              <h3 className="mk-card-title">Built for high-stakes domains.</h3>
              <p className="mk-card-desc">General-purpose assistants are optimized for no one. ambi is tuned for the questions that matter in a hospital boardroom, a research institution, a pharma strategy meeting.</p>
            </div>
            <div className="mk-product-card mk-product-card-wide">
              <span className="mk-card-num">04</span>
              <h3 className="mk-card-title">Decision-ready briefs the moment the call ends.</h3>
              <p className="mk-card-desc">What was discussed, what surfaced, what was flagged, what comes next. Fully cited. Built for action, not archiving.</p>
              <div className="mk-stats-row">
                <div className="mk-stat">
                  <span className="mk-stat-num">$259B</span>
                  <span className="mk-stat-label">lost to meeting inefficiency annually in US enterprise</span>
                </div>
                <div className="mk-stat">
                  <span className="mk-stat-num">150+</span>
                  <span className="mk-stat-label">discovery calls validating the problem across verticals</span>
                </div>
                <div className="mk-stat">
                  <span className="mk-stat-num">&lt;3s</span>
                  <span className="mk-stat-label">average time to surface a cited insight mid-conversation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="mk-section mk-section-alt" id="how-it-works">
        <div className="mk-section-inner">
          <span className="mk-eyebrow">Three Steps. Zero Friction.</span>
          <h2 className="mk-section-heading">How It Works</h2>
          <p className="mk-section-sub">
            ambi works across Zoom, Google Meet, Teams, Webex, Slack, and GoTo — one API, every major platform.
          </p>
          <div className="mk-steps-grid">
            <div className="mk-step">
              <span className="mk-step-num">01</span>
              <h3 className="mk-step-title">Live</h3>
              <p className="mk-step-desc">ambi joins as a silent participant. Sub-second transcription with speaker diarization. Invisible to the flow of conversation.</p>
            </div>
            <div className="mk-step">
              <span className="mk-step-num">02</span>
              <h3 className="mk-step-title">Real-Time</h3>
              <p className="mk-step-desc">Two AI instances run in parallel. One monitors for knowledge gaps. A second researches live across your internal documents and the web. Insights surface on a shared dashboard within seconds.</p>
            </div>
            <div className="mk-step">
              <span className="mk-step-num">03</span>
              <h3 className="mk-step-title">Post-Meeting</h3>
              <p className="mk-step-desc">A decision brief lands the moment the call ends. What was discussed, what surfaced, what was flagged, what comes next. Fully cited.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="mk-section" id="integrations">
        <div className="mk-section-inner">
          <span className="mk-eyebrow">One Platform. Every Stack.</span>
          <h2 className="mk-section-heading">Built to fit where you already work.</h2>
          <p className="mk-section-sub">
            ambi connects to the meeting platforms, knowledge systems, and data sources your team already relies on — with enterprise-grade security and VAPT-assessed compliance infrastructure.
          </p>
          <div className="mk-integration-groups">
            {integrationGroups.map(group => (
              <div key={group.category} className="mk-integration-group">
                <div className="mk-integration-left">
                  <span className="mk-integration-category">{group.category}</span>
                  <h4 className="mk-integration-group-title">{group.title}</h4>
                  <p className="mk-integration-desc">{group.desc}</p>
                </div>
                <div className="mk-integration-logos">
                  {group.logos.map(name => (
                    <span key={name} className={`mk-logo-tile${group.muted ? ' mk-logo-tile-muted' : ''}`}>{name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Traction ── */}
      <section className="mk-section mk-section-alt" id="traction">
        <div className="mk-section-inner">
          <span className="mk-eyebrow">Validated Across Every Target Vertical.</span>
          <h2 className="mk-section-heading">
            From hospital strategy rooms to financial services to edtech —<br />the signal is consistent.
          </h2>
          <p className="mk-section-sub">The problem is universal, and the trust is already there.</p>
          <div className="mk-stats-hero">
            <div className="mk-traction-stat">
              <span className="mk-traction-num">3</span>
              <span className="mk-traction-label">Paid pilots scheduled</span>
            </div>
            <div className="mk-traction-stat">
              <span className="mk-traction-num">15</span>
              <span className="mk-traction-label">Letters of interest signed</span>
            </div>
          </div>
          <div className="mk-traction-groups">
            <div className="mk-traction-group">
              <span className="mk-traction-badge mk-traction-badge-green">Paid Pilots</span>
              <div className="mk-traction-logos">
                {['Yale School of Medicine', 'Emerald Compound Pharmacy', 'Proofpoint Capital'].map(name => (
                  <span key={name} className="mk-traction-logo-tile">{name}</span>
                ))}
              </div>
            </div>
            <div className="mk-traction-group">
              <span className="mk-traction-badge mk-traction-badge-purple">Letters of Interest</span>
              <div className="mk-traction-logos">
                {['UniCredit', 'PwC', 'Yale Center for IT', 'Yale Wu Tsai Institute', 'K-12 Insight', 'Prince William County Public Schools'].map(name => (
                  <span key={name} className="mk-traction-logo-tile">{name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist ── */}
      <section className="mk-section mk-section-waitlist" id="waitlist">
        <div className="mk-section-inner mk-waitlist-inner">
          <h2 className="mk-waitlist-heading">
            The room is ready.<br />Are you?
          </h2>
          <p className="mk-waitlist-sub">Request early access and we'll be in touch.</p>
          {submitted ? (
            <p className="mk-waitlist-thanks">Thank you — we'll be in touch soon.</p>
          ) : (
            <form className="mk-waitlist-form" onSubmit={handleWaitlist}>
              <input
                type="email"
                className="mk-waitlist-input"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="mk-cta-primary">Join Waitlist</button>
            </form>
          )}
          <div className="mk-waitlist-contacts">
            <span>shaezminakhan@aya.yale.edu</span>
            <span className="mk-dot">·</span>
            <span>shan.lateef@ndm.ox.ac.uk</span>
            <span className="mk-dot">·</span>
            <span>ajit.sivakumar@nyu.edu</span>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mk-footer">
        <div className="mk-footer-inner">
          <div className="mk-footer-brand">
            <span className="mk-wordmark">ambi</span>
            <span className="mk-footer-tagline">Ambient intelligence for the rooms that matter.</span>
          </div>
          <div className="mk-footer-links">
            <Link to="/about" className="mk-footer-link">About</Link>
            <Link to="/contact" className="mk-footer-link">Contact</Link>
          </div>
        </div>
        <div className="mk-footer-copy">© 2026 ambi · Ambient intelligence for the rooms that matter.</div>
      </footer>

    </div>
  );
}
