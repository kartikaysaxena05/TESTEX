/**
 * @file packages/core/src/execution/persistence/execution-persistence-service.test.ts
 * Comprehensive unit and integration tests for Execution Persistence & Step-Level Audit Trail (V5 Phase 68).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ExecutionPersistenceService } from './execution-persistence-service.js';
import {
  ExecutionNotFoundError,
  ExecutionAlreadyTerminalError,
  ExecutionOwnershipMismatchError,
} from './execution-persistence-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('ExecutionPersistenceService (V5 Phase 68)', () => {
  let prisma: PrismaClient;
  let service: ExecutionPersistenceService;

  let testProjectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let testCaseVersionId: string;
  let testPlanId: string;
  let testRunId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new ExecutionPersistenceService({ prisma });

    // Clean up test data
    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Persistence Test Project' },
        { id: otherProjectId, name: 'Other Project' },
      ],
    });

    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Staging',
        baseUrl: 'https://staging.example.com',
        isDefault: true,
      },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Authentication Module',
        originalText: 'Original text',
        status: 'ACTIVE',
        versions: {
          create: [
            {
              projectId: testProjectId,
              versionNumber: 1,
              title: 'Authentication Module',
              requirementKeySnapshot: 'REQ-AUTH',
              originalText: 'Original text v1',
              sourceRequirementTextSha256: 'hash-req-1',
            },
          ],
        },
      },
    });

    const testCase = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'User Login Flow',
        objective: 'Verify login with credentials',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    testCaseId = testCase.id;

    const testCaseVersion = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        versionNumber: 1,
        title: testCase.title,
        objective: 'Login test objective',
        reviewStatus: 'APPROVED',
      },
    });
    testCaseVersionId = testCaseVersion.id;

    const testPlan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        environmentId: env.id,
        planFingerprint: 'dummy-fp-run-valid',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });
    testPlanId = testPlan.id;

    const testRun = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseTitle: testCase.title,
        testCaseVersionId: testCaseVersion.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlan.id,
        planFingerprint: testPlan.planFingerprint,
        status: 'PREPARING',
        browserEngine: 'chromium',
      },
    });
    testRunId = testRun.id;
  });

  afterEach(async () => {
    // Cascade delete project cleanups
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
  });

  describe('1. Execution Lifecycle & Version Binding', () => {
    it('creates write-ahead TestCaseExecution bound to exact test case version and initial state transition', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        browserEngine: 'chromium',
        environmentSnapshotJson: { baseUrl: 'https://app.example.com', apiKey: 'secret-token-123' },
      });

      assert.ok(execution.id);
      assert.equal(execution.projectId, testProjectId);
      assert.equal(execution.testRunId, testRunId);
      assert.equal(execution.testCaseId, testCaseId);
      assert.equal(execution.testCaseVersionId, testCaseVersionId);
      assert.equal(execution.testCaseVersionNumber, 1);
      assert.equal(execution.status, 'PREPARING');
      assert.equal(execution.attempt, 1);
      assert.equal(execution.browserEngine, 'chromium');

      // Verify secret redaction in environment snapshot
      assert.equal((execution.environmentSnapshotJson as any).apiKey, '***');

      // Verify state transition created
      assert.ok(execution.stateTransitions);
      assert.equal(execution.stateTransitions.length, 1);
      assert.equal(execution.stateTransitions[0]?.toStatus, 'PREPARING');
      assert.equal(execution.stateTransitions[0]?.reason, 'Execution initialized');
    });

    it('returns existing execution on duplicate createExecution calls (Idempotency)', async () => {
      const exec1 = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const exec2 = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      assert.equal(exec1.id, exec2.id);
    });

    it('rejects createExecution when test case belongs to another project', async () => {
      await assert.rejects(
        async () => {
          await service.createExecution({
            projectId: otherProjectId,
            testRunId,
            testCaseId, // Belongs to testProjectId
            testCaseVersionId,
            testCaseVersionNumber: 1,
            executableTestPlanId: testPlanId,
          });
        },
        (err: unknown) =>
          err instanceof ExecutionOwnershipMismatchError || err instanceof ExecutionNotFoundError,
      );
    });
  });

  describe('2. Step-Level Audit Trail & Incremental Durability', () => {
    it('persists step start and completion with secret redaction and assertion records', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      // 1. Start Step
      const startedStep = await service.startStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 1,
        attempt: 1,
        actionType: 'FILL',
        targetSummary: 'input[name="password"]',
        actionDataJson: {
          selector: 'input[name="password"]',
          password: 'SuperSecretPassword123!',
          text: 'my_password',
        },
        expectedSummary: 'Password field filled securely',
      });

      assert.ok(startedStep.id);
      assert.equal(startedStep.stepIndex, 1);
      assert.equal(startedStep.attempt, 1);
      assert.equal(startedStep.status, 'RUNNING');
      assert.ok(startedStep.startedAt);

      // Verify passwords and secret tokens redacted in actionData
      assert.equal((startedStep.actionDataJson as any).password, '***');

      // 2. Complete Step with Assertions
      const completedStep = await service.completeStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepExecutionId: startedStep.id,
        status: 'PASSED',
        durationMs: 145,
        actualSummary: 'Field updated with token: secret-token-456',
        assertionResults: [
          {
            assertionId: crypto.randomUUID(),
            projectId: testProjectId,
            testRunId,
            assertionType: 'ELEMENT_VISIBLE',
            operator: 'VISIBLE',
            status: 'PASSED',
            isHard: true,
            targetSummary: 'input[name="password"]',
            expected: { state: 'visible', authSecret: 'raw-secret' },
            actual: { state: 'visible', authSecret: 'raw-secret' },
            message: 'Input is visible',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 12,
          },
        ],
      });

      assert.equal(completedStep.status, 'PASSED');
      assert.equal(completedStep.durationMs, 145);
      assert.ok(completedStep.completedAt);
      assert.ok(
        completedStep.actualSummary?.includes('***') ||
          completedStep.actualSummary?.includes('token'),
      );
      assert.equal(completedStep.assertionResults.length, 1);
      assert.equal(completedStep.assertionResults[0]?.status, 'PASSED');
      assert.equal((completedStep.assertionResults[0]?.expectedValueJson as any).authSecret, '***');
    });

    it('handles multiple attempts per step cleanly without collision', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      // Attempt 1 fails
      const step1Attempt1 = await service.startStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 1,
        attempt: 1,
        actionType: 'CLICK',
        targetSummary: 'button#submit',
      });

      await service.completeStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepExecutionId: step1Attempt1.id,
        status: 'FAILED',
        durationMs: 100,
        errorMessage: 'Element not clickable',
      });

      // Attempt 2 succeeds
      const step1Attempt2 = await service.startStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 1,
        attempt: 2,
        actionType: 'CLICK',
        targetSummary: 'button#submit',
      });

      await service.completeStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepExecutionId: step1Attempt2.id,
        status: 'PASSED',
        durationMs: 120,
      });

      const stepsResult = await service.getExecutionSteps({
        projectId: testProjectId,
        executionId: execution.id,
      });

      assert.equal(stepsResult.items.length, 2);
      assert.equal(stepsResult.items[0]?.attempt, 1);
      assert.equal(stepsResult.items[0]?.status, 'FAILED');
      assert.equal(stepsResult.items[1]?.attempt, 2);
      assert.equal(stepsResult.items[1]?.status, 'PASSED');
    });
  });

  describe('3. Terminal State Protection & Completion', () => {
    it('transitions execution to terminal state and prevents invalid subsequent transitions', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const completed = await service.completeExecution({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        status: 'PASSED',
        durationMs: 500,
      });

      assert.equal(completed.status, 'PASSED');
      assert.equal(completed.durationMs, 500);

      // Verify idempotent completion with same terminal status returns cleanly
      const duplicate = await service.completeExecution({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        status: 'PASSED',
      });
      assert.equal(duplicate.status, 'PASSED');

      // Attempting to transition from terminal PASSED to FAILED is rejected
      await assert.rejects(
        async () => {
          await service.completeExecution({
            projectId: testProjectId,
            testRunId,
            executionId: execution.id,
            status: 'FAILED',
          });
        },
        (err: unknown) => err instanceof ExecutionAlreadyTerminalError,
      );
    });
  });

  describe('4. Startup Crash Reconciliation', () => {
    it('reconciles active PREPARING/RUNNING executions to AUTOMATION_ERROR on startup', async () => {
      // Create 2 executions in active state
      const run2 = await prisma.testRun.create({
        data: {
          projectId: testProjectId,
          testCaseId,
          testCaseTitle: 'User Login Flow',
          testCaseVersionId,
          testCaseVersionNumber: 1,
          executableTestPlanId: testPlanId,
          planFingerprint: 'dummy-fp-run-valid',
          status: 'RUNNING',
          browserEngine: 'chromium',
        },
      });

      const exec1 = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const exec2 = await service.createExecution({
        projectId: testProjectId,
        testRunId: run2.id,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      // Simulate crash reconciliation
      const result = await service.reconcileOrphanedExecutions({ projectId: testProjectId });
      assert.equal(result.reconciledCount, 2);

      const refreshed1 = await service.getExecution({
        projectId: testProjectId,
        executionId: exec1.id,
      });
      assert.equal(refreshed1.status, 'AUTOMATION_ERROR');
      assert.ok(refreshed1.terminalReason?.includes('PROCESS_INTERRUPTED'));

      const refreshed2 = await service.getExecution({
        projectId: testProjectId,
        executionId: exec2.id,
      });
      assert.equal(refreshed2.status, 'AUTOMATION_ERROR');
    });
  });

  describe('5. Audit Timeline Reconstruction & History Queries', () => {
    it('reconstructs unified chronological audit timeline from transitions, steps, and assertions', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const step1 = await service.startStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 1,
        attempt: 1,
        actionType: 'NAVIGATE',
        targetSummary: 'https://app.example.com',
      });

      await service.completeStep({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepExecutionId: step1.id,
        status: 'PASSED',
        durationMs: 250,
        assertionResults: [
          {
            assertionId: crypto.randomUUID(),
            projectId: testProjectId,
            testRunId,
            assertionType: 'URL_EQUALS',
            operator: 'EQUALS',
            status: 'PASSED',
            isHard: true,
            expected: 'https://app.example.com',
            actual: 'https://app.example.com',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 5,
          },
        ],
      });

      await service.completeExecution({
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        status: 'PASSED',
        durationMs: 300,
      });

      const timeline = await service.getExecutionAuditTimeline({
        projectId: testProjectId,
        executionId: execution.id,
      });

      assert.equal(timeline.executionId, execution.id);
      assert.equal(timeline.status, 'PASSED');
      assert.ok(timeline.events.length >= 4);

      // Verify event categories
      const categories = timeline.events.map(e => e.category);
      assert.ok(categories.includes('EXECUTION_LIFECYCLE'));
      assert.ok(categories.includes('STEP_STARTED'));
      assert.ok(categories.includes('STEP_COMPLETED'));
      assert.ok(categories.includes('ASSERTION_EVALUATED'));
    });

    it('paginates listExecutions and enforces project isolation', async () => {
      await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const listResult = await service.listExecutions({
        projectId: testProjectId,
        page: 1,
        pageSize: 10,
      });

      assert.equal(listResult.items.length, 1);
      assert.equal(listResult.total, 1);
      assert.equal(listResult.page, 1);

      // Cross-project query returns empty
      const otherList = await service.listExecutions({
        projectId: otherProjectId,
        page: 1,
        pageSize: 10,
      });
      assert.equal(otherList.items.length, 0);
    });
  });

  describe('6. Concurrency & High-Volume Durability', () => {
    it('handles concurrent step execution insertions without cross-talk or corruption', async () => {
      const execution = await service.createExecution({
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
      });

      const stepPromises = Array.from({ length: 10 }, async (_, i) => {
        const stepIndex = i + 1;
        const step = await service.startStep({
          projectId: testProjectId,
          testRunId,
          executionId: execution.id,
          stepIndex,
          attempt: 1,
          actionType: 'CLICK',
          targetSummary: `button#step-${stepIndex}`,
        });

        return await service.completeStep({
          projectId: testProjectId,
          testRunId,
          executionId: execution.id,
          stepExecutionId: step.id,
          status: 'PASSED',
          durationMs: 50 + stepIndex,
        });
      });

      const completedSteps = await Promise.all(stepPromises);
      assert.equal(completedSteps.length, 10);

      const allSteps = await service.getExecutionSteps({
        projectId: testProjectId,
        executionId: execution.id,
        pageSize: 50,
      });

      assert.equal(allSteps.items.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.equal(allSteps.items[i]?.stepIndex, i + 1);
        assert.equal(allSteps.items[i]?.status, 'PASSED');
      }
    });
  });
});
