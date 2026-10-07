/**
 * @file packages/core/src/failures/flakiness/flakiness-concurrency.test.ts
 * Concurrency & Mutex Serialization Tests for FlakinessAnalysisService (V6 Phase 79).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FlakinessAnalysisService } from './flakiness-analysis-service.js';
import type { PrismaClient } from '@prisma/client';

describe('Flakiness Analysis Concurrency & Mutex Serialization (V6 Phase 79)', () => {
  let prisma: PrismaClient;
  let service: FlakinessAnalysisService;

  let projectId: string;
  let failureCaseId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FlakinessAnalysisService(prisma);

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Concurrency Flakiness Project' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Requirement for Concurrency Test',
        originalText: 'User checkout flows',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Test Case Concurrency',
        objective: 'Test concurrency reliability',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-concurrency-test',
        summary: 'Plan for test case concurrency',
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
        planFingerprint: 'plan-fp-concurrency-test',
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
        errorCode: 'ERR_TIMEOUT',
        errorMessage: 'Element not found within 5000ms',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testRunId: run.id,
        executionId: exec.id,
        title: 'Test Case Failure',
        failureSignature: 'ERR_TIMEOUT_SUBMIT_BUTTON',
        testCaseVersionNumber: 1,
        status: 'READY',
        triggeringExecutionStatus: 'FAILED',
      },
    });
    failureCaseId = fc.id;
  });

  it('serializes concurrent analyzeFlakiness requests without race conditions', async () => {
    // Fire 5 concurrent requests simultaneously
    const promises = Array.from({ length: 5 }, () =>
      service.analyzeFlakiness({
        projectId,
        failureCaseId,
      }),
    );

    const results = await Promise.all(promises);

    // All results must succeed
    assert.strictEqual(results.length, 5);
    for (const res of results) {
      assert.ok(res.id);
      assert.strictEqual(res.isAuthoritative, true);
    }

    // Exactly one authoritative record should exist in the database for this failureCase
    const records = await prisma.flakinessAnalysis.findMany({
      where: { failureCaseId, isAuthoritative: true },
    });
    assert.strictEqual(records.length, 1);
  });
});
