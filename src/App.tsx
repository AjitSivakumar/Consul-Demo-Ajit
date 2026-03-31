import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DeliverablesPage } from './pages/DeliverablesPage';
import { RealtimeMeetingPage } from './pages/RealtimeMeetingPage';
import { MeetingStoreProvider } from './state/MeetingStore';

export default function App(): React.JSX.Element {
  return (
    <MeetingStoreProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Routes>
            <Route path="/realtime" element={<RealtimeMeetingPage />} />
            <Route path="/deliverables" element={<DeliverablesPage />} />
            <Route path="*" element={<Navigate to="/realtime" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </MeetingStoreProvider>
  );
}
