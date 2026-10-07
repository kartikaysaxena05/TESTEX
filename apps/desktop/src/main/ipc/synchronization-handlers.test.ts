/**
 * @file apps/desktop/src/main/ipc/synchronization-handlers.test.ts
 * Unit and security tests for desktop IPC synchronization handlers (V5 Phase 66).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleSynchronize,
  setSynchronizationCoordinatorForTest,
  setSessionManagerForTest,
} from './synchronization-handlers.js';
import type { SynchronizeStepInputDto } from '@ai-quality/contracts';
import {
  SynchronizationCoordinator,
  BrowserSessionManager,
  NavigationTimeoutError,
} from '@ai-quality/core';

describe('Synchronization IPC Handlers Unit & Security Tests', () => {
  function createMockEvent(isMainFrame = true): IpcMainInvokeEvent {
    return {
      senderFrame: {
        parent: isMainFrame ? null : ({} as any),
        url: isMainFrame ? 'app://renderer/index.html' : 'https://malicious-site.com',
      },
    } as unknown as IpcMainInvokeEvent;
  }

  const trustedEvent = createMockEvent(true);
  const untrustedEvent = createMockEvent(false);

  beforeEach(() => {
    setSynchronizationCoordinatorForTest(null);
    setSessionManagerForTest(null);
  });

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const payload: SynchronizeStepInputDto = {
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      strategy: 'AUTO',
    };

    const result = await handleSynchronize(untrustedEvent, payload);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const invalidPayload = {
      projectId: 'not-a-uuid',
      testRunId: crypto.randomUUID(),
      strategy: 'INVALID_STRATEGY' as any,
    };

    const result = await handleSynchronize(trustedEvent, invalidPayload as any);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles handleSynchronize successfully and sanitizes errors', async () => {
    const projectId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();

    const mockSession = {
      id: crypto.randomUUID(),
      testRunId,
      projectId,
      page: { isClosed: () => false } as any,
      context: {} as any,
    };

    const mockSessionManager = {
      getSession: (id: string) => (id === testRunId ? mockSession : undefined),
    } as unknown as BrowserSessionManager;

    const mockCoordinator = {
      synchronize: async () => ({
        strategy: 'URL',
        outcome: 'SATISFIED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 120,
        actualState: 'READY',
      }),
    } as unknown as SynchronizationCoordinator;

    setSessionManagerForTest(mockSessionManager);
    setSynchronizationCoordinatorForTest(mockCoordinator);

    const payload: SynchronizeStepInputDto = {
      projectId,
      testRunId,
      strategy: 'URL',
      urlPattern: '**/dashboard',
    };

    const result = await handleSynchronize(trustedEvent, payload);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.strategy, 'URL');
      assert.equal(result.data.outcome, 'SATISFIED');
    }
  });

  it('returns BROWSER_SESSION_NOT_FOUND when session does not exist', async () => {
    const projectId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();

    const mockSessionManager = {
      getSession: () => undefined,
    } as unknown as BrowserSessionManager;

    setSessionManagerForTest(mockSessionManager);

    const payload: SynchronizeStepInputDto = {
      projectId,
      testRunId,
      strategy: 'DOM_CONTENT_LOADED',
    };

    const result = await handleSynchronize(trustedEvent, payload);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'BROWSER_SESSION_NOT_FOUND');
    }
  });

  it('sanitizes domain error codes properly', async () => {
    const projectId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();

    const mockSession = {
      id: crypto.randomUUID(),
      testRunId,
      projectId,
      page: { isClosed: () => false } as any,
      context: {} as any,
    };

    const mockSessionManager = {
      getSession: () => mockSession,
    } as unknown as BrowserSessionManager;

    const mockCoordinator = {
      synchronize: async () => {
        throw new NavigationTimeoutError('**/checkout', 5000, 'http://localhost/cart');
      },
    } as unknown as SynchronizationCoordinator;

    setSessionManagerForTest(mockSessionManager);
    setSynchronizationCoordinatorForTest(mockCoordinator);

    const payload: SynchronizeStepInputDto = {
      projectId,
      testRunId,
      strategy: 'URL',
      urlPattern: '**/checkout',
    };

    const result = await handleSynchronize(trustedEvent, payload);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'NAVIGATION_TIMEOUT');
    }
  });
});
