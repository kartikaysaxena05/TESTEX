/**
 * @file packages/core/src/execution/execution-errors.test.ts
 * Unit tests for execution domain errors and sanitization behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BrowserLaunchFailedError,
  BrowserRuntimeError,
  BrowserUnavailableError,
  BrowserUnsupportedError,
  ExecutionCleanupFailedError,
  ExecutionProjectMismatchError,
  ExecutionRequestInvalidError,
  ExecutionSecurityViolationError,
  ExecutionTestNotApprovedError,
  ExecutionTestNotExecutableError,
  ExecutionTestNotFoundError,
  ExecutionTestRejectedError,
  ExecutionTestStaleError,
  ExecutionTimeoutError,
} from './execution-errors.js';

describe('Execution Domain Errors Unit Tests', () => {
  it('instantiates ExecutionRequestInvalidError with correct code and status', () => {
    const err = new ExecutionRequestInvalidError('Malformed payload', { field: 'timeoutMs' });
    assert.equal(err.code, 'EXECUTION_REQUEST_INVALID');
    assert.equal(err.status, 400);
    assert.equal(err.toDesktopError().code, 'EXECUTION_REQUEST_INVALID');
    assert.equal(err.toDesktopError().message, 'Malformed payload');
  });

  it('instantiates ExecutionProjectMismatchError with 403 status', () => {
    const err = new ExecutionProjectMismatchError('tc-1', 'proj-A', 'proj-B');
    assert.equal(err.code, 'EXECUTION_PROJECT_MISMATCH');
    assert.equal(err.status, 403);
    assert.ok(err.message.includes('belongs to project'));
  });

  it('instantiates ExecutionTestNotFoundError with 404 status', () => {
    const err = new ExecutionTestNotFoundError('tc-1', 'proj-A');
    assert.equal(err.code, 'EXECUTION_TEST_NOT_FOUND');
    assert.equal(err.status, 404);
  });

  it('instantiates ExecutionTestNotApprovedError with 400 status', () => {
    const err = new ExecutionTestNotApprovedError('tc-1', 'DRAFT');
    assert.equal(err.code, 'EXECUTION_TEST_NOT_APPROVED');
    assert.equal(err.status, 400);
    assert.ok(err.message.includes('DRAFT'));
  });

  it('instantiates ExecutionTestStaleError with version comparison', () => {
    const err = new ExecutionTestStaleError('tc-1', 1, 2);
    assert.equal(err.code, 'EXECUTION_TEST_STALE');
    assert.ok(err.message.includes('version 1'));
    assert.ok(err.message.includes('version 2'));
  });

  it('instantiates ExecutionTestRejectedError', () => {
    const err = new ExecutionTestRejectedError('tc-1', 'Invalid expected result');
    assert.equal(err.code, 'EXECUTION_TEST_REJECTED');
    assert.ok(err.message.includes('Invalid expected result'));
  });

  it('instantiates ExecutionTestNotExecutableError', () => {
    const err = new ExecutionTestNotExecutableError('tc-1', 'Missing required preconditions');
    assert.equal(err.code, 'EXECUTION_TEST_NOT_EXECUTABLE');
  });

  it('sanitizes filesystem paths in BrowserLaunchFailedError', () => {
    const rawError = new Error('Executable missing at /Users/secret/node_modules/playwright/bin');
    const err = new BrowserLaunchFailedError('chromium', rawError);
    assert.equal(err.code, 'BROWSER_LAUNCH_FAILED');
    assert.equal(err.status, 500);
    assert.ok(!err.message.includes('/Users/secret'));
    assert.ok(err.message.includes('[path]'));
  });

  it('instantiates BrowserRuntimeError', () => {
    const err = new BrowserRuntimeError('Page crashed during execution');
    assert.equal(err.code, 'BROWSER_RUNTIME_ERROR');
    assert.equal(err.status, 500);
  });

  it('instantiates BrowserUnavailableError with 503 status', () => {
    const err = new BrowserUnavailableError('chromium');
    assert.equal(err.code, 'BROWSER_UNAVAILABLE');
    assert.equal(err.status, 503);
  });

  it('instantiates BrowserUnsupportedError with 400 status', () => {
    const err = new BrowserUnsupportedError('safari-custom');
    assert.equal(err.code, 'BROWSER_UNSUPPORTED');
    assert.equal(err.status, 400);
  });

  it('instantiates ExecutionTimeoutError with 408 status', () => {
    const err = new ExecutionTimeoutError('navigation', 30000);
    assert.equal(err.code, 'EXECUTION_TIMEOUT');
    assert.equal(err.status, 408);
  });

  it('instantiates ExecutionCleanupFailedError with 500 status', () => {
    const err = new ExecutionCleanupFailedError('exec-1', 'Process unresponsive');
    assert.equal(err.code, 'EXECUTION_CLEANUP_FAILED');
    assert.equal(err.status, 500);
  });

  it('instantiates ExecutionSecurityViolationError with 403 status', () => {
    const err = new ExecutionSecurityViolationError('--no-sandbox flag is prohibited');
    assert.equal(err.code, 'EXECUTION_SECURITY_VIOLATION');
    assert.equal(err.status, 403);
  });
});
