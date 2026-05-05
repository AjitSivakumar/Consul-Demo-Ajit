import { Link } from 'react-router-dom';

export function ContactPage(): React.JSX.Element {
  return (
    <div className="mk-wrap">
      <nav className="mk-nav">
        <div className="mk-nav-inner">
          <Link to="/" className="mk-logo-link">
            <img src="/logo.svg" alt="ambi" className="mk-nav-logo" />
            <span className="mk-wordmark">ambi</span>
          </Link>
          <div className="mk-nav-links" style={{ marginLeft: 'auto' }}>
            <Link to="/about" className="mk-footer-link" style={{ fontSize: '14px', padding: '6px 14px' }}>About</Link>
          </div>
        </div>
      </nav>

      <main className="mk-contact-main">
        <div className="mk-contact-inner">
          <h1 className="mk-contact-heading">Get in touch.</h1>
          <p className="mk-contact-sub">
            Whether you're an accelerator, investor, or potential design partner — we'd love to talk.
          </p>
          <button
            className="mk-cta-primary"
            onClick={() => window.location.href = 'mailto:ajit.sivakumar@nyu.edu'}
          >
            Join Waitlist
          </button>
          <div className="mk-contact-emails">
            <a href="mailto:shaezminakhan@aya.yale.edu" className="mk-contact-email">shaezminakhan@aya.yale.edu</a>
            <a href="mailto:shan.lateef@ndm.ox.ac.uk" className="mk-contact-email">shan.lateef@ndm.ox.ac.uk</a>
            <a href="mailto:ajit.sivakumar@nyu.edu" className="mk-contact-email">ajit.sivakumar@nyu.edu</a>
          </div>
        </div>
      </main>

      <footer className="mk-footer">
        <div className="mk-footer-inner">
          <div className="mk-footer-brand">
            <Link to="/" className="mk-logo-link">
              <img src="/logo.svg" alt="ambi" className="mk-nav-logo" />
              <span className="mk-wordmark">ambi</span>
            </Link>
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
