/**
 * @file packages/core/src/failures/separation/domain-separation-concurrency.test.ts
 * Concurrency tests for Failure Domain Separation (V6 Phase 80).
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureDomainSeparationService } from './failure-domain-separation-service.js';

test('Failure Domain Separation Concurrency & Mutex Serialization (Phase 80)', async t => {
  let prisma: PrismaClient;
  let service: FailureDomainSeparationService;

  let projectId: string;
  let failureCaseId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureDomainSeparationService(prisma);

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Project Concurrency Domain' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CONC-01',
        title: 'Concurrency Requirement',
        originalText: 'System must serialize concurrent failure domain separations',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-CONC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Concurrency Test Case',
        objective: 'Test concurrent domain operations',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-conc-domain',
        summary: 'Plan for concurrency domain test',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-conc-domain',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        testRunId: run.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Success" but got "Failure"',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testRunId: run.id,
        executionId: exec.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Concurrency Failure Case',
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Success" but got "Failure"',
      },
    });
    failureCaseId = fc.id;
  });

  await t.test(
    '1. Serializes concurrent separateFailureDomain requests with exactly 1 authoritative record',
    async () => {
      // Launch 5 concurrent separation requests
      const promises = Array.from({ length: 5 }, () =>
        service.separateFailureDomain({
          projectId,
          failureCaseId,
        }),
      );

      const results = await Promise.all(promises);

      // All results must succeed
      assert.strictEqual(results.length, 5);
      for (const res of results) {
        assert.strictEqual(res.failureCaseId, failureCaseId);
        assert.strictEqual(res.projectId, projectId);
        assert.ok(res.separationFingerprint);
      }

      // Verify in database: exactly ONE record has isAuthoritative = true
      const authoritativeCount = await prisma.failureDomainSeparation.count({
        where: {
          failureCaseId,
          projectId,
          isAuthoritative: true,
        },
      });

      assert.strictEqual(authoritativeCount, 1);
    },
  );
});
