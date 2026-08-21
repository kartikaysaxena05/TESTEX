import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_VITE_DEV_PORT = 5173;
export const PRODUCTION_RENDERER_URL = 'app://renderer/index.html' as const;

/**
 * Get directory name in ESM runtime.
 */
function getCurrentDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return dirname(currentFile);
}

/**
 * Resolve the path to the application's desktop workspace root.
 */
export function getDesktopAppRoot(): string {
  const currentDir = getCurrentDir();
  // When compiled to dist/main, root is two levels up
  return resolve(currentDir, '..');
}

/**
 * Resolve the directory where the Vite React production bundle is built.
 */
export function getRendererDistDir(): string {
  const root = getDesktopAppRoot();
  return resolve(root, 'renderer');
}

/**
 * Resolve the path to the compiled CommonJS sandboxed preload script.
 */
export function getPreloadPath(): string {
  const root = getDesktopAppRoot();
  return resolve(root, 'preload', 'index.cjs');
}

/**
 * Validate development server URL ensuring strict loopback binding.
 */
export function isValidDevelopmentUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    const isLoopbackHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    const isHttp = parsed.protocol === 'http:';
    const isPortValid = parsed.port === String(DEFAULT_VITE_DEV_PORT) || parsed.port === '';
    return isHttp && isLoopbackHost && isPortValid;
  } catch {
    return false;
  }
}

/**
 * Get the target URL to load into BrowserWindow (dev server or production custom protocol).
 */
export function getRendererTargetUrl(): string {
  const devUrl = process.env['AI_QUALITY_RENDERER_DEV_URL'];
  if (devUrl && isValidDevelopmentUrl(devUrl)) {
    return devUrl;
  }
  return PRODUCTION_RENDERER_URL;
}
