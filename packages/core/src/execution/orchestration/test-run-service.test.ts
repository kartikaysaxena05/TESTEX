/**
 * @file packages/core/src/execution/orchestration/test-run-service.test.ts
 * Integration tests for TestRunService with PostgreSQL, idempotency, review guards, staleness guards, and isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { TestRunService } from './test-run-service.js';
import {
  TestRunNotFoundError,
  TestRunPlanNotFoundError,
  TestRunStaleError,
} from './orchestration-errors.js';
import {
  ExecutionProjectMismatchError,
  ExecutionTestNotApprovedError,
} from '../execution-errors.js';

describe('TestRunService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const runService = new TestRunService({ prisma });

  let projectId: string;
  let otherProjectId: string;
  let approvedTestCaseId: string;
  let draftTestCaseId: string;
  let staleTestCaseId: string;
  let planId: string;
  let environmentId: string;

  before(async () => {
    // 1. Create main project
    const project = await prisma.project.create({
      data: { name: 'TestRunService Project', status: 'ACTIVE' },
    });
    projectId = project.id;

    // 2. Create second project for isolation checks
    const otherProject = await prisma.project.create({
      data: { name: 'Other Isolation Project', status: 'ACTIVE' },
    });
    otherProjectId = otherProject.id;

    // 3. Create target environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId,
        name: 'Staging Env',
        baseUrl: 'https://staging.app.example.com',
        isDefault: true,
      },
    });
    environmentId = env.id;

    // 4. Create requirement
    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-RUN-001',
        title: 'Checkout Flow Requirement',
        originalText: 'Checkout requirement original text',
        status: 'ACTIVE',
        versions: {
          create: [
            {
              projectId,
              versionNumber: 1,
              title: 'Checkout v1',
              requirementKeySnapshot: 'REQ-RUN-001',
              originalText: 'Original text v1',
              sourceRequirementTextSha256: 'hash1',
            },
            {
              projectId,
              versionNumber: 2,
              title: 'Checkout v2',
              requirementKeySnapshot: 'REQ-RUN-001',
              originalText: 'Original text v2',
              sourceRequirementTextSha256: 'hash2',
            },
          ],
        },
      },
    });

    // 5. Create approved test case matching requirement v2
    const approvedTest = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-RUN-001',
        title: 'Checkout E2E Test',
        objective: 'Test checkout flow e2e',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 2,
      },
    });
    approvedTestCaseId = approvedTest.id;

    // 6. Create compiled valid plan for approved test
    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: approvedTestCaseId,
        testCaseVersionNumber: 1,
        environmentId,
        planFingerprint: 'dummy-fp-run-valid',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = plan.id;

    // 7. Create draft unapproved test case
    const draftTest = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-RUN-DRAFT',
        title: 'Draft Test Case',
        objective: 'Draft test objective',
        reviewStatus: 'DRAFT',
        currentVersionNumber: 1,
      },
    });
    draftTestCaseId = draftTest.id;

    // 8. Create stale test case (linked to old req version 1 while req is at version 2)
    const staleTest = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-RUN-STALE',
        title: 'Stale Test Case',
        objective: 'Stale test objective',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    staleTestCaseId = staleTest.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.delete({ where: { id: otherProjectId } });
    }
  });

  it('enqueues a test execution run for an approved test case with compiled plan', async () => {
    const run = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
      environmentId,
      browserEngine: 'chromium',
      headless: true,
    });

    assert.equal(run.projectId, projectId);
    assert.equal(run.testCaseId, approvedTestCaseId);
    assert.equal(run.testCaseVersionNumber, 1);
    assert.equal(run.executableTestPlanId, planId);
    assert.equal(run.status, 'QUEUED');
    assert.equal(run.environmentName, 'Staging Env');
    assert(run.id !== undefined);
  });

  it('respects idempotency key and returns existing run without duplication', async () => {
    const idempotencyKey = 'unique-idempotency-token-123';

    const run1 = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
      idempotencyKey,
    });

    const run2 = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
      idempotencyKey,
    });

    assert.equal(run1.id, run2.id);
    assert.equal(run2.idempotencyKey, idempotencyKey);
  });

  it('rejects execution of unapproved (DRAFT) test cases with ExecutionTestNotApprovedError', async () => {
    await assert.rejects(
      async () => {
        await runService.enqueueRun({
          projectId,
          testCaseId: draftTestCaseId,
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionTestNotApprovedError);
        assert.equal(err.code, 'EXECUTION_TEST_NOT_APPROVED');
        return true;
      },
    );
  });

  it('rejects execution of stale test cases with TestRunStaleError', async () => {
    await assert.rejects(
      async () => {
        await runService.enqueueRun({
          projectId,
          testCaseId: staleTestCaseId,
        });
      },
      (err: unknown) => {
        assert(err instanceof TestRunStaleError);
        assert.equal(err.code, 'TEST_RUN_STALE_ERROR');
        return true;
      },
    );
  });

  it('rejects execution when no executable plan exists with TestRunPlanNotFoundError', async () => {
    // Create approved test without any compiled plan
    const testWithoutPlan = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-NO-PLAN',
        title: 'Test Without Plan',
        objective: 'Test without compiled plan',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
      },
    });

    await assert.rejects(
      async () => {
        await runService.enqueueRun({
          projectId,
          testCaseId: testWithoutPlan.id,
        });
      },
      (err: unknown) => {
        assert(err instanceof TestRunPlanNotFoundError);
        assert.equal(err.code, 'TEST_RUN_PLAN_NOT_FOUND');
        return true;
      },
    );
  });

  it('enforces multi-tenant project isolation across all service methods', async () => {
    const run = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
    });

    // 1. Get from other project throws TEST_RUN_NOT_FOUND
    await assert.rejects(
      async () => {
        await runService.getRun({ projectId: otherProjectId, runId: run.id });
      },
      (err: unknown) => {
        assert(err instanceof TestRunNotFoundError);
        return true;
      },
    );

    // 2. Enqueue with mismatched testCase and projectId throws ExecutionProjectMismatchError
    await assert.rejects(
      async () => {
        await runService.enqueueRun({
          projectId: otherProjectId,
          testCaseId: approvedTestCaseId,
        });
      },
      (err: unknown) => {
        assert(err instanceof ExecutionProjectMismatchError);
        return true;
      },
    );
  });

  it('retrieves, lists, and cancels runs', async () => {
    const run = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
    });

    // Get
    const fetched = await runService.getRun({ projectId, runId: run.id });
    assert.equal(fetched.id, run.id);

    // List
    const list = await runService.listRuns({ projectId, limit: 10 });
    assert(list.length > 0);
    assert(list.some(r => r.id === run.id));

    // Cancel
    const cancelled = await runService.cancelRun({
      projectId,
      runId: run.id,
      reason: 'User cancelled from test suite',
    });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.terminalReason, 'User cancelled from test suite');
  });

  it('processes next queue item end-to-end', async () => {
    // Clear previously queued runs for this project to test isolated single-item FIFO execution
    await prisma.testRun.deleteMany({ where: { projectId } });

    const run = await runService.enqueueRun({
      projectId,
      testCaseId: approvedTestCaseId,
    });

    assert.equal(run.status, 'QUEUED');

    const executed = await runService.processNextQueueItem(projectId);
    assert(executed !== null);
    assert.equal(executed.id, run.id);
    assert.equal(executed.status, 'PASSED');
    assert(executed.completedAt !== null);
  });
});
