/**
 * @file packages/core/src/failures/impact/impact-security.test.ts
 * Security and tenant isolation tests for FailureImpactAssessmentService (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureImpactAssessmentService } from './failure-impact-assessment-service.js';
import {
  ImpactAssessmentCrossProjectError,
  ImpactAssessmentBlockedError,
} from './impact-errors.js';

test('FailureImpactAssessment: Security & Tenant Isolation', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for security test');

  const service = new FailureImpactAssessmentService(prisma);

  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();

  await prisma.project.create({ data: { id: projectA, name: 'Project A - Impact Security' } });
  await prisma.project.create({ data: { id: projectB, name: 'Project B - Impact Security' } });

  const tc = await prisma.testCase.create({
    data: {
      projectId: projectA,
      testCaseKey: `TC-SEC-${Date.now()}`,
      title: 'Security Isolation Test',
      objective: 'Verify tenant boundaries',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId: projectA,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-sec-${Date.now()}`,
      summary: 'Plan Sec',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const tr = await prisma.testRun.create({
    data: {
      projectId: projectA,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: plan.id,
      status: 'FAILED',
      planFingerprint: plan.planFingerprint,
      testCaseTitle: tc.title,
    },
  });

  const exec = await prisma.testCaseExecution.create({
    data: {
      projectId: projectA,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionId: null,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Unhandled crash in checkout pipeline',
    },
  });

  const fc = await prisma.failureCase.create({
    data: {
      projectId: projectA,
      executionId: exec.id,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 2,
      title: 'Crash in Checkout Pipeline',
      errorMessage: 'Unhandled crash in checkout pipeline',
      failureSignature: `sig-sec-${Date.now()}`,
      isEligible: true,
    },
  });

  await t.test(
    '1. Cross-project assessImpact is rejected with ImpactAssessmentCrossProjectError',
    async () => {
      await assert.rejects(
        async () => {
          await service.assessImpact({
            projectId: projectB, // Malicious or mismatched project ID
            failureCaseId: fc.id,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ImpactAssessmentCrossProjectError);
          return true;
        },
      );
    },
  );

  await t.test(
    '2. Cross-project getImpactAssessment is rejected with ImpactAssessmentCrossProjectError',
    async () => {
      await assert.rejects(
        async () => {
          await service.getImpactAssessment({
            projectId: projectB,
            failureCaseId: fc.id,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ImpactAssessmentCrossProjectError);
          return true;
        },
      );
    },
  );

  await t.test(
    '3. Cross-project listImpactHistory is rejected with ImpactAssessmentCrossProjectError',
    async () => {
      await assert.rejects(
        async () => {
          await service.listImpactHistory({
            projectId: projectB,
            failureCaseId: fc.id,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ImpactAssessmentCrossProjectError);
          return true;
        },
      );
    },
  );

  await t.test(
    '4. Ineligible failure case is blocked with ImpactAssessmentBlockedError',
    async () => {
      const trInelig = await prisma.testRun.create({
        data: {
          projectId: projectA,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          executableTestPlanId: plan.id,
          status: 'FAILED',
          planFingerprint: plan.planFingerprint,
          testCaseTitle: tc.title,
        },
      });

      const execInelig = await prisma.testCaseExecution.create({
        data: {
          projectId: projectA,
          testRunId: trInelig.id,
          testCaseId: tc.id,
          testCaseVersionId: null,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          status: 'FAILED',
          errorMessage: 'Blocked execution',
        },
      });

      const ineligibleFc = await prisma.failureCase.create({
        data: {
          projectId: projectA,
          executionId: execInelig.id,
          testRunId: trInelig.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          stepIndex: 3,
          title: 'Ineligible Failure Case',
          errorMessage: 'Blocked failure case',
          failureSignature: `sig-sec-inelig-${Date.now()}`,
          isEligible: false,
          ineligibilityReason: 'Excluded from failure analysis due to system maintenance mode',
        },
      });

      await assert.rejects(
        async () => {
          await service.assessImpact({
            projectId: projectA,
            failureCaseId: ineligibleFc.id,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ImpactAssessmentBlockedError);
          assert.ok((err as ImpactAssessmentBlockedError).message.includes('maintenance mode'));
          return true;
        },
      );
    },
  );
});
