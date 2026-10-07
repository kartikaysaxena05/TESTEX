/**
 * @file packages/core/src/failures/localization/localization-security.test.ts
 * Multi-tenant security isolation and adversarial boundary tests for Phase 81.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureEvidenceCorrelationService } from './failure-evidence-correlation-service.js';
import { LocalizationCrossProjectError } from './localization-errors.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';

test('Technical Cause Localization Security & Multi-Tenant Isolation (Phase 81)', async t => {
  let prisma: PrismaClient;
  let service: FailureEvidenceCorrelationService;

  let projectAId: string;
  let projectBId: string;
  let failureCaseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureEvidenceCorrelationService(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A Localization' },
        { id: projectBId, name: 'Project B Localization' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-LOC-SEC-01',
        title: 'Localization Security Requirement',
        originalText: 'System must isolate failure evidence localization',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-LOC-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Security Test Case',
        objective: 'Test tenant separation in localization',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-sec-loc',
        summary: 'Plan for security localization test',
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
        planFingerprint: 'plan-fp-sec-loc',
        testCaseTitle: tc.title,
      },
    });

    const execution = await prisma.testCaseExecution.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        testRunId: run.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ERR_500',
        errorMessage: '500 Internal Server Error',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testRunId: run.id,
        executionId: execution.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Security Failure Case',
        errorCode: 'ERR_500',
        errorMessage: '500 Internal Server Error',
      },
    });
    failureCaseAId = fc.id;
  });

  await t.test(
    '1. Rejects cross-project localization access: Project B cannot localize Project A case',
    async () => {
      await assert.rejects(
        async () => {
          await service.localizeTechnicalCause({
            projectId: projectBId, // wrong tenant
            failureCaseId: failureCaseAId,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof LocalizationCrossProjectError);
          assert.strictEqual(err.code, 'LOCALIZATION_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test(
    '2. Rejects cross-project read access: Project B cannot get Project A localization',
    async () => {
      await assert.rejects(
        async () => {
          await service.getTechnicalLocalization({
            projectId: projectBId,
            failureCaseId: failureCaseAId,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof LocalizationCrossProjectError);
          assert.strictEqual(err.code, 'LOCALIZATION_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test(
    '3. Rejects cross-project history listing: Project B cannot list Project A history',
    async () => {
      await assert.rejects(
        async () => {
          await service.listLocalizationHistory({
            projectId: projectBId,
            failureCaseId: failureCaseAId,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof LocalizationCrossProjectError);
          assert.strictEqual(err.code, 'LOCALIZATION_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test('4. Rejects non-existent failure case with FailureCaseNotFoundError', async () => {
    const nonExistentCaseId = crypto.randomUUID();
    await assert.rejects(
      async () => {
        await service.localizeTechnicalCause({
          projectId: projectAId,
          failureCaseId: nonExistentCaseId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof FailureCaseNotFoundError);
        return true;
      },
    );
  });
});
