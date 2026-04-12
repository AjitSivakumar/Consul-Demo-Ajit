import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeliverablesPage } from './pages/DeliverablesPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { GroupsPage } from './pages/GroupsPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RealtimeMeetingPage } from './pages/RealtimeMeetingPage';
import { MeetingStoreProvider } from './state/MeetingStore';
import { useAuth } from './hooks/useAuth';

function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <div className="lp-wrap"><div className="lp-body"><p className="lp-sub">Loading…</p></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App(): React.JSX.Element {
  return (
    <MeetingStoreProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/groups" element={<RequireAuth><GroupsPage /></RequireAuth>} />
            <Route path="/groups/:id" element={<RequireAuth><GroupDetailPage /></RequireAuth>} />
            <Route path="/realtime" element={<RequireAuth><RealtimeMeetingPage /></RequireAuth>} />
            <Route path="/deliverables" element={<RequireAuth><DeliverablesPage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MeetingStoreProvider>
  );
}
