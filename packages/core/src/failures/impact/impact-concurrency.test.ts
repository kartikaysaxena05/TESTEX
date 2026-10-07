/**
 * @file packages/core/src/failures/impact/impact-concurrency.test.ts
 * Concurrency & Mutex serialization tests for FailureImpactAssessmentService (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureImpactAssessmentService } from './failure-impact-assessment-service.js';

test('FailureImpactAssessment: Concurrency & Mutex Serialization', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for concurrency test');

  const service = new FailureImpactAssessmentService(prisma);

  const projectId = crypto.randomUUID();
  await prisma.project.create({ data: { id: projectId, name: 'Impact Concurrency Project' } });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-CONC-${Date.now()}`,
      title: 'Concurrency Test Case',
      objective: 'Verify parallel assessment serialization',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-conc-${Date.now()}`,
      summary: 'Plan Conc',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const tr = await prisma.testRun.create({
    data: {
      projectId,
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
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionId: null,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Database connection timeout during cart checkout',
    },
  });

  const fc = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec.id,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 1,
      title: 'Database connection timeout during cart checkout',
      errorMessage: 'Database connection timeout during cart checkout',
      failureSignature: `sig-conc-${Date.now()}`,
      isEligible: true,
    },
  });

  await t.test(
    '1. 5 parallel simultaneous assessImpact calls resolve safely without race condition',
    async () => {
      const parallelCalls = Array.from({ length: 5 }).map((_, index) =>
        service.assessImpact({
          projectId,
          failureCaseId: fc.id,
          environmentOverride: index === 0 ? 'PRODUCTION' : 'STAGING',
        }),
      );

      const results = await Promise.all(parallelCalls);
      assert.equal(results.length, 5);

      for (const res of results) {
        assert.ok(res.id);
        assert.equal(res.failureCaseId, fc.id);
      }

      // In DB, exactly ONE record must remain authoritative
      const authoritativeCount = await prisma.failureImpactAssessment.count({
        where: { failureCaseId: fc.id, projectId, isAuthoritative: true },
      });
      assert.equal(authoritativeCount, 1);

      // Total records created should equal 5
      const totalCount = await prisma.failureImpactAssessment.count({
        where: { failureCaseId: fc.id, projectId },
      });
      assert.equal(totalCount, 5);
    },
  );
});
