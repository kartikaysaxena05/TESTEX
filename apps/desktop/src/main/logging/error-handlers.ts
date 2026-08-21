/**
 * @file apps/desktop/src/main/logging/error-handlers.ts
 * Centralized main process exception, rejection, and process lifecycle diagnostic handlers.
 */

import electron, { type BrowserWindow } from 'electron';
import { getLogger, flushLogger } from '@ai-quality/core';

let isGlobalHandlersRegistered = false;

/**
 * Handles fatal uncaught process exceptions: logs fatal event, flushes stream, and exits.
 */
export async function handleUncaughtException(
  err: unknown,
  exitFn: (code: number) => void = code => {
    if (electron.app) {
      electron.app.exit(code);
    } else {
      process.exit(code);
    }
  },
): Promise<void> {
  const logger = getLogger();
  logger.fatal('process.uncaught_exception', err);

  try {
    await flushLogger();
  } catch (flushErr) {
    console.error('[Fatal Handler] Error flushing logger during uncaughtException:', flushErr);
  }

  exitFn(1);
}

/**
 * Handles unhandled promise rejections in the main process: logs structured error.
 */
export function handleUnhandledRejection(reason: unknown): void {
  const logger = getLogger();
  logger.error('process.unhandled_rejection', reason);
}

/**
 * Registers global Node.js process error handlers once per application lifecycle.
 */
export function setupGlobalProcessErrorHandlers(exitFn?: (code: number) => void): void {
  if (isGlobalHandlersRegistered) return;
  isGlobalHandlersRegistered = true;

  process.on('uncaughtException', err => {
    void handleUncaughtException(err, exitFn);
  });

  process.on('unhandledRejection', reason => {
    handleUnhandledRejection(reason);
  });

  if (electron.app) {
    electron.app.on('child-process-gone', (_event, details) => {
      getLogger().warn('electron.child_process_gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });
  }
}

/**
 * Attaches diagnostics to BrowserWindow webContents for crash and load failure reporting.
 */
export function setupWindowErrorDiagnostics(window: BrowserWindow): void {
  if (!window || window.isDestroyed()) return;

  const { webContents } = window;

  // 1. Renderer process crash / termination diagnostics
  webContents.on('render-process-gone', (_event, details) => {
    getLogger().error('electron.renderer_process_gone', undefined, {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  // 2. Page load failure diagnostics
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    // Sanitize validatedURL to remove query parameters and potential secrets
    let safeUrl = validatedURL;
    try {
      const parsed = new URL(validatedURL);
      safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      safeUrl = '[Invalid URL]';
    }

    getLogger().warn('electron.page_load_failed', {
      errorCode,
      errorDescription,
      url: safeUrl,
    });
  });
}
