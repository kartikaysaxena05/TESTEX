/**
 * @file apps/desktop/src/main/index.ts
 * Electron Main Process Entry Point.
 *
 * Subsystems:
 * - Custom protocol scheme registration
 * - Sandbox initialization
 * - Top-level process exception & rejection handlers
 * - Application lifecycle orchestration
 */

import electron from 'electron';
import { registerRendererScheme } from './protocol.js';
import { setupAppLifecycle } from './app-lifecycle.js';

// Top-level error safety handlers
process.on('uncaughtException', error => {
  console.error('[Main Process] Uncaught Exception:', error.message, error.stack);
});

process.on('unhandledRejection', reason => {
  console.error('[Main Process] Unhandled Promise Rejection:', reason);
});

// Register custom app:// scheme as standard and secure before ready
registerRendererScheme();

// Enforce Chromium sandbox globally before app is ready
electron.app.enableSandbox();

// Initialize application lifecycle, protocol handlers, and window management
setupAppLifecycle();
