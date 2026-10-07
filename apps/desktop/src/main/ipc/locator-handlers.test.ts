/**
 * @file apps/desktop/src/main/ipc/locator-handlers.test.ts
 * Unit and security tests for Locator Resolution IPC handlers (V5 Phase 64).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import { handleResolveLocator, setLocatorResolutionServiceForTest } from './locator-handlers.js';
import { LocatorNotFoundError } from '@ai-quality/core';

describe('Locator Resolution IPC Handlers Unit & Security Tests', () => {
  beforeEach(() => {
    setLocatorResolutionServiceForTest(null);
  });

  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'http://evil.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const untrustedEvent = createMockEvent(false);
    const result = await handleResolveLocator(untrustedEvent, {
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      target: { kind: 'CONTROL', name: 'Submit' },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const trustedEvent = createMockEvent(true);
    const result = await handleResolveLocator(trustedEvent, {
      projectId: 'not-a-uuid',
      testRunId: 'invalid-id',
      target: {} as any,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles resolveLocator successfully and sanitizes errors', async () => {
    const mockService = {
      resolveLocator: async () => {
        throw new LocatorNotFoundError('Button not found', 5000);
      },
    } as any;

    setLocatorResolutionServiceForTest(mockService);

    const trustedEvent = createMockEvent(true);
    const result = await handleResolveLocator(trustedEvent, {
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      target: { kind: 'CONTROL', name: 'Submit' },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'LOCATOR_NOT_FOUND');
    }
  });
});
