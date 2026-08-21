import type { AppInfo } from '@ai-quality/contracts';
import { Sidebar } from './Sidebar.js';
import { TopBar, type BridgeConnectionState } from './TopBar.js';
import { Workspace } from './Workspace.js';
import { StatusBar } from './StatusBar.js';

interface AppShellProps {
  bridgeState: BridgeConnectionState;
  appInfo: AppInfo | null;
}

export function AppShell({ bridgeState, appInfo }: AppShellProps) {
  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-shell-body">
        <Sidebar />
        <div className="content-area">
          <TopBar bridgeState={bridgeState} />
          <Workspace />
        </div>
      </div>
      <StatusBar bridgeState={bridgeState} appInfo={appInfo} />
    </div>
  );
}
