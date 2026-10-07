/**
 * @file apps/desktop/src/main/ipc/assertion-handlers.test.ts
 * Unit and security tests for desktop IPC assertion handlers (V5 Phase 67).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleAssert,
  handleEvaluateStepAssertions,
  setAssertionEngineForTest,
  setSessionManagerForTest,
} from './assertion-handlers.js';
import type {
  AssertInputDto,
  EvaluateStepAssertionsInputDto,
  ExecutableAssertionDto,
} from '@ai-quality/contracts';
import { AssertionEngine, BrowserSessionManager } from '@ai-quality/core';

describe('Assertion IPC Handlers Unit & Security Tests', () => {
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
    setAssertionEngineForTest(null);
    setSessionManagerForTest(null);
  });

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const payload: AssertInputDto = {
      projectId: crypto.randomUUID(),
      testRunId: crypto.randomUUID(),
      assertion: {
        id: crypto.randomUUID(),
        type: 'TEXT_EQUALS',
        target: { kind: 'ELEMENT', css: '#title' },
        expectedValue: { kind: 'LITERAL', value: 'Dashboard' },
        description: 'Verify title',
      },
    };

    const result = await handleAssert(untrustedEvent, payload);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const invalidPayload = {
      projectId: 'not-a-uuid',
      testRunId: crypto.randomUUID(),
      assertion: {} as any,
    };

    const result = await handleAssert(trustedEvent, invalidPayload as any);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles handleAssert successfully and returns structured assertion result', async () => {
    const projectId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const assertionId = crypto.randomUUID();

    const mockSession = {
      sessionId: testRunId,
      testRunId,
      projectId,
      page: { isClosed: () => false } as any,
      context: {} as any,
    };

    const mockSessionManager = {
      getSessionByRunId: (id: string) => (id === testRunId ? mockSession : undefined),
      getActiveSessions: () => [mockSession],
    } as unknown as BrowserSessionManager;

    const mockEngine = {
      evaluateAssertion: async () => ({
        assertionId,
        testRunId,
        projectId,
        assertionType: 'TEXT_EQUALS',
        operator: 'EQUALS',
        status: 'PASSED',
        expected: 'Dashboard',
        actual: 'Dashboard',
        durationMs: 15,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        isHard: true,
      }),
    } as unknown as AssertionEngine;

    setSessionManagerForTest(mockSessionManager);
    setAssertionEngineForTest(mockEngine);

    const payload: AssertInputDto = {
      projectId,
      testRunId,
      assertion: {
        id: assertionId,
        type: 'TEXT_EQUALS',
        target: { kind: 'ELEMENT', css: '#header' },
        expectedValue: { kind: 'LITERAL', value: 'Dashboard' },
        description: 'Verify header',
      },
    };

    const result = await handleAssert(trustedEvent, payload);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'PASSED');
      assert.equal(result.data.expected, 'Dashboard');
      assert.equal(result.data.actual, 'Dashboard');
    }
  });

  it('handles handleEvaluateStepAssertions successfully and aggregates outcomes', async () => {
    const projectId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const stepId = crypto.randomUUID();

    const mockSession = {
      sessionId: testRunId,
      testRunId,
      projectId,
      page: { isClosed: () => false } as any,
      context: {} as any,
    };

    const mockSessionManager = {
      getSessionByRunId: (id: string) => (id === testRunId ? mockSession : undefined),
      getActiveSessions: () => [mockSession],
    } as unknown as BrowserSessionManager;

    const mockEngine = {
      evaluateStepAssertions: async () => ({
        stepId,
        status: 'PASSED',
        passedCount: 2,
        failedCount: 0,
        errorCount: 0,
        durationMs: 30,
        results: [],
      }),
    } as unknown as AssertionEngine;

    setSessionManagerForTest(mockSessionManager);
    setAssertionEngineForTest(mockEngine);

    const assertions: ExecutableAssertionDto[] = [
      {
        id: crypto.randomUUID(),
        type: 'ELEMENT_VISIBLE',
        target: { kind: 'ELEMENT', css: '#btn' },
        description: 'Check visible',
      },
    ];

    const payload: EvaluateStepAssertionsInputDto = {
      projectId,
      testRunId,
      stepId,
      assertions,
    };

    const result = await handleEvaluateStepAssertions(trustedEvent, payload);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, 'PASSED');
      assert.equal(result.data.passedCount, 2);
    }
  });
});
