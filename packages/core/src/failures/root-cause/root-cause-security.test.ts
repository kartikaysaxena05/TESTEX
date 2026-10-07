/**
 * @file packages/core/src/failures/root-cause/root-cause-security.test.ts
 * Multi-tenant security isolation and boundary verification for Phase 83 Root-Cause Analysis.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureRootCauseService } from './failure-root-cause-service.js';
import {
  RootCauseCrossProjectError,
  RootCauseBlockedError,
  RootCauseInsufficientEvidenceError,
} from './root-cause-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';

test('Root-Cause Security & Multi-Tenant Isolation (Phase 83)', async t => {
  let prisma: PrismaClient;
  let service: FailureRootCauseService;

  let projectAId: string;
  let projectBId: string;
  let failureCaseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureRootCauseService(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A Root Cause Security' },
        { id: projectBId, name: 'Project B Root Cause Security' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: `REQ-RCA-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'RCA Security Requirement',
        originalText: 'System must isolate root-cause analysis by project tenant',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-RCA-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'RCA Security Test Case',
        objective: 'Test tenant separation in root cause analysis',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: `plan-fp-rca-sec-${Date.now()}`,
        summary: 'RCA Sec Plan',
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
        planFingerprint: `plan-fp-rca-sec-${Date.now()}`,
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
        errorMessage: 'Test error message for root-cause tenant isolation',
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
        title: 'Tenant Isolation RCA Failure Case',
        errorMessage: 'Test error message for root cause analysis',
      },
    });
    failureCaseAId = fc.id;
  });

  await t.test('1. Rejects cross-project analyze attempt when project ID mismatches', async () => {
    await assert.rejects(
      () =>
        service.analyzeRootCause({
          projectId: projectBId, // Mismatched!
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof RootCauseCrossProjectError);
        assert.equal(err.code, 'ROOT_CAUSE_CROSS_PROJECT');
        return true;
      },
    );
  });

  await t.test('2. Rejects cross-project read access in getRootCauseAnalysis', async () => {
    await assert.rejects(
      () =>
        service.getRootCauseAnalysis({
          projectId: projectBId, // Mismatched!
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof RootCauseCrossProjectError);
        assert.equal(err.code, 'ROOT_CAUSE_CROSS_PROJECT');
        return true;
      },
    );
  });

  await t.test('3. Rejects cross-project read access in listRootCauseHistory', async () => {
    await assert.rejects(
      () =>
        service.listRootCauseHistory({
          projectId: projectBId, // Mismatched!
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof RootCauseCrossProjectError);
        assert.equal(err.code, 'ROOT_CAUSE_CROSS_PROJECT');
        return true;
      },
    );
  });

  await t.test('4. Rejects non-existent failure case with FailureCaseNotFoundError', async () => {
    const nonexistentId = crypto.randomUUID();
    await assert.rejects(
      () =>
        service.analyzeRootCause({
          projectId: projectAId,
          failureCaseId: nonexistentId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FailureCaseNotFoundError);
        return true;
      },
    );
  });

  await t.test('5. Rejects analysis when failure case is marked ineligible', async () => {
    await prisma.failureCase.update({
      where: { id: failureCaseAId },
      data: { isEligible: false, ineligibilityReason: 'Flaky rerun passed' },
    });

    await assert.rejects(
      () =>
        service.analyzeRootCause({
          projectId: projectAId,
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof RootCauseBlockedError);
        assert.equal(err.code, 'ROOT_CAUSE_BLOCKED');
        return true;
      },
    );
  });

  await t.test(
    '6. Rejects analysis when failure case contains zero evidence, no error message, and no baseline',
    async () => {
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
          planFingerprint: `plan-fp-rca-empty-${Date.now()}`,
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
          title: 'Empty Case Zero RCA Evidence',
          errorMessage: null,
        },
      });

      await assert.rejects(
        () =>
          service.analyzeRootCause({
            projectId: projectAId,
            failureCaseId: emptyCase.id,
          }),
        (err: unknown) => {
          assert.ok(err instanceof RootCauseInsufficientEvidenceError);
          assert.equal(err.code, 'ROOT_CAUSE_INSUFFICIENT_EVIDENCE');
          return true;
        },
      );
    },
  );
});
