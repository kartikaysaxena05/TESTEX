/**
 * @file apps/desktop/src/main/ipc/logging-handlers.ts
 * IPC handlers for restricted renderer error reporting with rate-limiting and deduplication.
 */

import {
  rendererErrorReportSchema,
  type RendererErrorReport,
  type RendererErrorReportResult,
} from '@ai-quality/contracts';
import { getLogger } from '@ai-quality/core';

interface ErrorReportEntry {
  readonly timestamp: number;
  readonly key: string;
}

// In-memory sliding window for rate limiting and deduplication
const reportsHistory: ErrorReportEntry[] = [];
let rateLimitWarningLogged = false;

const MAX_REPORTS_PER_MINUTE = 20;
const DEDUPLICATION_WINDOW_MS = 5000;

export function resetLoggingRateLimiterForTest(): void {
  reportsHistory.length = 0;
  rateLimitWarningLogged = false;
}

export function handleReportRendererError(payload: unknown): RendererErrorReportResult {
  // 1. Runtime validation with strict size bounds
  const report: RendererErrorReport = rendererErrorReportSchema.parse(payload);

  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // 2. Clean old entries outside the 1-minute window
  while (reportsHistory.length > 0 && reportsHistory[0]!.timestamp < oneMinuteAgo) {
    reportsHistory.shift();
  }

  // 3. Check rate limit
  if (reportsHistory.length >= MAX_REPORTS_PER_MINUTE) {
    if (!rateLimitWarningLogged) {
      rateLimitWarningLogged = true;
      getLogger().warn('renderer.error.rate_limited', {
        reason: 'Maximum renderer error reports exceeded limit (20/min).',
      });
    }
    return { recorded: false };
  }

  // Reset warning flag if back under threshold
  rateLimitWarningLogged = false;

  // 4. Deduplicate identical errors within deduplication window
  const deduplicationKey = `${report.source}:${report.message}`;
  const isDuplicate = reportsHistory.some(
    entry => entry.key === deduplicationKey && now - entry.timestamp < DEDUPLICATION_WINDOW_MS,
  );

  if (isDuplicate) {
    return { recorded: false };
  }

  // Record entry
  reportsHistory.push({
    timestamp: now,
    key: deduplicationKey,
  });

  // 5. Write structured log event
  getLogger().error('renderer.error_reported', undefined, {
    source: report.source,
    message: report.message,
    stack: report.stack,
    componentStack: report.componentStack,
    route: report.route,
  });

  return { recorded: true };
}
