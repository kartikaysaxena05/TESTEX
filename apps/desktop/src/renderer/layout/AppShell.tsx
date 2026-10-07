import type { AppInfo } from '@ai-quality/contracts';
import type { BridgeConnectionState } from './TopBar.js';
import { CodexShell } from '../features/shell/CodexShell.js';

interface AppShellProps {
  bridgeState: BridgeConnectionState;
  appInfo: AppInfo | null;
}

export function AppShell({ bridgeState, appInfo }: AppShellProps) {
  return <CodexShell bridgeState={bridgeState} appInfo={appInfo} />;
}

