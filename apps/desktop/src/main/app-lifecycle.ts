import electron, { type BrowserWindow } from 'electron';
import { closeDatabaseManager, initLogger, getLogger, flushLogger } from '@ai-quality/core';
import { createMainWindow, getMainWindow } from './main-window.js';
import { setupCustomProtocolHandler } from './protocol.js';
import { getRendererDistDir } from './paths.js';
import { registerIpcHandlers } from './ipc/register-ipc.js';
import { resolveLogDirectory } from './logging/log-path.js';
import {
  setupGlobalProcessErrorHandlers,
  setupWindowErrorDiagnostics,
} from './logging/error-handlers.js';

const isSmokeTestMode =
  process.env['AI_QUALITY_ELECTRON_SMOKE'] === '1' || process.argv.includes('--smoke');

/**
 * Handle deterministic smoke testing verification flow verifying React mount, AppShell, IPC bridge, and route navigation.
 */
function handleSmokeTestMode(window: BrowserWindow): void {
  getLogger().info('smoke_test.started');
  const timeoutTimer = setTimeout(async () => {
    try {
      const bodyHtml = await window.webContents.executeJavaScript('document.body.innerHTML');
      getLogger().error('smoke_test.timeout', undefined, { bodyHtml });
    } catch (e) {
      getLogger().error('smoke_test.timeout_read_error', e);
    }
    electron.app.exit(1);
  }, 10000);

  if (!window || window.isDestroyed()) {
    getLogger().error('smoke_test.invalid_window');
    clearTimeout(timeoutTimer);
    electron.app.exit(1);
    return;
  }

  let routeTransitionInitiated = false;

  const checkNavigationReadiness = async (): Promise<void> => {
    try {
      const isBridgeReady = await window.webContents.executeJavaScript(
        'Boolean(document.querySelector(\'[data-desktop-bridge="ready"]\'))',
      );

      const isAppShellReady = await window.webContents.executeJavaScript(
        'Boolean(document.querySelector(\'[data-app-shell="ready"]\'))',
      );

      const hasDesktopApi = await window.webContents.executeJavaScript(
        'Boolean(window.desktop && window.desktop.app && window.desktop.health && window.desktop.database && window.desktop.logging)',
      );

      if (isBridgeReady && isAppShellReady && hasDesktopApi) {
        if (!routeTransitionInitiated) {
          const isOverviewScreen = await window.webContents.executeJavaScript(
            'Boolean(document.querySelector(\'[data-screen="overview"]\'))',
          );

          if (isOverviewScreen) {
            routeTransitionInitiated = true;
            getLogger().info('smoke_test.overview_verified');

            // Navigate to Requirements view
            await window.webContents.executeJavaScript(`
              const navLink = document.querySelector('a[href="#/requirements"]');
              if (navLink) {
                navLink.click();
              } else {
                window.location.hash = '#/requirements';
              }
            `);
          }
        } else {
          const isRequirementsScreen = await window.webContents.executeJavaScript(
            'Boolean(document.querySelector(\'[data-screen="requirements"], [data-screen="requirements-no-project"]\'))',
          );

          if (isRequirementsScreen) {
            clearTimeout(timeoutTimer);
            const loadedUrl = window.webContents.getURL();
            getLogger().info('smoke_test.completed', { url: loadedUrl });
            setTimeout(() => {
              void flushLogger().finally(() => {
                electron.app.exit(0);
              });
            }, 200);
            return;
          }
        }
      }

      setTimeout(() => {
        if (!window.isDestroyed()) {
          checkNavigationReadiness().catch(() => {});
        }
      }, 100);
    } catch {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          checkNavigationReadiness().catch(() => {});
        }
      }, 100);
    }
  };

  // Give React and Preload bridge a tick to mount then start checking
  setTimeout(() => {
    checkNavigationReadiness().catch(() => {});
  }, 100);
}

/**
 * Setup and orchestrate the full Electron application lifecycle.
 */
export function setupAppLifecycle(): void {
  const { app } = electron;

  // 1. Initialize Logger & Global Process Error Handlers early
  try {
    const logDir = resolveLogDirectory();
    initLogger({ logDir });
  } catch (err) {
    console.error('[Lifecycle] Logger initialization fallback to console:', err);
  }

  setupGlobalProcessErrorHandlers();

  // 2. Single Instance Lock - Prevent duplicate application instances
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    getLogger().warn('application.secondary_instance_detected');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  });

  // 3. Application Ready Handler
  app.whenReady().then(async () => {
    try {
      getLogger().info('application.started', {
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
      });

      // Register desktop IPC handlers
      registerIpcHandlers();

      // Register the production custom protocol handler
      setupCustomProtocolHandler(getRendererDistDir());

      const window = await createMainWindow();
      setupWindowErrorDiagnostics(window);

      if (isSmokeTestMode) {
        handleSmokeTestMode(window);
      }
    } catch (error) {
      getLogger().fatal('application.startup_failed', error);
      void flushLogger().finally(() => {
        app.exit(1);
      });
    }
  });

  // 4. Re-create Window on macOS Activation
  app.on('activate', async () => {
    if (getMainWindow() === null) {
      try {
        const window = await createMainWindow();
        setupWindowErrorDiagnostics(window);
      } catch (error) {
        getLogger().error('application.window_recreate_failed', error);
      }
    }
  });

  // 5. Window All Closed - Platform Specific Behavior
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // 6. Clean Shutdown & Database Connection Termination
  app.on('before-quit', () => {
    getLogger().info('application.shutdown');
    closeDatabaseManager().catch(err => {
      getLogger().warn('database.close_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    void flushLogger();
  });
}
