import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import CandidatesPage from './pages/CandidatesPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import LevelEnginePage from './pages/LevelEnginePage';
import AuditLogsPage from './pages/AuditLogsPage';
import NotFoundPage from './pages/NotFoundPage';
import PipelinePage from './pages/PipelinePage';

function Auth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<Auth><Layout><DashboardPage /></Layout></Auth>} />
        <Route path="/jobs" element={<Auth><Layout><JobsPage /></Layout></Auth>} />
        <Route path="/jobs/:id" element={<Auth><Layout><JobDetailPage /></Layout></Auth>} />
        <Route path="/candidates" element={<Auth><Layout><CandidatesPage /></Layout></Auth>} />
        <Route path="/candidates/:id" element={<Auth><Layout><CandidateDetailPage /></Layout></Auth>} />
        <Route path="/analytics" element={<Auth><Layout><AnalyticsPage /></Layout></Auth>} />
        <Route path="/pipeline" element={<Auth><Layout><PipelinePage /></Layout></Auth>} />
        <Route path="/profile" element={<Auth><Layout><ProfilePage /></Layout></Auth>} />
        <Route path="/settings" element={<Auth><Layout><SettingsPage /></Layout></Auth>} />
        <Route path="/admin" element={<Auth><Layout><AdminPage /></Layout></Auth>} />
        <Route path="/audit-logs" element={<Auth><Layout><AuditLogsPage /></Layout></Auth>} />
        <Route path="/level-engine" element={<Auth><Layout><LevelEnginePage /></Layout></Auth>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
