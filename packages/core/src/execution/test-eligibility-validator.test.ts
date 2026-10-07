/**
 * @file packages/core/src/execution/test-eligibility-validator.test.ts
 * Integration tests for TestEligibilityValidator evaluating V4 approval, staleness, and tenant isolation rules.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../database/index.js';
import { TestEligibilityValidator } from './test-eligibility-validator.js';
import { ExecutionProjectMismatchError } from './execution-errors.js';

describe('TestEligibilityValidator Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const validator = new TestEligibilityValidator(prisma);

  let projectIdA: string;
  let projectIdB: string;
  let requirementId: string;
  let draftTestCaseId: string;
  let approvedTestCaseId: string;
  let rejectedTestCaseId: string;
  let manualTestCaseId: string;
  let staleTestCaseId: string;

  before(async () => {
    // 1. Create Projects
    const projA = await prisma.project.create({
      data: { name: 'V5 Execution Test Project A', status: 'ACTIVE' },
    });
    projectIdA = projA.id;

    const projB = await prisma.project.create({
      data: { name: 'V5 Execution Test Project B', status: 'ACTIVE' },
    });
    projectIdB = projB.id;

    // 2. Create Requirement and Version 1
    const req = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        requirementKey: 'REQ-EXEC-001',
        title: 'User Authentication Flow',
        originalText: 'The user shall be able to log in with email and password.',
        status: 'ACTIVE',
      },
    });
    requirementId = req.id;

    const reqVer1 = await prisma.requirementVersion.create({
      data: {
        projectId: projectIdA,
        requirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-EXEC-001',
        title: 'User Authentication Flow',
        originalText: 'The user shall be able to log in with email and password.',
        sourceRequirementTextSha256: 'hash1',
      },
    });

    // 3. Create Draft Test Case
    const draftTc = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        testCaseKey: 'TC-EXEC-001',
        title: 'Verify valid login credentials',
        objective: 'Login successfully',
        reviewStatus: 'DRAFT',
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer1.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    draftTestCaseId = draftTc.id;

    // 4. Create Approved Test Case
    const approvedTc = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        testCaseKey: 'TC-EXEC-002',
        title: 'Verify valid login credentials approved',
        objective: 'Login successfully with approval',
        reviewStatus: 'APPROVED',
        approvedVersionNumber: 1,
        approvedAt: new Date(),
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer1.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    approvedTestCaseId = approvedTc.id;

    // 5. Create Rejected Test Case
    const rejectedTc = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        testCaseKey: 'TC-EXEC-003',
        title: 'Verify rejected test case',
        objective: 'Rejection testing',
        reviewStatus: 'REJECTED',
        latestReviewComment: 'Invalid expected outcome',
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer1.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    rejectedTestCaseId = rejectedTc.id;

    // 6. Create Manual Only Test Case
    const manualTc = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        testCaseKey: 'TC-EXEC-004',
        title: 'Verify physical card swipe',
        objective: 'Manual card swipe testing',
        reviewStatus: 'APPROVED',
        executionSuitability: 'MANUAL',
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer1.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    manualTestCaseId = manualTc.id;

    // 7. Create Test Case that will become Stale
    const staleTc = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        testCaseKey: 'TC-EXEC-005',
        title: 'Verify test case before requirement advancement',
        objective: 'Staleness evaluation',
        reviewStatus: 'APPROVED',
        sourceRequirementId: requirementId,
        sourceRequirementVersionId: reqVer1.id,
        sourceRequirementVersionNumber: 1,
      },
    });
    staleTestCaseId = staleTc.id;

    // Advance Requirement to Version 2
    await prisma.requirementVersion.create({
      data: {
        projectId: projectIdA,
        requirementId,
        versionNumber: 2,
        requirementKeySnapshot: 'REQ-EXEC-001',
        title: 'User Authentication Flow (Updated)',
        originalText: 'The user shall be able to log in with 2FA enabled.',
        sourceRequirementTextSha256: 'hash2',
      },
    });
  });

  after(async () => {
    // Cleanup created test data
    await prisma.project.deleteMany({
      where: { id: { in: [projectIdA, projectIdB] } },
    });
  });

  it('returns NOT_FOUND for non-existent testCaseId', async () => {
    const res = await validator.validateEligibility({
      projectId: projectIdA,
      testCaseId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(res.status, 'NOT_FOUND');
    assert.equal(res.isEligible, false);
  });

  it('throws ExecutionProjectMismatchError when test case belongs to another project', async () => {
    await assert.rejects(
      async () => {
        await validator.validateEligibility({
          projectId: projectIdB, // Requesting project B for a test from project A
          testCaseId: approvedTestCaseId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ExecutionProjectMismatchError);
        return true;
      },
    );
  });

  it('reports NOT_APPROVED for DRAFT test case', async () => {
    const res = await validator.validateEligibility({
      projectId: projectIdA,
      testCaseId: draftTestCaseId,
    });
    assert.equal(res.status, 'NOT_APPROVED');
    assert.equal(res.isEligible, false);
    assert.ok(res.reasons[0]?.includes('DRAFT'));
  });

  it('reports REJECTED for test case in REJECTED review status', async () => {
    const res = await validator.validateEligibility({
      projectId: projectIdA,
      testCaseId: rejectedTestCaseId,
    });
    assert.equal(res.status, 'REJECTED');
    assert.equal(res.isEligible, false);
    assert.ok(res.reasons[0]?.includes('REJECTED'));
  });

  it('reports UNSUPPORTED_SUITABILITY for MANUAL suitability test case', async () => {
    const res = await validator.validateEligibility({
      projectId: projectIdA,
      testCaseId: manualTestCaseId,
    });
    assert.equal(res.status, 'UNSUPPORTED_SUITABILITY');
    assert.equal(res.isEligible, false);
  });

  it('reports STALE when source requirement version advanced past test version', async () => {
    const res = await validator.validateEligibility({
      projectId: projectIdA,
      testCaseId: staleTestCaseId,
    });
    assert.equal(res.status, 'STALE');
    assert.equal(res.isEligible, false);
    assert.equal(res.isRequirementStale, true);
    assert.equal(res.sourceRequirementVersionNumber, 1);
    assert.equal(res.currentRequirementVersionNumber, 2);
  });
});
