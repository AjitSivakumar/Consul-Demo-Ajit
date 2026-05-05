import { Link } from 'react-router-dom';

const team = [
  {
    initials: 'SK',
    name: 'Shaezmina Khan',
    role: 'Co-Founder & CEO',
    bio: 'Career spanning the U.S. Congress House Foreign Affairs Committee, the European Commission, the Oxford Union, and Yale Law. Watched critical decisions collapse in real time because the right intelligence wasn\'t in the room. Knows how to build institutional trust and how to sell the fix.',
    tags: ['Yale', 'Oxford Union', 'U.S. Congress', 'European Commission'],
  },
  {
    initials: 'SL',
    name: 'Shan Lateef',
    role: 'Co-Founder & Chief of Research',
    bio: 'Clinical research and global public health background across Yale School of Medicine, NIH, Oxford, and IIT. MSc in Modelling for Global Health from Oxford. Observed firsthand that strategic decisions require pulling from data systems that never talk to each other and never show up in the same room.',
    tags: ['Oxford', 'Yale SOM', 'NIH', 'IIT'],
  },
  {
    initials: 'AS',
    name: 'Ajit Sivakumar',
    role: 'Co-Founder & CTO',
    bio: 'CS & Mathematics at NYU Courant, specializing in deep learning. Improved ETF return prediction 43% at Rebellion Research. Reduced interaction latency 36% at Superfocus.ai. Building ambi\'s real-time AI engine and agentic reasoning layer.',
    tags: ['NYU Courant', 'Rebellion Research', 'Superfocus.ai'],
  },
];

export function AboutPage(): React.JSX.Element {
  return (
    <div className="mk-wrap">
      <nav className="mk-nav">
        <div className="mk-nav-inner">
          <Link to="/" className="mk-logo-link">
            <img src="/logo.svg" alt="ambi" className="mk-nav-logo" />
            <span className="mk-wordmark">ambi</span>
          </Link>
          <div className="mk-nav-links" style={{ marginLeft: 'auto' }}>
            <Link to="/contact" className="mk-footer-link" style={{ fontSize: '14px', padding: '6px 14px' }}>Contact</Link>
          </div>
        </div>
      </nav>

      <main style={{ paddingTop: '68px' }}>
        {/* Vision */}
        <section className="mk-about-vision">
          <div className="mk-section-inner">
            <blockquote className="mk-pull-quote">
              "We didn't find this problem. We lived it. All three founders have spent their careers inside the exact rooms ambi is built for."
            </blockquote>
            <p className="mk-about-para">
              AI has begun to change how organizations operate from an efficiency standpoint, but it has not yet changed the underlying model of how people actually work together. ambi is building toward that future — an ambient intelligence layer that participates in the room, closes information gaps as they emerge, and transforms meetings from decision dead-ends into engines of progress.
            </p>
          </div>
        </section>

        {/* Team */}
        <section className="mk-section">
          <div className="mk-section-inner">
            <span className="mk-eyebrow">The Team</span>
            <h2 className="mk-section-heading">Built by people who lived the problem.</h2>
            <div className="mk-team-grid">
              {team.map((m) => (
                <div key={m.name} className="mk-team-card">
                  <div className="mk-team-avatar">{m.initials}</div>
                  <h3 className="mk-team-name">{m.name}</h3>
                  <span className="mk-team-role">{m.role}</span>
                  <p className="mk-team-bio">{m.bio}</p>
                  <div className="mk-team-tags">
                    {m.tags.map(t => <span key={t} className="mk-team-tag">{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Advisor */}
        <section className="mk-section mk-section-alt">
          <div className="mk-section-inner">
            <span className="mk-eyebrow">Advisor</span>
            <div className="mk-advisor-card">
              <div className="mk-team-avatar">DG</div>
              <div className="mk-advisor-content">
                <h3 className="mk-team-name">Dan Goldsmith</h3>
                <span className="mk-team-role">Co-Founder & Partner, Proofpoint Capital · Former CEO, Instructure (Canvas LMS)</span>
                <p className="mk-team-bio">
                  As CEO of Instructure, Dan led a $2B public-to-private exit, grew annual revenue past $250M, and served 30M+ students across 5,000+ institutions. His career spans Accenture, PwC, IBM, and eight years as a founding executive at Veeva Systems (IPO, $20B market cap). He is actively supporting ambi's LOI pipeline with direct introductions to IBM, Accenture, and SEI.
                </p>
                <div className="mk-team-tags">
                  {['Instructure / Canvas', 'Veeva Systems', 'Accenture', 'IBM', 'Proofpoint Capital', '$2B Exit'].map(t => (
                    <span key={t} className="mk-team-tag">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
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
