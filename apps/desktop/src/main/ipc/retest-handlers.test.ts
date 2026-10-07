/**
 * @file apps/desktop/src/main/ipc/retest-handlers.test.ts
 * IPC handler tests for Requirement Change-Impact & Retest Selection (V7 Phase 106).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateChangeSnapshot,
  handlePlanRetest,
  handleGetRetestPlan,
  handleListRetestPlans,
  handleExplainTestSelection,
  setRetestPlanService,
} from './retest-handlers.js';
import { RetestPlanNotFoundError } from '@ai-quality/core';
import type {
  ChangeSnapshotDto,
  RetestPlanDto,
  ExplainTestSelectionResultDto,
} from '@ai-quality/contracts';

describe('Retest IPC Handlers (Phase 106)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://malicious.origin/attack.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validSnapshotId = '22222222-2222-2222-2222-222222222222';
  const validPlanId = '33333333-3333-3333-3333-333333333333';
  const validTestCaseId = '44444444-4444-4444-4444-444444444444';

  const mockSnapshotDto: ChangeSnapshotDto = {
    id: validSnapshotId,
    projectId: validProjectId,
    sourceType: 'REQUIREMENT_CHANGE',
    sourceEntityId: 'req-1',
    baseRevision: null,
    targetRevision: null,
    title: 'Auth Requirement Update',
    description: 'Updated auth flow',
    changedFiles: ['src/auth/login.ts'],
    changedSymbolsJson: [],
    changedRequirements: ['REQ-AUTH-01'],
    changedApisJson: [],
    changedConfiguration: {},
    diffText: null,
    metadataJson: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPlanDto: RetestPlanDto = {
    id: validPlanId,
    projectId: validProjectId,
    changeSnapshotId: validSnapshotId,
    impactGraph: { nodes: [], edges: [] },
    selectedTests: [
      {
        testCaseId: validTestCaseId,
        testCaseKey: 'TC-AUTH-001',
        testCaseTitle: 'Verify valid login credentials',
        testCaseVersionId: null,
        testCaseVersionNumber: 1,
        selectionState: 'MANDATORY',
        impactCategory: 'DIRECT',
        confidence: 'HIGH',
        selectionReason: 'Directly traces to modified requirement REQ-AUTH-01',
        dependencyPath: [],
        riskSignals: [],
        evidenceReferences: [],
        historicalFailureSignal: false,
        isExecutable: true,
      },
    ],
    totalTestsCount: 1,
    mandatoryCount: 1,
    recommendedCount: 0,
    optionalCount: 0,
    unknownCount: 0,
    excludedCount: 0,
    fullRegressionRequired: false,
    fullRegressionReason: null,
    status: 'COMPLETED',
    selectionPolicyVersion: '1.0.0',
    riskPolicyVersion: '1.0.0',
    impactEngineVersion: '1.0.0',
    auditTrail: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockExplainResult: ExplainTestSelectionResultDto = {
    testCaseId: validTestCaseId,
    testCaseKey: 'TC-AUTH-001',
    testCaseTitle: 'Verify valid login credentials',
    selectionState: 'MANDATORY',
    impactCategory: 'DIRECT',
    confidence: 'HIGH',
    selectionReason: 'Directly traces to modified requirement REQ-AUTH-01',
    dependencyPath: [],
    riskSignals: [],
    evidenceReferences: [],
    historicalFailureSignal: false,
    changedRequirement: 'REQ-AUTH-01',
    affectedCodeOrApi: 'src/auth/login.ts',
    tracePath: [
      'Requirement: REQ-AUTH-01',
      'Code/API: src/auth/login.ts',
      'Test: TC-AUTH-001 (Verify valid login credentials)',
    ],
  };

  let mockService: any;

  beforeEach(() => {
    mockService = {
      createChangeSnapshot: async () => mockSnapshotDto,
      planRetest: async () => mockPlanDto,
      getRetestPlan: async () => mockPlanDto,
      listRetestPlans: async () => [mockPlanDto],
      explainTestSelection: async () => mockExplainResult,
    };
    setRetestPlanService(mockService);
  });

  it('rejects untrusted sender for all handlers', async () => {
    const res1 = await handleCreateChangeSnapshot(fakeUntrustedEvent, {
      projectId: validProjectId,
      sourceType: 'REQUIREMENT_CHANGE',
      title: 'Unauthorized snapshot',
    });
    assert.equal(res1.ok, false);
    if (!res1.ok) assert.equal(res1.error.code, 'UNAUTHORIZED_SENDER');

    const res2 = await handlePlanRetest(fakeUntrustedEvent, {
      projectId: validProjectId,
      changeSnapshotId: validSnapshotId,
    });
    assert.equal(res2.ok, false);
    if (!res2.ok) assert.equal(res2.error.code, 'UNAUTHORIZED_SENDER');

    const res3 = await handleGetRetestPlan(fakeUntrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
    });
    assert.equal(res3.ok, false);
    if (!res3.ok) assert.equal(res3.error.code, 'UNAUTHORIZED_SENDER');

    const res4 = await handleListRetestPlans(fakeUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(res4.ok, false);
    if (!res4.ok) assert.equal(res4.error.code, 'UNAUTHORIZED_SENDER');

    const res5 = await handleExplainTestSelection(fakeUntrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
      testCaseId: validTestCaseId,
    });
    assert.equal(res5.ok, false);
    if (!res5.ok) assert.equal(res5.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('successfully creates change snapshot via IPC', async () => {
    const result = await handleCreateChangeSnapshot(fakeTrustedEvent, {
      projectId: validProjectId,
      sourceType: 'REQUIREMENT_CHANGE',
      title: 'Auth Requirement Update',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.id, validSnapshotId);
      assert.equal(result.data.projectId, validProjectId);
    }
  });

  it('successfully plans retest via IPC', async () => {
    const result = await handlePlanRetest(fakeTrustedEvent, {
      projectId: validProjectId,
      changeSnapshotId: validSnapshotId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.id, validPlanId);
      assert.equal(result.data.mandatoryCount, 1);
    }
  });

  it('successfully gets retest plan via IPC', async () => {
    const result = await handleGetRetestPlan(fakeTrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.data);
      assert.equal(result.data.id, validPlanId);
      assert.equal(result.data.status, 'COMPLETED');
    }
  });

  it('successfully lists retest plans via IPC', async () => {
    const result = await handleListRetestPlans(fakeTrustedEvent, {
      projectId: validProjectId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0]?.id, validPlanId);
    }
  });

  it('successfully explains test selection via IPC', async () => {
    const result = await handleExplainTestSelection(fakeTrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
      testCaseId: validTestCaseId,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.testCaseId, validTestCaseId);
      assert.equal(result.data.selectionState, 'MANDATORY');
      assert.equal(result.data.tracePath.length, 3);
    }
  });

  it('properly propagates known domain errors with error codes', async () => {
    mockService.getRetestPlan = async () => {
      throw new RetestPlanNotFoundError(`Retest plan ${validPlanId} not found.`);
    };

    const res = await handleGetRetestPlan(fakeTrustedEvent, {
      projectId: validProjectId,
      planId: validPlanId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'RETEST_PLAN_NOT_FOUND');
    }
  });
});
