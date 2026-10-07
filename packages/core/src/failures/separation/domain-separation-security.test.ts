/**
 * @file packages/core/src/failures/separation/domain-separation-security.test.ts
 * Multi-tenant security isolation and adversarial tests for Failure Domain Separation (V6 Phase 80).
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureDomainSeparationService } from './failure-domain-separation-service.js';
import { FailureDomainCrossProjectError } from './separation-errors.js';
import { generateDomainSeparationFingerprint } from './separation-fingerprint.js';

test('Failure Domain Separation Security & Multi-Tenant Isolation (Phase 80)', async t => {
  let prisma: PrismaClient;
  let service: FailureDomainSeparationService;

  let projectAId: string;
  let projectBId: string;
  let failureCaseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureDomainSeparationService(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A Domain' },
        { id: projectBId, name: 'Project B Domain' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-SEC-01',
        title: 'Security Requirement',
        originalText: 'System must separate failure domains securely',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-SEC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Security Test Case',
        objective: 'Test tenant separation',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-sec-domain',
        summary: 'Plan for security domain test',
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
        planFingerprint: 'plan-fp-sec-domain',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        testRunId: run.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Authorized" but got "Forbidden"',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testRunId: run.id,
        executionId: exec.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Security Failure Case',
        errorCode: 'ERR_ASSERTION_MISMATCH',
        errorMessage: 'Expected "Authorized" but got "Forbidden"',
      },
    });
    failureCaseAId = fc.id;
  });

  await t.test(
    '1. Rejects cross-project separation attempt when project ID mismatches',
    async () => {
      await assert.rejects(
        async () => {
          await service.separateFailureDomain({
            projectId: projectBId, // Cross-project attack!
            failureCaseId: failureCaseAId,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof FailureDomainCrossProjectError);
          assert.strictEqual(err.code, 'FAILURE_DOMAIN_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test('2. Rejects cross-project read access in getDomainSeparation', async () => {
    await assert.rejects(
      async () => {
        await service.getDomainSeparation({
          projectId: projectBId, // Cross-project attack!
          failureCaseId: failureCaseAId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof FailureDomainCrossProjectError);
        return true;
      },
    );
  });

  await t.test('3. Rejects cross-project read access in listDomainSeparationHistory', async () => {
    await assert.rejects(
      async () => {
        await service.listDomainSeparationHistory({
          projectId: projectBId, // Cross-project attack!
          failureCaseId: failureCaseAId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof FailureDomainCrossProjectError);
        return true;
      },
    );
  });

  await t.test('4. Fingerprint Generator strictly redacts credentials and auth tokens', () => {
    const rawReason =
      'Database connection failed with postgres://user:supersecretpass123@db.prod.internal:5432/app';
    const fixedFailureCaseId = crypto.randomUUID();
    const fixedTestCaseId = crypto.randomUUID();

    const fp1 = generateDomainSeparationFingerprint({
      failureCaseId: fixedFailureCaseId,
      testCaseId: fixedTestCaseId,
      testCaseVersionNumber: 1,
      domain: 'ENVIRONMENT_FAILURE',
      domainSubreason: 'DATABASE_OFFLINE',
      separationRulesVersion: '1.0.0',
      matchedRuleIds: ['RULE_ENV_DB'],
      excludedDomains: ['APPLICATION_DEFECT_CANDIDATE'],
      exclusionReasons: {
        APPLICATION_DEFECT_CANDIDATE: rawReason,
      },
      evidenceReferences: [],
    });

    const sanitizedReason =
      'Database connection failed with postgres://user:[REDACTED]@db.prod.internal:5432/app';
    const fp2 = generateDomainSeparationFingerprint({
      failureCaseId: fixedFailureCaseId,
      testCaseId: fixedTestCaseId,
      testCaseVersionNumber: 1,
      domain: 'ENVIRONMENT_FAILURE',
      domainSubreason: 'DATABASE_OFFLINE',
      separationRulesVersion: '1.0.0',
      matchedRuleIds: ['RULE_ENV_DB'],
      excludedDomains: ['APPLICATION_DEFECT_CANDIDATE'],
      exclusionReasons: {
        APPLICATION_DEFECT_CANDIDATE: sanitizedReason,
      },
      evidenceReferences: [],
    });

    // Hash with raw secret must be identical to hash with already-redacted secret
    // proving the redactor was applied before hashing!
    assert.strictEqual(fp1, fp2);
  });

  await t.test('5. Rejects re-evaluation when reevaluationReason is missing or empty', async () => {
    await assert.rejects(
      async () => {
        await service.reevaluateDomainSeparation({
          projectId: projectAId,
          failureCaseId: failureCaseAId,
          reevaluationReason: '', // Empty reason!
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });
});
