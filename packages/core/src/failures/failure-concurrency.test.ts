/**
 * @file packages/core/src/failures/failure-concurrency.test.ts
 * Concurrency, race condition, and transaction atomicity tests for V6 Failure Intelligence.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { FailureCaseService } from './failure-case-service.js';
import type { PrismaClient } from '@prisma/client';

describe('Failure Concurrency & Idempotency (V6 Phase 74)', () => {
  let prisma: PrismaClient;
  let service: FailureCaseService;

  let testProjectId: string;
  let executionId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureCaseService({ prisma });

    testProjectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: testProjectId, name: 'Concurrency Test Project' },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-CONC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Concurrent Test Case',
        objective: 'Test concurrent analysis initialization',
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'fingerprint-conc',
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
        planFingerprint: 'fingerprint-conc',
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
        errorMessage: 'Concurrent execution failure simulation',
      },
    });
    executionId = exec.id;
  });

  describe('Concurrent Case Creation', () => {
    it('handles 10 concurrent ensureFailureCaseFromExecution requests returning identical FailureCase', async () => {
      const promises = Array.from({ length: 10 }).map(() =>
        service.ensureFailureCaseFromExecution({
          projectId: testProjectId,
          executionId,
        }),
      );

      const results = await Promise.all(promises);

      // All 10 requests must return the exact same FailureCase ID
      const firstId = results[0]?.id;
      assert.ok(firstId);
      for (const res of results) {
        assert.strictEqual(res.id, firstId);
        assert.strictEqual(res.executionId, executionId);
      }

      // Check database to ensure exactly 1 record was created
      const count = await prisma.failureCase.count({
        where: { executionId },
      });
      assert.strictEqual(count, 1);
    });
  });

  describe('Concurrent Analysis Initialization', () => {
    it('allows only 1 analysis to start concurrently on a single FailureCase', async () => {
      const failureCase = await service.createFailureCase({
        projectId: testProjectId,
        executionId,
      });

      // Trigger 5 concurrent startAnalysis calls
      const promises = Array.from({ length: 5 }).map(() =>
        service
          .startAnalysis({
            projectId: testProjectId,
            failureCaseId: failureCase.id,
          })
          .then(
            res => ({ success: true as const, run: res }),
            err => ({ success: false as const, error: err }),
          ),
      );

      const outcomes = await Promise.all(promises);

      const successes = outcomes.filter(o => o.success);
      const failures = outcomes.filter(o => !o.success);

      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 4);

      // Verify failure cases is in ANALYZING status
      const updatedCase = await service.getFailureCase({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(updatedCase.status, 'ANALYZING');
      assert.strictEqual(updatedCase.analysisAttemptCount, 1);
    });
  });
});
