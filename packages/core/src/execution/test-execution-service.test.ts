/**
 * @file packages/core/src/execution/test-execution-service.test.ts
 * Real integration tests for TestExecutionService with live Chromium smoke and sequential lifecycle reuse.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestExecutionService } from './test-execution-service.js';
import { ExecutionTestNotApprovedError } from './execution-errors.js';

describe('TestExecutionService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const service = new TestExecutionService({ prisma });

  let projectId: string;
  let requirementId: string;
  let approvedTestCaseId: string;
  let draftTestCaseId: string;

  before(async () => {
    // Setup test project and test cases
    const proj = await prisma.project.create({
      data: { name: 'V5 Service Integration Project', status: 'ACTIVE' },
    });
    projectId = proj.id;

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-SMOKE-001',
        title: 'Smoke Test Requirement',
        originalText: 'The user shall be able to navigate to the application dashboard.',
        status: 'ACTIVE',
      },
    });
    requirementId = req.id;

    const reqVer = await prisma.requirementVersion.create({
      data: {
        projectId,
        requirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SMOKE-001',
        title: 'Smoke Test Requirement',
        originalText: 'The user shall be able to navigate to the application dashboard.',
        sourceRequirementTextSha256: 'sha1',
      },
    });

    const approvedTc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-SMOKE-001',
        title: 'Smoke Execution Test Case',
        objective: 'Test service preparation',
        reviewStatus: 'APPROVED',
        approvedVersionNumber: 1,
        approvedAt: new Date(),
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    approvedTestCaseId = approvedTc.id;

    const draftTc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: 'TC-SMOKE-002',
        title: 'Draft Test Case',
        objective: 'Draft rejection',
        reviewStatus: 'DRAFT',
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    draftTestCaseId = draftTc.id;
  });

  after(async () => {
    await prisma.project.deleteMany({
      where: { id: projectId },
    });
    await service.cleanupAll();
  });

  it('queries capability report with active execution count', async () => {
    const caps = await service.getCapabilities();
    assert.equal(caps.playwrightInstalled, true);
    assert.equal(caps.chromiumAvailable, true);
    assert.equal(caps.activeExecutionsCount, 0);
  });

  it('runs real Playwright deterministic runtime smoke test successfully', async () => {
    const result = await service.runRuntimeSmoke({
      browserEngine: 'chromium',
      headless: true,
      timeoutMs: 20000,
    });

    assert.equal(result.browserEngine, 'chromium');
    assert.ok(result.browserVersion.length > 0);
    assert.equal(result.headless, true);
    assert.equal(result.launchSuccess, true);
    assert.equal(result.contextSuccess, true);
    assert.equal(result.pageSuccess, true);
    assert.equal(result.navigationSuccess, true);
    assert.equal(result.cleanupSuccess, true);
    assert.equal(result.pageTitle, 'V5 Playwright Runtime Smoke');
    assert.equal(result.verifiedText, 'READY');

    assert.ok(result.timings.launchMs >= 0);
    assert.ok(result.timings.contextMs >= 0);
    assert.ok(result.timings.pageMs >= 0);
    assert.ok(result.timings.navigationMs >= 0);
    assert.ok(result.timings.cleanupMs >= 0);
    assert.ok(result.timings.totalMs > 0);

    // Verify no leaked runtime resources in registry
    const caps = await service.getCapabilities();
    assert.equal(caps.activeExecutionsCount, 0);
  });

  it('executes 3 repeated sequential runtime smoke launches with 0 resource leaks', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await service.runRuntimeSmoke({
        browserEngine: 'chromium',
        headless: true,
        timeoutMs: 20000,
      });
      assert.equal(res.launchSuccess, true);
      assert.equal(res.cleanupSuccess, true);
      assert.equal(res.verifiedText, 'READY');

      const caps = await service.getCapabilities();
      assert.equal(caps.activeExecutionsCount, 0, `Run ${i} must leave 0 active contexts`);
    }
  });

  it('prepares execution context for approved test case and performs clean teardown', async () => {
    const execCtx = await service.prepareExecution({
      projectId,
      testCaseId: approvedTestCaseId,
      browserEngine: 'chromium',
      headless: true,
    });

    assert.ok(execCtx.executionId);
    assert.equal(execCtx.projectId, projectId);
    assert.equal(execCtx.testCaseId, approvedTestCaseId);
    assert.ok(execCtx.browser.isConnected());
    assert.ok(!execCtx.page.isClosed());

    // Active execution count should be 1
    const caps = await service.getCapabilities();
    assert.equal(caps.activeExecutionsCount, 1);

    // Teardown
    await service.cleanup(execCtx.executionId);

    // Active execution count should return to 0
    const capsAfter = await service.getCapabilities();
    assert.equal(capsAfter.activeExecutionsCount, 0);
  });

  it('rejects execution preparation for DRAFT test case with ExecutionTestNotApprovedError', async () => {
    await assert.rejects(
      async () => {
        await service.prepareExecution({
          projectId,
          testCaseId: draftTestCaseId,
          browserEngine: 'chromium',
          headless: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ExecutionTestNotApprovedError);
        return true;
      },
    );

    const caps = await service.getCapabilities();
    assert.equal(caps.activeExecutionsCount, 0);
  });
});
