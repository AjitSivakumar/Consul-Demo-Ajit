import { Link } from 'react-router-dom';
import { ActionList } from '../components/deliverables/ActionList';
import { QASection } from '../components/deliverables/QASection';
import { ResearchCard } from '../components/deliverables/ResearchCard';
import { SlideGrid } from '../components/deliverables/SlideGrid';
import { useMeetingStore } from '../state/MeetingStore';

export function DeliverablesPage(): React.JSX.Element {
  const { state } = useMeetingStore();
  const g = state.generatedContent;
  const hasContent = Boolean(g.research || g.qa || g.actions || g.slides);

  const elementCount = [g.research, g.qa, g.actions, g.slides].filter(Boolean).length;

  return (
    <div className="dl-page">
      {/* TOPBAR — matches ambient live page */}
      <header className="ambient-topbar">
        <div className="ambient-logo">
          <span className="ambient-logo-dot" />
          ambi
        </div>

        <div className="ambient-meeting-info">
          <div className="ambient-meeting-title">Post-Meeting Deliverables</div>
          <div className="ambient-live-badge ambient-done-badge">
            {hasContent ? 'READY' : 'PENDING'}
          </div>
        </div>

        <div className="ambient-topbar-right">
          <Link to="/realtime" className="ambient-btn ghost">
            ← Back to Meeting
          </Link>
        </div>
      </header>

      {/* HERO */}
      <div className="dl-hero">
        <div>
          <div className="dl-hero-eyebrow">
            {state.context.accountContext} · {state.context.projectContext}
          </div>
          <h1 className="dl-title">
            {state.context.title} debrief
          </h1>
          <div className="dl-hero-meta">
            {state.context.participants.map((p) => (
              <span className="dl-hero-chip" key={p}>{p}</span>
            ))}
            {g.generatedAt && (
              <span className="dl-hero-chip">
                {new Date(g.generatedAt).toLocaleDateString(undefined, { weekday: 'long' })}
              </span>
            )}
          </div>
        </div>
        <div className="dl-hero-stats">
          <div className="dl-hero-stat-num">{elementCount}</div>
          <div className="dl-hero-stat-label">
            deliverable elements<br />generated
          </div>
        </div>
      </div>

      {/* MOCK BANNER */}
      <div className="dl-mock-banner">
        <div className="dl-mock-icon">📂</div>
        <div className="dl-mock-content">
          <h4>Pre-call data feed — context provided to Ambi</h4>
          <p>
            Before the meeting, context documents were uploaded to Ambi&apos;s session:
            {' '}<strong>internal product docs</strong>, <strong>client intelligence</strong>,
            and any relevant prior materials. Ambi indexed these at session start so live
            research triggers could pull from them during the call.
          </p>
        </div>
      </div>

      {/* MAIN */}
      <div className="dl-main">
        {!hasContent ? (
          <div className="dl-section">
            <div className="dl-card">
              <div className="dl-card-head">
                <div className="dl-elem-badge dl-e1">—</div>
                <div className="dl-card-head-title">No deliverables generated yet</div>
              </div>
              <div className="dl-card-body">
                <p className="dl-info-text">
                  Start the meeting, let Ambi capture the conversation, and end the meeting
                  to generate the full deliverables package.
                </p>
                <Link to="/realtime" className="ambient-btn" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>
                  Go to Meeting
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {g.research && (
          <div className="dl-section">
            <ResearchCard data={g.research} />
          </div>
        )}

        {g.qa && g.qa.categories.length > 0 && (
          <div className="dl-section">
            <QASection data={g.qa} />
          </div>
        )}

        {g.actions && g.actions.items.length > 0 && (
          <div className="dl-section">
            <ActionList data={g.actions} />
          </div>
        )}

        {g.slides && g.slides.slides.length > 0 && (
          <div className="dl-section">
            <SlideGrid data={g.slides} />
          </div>
        )}
      </div>

      {/* FOOTER */}
      {hasContent && (
        <div className="dl-footer-note">
          <p>
            <strong>Note:</strong> All content is AI-generated from the meeting transcript
            and uploaded documents. Fields marked as pending require manual confirmation
            before external sharing.
          </p>
        </div>
      )}
    </div>
  );
}
