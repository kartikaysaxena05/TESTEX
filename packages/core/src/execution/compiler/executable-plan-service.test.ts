/**
 * @file packages/core/src/execution/compiler/executable-plan-service.test.ts
 * Integration tests for ExecutablePlanService with PostgreSQL persistence, transactions, and idempotency.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { ExecutablePlanService } from './executable-plan-service.js';
import { TestNotApprovedError, TestEnvironmentMismatchError } from './compiler-errors.js';

describe('ExecutablePlanService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const planService = new ExecutablePlanService(prisma);

  let projectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let draftTestCaseId: string;
  let environmentId: string;

  before(async () => {
    // 1. Create main project
    const project = await prisma.project.create({
      data: { name: 'Plan Compiler Integration Project', status: 'ACTIVE' },
    });
    projectId = project.id;

    // 2. Create second project for isolation checks
    const otherProject = await prisma.project.create({
      data: { name: 'Other Project Isolation', status: 'ACTIVE' },
    });
    otherProjectId = otherProject.id;

    // 3. Create target environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId,
        name: 'Staging Environment',
        baseUrl: 'https://staging.app.example.com',
        isDefault: true,
      },
    });
    environmentId = env.id;

    // 4. Create approved test case
    const approvedTest = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-COMP-001',
        title: 'User Login E2E Flow',
        objective: 'Test user authentication in staging.',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        approvedVersionNumber: 1,
        executionSuitability: 'AUTOMATED',
        preconditions: {
          create: [
            {
              sequenceOrder: 1,
              category: 'DATA_STATE',
              description: 'User account exists with email test@example.com',
            },
          ],
        },
        steps: {
          create: [
            {
              stepNumber: 1,
              action: 'Navigate to /login',
              expectedResult: 'Login form is displayed',
            },
            {
              stepNumber: 2,
              action: 'Enter user email',
              testDataSummary: 'test@example.com',
            },
            {
              stepNumber: 3,
              action: 'Enter password into Password field',
              testDataSummary: 'SuperSecret123',
            },
            {
              stepNumber: 4,
              action: 'Click Submit button',
              expectedResult: 'User is redirected to /dashboard',
            },
          ],
        },
        versions: {
          create: [
            {
              projectId,
              versionNumber: 1,
              title: 'User Login E2E Flow',
              objective: 'Test user authentication in staging.',
              reviewStatus: 'APPROVED',
              executionSuitability: 'AUTOMATED',
              preconditionsJson: [
                {
                  id: 'p1',
                  sequenceOrder: 1,
                  category: 'DATA_STATE',
                  description: 'User account exists with email test@example.com',
                },
              ],
              stepsJson: [
                {
                  id: 's1',
                  stepNumber: 1,
                  action: 'Navigate to /login',
                  expectedResult: 'Login form is displayed',
                },
                {
                  id: 's2',
                  stepNumber: 2,
                  action: 'Enter user email',
                  testDataSummary: 'test@example.com',
                },
                {
                  id: 's3',
                  stepNumber: 3,
                  action: 'Enter password into Password field',
                  testDataSummary: 'SuperSecret123',
                },
                {
                  id: 's4',
                  stepNumber: 4,
                  action: 'Click Submit button',
                  expectedResult: 'User is redirected to /dashboard',
                },
              ],
            },
          ],
        },
      },
    });
    testCaseId = approvedTest.id;

    // 5. Create draft test case
    const draftTest = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-COMP-DRAFT',
        title: 'Draft Unreviewed Test',
        objective: 'Draft unapproved test case.',
        reviewStatus: 'DRAFT',
        currentVersionNumber: 1,
        steps: {
          create: [
            {
              stepNumber: 1,
              action: 'Navigate to /settings',
            },
          ],
        },
      },
    });
    draftTestCaseId = draftTest.id;
  });

  after(async () => {
    await prisma.executableTestPlan.deleteMany({ where: { projectId } });
    await prisma.testCaseStep.deleteMany({
      where: { testCaseId: { in: [testCaseId, draftTestCaseId] } },
    });
    await prisma.testCasePrecondition.deleteMany({
      where: { testCaseId: { in: [testCaseId, draftTestCaseId] } },
    });
    await prisma.testCaseVersion.deleteMany({
      where: { testCaseId: { in: [testCaseId, draftTestCaseId] } },
    });
    await prisma.testCase.deleteMany({ where: { id: { in: [testCaseId, draftTestCaseId] } } });
    await prisma.projectEnvironment.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  });

  it('compiles and persists an executable test plan atomically in PostgreSQL', async () => {
    const plan = await planService.compilePlan({
      projectId,
      testCaseId,
      environmentId,
    });

    assert.ok(plan.id);
    assert.equal(plan.projectId, projectId);
    assert.equal(plan.testCaseId, testCaseId);
    assert.equal(plan.environmentId, environmentId);
    assert.equal(plan.status, 'VALID');
    assert.equal(plan.isExecutable, true);
    assert.equal(plan.steps.length, 4);

    // Verify database record
    const record = await prisma.executableTestPlan.findUnique({
      where: { id: plan.id },
    });
    assert.ok(record);
    assert.equal(record.planFingerprint, plan.planFingerprint);
  });

  it('maintains idempotency: compiling unchanged test case returns equivalent plan', async () => {
    const plan1 = await planService.compilePlan({
      projectId,
      testCaseId,
      environmentId,
    });

    const plan2 = await planService.compilePlan({
      projectId,
      testCaseId,
      environmentId,
    });

    assert.equal(plan1.planFingerprint, plan2.planFingerprint);
    assert.equal(plan1.id, plan2.id);
  });

  it('retrieves plan by plan ID and by test case key', async () => {
    const plan = await planService.compilePlan({
      projectId,
      testCaseId,
      environmentId,
    });

    const retrieved = await planService.getPlan({
      projectId,
      planId: plan.id,
    });
    assert.equal(retrieved.id, plan.id);
    assert.equal(retrieved.planFingerprint, plan.planFingerprint);

    const byTestCase = await planService.getPlanByTestCase({
      projectId,
      testCaseId,
    });
    assert.ok(byTestCase);
    assert.equal(byTestCase?.id, plan.id);
  });

  it('throws TestNotApprovedError when attempting to compile a DRAFT test case for execution', async () => {
    await assert.rejects(
      async () => {
        await planService.compilePlan({
          projectId,
          testCaseId: draftTestCaseId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TestNotApprovedError);
        return true;
      },
    );
  });

  it('allows in-memory preview of a draft test case with previewOnly: true', async () => {
    const preview = await planService.previewPlan({
      projectId,
      testCaseId: draftTestCaseId,
    });

    assert.ok(preview);
    assert.equal(preview.status, 'REVIEW_REQUIRED');
    assert.equal(preview.isExecutable, false);

    // Confirm that preview was NOT persisted in PostgreSQL
    const inDb = await prisma.executableTestPlan.findFirst({
      where: { testCaseId: draftTestCaseId },
    });
    assert.equal(inDb, null);
  });

  it('lists executable plans for a project with optional status filter', async () => {
    const list = await planService.listPlans({
      projectId,
      status: 'VALID',
    });

    assert.ok(list.length >= 1);
    assert.equal(list[0]!.status, 'VALID');
  });

  it('rejects environment from another project', async () => {
    const otherEnv = await prisma.projectEnvironment.create({
      data: {
        projectId: otherProjectId,
        name: 'Other Project Staging',
      },
    });

    try {
      await assert.rejects(
        async () => {
          await planService.compilePlan({
            projectId,
            testCaseId,
            environmentId: otherEnv.id,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof TestEnvironmentMismatchError);
          return true;
        },
      );
    } finally {
      await prisma.projectEnvironment.delete({ where: { id: otherEnv.id } });
    }
  });
});
