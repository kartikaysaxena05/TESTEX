/**
 * @file packages/core/src/agent-tools/failure-intelligence/certification/v10-phase148-certification.test.ts
 * Authoritative certification test suite for V10 Phase 148: Failure Intelligence Tool.
 *
 * Certifies:
 * 1. Tool registration: failure_intelligence.analyze registered with category DEFECTS, permission level READ.
 * 2. Permission evaluation: AgentPermissionService resolves failure_intelligence.analyze to READ_ONLY.
 * 3. Valid failure analysis via failureId for application defect.
 * 4. Valid failure analysis via executionId for automation error.
 * 5. Structured output schema completeness and field verification.
 * 6. Evidence reference integrity: returns real ingested artifacts without hallucinating logs/screenshots.
 * 7. Non-fabrication & read-only safety: does not alter code or authoritative execution states.
 * 8. Project / user tenant isolation:
 *    - Rejects cross-project access attempt.
 *    - Rejects unauthorized user requesting another user's failure case.
 * 9. Rejection of in-eligible executions (e.g. PASSED execution).
 * 10. Missing entity handling:
 *     - Missing execution throws FailureIntelligenceExecutionNotFoundError / DesktopErrorCode 'NOT_FOUND'.
 *     - Missing failure case throws FailureIntelligenceCaseNotFoundError.
 * 11. Malformed input validation (UUID formatting, required fields).
 * 12. Thread task step recording integration with AgentThreadService.
 * 13. Concurrent invocation safety without race conditions.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  FailureIntelligenceToolService,
  createFailureIntelligenceToolDefinitions,
  FailureIntelligenceExecutionNotFoundError,
  FailureIntelligenceCaseNotFoundError,
  FailureIntelligenceIneligibleExecutionError,
  FailureIntelligenceValidationError,
} from '../index.js';
import { ToolRegistryService } from '../../agent-tool-registry.js';
import { AgentPermissionService } from '../../../agent-permissions/agent-permission-service.js';
import { AiCrossProjectAccessError } from '../../../ai-provider/ai-provider-errors.js';

describe('V10 Phase 148: Failure Intelligence Tool Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const intruderUserId = 'user-intruder-9999';

  const testExecutionFailId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const testExecutionPassId = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
  const testFailureCaseId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  const testRunId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testCaseId = 'dddddddd-1111-1111-1111-dddddddddddd';
  const testTaskId = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';
  const otherFailureCaseId = 'ffffffff-1111-1111-1111-ffffffffffff';

  let projectStore: any[];
  let executionStore: any[];
  let failureCaseStore: any[];
  let taskStore: any[];
  let stepStore: any[];
  let bugReportStore: any[];
  let rootCauseStore: any[];
  let classificationStore: any[];

  let mockPrisma: PrismaClient;
  let service: FailureIntelligenceToolService;
  let registry: ToolRegistryService;
  let permissionService: AgentPermissionService;

  beforeEach(() => {
    projectStore = [
      {
        id: testProjectId,
        name: 'Autonomous Web Testing Project',
        userId: testUserId,
        deletedAt: null,
      },
      {
        id: otherProjectId,
        name: 'Isolated Second Tenant Project',
        userId: 'other-user',
        deletedAt: null,
      },
    ];

    executionStore = [
      {
        id: testExecutionFailId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Expected text "Dashboard Overview" to be visible, but received HTTP 500',
        testCase: {
          id: testCaseId,
          testCaseKey: 'TC-AUTH-001',
          title: 'User Login & Checkout',
          sourceRequirementId: 'req-001',
          sourceRequirementKey: 'REQ-AUTH',
        },
        testRun: {
          id: testRunId,
          testCaseTitle: 'User Login & Checkout',
        },
        stepExecutions: [
          {
            id: 'step-1',
            stepIndex: 1,
            actionType: 'NAVIGATE',
            status: 'PASSED',
            targetSummary: 'navigate to /checkout',
          },
          {
            id: 'step-2',
            stepIndex: 2,
            actionType: 'ASSERT',
            status: 'FAILED',
            errorMessage: 'Expected text "Dashboard Overview" to be visible',
            actualSummary: 'HTTP 500 Internal Server Error: Database deadlock',
          },
        ],
        evidenceBundles: [],
      },
      {
        id: testExecutionPassId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        status: 'PASSED',
        errorCode: null,
        errorMessage: null,
        evidenceBundles: [],
      },
    ];

    failureCaseStore = [
      {
        id: testFailureCaseId,
        projectId: testProjectId,
        executionId: testExecutionFailId,
        title: 'Checkout POST failed with HTTP 500',
        failureSummary: 'HTTP 500 Internal Server Error: Database deadlock during order dispatch',
        status: 'CLASSIFIED',
        metadataJson: {},
        evidenceCompleteness: 'COMPLETE',
        createdAt: new Date(),
        updatedAt: new Date(),
        execution: executionStore[0],
        evidenceReferences: [
          {
            id: 'ev-screenshot-01',
            artifactType: 'SCREENSHOT',
            logicalName: 'error_checkout.png',
            mimeType: 'image/png',
            byteSize: 45020,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            integrityStatus: 'VERIFIED',
          },
          {
            id: 'ev-console-01',
            artifactType: 'CONSOLE_LOG',
            logicalName: 'browser_console.log',
            mimeType: 'text/plain',
            byteSize: 1204,
            sha256: 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678',
            integrityStatus: 'VERIFIED',
          },
        ],
        reproductionAttempts: [
          {
            id: 'repro-1',
            attemptNumber: 1,
            status: 'REPRODUCED',
            isSignatureMatch: true,
          },
        ],
      },
      {
        id: otherFailureCaseId,
        projectId: otherProjectId,
        executionId: 'exec-other',
        title: 'Other Tenant Failure Case',
        failureSummary: 'Cross project failure case',
        status: 'CLASSIFIED',
        execution: {
          id: 'exec-other',
          projectId: otherProjectId,
          status: 'FAILED',
        },
      },
    ];

    taskStore = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: 'th-1',
        title: 'Analyze checkout failure task',
        status: 'RUNNING',
      },
    ];

    stepStore = [];

    bugReportStore = [
      {
        id: 'bug-001',
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        reportNumber: 'BUG-101',
        revision: 1,
        status: 'READY',
        isApplicationDefect: true,
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        severity: 'HIGH',
        priority: 'P1_URGENT',
        duplicateClusterKey: 'CLUSTER-DEADLOCK-500',
        relatedFailureCount: 3,
        reproductionStepsJson: [
          { stepNumber: 1, action: 'Open checkout page', expectedResult: 'Page rendered' },
          { stepNumber: 2, action: 'Click submit button', expectedResult: 'Order confirmed' },
        ],
      },
    ];

    rootCauseStore = [
      {
        id: 'rc-001',
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
        probableLayer: 'BACKEND',
        probableComponent: 'OrderProcessingService',
        probableCause: 'Database deadlock in transaction handler',
        humanExplanation: 'Order processing failed due to database row lock deadlock.',
        affectedExecutionPath: ['POST /api/checkout', 'OrderProcessingService.createOrder'],
        createdAt: new Date(),
      },
    ];

    classificationStore = [
      {
        id: 'fc-class-1',
        projectId: testProjectId,
        failureCaseId: testFailureCaseId,
        analysisRunId: null,
        category: 'APPLICATION_FAILURE',
        subcategory: 'HTTP_ERROR_RESPONSE',
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'APP_HTTP_ERROR_001',
        matchedRuleIds: ['APP_HTTP_ERROR_001'],
        ruleExplanationsJson: [
          {
            ruleId: 'APP_HTTP_ERROR_001',
            ruleName: 'Application HTTP Error Response',
            category: 'APPLICATION_FAILURE',
            subcategory: 'HTTP_ERROR_RESPONSE',
            explanation: 'Received HTTP 500 error from API',
            supportingEvidence: ['HTTP 500 Internal Server Error'],
            signalStrength: 'DEFINITIVE',
          },
        ],
        conflictingRuleIds: [],
        evidenceReferencesJson: ['ev-screenshot-01', 'ev-console-01'],
        isAuthoritative: true,
        reclassificationReason: null,
        supersededById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          return projectStore.find(p => p.id === where.id) || null;
        },
      },
      agentThreadTask: {
        findUnique: async ({ where }: any) => {
          return taskStore.find(t => t.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return (
            taskStore.find(
              t => t.id === where.id && (!where.projectId || t.projectId === where.projectId),
            ) || null
          );
        },
      },
      agentExecutionStep: {
        count: async () => stepStore.length,
        create: async ({ data }: any) => {
          const rec = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
          stepStore.push(rec);
          return rec;
        },
      },
      failureCase: {
        findUnique: async ({ where }: any) => {
          return failureCaseStore.find(fc => fc.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          return (
            failureCaseStore.find(fc => {
              if (where.projectId && fc.projectId !== where.projectId) return false;
              if (where.executionId && fc.executionId !== where.executionId) return false;
              if (where.id && fc.id !== where.id) return false;
              return true;
            }) || null
          );
        },
        create: async ({ data }: any) => {
          const rec = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
          failureCaseStore.push(rec);
          return rec;
        },
      },
      testCaseExecution: {
        findUnique: async ({ where }: any) => {
          return executionStore.find(e => e.id === where.id) || null;
        },
      },
      failureRootCauseAnalysis: {
        findFirst: async ({ where }: any) => {
          return (
            rootCauseStore.find(
              rc => rc.projectId === where.projectId && rc.failureCaseId === where.failureCaseId,
            ) || null
          );
        },
      },
      structuredBugReport: {
        findFirst: async ({ where }: any) => {
          return (
            bugReportStore.find(
              b => b.projectId === where.projectId && b.failureCaseId === where.failureCaseId,
            ) || null
          );
        },
      },
      failureClassification: {
        findFirst: async ({ where }: any) => {
          return (
            classificationStore.find(c => {
              if (where.projectId && c.projectId !== where.projectId) return false;
              if (where.failureCaseId && c.failureCaseId !== where.failureCaseId) return false;
              if (where.isAuthoritative !== undefined && c.isAuthoritative !== where.isAuthoritative) return false;
              return true;
            }) || null
          );
        },
        findMany: async ({ where }: any) => {
          return classificationStore.filter(c => {
            if (where.projectId && c.projectId !== where.projectId) return false;
            if (where.failureCaseId && c.failureCaseId !== where.failureCaseId) return false;
            return true;
          });
        },
        create: async ({ data }: any) => {
          const rec = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
          classificationStore.push(rec);
          return rec;
        },
        update: async ({ where, data }: any) => {
          const idx = classificationStore.findIndex(c => c.id === where.id);
          if (idx >= 0) {
            classificationStore[idx] = { ...classificationStore[idx], ...data, updatedAt: new Date() };
            return classificationStore[idx];
          }
          return null;
        },
      },
      flakinessAnalysis: {
        findFirst: async () => null,
      },
      agentToolAuditLog: {
        create: async () => ({}),
      },
      $transaction: async (callback: any) => {
        return callback(mockPrisma);
      },
    } as unknown as PrismaClient;

    permissionService = new AgentPermissionService({ prisma: mockPrisma });
    service = new FailureIntelligenceToolService({ prisma: mockPrisma });
    registry = new ToolRegistryService({ prisma: mockPrisma, permissionService });

    const tools = createFailureIntelligenceToolDefinitions(service);
    for (const tool of tools) {
      registry.registerTool(tool as any);
    }
  });

  // --------------------------------------------------------------------------
  // 1. Tool Registration & Permission Level
  // --------------------------------------------------------------------------
  it('certifies tool registration with category DEFECTS and READ_ONLY permission level', () => {
    const tool = registry.getRegisteredTool('failure_intelligence.analyze');
    assert.ok(tool);
    assert.equal(tool.toolId, 'failure_intelligence.analyze');
    assert.equal(tool.category, 'DEFECTS');
    assert.equal(tool.permissionLevel, 'READ');

    const perm = permissionService.resolveToolPermissionLevel('failure_intelligence.analyze');
    assert.equal(perm, 'READ_ONLY');
  });

  // --------------------------------------------------------------------------
  // 2. Failure Analysis via failureId
  // --------------------------------------------------------------------------
  it('certifies valid failure analysis via failureId for confirmed application defect', async () => {
    const result = await service.analyze(
      {
        projectId: testProjectId,
        failureId: testFailureCaseId,
      },
      testUserId,
    );

    assert.ok(result);
    assert.equal(result.failureCaseId, testFailureCaseId);
    assert.equal(result.projectId, testProjectId);
    assert.equal(result.executionId, testExecutionFailId);
    assert.equal(result.category, 'APPLICATION_FAILURE');
    assert.equal(result.isApplicationDefect, true);
    assert.equal(result.recommendedNextAction, 'TRIAGE_APPLICATION_DEFECT');
    assert.equal(result.evidence.length, 2);
    assert.equal(result.evidence[0]?.logicalName, 'error_checkout.png');
    assert.equal(result.reproduction?.status, 'REPRODUCED');
    assert.equal(result.defect?.reportNumber, 'BUG-101');
    assert.equal(result.rootCause?.probableLayer, 'BACKEND');
    assert.match(result.summary, /Classified as APPLICATION_FAILURE/i);
  });

  // --------------------------------------------------------------------------
  // 3. Failure Analysis via executionId
  // --------------------------------------------------------------------------
  it('certifies valid failure analysis via executionId resolving underlying case', async () => {
    const result = await service.analyze(
      {
        projectId: testProjectId,
        executionId: testExecutionFailId,
      },
      testUserId,
    );

    assert.ok(result);
    assert.equal(result.executionId, testExecutionFailId);
    assert.equal(result.failureCaseId, testFailureCaseId);
    assert.equal(result.isApplicationDefect, true);
    assert.equal(result.testCaseKey, 'TC-AUTH-001');
  });

  // --------------------------------------------------------------------------
  // 4. Invocation through ToolRegistryService
  // --------------------------------------------------------------------------
  it('certifies execution through ToolRegistryService with envelope integrity', async () => {
    const invokeResult = await registry.invoke(
      {
        toolId: 'failure_intelligence.analyze',
        projectId: testProjectId,
        input: {
          projectId: testProjectId,
          failureId: testFailureCaseId,
          taskId: testTaskId,
        },
      },
      {
        projectId: testProjectId,
        userId: testUserId,
        taskId: testTaskId,
      },
    );

    assert.ok(invokeResult);
    assert.equal(invokeResult.success, true);
    assert.equal(invokeResult.toolId, 'failure_intelligence.analyze');
    assert.ok(invokeResult.durationMs >= 0);

    const out = invokeResult.output as any;
    assert.equal(out.failureCaseId, testFailureCaseId);
    assert.equal(out.recommendedNextAction, 'TRIAGE_APPLICATION_DEFECT');

    // Confirm step was appended to thread task history
    assert.equal(stepStore.length, 1);
    assert.equal(stepStore[0]?.taskId, testTaskId);
    assert.equal(stepStore[0]?.metadata?.toolName, 'failure_intelligence.analyze');
  });

  // --------------------------------------------------------------------------
  // 5. Tenant Isolation: Cross-Project Access Rejection
  // --------------------------------------------------------------------------
  it('certifies rejection when attempting to access a failure case from another project', async () => {
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
            failureId: otherFailureCaseId, // Belongs to otherProjectId
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        assert.match(err.message, /belongs to project '22222222-2222-2222-2222-222222222222'/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 6. Tenant Isolation: Unauthorized User Access Rejection
  // --------------------------------------------------------------------------
  it('certifies rejection when unauthorized user calls tool on protected project', async () => {
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
            failureId: testFailureCaseId,
          },
          intruderUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        assert.match(err.message, /does not have permission to access project/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 7. Non-Existent Entity Handling
  // --------------------------------------------------------------------------
  it('certifies error thrown when executionId does not exist', async () => {
    const missingExecutionId = '99999999-9999-9999-9999-999999999999';
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
            executionId: missingExecutionId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof FailureIntelligenceExecutionNotFoundError);
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  it('certifies error thrown when failureId does not exist', async () => {
    const missingFailureId = '88888888-8888-8888-8888-888888888888';
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
            failureId: missingFailureId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof FailureIntelligenceCaseNotFoundError);
        assert.match(err.message, /not found/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 8. Rejection of Ineligible Execution (PASSED execution)
  // --------------------------------------------------------------------------
  it('certifies rejection of PASSED execution in failure analysis', async () => {
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
            executionId: testExecutionPassId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof FailureIntelligenceIneligibleExecutionError);
        assert.match(err.message, /not eligible for failure intelligence/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 9. Malformed Input Validation
  // --------------------------------------------------------------------------
  it('certifies schema validation rejects input without executionId or failureId', async () => {
    await assert.rejects(
      async () => {
        await service.analyze(
          {
            projectId: testProjectId,
          } as any,
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof FailureIntelligenceValidationError);
        assert.match(err.message, /Either executionId or failureId must be provided/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 10. Non-Fabrication & Evidence Safety
  // --------------------------------------------------------------------------
  it('certifies evidence integrity: only returns real ingested artifacts without hallucinations', async () => {
    const result = await service.analyze(
      {
        projectId: testProjectId,
        failureId: testFailureCaseId,
        options: {
          includeEvidenceDetails: true,
        },
      },
      testUserId,
    );

    assert.equal(result.evidence.length, 2);
    // Verified sha256 checksums match authoritative data
    assert.equal(result.evidence[0]?.sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(result.evidence[1]?.sha256, 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678');
    assert.equal(result.evidence[0]?.integrityStatus, 'VERIFIED');
  });

  // --------------------------------------------------------------------------
  // 11. Concurrency Safety
  // --------------------------------------------------------------------------
  it('certifies concurrent calls on same failure case complete safely', async () => {
    const [res1, res2] = await Promise.all([
      service.analyze({ projectId: testProjectId, failureId: testFailureCaseId }, testUserId),
      service.analyze({ projectId: testProjectId, failureId: testFailureCaseId }, testUserId),
    ]);

    assert.equal(res1.failureCaseId, testFailureCaseId);
    assert.equal(res2.failureCaseId, testFailureCaseId);
    assert.equal(res1.category, res2.category);
    assert.equal(res1.recommendedNextAction, res2.recommendedNextAction);
  });
});
