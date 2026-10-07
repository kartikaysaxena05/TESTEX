/**
 * @file apps/desktop/src/main/ipc/planner-handlers.test.ts
 * Unit tests for V10 Phase 152 Multi-Step Planning IPC handlers.
 * Verifies untrusted origin rejection, authentication, schema validation, and planner delegation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handlePlannerCreatePlan,
  handlePlannerGetPlan,
  handlePlannerListPlans,
  handlePlannerGetActivePlan,
  handlePlannerAddStep,
  handlePlannerRemoveStep,
  handlePlannerReorderSteps,
  handlePlannerModifyStep,
  handlePlannerSetStepStatus,
  handlePlannerSetPlanStatus,
  setAgentPlanServiceForTest,
} from './planner-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  AgentPlanService,
  AgentPlanNotFoundError,
  AgentPlanCircularDependencyError,
  AgentPlanCrossProjectAccessError,
  type AuthenticationService,
} from '@ai-quality/core';
import type { AgentPlanExecutionDto } from '@ai-quality/contracts';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = 'mock-valid-session-token';
  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
  }
  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }
  public async clearSessionToken(): Promise<void> {
    this.token = null;
  }
}

describe('V10 Phase 152 Multi-Step Planning IPC Handlers', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';
  const testThreadId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  const testTaskId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testPlanId = 'dddddddd-1111-1111-1111-dddddddddddd';
  const testStepId = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';

  const mockPlanDto: AgentPlanExecutionDto = {
    id: testPlanId,
    projectId: testProjectId,
    threadId: testThreadId,
    taskId: testTaskId,
    version: 1,
    isActive: true,
    status: 'READY',
    summary: 'Execution plan for checkout bug fix',
    intent: 'DEFECT_REPAIR',
    totalSteps: 1,
    completedSteps: 0,
    requiresApproval: true,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: testStepId,
        planId: testPlanId,
        sequence: 1,
        title: 'Inspect repository',
        objective: 'Find checkout files',
        toolAction: 'repository.search_files',
        structuredInput: { query: 'checkout' },
        dependencies: [],
        status: 'PENDING',
        resultReference: null,
        errorInfo: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const createTrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'app://renderer/index.html',
      },
    }) as unknown as IpcMainInvokeEvent;

  const createUntrustedEvent = (): IpcMainInvokeEvent =>
    ({
      senderFrame: {
        parent: null,
        url: 'https://evil-external-site.com',
      },
    }) as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    const mockAuthService = {
      validateSession: async (token: string) => {
        if (token === 'mock-valid-session-token') {
          return {
            id: 'session-id',
            userId: testUserId,
            token,
            expiresAt: new Date(Date.now() + 3600000),
            createdAt: new Date(),
          };
        }
        return null;
      },
    } as unknown as AuthenticationService;

    setAuthServiceForTest(mockAuthService);
    setSecureStorageForTest(new MockSecureStorage());
  });

  it('1. should reject createPlan from untrusted sender origin', async () => {
    const res = await handlePlannerCreatePlan(createUntrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('2. should reject createPlan with invalid schema parameters', async () => {
    const res = await handlePlannerCreatePlan(createTrustedEvent(), {
      projectId: 'invalid-not-uuid',
      threadId: testThreadId,
      taskId: testTaskId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('3. should delegate valid createPlan to AgentPlanService', async () => {
    let capturedInput: any = null;
    let capturedUserId: any = null;

    const mockService = {
      createPlan: async (input: any, userId: any) => {
        capturedInput = input;
        capturedUserId = userId;
        return mockPlanDto;
      },
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerCreatePlan(createTrustedEvent(), {
      projectId: testProjectId,
      threadId: testThreadId,
      taskId: testTaskId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testPlanId);
      assert.equal(capturedInput.projectId, testProjectId);
      assert.equal(capturedUserId, testUserId);
    }
  });

  it('4. should handle getPlan and map domain errors', async () => {
    const mockService = {
      getPlan: async () => {
        throw new AgentPlanNotFoundError('Plan was not found in project.');
      },
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerGetPlan(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AGENT_PLAN_NOT_FOUND');
    }
  });

  it('5. should handle getActivePlan delegation', async () => {
    const mockService = {
      getActivePlan: async () => mockPlanDto,
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerGetActivePlan(createTrustedEvent(), {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.id, testPlanId);
    }
  });

  it('6. should handle listPlans delegation', async () => {
    const mockService = {
      listPlans: async () => [mockPlanDto],
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerListPlans(createTrustedEvent(), {
      projectId: testProjectId,
      taskId: testTaskId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.length, 1);
    }
  });

  it('7. should handle addStep and return updated plan', async () => {
    const mockService = {
      addStep: async () => mockPlanDto,
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerAddStep(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      step: {
        title: 'New step',
        objective: 'Test',
        toolAction: 'terminal.run',
        dependencies: [],
      },
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testPlanId);
    }
  });

  it('8. should handle removeStep and return updated plan', async () => {
    const mockService = {
      removeStep: async () => mockPlanDto,
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerRemoveStep(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      stepId: testStepId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testPlanId);
    }
  });

  it('9. should handle reorderSteps and reject circular dependency error cleanly', async () => {
    const mockService = {
      reorderSteps: async () => {
        throw new AgentPlanCircularDependencyError('Circular dependency cycle detected');
      },
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerReorderSteps(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      stepIdsInOrder: [testStepId],
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AGENT_PLAN_CIRCULAR_DEPENDENCY');
    }
  });

  it('10. should handle setStepStatus delegation', async () => {
    const mockService = {
      setStepStatus: async () => mockPlanDto,
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerSetStepStatus(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      stepId: testStepId,
      status: 'COMPLETED',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testPlanId);
    }
  });

  it('11. should handle setPlanStatus delegation and reject cross-project access', async () => {
    const mockService = {
      setPlanStatus: async () => {
        throw new AgentPlanCrossProjectAccessError('Cross project access forbidden');
      },
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerSetPlanStatus(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      status: 'CANCELLED',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AGENT_PLAN_CROSS_PROJECT_ACCESS');
    }
  });

  it('12. should handle modifyStep delegation', async () => {
    const mockService = {
      modifyStep: async () => mockPlanDto,
    } as unknown as AgentPlanService;

    setAgentPlanServiceForTest(mockService);

    const res = await handlePlannerModifyStep(createTrustedEvent(), {
      projectId: testProjectId,
      planId: testPlanId,
      stepId: testStepId,
      title: 'Modified Title',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, testPlanId);
    }
  });
});

