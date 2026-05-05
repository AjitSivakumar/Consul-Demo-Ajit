import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AboutPage } from './pages/AboutPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { ContactPage } from './pages/ContactPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeliverablesPage } from './pages/DeliverablesPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { GroupsPage } from './pages/GroupsPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { MarketingPage } from './pages/MarketingPage';
import { RealtimeMeetingPage } from './pages/RealtimeMeetingPage';
import { MeetingStoreProvider } from './state/MeetingStore';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { PasswordGate } from './components/common/PasswordGate';

function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user, loading } = useAuth();
  if (!supabase) return <>{children}</>;
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
            <Route path="/" element={<MarketingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/app" element={<PasswordGate><LandingPage /></PasswordGate>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/dashboard" element={<PasswordGate><RequireAuth><DashboardPage /></RequireAuth></PasswordGate>} />
            <Route path="/groups" element={<PasswordGate><RequireAuth><GroupsPage /></RequireAuth></PasswordGate>} />
            <Route path="/groups/:id" element={<PasswordGate><RequireAuth><GroupDetailPage /></RequireAuth></PasswordGate>} />
            <Route path="/realtime" element={<PasswordGate><RequireAuth><RealtimeMeetingPage /></RequireAuth></PasswordGate>} />
            <Route path="/deliverables" element={<PasswordGate><RequireAuth><DeliverablesPage /></RequireAuth></PasswordGate>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MeetingStoreProvider>
  );
}
