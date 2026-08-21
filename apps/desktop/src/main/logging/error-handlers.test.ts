/**
 * @file apps/desktop/src/main/logging/error-handlers.test.ts
 * Unit tests for main process global exception handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleUncaughtException, handleUnhandledRejection } from './error-handlers.js';

describe('Main Process Global Error Handlers Tests', () => {
  it('should handle uncaughtException by logging fatal event and calling exit callback with code 1', async () => {
    let capturedExitCode: number | null = null;
    const mockExitFn = (code: number) => {
      capturedExitCode = code;
    };

    const fatalErr = new Error('Fatal database corruption or V8 OOM.');
    await handleUncaughtException(fatalErr, mockExitFn);

    assert.strictEqual(capturedExitCode, 1, 'Fatal handler must exit with code 1');
  });

  it('should handle unhandledRejection without throwing', () => {
    assert.doesNotThrow(() => {
      handleUnhandledRejection(new Error('Unexpected unhandled promise rejection.'));
    });

    assert.doesNotThrow(() => {
      handleUnhandledRejection('String rejection reason');
    });

    assert.doesNotThrow(() => {
      handleUnhandledRejection(null);
    });
  });
});
