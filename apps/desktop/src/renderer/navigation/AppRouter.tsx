import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
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

interface AppRouterProps {
  bridgeState: BridgeConnectionState;
  appInfo: AppInfo | null;
}

export function AppRouter({ bridgeState, appInfo }: AppRouterProps) {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell bridgeState={bridgeState} appInfo={appInfo} />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewScreen />} />
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
    </HashRouter>
  );
}
