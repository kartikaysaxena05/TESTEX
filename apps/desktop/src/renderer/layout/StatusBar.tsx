import type { AppInfo } from '@ai-quality/contracts';
import type { BridgeConnectionState } from './TopBar.js';

interface StatusBarProps {
  bridgeState: BridgeConnectionState;
  appInfo: AppInfo | null;
}

export function StatusBar({ bridgeState, appInfo }: StatusBarProps) {
  const getAppDescriptor = () => {
    if (!appInfo) {
      return 'AI Quality Platform';
    }
    return `${appInfo.name} v${appInfo.version} (${appInfo.platform} / ${appInfo.arch})`;
  };

  const getBridgeLabel = () => {
    switch (bridgeState) {
      case 'ready':
        return 'Desktop Connected';
      case 'loading':
        return 'Connecting...';
      case 'unavailable':
      case 'error':
      default:
        return 'Desktop Offline';
    }
  };

  return (
    <footer className="statusbar" data-testid="statusbar" aria-label="Application Status Bar">
      <div className="statusbar-left">
        <span className="statusbar-item">{getAppDescriptor()}</span>
      </div>

      <div className="statusbar-right">
        <span className="statusbar-item">Sandbox Active</span>
        <span className="statusbar-item">·</span>
        <span className="statusbar-item">{getBridgeLabel()}</span>
      </div>
    </footer>
  );
}
