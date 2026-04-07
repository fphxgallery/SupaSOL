import type { ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { SwapPage } from './pages/SwapPage';
import { LendPage } from './pages/LendPage';
import { TriggerPage } from './pages/TriggerPage';
import { RecurringPage } from './pages/RecurringPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { PredictionPage } from './pages/PredictionPage';
import { SendPage } from './pages/SendPage';
import { StudioPage } from './pages/StudioPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

function PageBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<PageBoundary><DashboardPage /></PageBoundary>} />
        <Route path="swap" element={<PageBoundary><SwapPage /></PageBoundary>} />
        <Route path="lend" element={<PageBoundary><LendPage /></PageBoundary>} />
        <Route path="trigger" element={<PageBoundary><TriggerPage /></PageBoundary>} />
        <Route path="recurring" element={<PageBoundary><RecurringPage /></PageBoundary>} />
        <Route path="portfolio" element={<PageBoundary><PortfolioPage /></PageBoundary>} />
        <Route path="prediction" element={<PageBoundary><PredictionPage /></PageBoundary>} />
        <Route path="send" element={<PageBoundary><SendPage /></PageBoundary>} />
        <Route path="studio" element={<PageBoundary><StudioPage /></PageBoundary>} />
        <Route path="history" element={<PageBoundary><HistoryPage /></PageBoundary>} />
        <Route path="settings" element={<PageBoundary><SettingsPage /></PageBoundary>} />
      </Route>
    </Routes>
  );
}
