/**
 * @file apps/desktop/src/main/logging/log-path.ts
 * Privileged log directory resolution using Electron application paths.
 */

import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function resolveLogDirectory(): string {
  try {
    const { app } = electron;
    if (app && typeof app.getPath === 'function') {
      try {
        const logsPath = app.getPath('logs');
        if (!fs.existsSync(logsPath)) {
          fs.mkdirSync(logsPath, { recursive: true });
        }
        return logsPath;
      } catch {
        const userDataPath = app.getPath('userData');
        const fallbackLogsPath = path.join(userDataPath, 'logs');
        if (!fs.existsSync(fallbackLogsPath)) {
          fs.mkdirSync(fallbackLogsPath, { recursive: true });
        }
        return fallbackLogsPath;
      }
    }
  } catch {
    // In unit test or non-electron runner
  }

  const tmpPath = path.join(process.cwd(), '.tmp-logs');
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true });
  }
  return tmpPath;
}
