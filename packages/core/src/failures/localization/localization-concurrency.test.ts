/**
 * @file packages/core/src/failures/localization/localization-concurrency.test.ts
 * Concurrency tests for Failure Evidence Correlation & Technical Cause Localization (V6 Phase 81).
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureEvidenceCorrelationService } from './failure-evidence-correlation-service.js';
import { FailureDomainSeparationService } from '../separation/failure-domain-separation-service.js';

test('Technical Cause Localization Concurrency & Mutex Serialization (Phase 81)', async t => {
  let prisma: PrismaClient;
  let service: FailureEvidenceCorrelationService;

  let projectId: string;
  let failureCaseId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    const domainSeparationService = new FailureDomainSeparationService(prisma);
    service = new FailureEvidenceCorrelationService(prisma, domainSeparationService);

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Project Concurrency Localization' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-CONC-LOC-01',
        title: 'Concurrency Requirement',
        originalText: 'System must serialize concurrent technical localizations',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-CONC-LOC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Concurrency Test Case',
        objective: 'Test concurrent localization operations',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-conc-loc',
        summary: 'Plan for concurrency localization test',
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
        planFingerprint: 'plan-fp-conc-loc',
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
    '1. Serializes concurrent localizeTechnicalCause requests with exactly 1 authoritative record',
    async () => {
      // Launch 5 concurrent localization requests
      const promises = Array.from({ length: 5 }, () =>
        service.localizeTechnicalCause({
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
        assert.ok(res.localizationFingerprint);
        assert.ok(res.primaryLayer);
      }

      // Verify in database: exactly ONE record has isAuthoritative = true
      const authoritativeCount = await prisma.failureTechnicalLocalization.count({
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
