/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-security.test.ts
 * Multi-tenant security isolation and boundary verification for Phase 82.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureAiReasoningService } from './failure-ai-reasoning-service.js';
import {
  AiAssessmentCrossProjectError,
  AiAssessmentBlockedError,
  AiAssessmentInsufficientEvidenceError,
} from './ai-reasoning-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';

test('AI Classification Security & Multi-Tenant Isolation (Phase 82)', async t => {
  let prisma: PrismaClient;
  let service: FailureAiReasoningService;

  let projectAId: string;
  let projectBId: string;
  let failureCaseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureAiReasoningService(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A Security AI' },
        { id: projectBId, name: 'Project B Security AI' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-AI-SEC-01',
        title: 'AI Security Requirement',
        originalText: 'System must isolate AI failure reasoning by project',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-AI-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Security Test Case',
        objective: 'Test tenant separation in AI reasoning',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-sec-ai',
        summary: 'Sec Plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-sec-ai',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: projectAId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        errorMessage: 'Test error message for tenant isolation',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Tenant Isolation Failure Case',
        errorMessage: 'Test error message',
      },
    });
    failureCaseAId = fc.id;
  });

  await t.test(
    '1. Rejects cross-project assessment attempt when project ID mismatches',
    async () => {
      await assert.rejects(
        () =>
          service.assessFailureWithAi({
            projectId: projectBId, // Mismatched!
            failureCaseId: failureCaseAId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AiAssessmentCrossProjectError);
          assert.equal(err.code, 'AI_ASSESSMENT_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test('2. Rejects cross-project read access in getAiAssessment', async () => {
    await assert.rejects(
      () =>
        service.getAiAssessment({
          projectId: projectBId, // Mismatched!
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AiAssessmentCrossProjectError);
        return true;
      },
    );
  });

  await t.test('3. Rejects cross-project read access in listAiAssessmentHistory', async () => {
    await assert.rejects(
      () =>
        service.listAiAssessmentHistory({
          projectId: projectBId, // Mismatched!
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AiAssessmentCrossProjectError);
        return true;
      },
    );
  });

  await t.test('4. Rejects non-existent failure case with FailureCaseNotFoundError', async () => {
    const nonexistentId = crypto.randomUUID();
    await assert.rejects(
      () =>
        service.assessFailureWithAi({
          projectId: projectAId,
          failureCaseId: nonexistentId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FailureCaseNotFoundError);
        return true;
      },
    );
  });

  await t.test('5. Rejects assessment when failure case is marked ineligible', async () => {
    await prisma.failureCase.update({
      where: { id: failureCaseAId },
      data: { isEligible: false, ineligibilityReason: 'Execution succeeded on retry' },
    });

    await assert.rejects(
      () =>
        service.assessFailureWithAi({
          projectId: projectAId,
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof AiAssessmentBlockedError);
        assert.equal(err.code, 'AI_ASSESSMENT_BLOCKED');
        return true;
      },
    );
  });

  await t.test(
    '6. Rejects assessment when failure case contains zero evidence, no error message, and no baseline',
    async () => {
      // Create an empty failure case with no error messages and no evidence
      const existingTc = await prisma.testCase.findFirstOrThrow({
        where: { projectId: projectAId },
      });
      const existingPlan = await prisma.executableTestPlan.findFirstOrThrow({
        where: { projectId: projectAId },
      });

      const emptyRun = await prisma.testRun.create({
        data: {
          projectId: projectAId,
          testCaseId: existingTc.id,
          testCaseVersionNumber: 1,
          executableTestPlanId: existingPlan.id,
          status: 'FAILED',
          planFingerprint: 'plan-fp-sec-empty-' + crypto.randomUUID().slice(0, 8),
          testCaseTitle: existingTc.title,
        },
      });

      const emptyExec = await prisma.testCaseExecution.create({
        data: {
          projectId: projectAId,
          testRunId: emptyRun.id,
          testCaseId: existingTc.id,
          testCaseVersionNumber: 1,
          executableTestPlanId: existingPlan.id,
          status: 'FAILED',
          errorMessage: null,
        },
      });

      const emptyCase = await prisma.failureCase.create({
        data: {
          projectId: projectAId,
          testCaseId: emptyExec.testCaseId,
          testCaseVersionNumber: 1,
          testRunId: emptyExec.testRunId,
          executionId: emptyExec.id,
          triggeringExecutionStatus: 'FAILED',
          title: 'Empty Case Zero Evidence',
          errorMessage: null,
        },
      });

      await assert.rejects(
        () =>
          service.assessFailureWithAi({
            projectId: projectAId,
            failureCaseId: emptyCase.id,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AiAssessmentInsufficientEvidenceError);
          assert.equal(err.code, 'AI_ASSESSMENT_INSUFFICIENT_EVIDENCE');
          return true;
        },
      );
    },
  );
});
