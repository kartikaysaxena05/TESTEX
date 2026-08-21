import electron, { type BrowserWindow } from 'electron';
import { getSecureWebPreferences, applySecurityPolicies } from './security.js';
import { getRendererTargetUrl, getPreloadPath } from './paths.js';

let mainWindow: BrowserWindow | null = null;

/**
 * Returns the active main window instance if one exists.
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Create and configure the primary application BrowserWindow.
 */
export async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return mainWindow;
  }

  const targetUrl = getRendererTargetUrl();
  const preloadPath = getPreloadPath();

  const { BrowserWindow: BrowserWindowConstructor, session } = electron;

  mainWindow = new BrowserWindowConstructor({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'AI-Driven Software Quality Engineering Platform',
    webPreferences: getSecureWebPreferences(preloadPath),
  });

  // Apply strict navigation, popup, and permission policies
  applySecurityPolicies(mainWindow, session.defaultSession, targetUrl);

  // Prevent flash of unstyled content
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // Forward renderer console logs for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] (level ${level}) ${message} [${sourceId}:${line}]`);
  });

  // Track window failure
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[MainWindow] Failed to load content: ${errorDescription} (${errorCode}) at ${validatedURL}`,
      );
    },
  );

  // Release reference on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the target URL (app://renderer/index.html or dev server)
  try {
    await mainWindow.loadURL(targetUrl);
  } catch (error) {
    console.error(`[MainWindow] Error while loading URL "${targetUrl}":`, error);
    throw error;
  }

  return mainWindow;
}
