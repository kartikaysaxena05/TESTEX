/**
 * @file apps/desktop/src/main/ipc/action-execution-handlers.test.ts
 * Unit and security tests for Action Execution IPC Handlers (V5 Phase 63).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  ExecuteActionInputDto,
  ExecuteStepInputDto,
  ActionResultDto,
  StepExecutionResultDto,
} from '@ai-quality/contracts';
import {
  handleExecuteAction,
  handleExecuteStep,
  setActionExecutionServiceForTest,
} from './action-execution-handlers.js';
import { ActionExecutionService, CrossRunExecutionError } from '@ai-quality/core';

describe('Action Execution IPC Handlers Unit & Security Tests', () => {
  const validEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedSubframeEvent = {
    senderFrame: {
      parent: {}, // Nested subframe is untrusted
      url: 'http://localhost:5173/subframe.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const mockService = {
    executeAction: async (input: ExecuteActionInputDto): Promise<ActionResultDto> => {
      if (input.projectId === '00000000-0000-0000-0000-000000000000') {
        throw new CrossRunExecutionError('Cross-project access blocked');
      }
      return {
        actionId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
        stepId: input.stepId,
        testRunId: input.testRunId,
        projectId: input.projectId,
        actionType: input.action.action,
        status: 'PASSED',
        riskLevel: 'MUTATING',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 42,
        targetSummary: 'test-button',
        forceUsed: false,
      };
    },
    executeStep: async (input: ExecuteStepInputDto): Promise<StepExecutionResultDto> => ({
      stepId: input.step.id,
      sequence: input.step.sequence,
      actionResult: {
        actionId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
        stepId: input.step.id,
        testRunId: input.testRunId,
        projectId: input.projectId,
        actionType: input.step.action,
        status: 'PASSED',
        riskLevel: 'MUTATING',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 42,
        targetSummary: 'test-step-target',
        forceUsed: false,
      },
      status: 'PASSED',
      durationMs: 42,
    }),
  } as unknown as ActionExecutionService;

  before(() => {
    setActionExecutionServiceForTest(mockService);
  });

  after(() => {
    setActionExecutionServiceForTest(null);
  });

  it('rejects invocations from untrusted senders with UNAUTHORIZED_SENDER', async () => {
    const res = await handleExecuteAction(untrustedSubframeEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      testRunId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
      action: {
        id: 'd9e79391-7667-4e3e-a107-5509930f30c3',
        sequence: 1,
        action: 'CLICK',
        description: 'Click button',
        isOptional: false,
        assertions: [],
      },
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates input schemas and rejects invalid payloads with VALIDATION_ERROR', async () => {
    const res = await handleExecuteAction(validEvent, {
      projectId: 'not-a-valid-uuid',
      testRunId: 'also-invalid',
    } as unknown as ExecuteActionInputDto);

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('handles executeAction successfully and sanitizes errors', async () => {
    // 1. Success
    const res1 = await handleExecuteAction(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      testRunId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
      action: {
        id: 'd9e79391-7667-4e3e-a107-5509930f30c3',
        sequence: 1,
        action: 'CLICK',
        description: 'Click button',
        isOptional: false,
        assertions: [],
      },
    });
    assert.equal(res1.ok, true);
    if (res1.ok) {
      assert.equal(res1.data.status, 'PASSED');
      assert.equal(res1.data.actionType, 'CLICK');
    }

    // 2. Cross-project error
    const res2 = await handleExecuteAction(validEvent, {
      projectId: '00000000-0000-0000-0000-000000000000',
      testRunId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
      action: {
        id: 'd9e79391-7667-4e3e-a107-5509930f30c3',
        sequence: 1,
        action: 'CLICK',
        description: 'Click button',
        isOptional: false,
        assertions: [],
      },
    });
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.equal(res2.error.code, 'CROSS_RUN_EXECUTION_ERROR');
    }
  });

  it('handles executeStep successfully', async () => {
    const res = await handleExecuteStep(validEvent, {
      projectId: 'd9e79391-7667-4e3e-a107-5509930f30c1',
      testRunId: 'd9e79391-7667-4e3e-a107-5509930f30c2',
      step: {
        id: 'd9e79391-7667-4e3e-a107-5509930f30c3',
        sequence: 1,
        action: 'NAVIGATE',
        description: 'Navigate to app',
        isOptional: false,
        assertions: [],
      },
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'PASSED');
      assert.equal(res.data.sequence, 1);
    }
  });
});
