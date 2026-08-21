/**
 * @file apps/desktop/src/main/ipc/logging-handlers.test.ts
 * Unit tests for renderer error reporting IPC, rate limiting, and deduplication.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleReportRendererError, resetLoggingRateLimiterForTest } from './logging-handlers.js';
import { createSafeIpcHandler } from './register-ipc.js';
import { DESKTOP_CHANNELS } from '@ai-quality/contracts';

describe('Logging IPC Handlers & Rate Limiting Tests', () => {
  beforeEach(() => {
    resetLoggingRateLimiterForTest();
  });

  it('should accept and record a valid renderer error report', () => {
    const result = handleReportRendererError({
      source: 'react-error-boundary',
      message: 'Failed to render ProjectDashboard component.',
      stack: 'Error: Failed to render\n    at ProjectDashboard (ProjectDashboard.tsx:42)',
      route: '#/overview',
    });

    assert.deepStrictEqual(result, { recorded: true });
  });

  it('should reject reports with invalid source types', () => {
    assert.throws(
      () => {
        handleReportRendererError({
          source: 'unsupported-source-type',
          message: 'Error message',
        });
      },
      (err: Error) => err.name === 'ZodError',
    );
  });

  it('should reject reports with oversized messages exceeding 2000 characters', () => {
    const oversizedMessage = 'A'.repeat(2001);
    assert.throws(
      () => {
        handleReportRendererError({
          source: 'window-error',
          message: oversizedMessage,
        });
      },
      (err: Error) => err.name === 'ZodError',
    );
  });

  it('should reject reports with oversized stacks exceeding 8000 characters', () => {
    const oversizedStack = 'Stack: '.repeat(2000); // > 10,000 chars
    assert.throws(
      () => {
        handleReportRendererError({
          source: 'unhandled-rejection',
          message: 'Promise rejected',
          stack: oversizedStack,
        });
      },
      (err: Error) => err.name === 'ZodError',
    );
  });

  it('should deduplicate identical error reports occurring within the deduplication window', () => {
    const report = {
      source: 'window-error' as const,
      message: 'Network timeout when contacting loopback.',
    };

    const first = handleReportRendererError(report);
    assert.deepStrictEqual(first, { recorded: true });

    // Second identical report within 5 seconds should be suppressed
    const second = handleReportRendererError(report);
    assert.deepStrictEqual(second, { recorded: false });
  });

  it('should enforce rate limit and suppress writes when exceeding 20 reports per minute', () => {
    for (let i = 0; i < 20; i++) {
      const res = handleReportRendererError({
        source: 'react-error-boundary',
        message: `Unique error message ${i}`,
      });
      assert.deepStrictEqual(res, { recorded: true });
    }

    // 21st report exceeds limit and is suppressed
    const overflowRes = handleReportRendererError({
      source: 'react-error-boundary',
      message: 'Overflow error 21',
    });
    assert.deepStrictEqual(overflowRes, { recorded: false });
  });

  it('should reject untrusted IPC invocation through createSafeIpcHandler', async () => {
    const safeHandler = createSafeIpcHandler(
      DESKTOP_CHANNELS.LOGGING_REPORT_RENDERER_ERROR,
      (_event, payload) => handleReportRendererError(payload),
    );

    // Mock untrusted sender (missing frame or wrong origin)
    const mockUntrustedEvent = {
      senderFrame: null,
      sender: {},
    } as unknown as import('electron').IpcMainInvokeEvent;

    const res = await safeHandler(mockUntrustedEvent, {
      source: 'window-error',
      message: 'Unauthenticated message',
    });

    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });
});
