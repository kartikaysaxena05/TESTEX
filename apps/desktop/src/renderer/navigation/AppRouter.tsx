import { HashRouter, MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { AppInfo } from '@ai-quality/contracts';
import type { BridgeConnectionState } from '../layout/TopBar.js';
import { AppShell } from '../layout/AppShell.js';
import { OverviewScreen } from '../screens/OverviewScreen.js';
import { ProjectsScreen } from '../screens/ProjectsScreen.js';
import { SourceScreen } from '../screens/SourceScreen.js';
import { RequirementsScreen } from '../screens/RequirementsScreen.js';
import { TestCasesScreen } from '../screens/TestCasesScreen.js';
import { TestRunsScreen } from '../screens/TestRunsScreen.js';
import { DefectsScreen } from '../screens/DefectsScreen.js';
import { TraceabilityScreen } from '../screens/TraceabilityScreen.js';
import { ReportsScreen } from '../screens/ReportsScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { NotFoundScreen } from '../screens/NotFoundScreen.js';
import { ProjectRouteGuard } from './ProjectRouteGuard.js';
import { useAuth } from '../context/AuthContext.js';
import { AuthScreen } from '../screens/auth/AuthScreen.js';

interface AppRouterProps {
  bridgeState: BridgeConnectionState;
  appInfo: AppInfo | null;
}

export function AppRouter({ bridgeState, appInfo }: AppRouterProps) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="auth-loading-screen" data-testid="auth-loading-state">
        <div className="auth-loading-spinner" />
        <span className="auth-loading-text">Authenticating session...</span>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <AuthScreen />;
  }

  const Router = typeof window !== 'undefined' ? HashRouter : MemoryRouter;

  return (
    <Router>
      <Routes>
        <Route element={<AppShell bridgeState={bridgeState} appInfo={appInfo} />}>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<OverviewScreen />} />
          <Route path="/workspace/:projectId" element={<ProjectRouteGuard />} />
          <Route path="/workspace/:projectId/:section" element={<ProjectRouteGuard />} />
          <Route path="/overview" element={<OverviewScreen />} />
          <Route path="/project/:projectId" element={<ProjectRouteGuard />} />
          <Route path="/project/:projectId/session/:sessionId" element={<ProjectRouteGuard />} />
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/source" element={<SourceScreen />} />
          <Route path="/requirements" element={<RequirementsScreen />} />
          <Route path="/test-cases" element={<TestCasesScreen />} />
          <Route path="/test-runs" element={<TestRunsScreen />} />
          <Route path="/defects" element={<DefectsScreen />} />
          <Route path="/traceability" element={<TraceabilityScreen />} />
          <Route path="/reports" element={<ReportsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </Router>
  );
}
