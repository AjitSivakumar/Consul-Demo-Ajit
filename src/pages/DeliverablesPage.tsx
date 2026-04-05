import { useNavigate } from 'react-router-dom';
import { ActionList } from '../components/deliverables/ActionList';
import { QASection } from '../components/deliverables/QASection';
import { ResearchCard } from '../components/deliverables/ResearchCard';
import { SlideGrid } from '../components/deliverables/SlideGrid';
import { useMeetingStore } from '../state/MeetingStore';

export function DeliverablesPage(): React.JSX.Element {
  const { state, dispatch } = useMeetingStore();
  const navigate = useNavigate();

  const handleBack = (): void => {
    navigate('/realtime');
  };

  const handleNewMeeting = (): void => {
    dispatch({ type: 'RESET' });
    navigate('/realtime');
  };
  const g = state.generatedContent;
  const hasContent = Boolean(g.research || g.qa || g.actions || g.slides);

  const participants = state.context.participants.slice(0, 3).join(' · ');

  return (
    <main className="db-wrap">
      {/* ── Top Navigation ── */}
      <header className="topnav">
        <div className="nav-left">
          <img src="/logo.svg" alt="Ambi" className="nav-logo" />
          <span className="wordmark">ambi</span>
        </div>

        <div className="nav-center">
          <div className="meeting-title">{state.context.title || 'Post-Meeting Deliverables'}</div>
          <div className="meeting-sub">{participants || 'Meeting summary'}</div>
        </div>

        <div className="nav-right">
          <div className={`live-pill idle`}>
            <div className="live-dot" />
            {hasContent ? 'Ready' : 'Pending'}
          </div>
          <button type="button" className="nav-btn" onClick={handleBack}>
            ← Back
          </button>
          {hasContent && (
            <button type="button" className="nav-btn end" onClick={handleNewMeeting}>
              New Meeting
            </button>
          )}
        </div>
      </header>

      {/* ── Deliverables Body ── */}
      <div className="dl-body">
        {!hasContent ? (
          <div className="dl-empty">
            <div className="dl-empty-title">No deliverables generated yet</div>
            <p className="dl-empty-sub">
              Start the meeting, let Ambi capture the conversation, and end the meeting
              to generate the full deliverables package.
            </p>
            <button type="button" className="nav-btn deliver" onClick={handleBack}>
              Go to Meeting
            </button>
          </div>
        ) : (
          <div className="dl-main">
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
        )}
      </div>
    </main>
  );
}
