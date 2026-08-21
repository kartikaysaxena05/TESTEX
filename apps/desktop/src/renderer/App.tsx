import { useEffect, useState } from 'react';
import type { AppInfo } from '@ai-quality/contracts';
import { AppRouter } from './navigation/AppRouter.js';
import type { BridgeConnectionState } from './layout/TopBar.js';
import { ProjectProvider } from './context/ProjectContext.js';

export function App() {
  const [bridgeState, setBridgeState] = useState<BridgeConnectionState>('loading');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initializeBridge() {
      if (!window.desktop) {
        if (isMounted) {
          setBridgeState('unavailable');
        }
        return;
      }

      try {
        // 1. Health check IPC
        const healthResult = await window.desktop.health.check();
        if (!healthResult.ok) {
          if (isMounted) {
            setBridgeState('error');
          }
          return;
        }

        // 2. App Info metadata IPC
        const appInfoResult = await window.desktop.app.getInfo();
        if (!appInfoResult.ok) {
          if (isMounted) {
            setBridgeState('error');
          }
          return;
        }

        if (isMounted) {
          setAppInfo(appInfoResult.data);
          setBridgeState('ready');
        }
      } catch {
        if (isMounted) {
          setBridgeState('error');
        }
      }
    }

    initializeBridge();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      className="app-root-container"
      data-app-ready="true"
      data-desktop-bridge={bridgeState === 'ready' ? 'ready' : 'not-ready'}
      data-app-shell="ready"
    >
      <ProjectProvider>
        <AppRouter bridgeState={bridgeState} appInfo={appInfo} />
      </ProjectProvider>
    </div>
  );
}
