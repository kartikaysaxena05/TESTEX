/**
 * @file packages/core/src/test-review/test-review-service.test.ts
 * Integration tests for Phase 56 Test Review, Approval, Regeneration & Versioning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '../logging/index.js';
import { TestReviewService } from './test-review-service.js';
import { TestReviewProjectMismatchError, TestVersionConflictError } from './test-review-errors.js';

test('TestReviewService Integration Suite', async t => {
  const prisma = new PrismaClient();
  const logger = new AppLogger();
  const service = new TestReviewService({ prisma, logger });

  let projectAId: string;
  let projectBId: string;
  let reqAId: string;

  t.before(async () => {
    // Setup test projects
    const pA = await prisma.project.create({
      data: {
        name: `Phase 56 Test Project A ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    projectAId = pA.id;

    const pB = await prisma.project.create({
      data: {
        name: `Phase 56 Test Project B ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    projectBId = pB.id;

    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-AUTH-001',
        title: 'User Authentication Flow',
        originalText: 'The user must provide email and password. Maximum 5 attempts allowed.',
        status: 'ACTIVE',
        versions: {
          create: {
            projectId: projectAId,
            versionNumber: 1,
            requirementKeySnapshot: 'REQ-AUTH-001',
            title: 'User Authentication Flow',
            originalText: 'The user must provide email and password. Maximum 5 attempts allowed.',
            sourceRequirementTextSha256: 'sha256-auth',
          },
        },
      },
    });
    reqAId = reqA.id;
  });

  t.after(async () => {
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
    await prisma.$disconnect();
  });

  await t.test('1. initializes baseline v1 on review inspection if no version exists', async () => {
    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: 'TC-AUTH-001',
        title: 'Valid Email and Password Login',
        objective: 'Verify user can log in with valid credentials.',
        type: 'POSITIVE',
        priority: 'HIGH',
        status: 'ACTIVE',
        sourceRequirementId: reqAId,
        sourceRequirementKey: 'REQ-AUTH-001',
        sourceRequirementVersionNumber: 1,
        preconditions: {
          create: [
            {
              sequenceOrder: 1,
              category: 'AUTHENTICATION',
              description: 'User account is active.',
            },
          ],
        },
        steps: {
          create: [
            {
              stepNumber: 1,
              action: 'Navigate to login page',
              expectedResult: 'Login form is displayed',
            },
            {
              stepNumber: 2,
              action: 'Enter credentials and click submit',
              expectedResult: 'Redirected to dashboard',
            },
          ],
        },
        testData: {
          create: [
            {
              sequenceOrder: 1,
              name: 'email',
              dataType: 'STRING',
              valueJson: 'user@example.com',
            },
          ],
        },
      },
    });

    const detail = await service.getReviewDetail({
      projectId: projectAId,
      testCaseId: tc.id,
    });

    assert.equal(detail.testCase.id, tc.id);
    assert.equal(detail.activeVersion.versionNumber, 1);
    assert.equal(detail.activeVersion.sourceType, 'INITIAL_AI_GENERATION');
    assert.equal(detail.activeVersion.reviewStatus, 'DRAFT');
    assert.equal(detail.activeVersion.title, 'Valid Email and Password Login');
    assert.equal(detail.activeVersion.preconditions.length, 1);
    assert.equal(detail.activeVersion.steps.length, 2);
    assert.equal(detail.activeVersion.testData.length, 1);
    assert.equal(detail.versionsCount, 1);
  });

  await t.test('2. approves a specific version and logs review audit event', async () => {
    const tc = await prisma.testCase.findFirstOrThrow({
      where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
    });

    const approved = await service.approveTestVersion({
      projectId: projectAId,
      testCaseId: tc.id,
      versionNumber: 1,
      comment: 'Approved for regression test suite.',
      reviewerActorId: 'QA_LEAD_ALICE',
    });

    assert.equal(approved.testCase.reviewStatus, 'APPROVED');
    assert.equal(approved.activeVersion.reviewStatus, 'APPROVED');
    assert.equal(approved.activeVersion.versionNumber, 1);
    assert.equal(approved.reviewEvents.length, 1);
    assert.equal(approved.reviewEvents[0]?.action, 'APPROVED');
    assert.equal(approved.reviewEvents[0]?.actorId, 'QA_LEAD_ALICE');
    assert.equal(approved.reviewEvents[0]?.comment, 'Approved for regression test suite.');

    // Idempotent approval check
    const idempotent = await service.approveTestVersion({
      projectId: projectAId,
      testCaseId: tc.id,
      versionNumber: 1,
      comment: 'Approved again.',
      reviewerActorId: 'QA_LEAD_ALICE',
    });
    assert.equal(idempotent.reviewEvents.length, 1); // No duplicate events created
  });

  await t.test(
    '3. human edit creates immutable v2, attributes HUMAN_EDIT, and resets approval on v2 while preserving historical v1 approval',
    async () => {
      const tc = await prisma.testCase.findFirstOrThrow({
        where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
      });

      const edited = await service.editTestCase({
        projectId: projectAId,
        testCaseId: tc.id,
        expectedVersionNumber: 1,
        title: 'Valid Email and Password Login with Session Token',
        objective: 'Verify user logs in and session token is assigned.',
        changeReason: 'Added session token verification assertion.',
        preconditions: [
          {
            sequenceOrder: 1,
            category: 'AUTHENTICATION',
            description: 'User account is active and verified.',
          },
        ],
        steps: [
          {
            stepNumber: 1,
            action: 'Navigate to login page',
            expectedResult: 'Login form is displayed',
          },
          {
            stepNumber: 2,
            action: 'Enter credentials and click submit',
            expectedResult: 'Redirected to dashboard and session token cookie set',
          },
        ],
        testData: [
          {
            sequenceOrder: 1,
            name: 'email',
            dataType: 'STRING',
            valueJson: 'user@example.com',
          },
        ],
        editorActorId: 'QA_DEV_BOB',
      });

      // Active version should now be v2, in DRAFT state
      assert.equal(edited.testCase.currentVersionNumber, 2);
      assert.equal(edited.testCase.reviewStatus, 'DRAFT');
      assert.equal(edited.activeVersion.versionNumber, 2);
      assert.equal(edited.activeVersion.sourceType, 'HUMAN_EDIT');
      assert.equal(edited.activeVersion.reviewStatus, 'DRAFT');
      assert.equal(edited.activeVersion.createdByActorId, 'QA_DEV_BOB');
      assert.equal(edited.versionsCount, 2);

      // Historical v1 version remains intact and APPROVED
      const v1 = await service.getReviewDetail({
        projectId: projectAId,
        testCaseId: tc.id,
        versionNumber: 1,
      });
      assert.equal(v1.activeVersion.versionNumber, 1);
      assert.equal(v1.activeVersion.reviewStatus, 'APPROVED');
      assert.equal(v1.activeVersion.sourceType, 'INITIAL_AI_GENERATION');
    },
  );

  await t.test('4. rejects no-op edit without creating superfluous version', async () => {
    const tc = await prisma.testCase.findFirstOrThrow({
      where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
    });

    // Save exact same content
    const res = await service.editTestCase({
      projectId: projectAId,
      testCaseId: tc.id,
      expectedVersionNumber: 2,
      title: 'Valid Email and Password Login with Session Token',
      objective: 'Verify user logs in and session token is assigned.',
      preconditions: [
        {
          sequenceOrder: 1,
          category: 'AUTHENTICATION',
          description: 'User account is active and verified.',
        },
      ],
      steps: [
        {
          stepNumber: 1,
          action: 'Navigate to login page',
          expectedResult: 'Login form is displayed',
        },
        {
          stepNumber: 2,
          action: 'Enter credentials and click submit',
          expectedResult: 'Redirected to dashboard and session token cookie set',
        },
      ],
      testData: [
        {
          sequenceOrder: 1,
          name: 'email',
          dataType: 'STRING',
          valueJson: 'user@example.com',
        },
      ],
    });

    // Version number must remain 2 (0 new versions created)
    assert.equal(res.activeVersion.versionNumber, 2);
    assert.equal(res.versionsCount, 2);
  });

  await t.test(
    '5. enforces optimistic concurrency conflict on stale edit base version',
    async () => {
      const tc = await prisma.testCase.findFirstOrThrow({
        where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
      });

      // Expects version 1, but current version is 2
      await assert.rejects(
        async () => {
          await service.editTestCase({
            projectId: projectAId,
            testCaseId: tc.id,
            expectedVersionNumber: 1,
            title: 'Concurrent Edit Title',
            objective: 'Will fail due to version conflict',
            preconditions: [],
            steps: [],
            testData: [],
          });
        },
        (err: any) =>
          err instanceof TestVersionConflictError && err.code === 'TEST_VERSION_CONFLICT',
      );
    },
  );

  await t.test('6. computes deterministic structural version diff between v1 and v2', async () => {
    const tc = await prisma.testCase.findFirstOrThrow({
      where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
    });

    const diff = await service.compareTestVersions({
      projectId: projectAId,
      testCaseId: tc.id,
      fromVersionNumber: 1,
      toVersionNumber: 2,
    });

    assert.equal(diff.fromVersionNumber, 1);
    assert.equal(diff.toVersionNumber, 2);
    assert.equal(
      diff.fieldChanges.some(f => f.field === 'title'),
      true,
    );
    assert.equal(diff.preconditionChanges.modified.length, 1);
    assert.equal(diff.stepChanges.modified.length, 1);
  });

  await t.test(
    '7. rejects a test version with structured reason taxonomy and comment',
    async () => {
      const tc = await prisma.testCase.findFirstOrThrow({
        where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
      });

      const rejected = await service.rejectTestVersion({
        projectId: projectAId,
        testCaseId: tc.id,
        versionNumber: 2,
        rejectionReason: 'INCORRECT_PRECONDITION',
        comment: 'Verified account requirement is inaccurate for guest checkout.',
        reviewerActorId: 'QA_LEAD_ALICE',
      });

      assert.equal(rejected.testCase.reviewStatus, 'REJECTED');
      assert.equal(rejected.activeVersion.reviewStatus, 'REJECTED');
      assert.equal(
        rejected.reviewEvents.some(e => e.action === 'REJECTED'),
        true,
      );
    },
  );

  await t.test(
    '8. regenerates a test case creating v3 with AI_REGENERATION source and draft status',
    async () => {
      const tc = await prisma.testCase.findFirstOrThrow({
        where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
      });

      const regenerated = await service.regenerateTestCase({
        projectId: projectAId,
        testCaseId: tc.id,
        expectedVersionNumber: 2,
        reason: 'Regenerate without verified email constraint.',
        reviewerInstructions: 'Focus on standard login flow.',
        actorId: 'QA_DEV_BOB',
      });

      assert.equal(regenerated.testCase.currentVersionNumber, 3);
      assert.equal(regenerated.testCase.reviewStatus, 'DRAFT');
      assert.equal(regenerated.activeVersion.versionNumber, 3);
      assert.equal(regenerated.activeVersion.sourceType, 'AI_REGENERATION');
      assert.equal(regenerated.activeVersion.reviewStatus, 'DRAFT');
      assert.equal(regenerated.versionsCount, 3);
    },
  );

  await t.test('9. preserves test case history and prevents cross-project access', async () => {
    const tc = await prisma.testCase.findFirstOrThrow({
      where: { projectId: projectAId, testCaseKey: 'TC-AUTH-001' },
    });

    // Cross-project read
    await assert.rejects(
      async () => {
        await service.getReviewDetail({
          projectId: projectBId,
          testCaseId: tc.id,
        });
      },
      (err: any) => err instanceof TestReviewProjectMismatchError,
    );

    // Cross-project approve
    await assert.rejects(
      async () => {
        await service.approveTestVersion({
          projectId: projectBId,
          testCaseId: tc.id,
          versionNumber: 3,
        });
      },
      (err: any) => err instanceof TestReviewProjectMismatchError,
    );

    // Cross-project edit
    await assert.rejects(
      async () => {
        await service.editTestCase({
          projectId: projectBId,
          testCaseId: tc.id,
          expectedVersionNumber: 3,
          title: 'Cross project edit',
          objective: 'Forbidden',
          preconditions: [],
          steps: [],
          testData: [],
        });
      },
      (err: any) => err instanceof TestReviewProjectMismatchError,
    );

    // History check
    const history = await service.getTestHistory({
      projectId: projectAId,
      testCaseId: tc.id,
    });
    assert.equal(history.versions.length, 3);
    assert.equal(history.reviewEvents.length >= 3, true);
  });

  await t.test('10. lists review queue with filtering by review status', async () => {
    const draftQueue = await service.listReviewQueue({
      projectId: projectAId,
      reviewStatus: 'DRAFT',
    });
    assert.equal(
      draftQueue.items.some(i => i.testCaseKey === 'TC-AUTH-001'),
      true,
    );

    const approvedQueue = await service.listReviewQueue({
      projectId: projectAId,
      reviewStatus: 'APPROVED',
    });
    assert.equal(
      approvedQueue.items.some(i => i.testCaseKey === 'TC-AUTH-001'),
      false,
    );
  });
});
