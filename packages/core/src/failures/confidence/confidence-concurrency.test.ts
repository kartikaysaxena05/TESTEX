/**
 * @file packages/core/src/failures/confidence/confidence-concurrency.test.ts
 * Concurrency and mutex serialization test suite for Confidence Assessment (V6 Phase 86).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { ConfidenceAssessmentService } from './confidence-assessment-service.js';

test('Confidence Assessment: Concurrency & Mutex Serialization Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for concurrency test');

  const service = new ConfidenceAssessmentService(prisma);
  const projectId = crypto.randomUUID();

  await prisma.project.create({ data: { id: projectId, name: 'Project Concurrency Confidence' } });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-CONC-${Date.now()}`,
      title: 'Concurrency TC',
      objective: 'Verify mutex serialization',
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
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Concurrency race test',
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
      title: 'Concurrency race test failure',
      errorMessage: 'Concurrency race test',
      failureSignature: `sig-conc-${Date.now()}`,
      isEligible: true,
    },
  });

  t.after(async () => {
    await prisma.evidenceAttribution.deleteMany({ where: { projectId } });
    await prisma.confidenceAssessment.deleteMany({ where: { projectId } });
    await prisma.failureCase.deleteMany({ where: { projectId } });
    await prisma.testCaseExecution.deleteMany({ where: { projectId } });
    await prisma.testRun.deleteMany({ where: { projectId } });
    await prisma.executableTestPlan.deleteMany({ where: { projectId } });
    await prisma.testCase.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  });

  await t.test(
    'Concurrent reassessments serialize cleanly without deadlocks or corrupted revisions',
    async () => {
      // Initial assessment
      const initial = await service.assessConfidence({
        projectId,
        failureCaseId: fc.id,
      });
      assert.strictEqual(initial.revision, 1);
      assert.strictEqual(initial.isAuthoritative, true);

      // Launch 4 concurrent reassessments with distinct reasons
      const promises = [1, 2, 3, 4].map(i =>
        service.reassessConfidence({
          projectId,
          failureCaseId: fc.id,
          reason: `Concurrent mutation wave #${i}`,
        }),
      );

      const results = await Promise.all(promises);
      assert.strictEqual(results.length, 4);

      // Verify history and revision numbers
      const history = await service.listConfidenceHistory({
        projectId,
        failureCaseId: fc.id,
      });

      // Total revisions should be 5 (initial + 4 reassessments)
      assert.strictEqual(history.length, 5);

      // Exactly one authoritative record
      const authoritative = history.filter(h => h.isAuthoritative);
      assert.strictEqual(authoritative.length, 1);
      assert.strictEqual(authoritative[0]?.revision, 5);

      // All revisions 1 to 5 exist uniquely
      const revisions = history.map(h => h.revision).sort((a, b) => a - b);
      assert.deepStrictEqual(revisions, [1, 2, 3, 4, 5]);
    },
  );
});
