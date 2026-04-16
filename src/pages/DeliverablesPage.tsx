import { Component, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavBar } from '../components/common/NavBar';
import { ActionList } from '../components/deliverables/ActionList';
import { ChenLabDeliverable } from '../components/deliverables/ChenLabDeliverable';
import { QASection } from '../components/deliverables/QASection';
import { ResearchCard } from '../components/deliverables/ResearchCard';
import { SlideGrid } from '../components/deliverables/SlideGrid';
import { useMeetingStore } from '../state/MeetingStore';

class DeliverableErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  render() {
    if (this.state.error) {
      return (
        <div className="dl-empty">
          <div className="dl-empty-title">Something went wrong rendering deliverables</div>
          <p className="dl-empty-sub" style={{ color: 'var(--accent-red, #f87171)', fontFamily: 'monospace', fontSize: 12 }}>
            {this.state.error}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const isChenLabPreset = state.activePresetId === 'chen-tobin-heat' || state.activePresetId === 'chen-tobin-heat-auto';
  const hasContent = Boolean(g.research || g.qa || g.actions) || (isChenLabPreset && state.liveStatus === 'ended');

  const handleDownloadPDF = (): void => {
    window.print();
  };

  const participants = (state.context.participants ?? []).slice(0, 3).join(' · ');

  return (
    <main className="db-wrap">
      {/* ── Top Navigation ── */}
      <NavBar
        headerClassName="topnav"
        centerSlot={
          <>
            <div className="meeting-title">{state.context.title || 'Post-Meeting Deliverables'}</div>
            <div className="meeting-sub">{participants || 'Meeting summary'}</div>
          </>
        }
        rightSlot={
          <>
            <div className="live-pill idle">
              <div className="live-dot" />
              {hasContent ? 'Ready' : 'Pending'}
            </div>
            <button type="button" className="nav-btn" onClick={handleBack}>← Back</button>
            {hasContent && (
              <button type="button" className="nav-btn dl-pdf-btn" onClick={handleDownloadPDF}>↓ PDF</button>
            )}
            {hasContent && (
              <button type="button" className="nav-btn end" onClick={handleNewMeeting}>New Meeting</button>
            )}
          </>
        }
      />

      {/* ── Deliverables Body ── */}
      <div className="dl-body">
        <DeliverableErrorBoundary>
        {isChenLabPreset && state.liveStatus === 'ended' ? (
          <div className="dl-main"><ChenLabDeliverable /></div>
        ) : !hasContent ? (
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
        </DeliverableErrorBoundary>
      </div>
    </main>
  );
}
