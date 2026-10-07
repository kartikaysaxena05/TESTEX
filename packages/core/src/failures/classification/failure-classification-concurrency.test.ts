/**
 * @file packages/core/src/failures/classification/failure-classification-concurrency.test.ts
 * Concurrency tests for Deterministic Classification (V6 Phase 77).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FailureDeterministicClassifier } from './failure-deterministic-classifier.js';
import type { PrismaClient } from '@prisma/client';

describe('Failure Classification Concurrency (V6 Phase 77)', () => {
  let prisma: PrismaClient;
  let classifier: FailureDeterministicClassifier;

  let testProjectId: string;
  let caseId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Prisma client unavailable');
    prisma = client;
    classifier = new FailureDeterministicClassifier(prisma);

    testProjectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: testProjectId, name: 'Concurrency Test Project' },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Concurrent Case',
        objective: 'Test concurrency',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-conc',
        summary: 'Plan',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-conc',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'TIMEOUT',
        errorMessage: 'Action timed out after 30000ms',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Concurrent Failure Case',
        errorCode: 'TIMEOUT',
        errorMessage: 'Timeout 30000ms exceeded',
      },
    });
    caseId = fc.id;
  });

  it('safely handles concurrent classification invocations for the same failure case without state corruption', async () => {
    // Fire 3 simultaneous classification requests
    const promises = [
      classifier.classify({ projectId: testProjectId, failureCaseId: caseId }),
      classifier.classify({ projectId: testProjectId, failureCaseId: caseId }),
      classifier.classify({ projectId: testProjectId, failureCaseId: caseId }),
    ];

    const results = await Promise.all(promises);

    // All results should return valid DTOs
    for (const res of results) {
      assert.ok(res.id);
      assert.strictEqual(res.category, 'AUTOMATION_FAILURE');
      assert.strictEqual(res.isAuthoritative, true);
    }

    // Verify in database: exactly 1 authoritative record exists for this failure case
    const authoritativeRecords = await prisma.failureClassification.findMany({
      where: {
        failureCaseId: caseId,
        projectId: testProjectId,
        isAuthoritative: true,
      },
    });

    assert.strictEqual(
      authoritativeRecords.length,
      1,
      'Exactly one authoritative classification record must exist.',
    );
  });
});
