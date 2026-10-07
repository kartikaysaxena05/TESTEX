/**
 * @file packages/core/src/failures/flakiness/flakiness-security.test.ts
 * Multi-tenant project isolation, audit trail immutability, and ineligibility filtering tests (V6 Phase 79).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FlakinessAnalysisService } from './flakiness-analysis-service.js';
import { FlakinessCrossProjectError, FlakinessAnalysisNotFoundError } from './flakiness-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('Flakiness Analysis Security & Multi-Tenant Isolation (V6 Phase 79)', () => {
  let prisma: PrismaClient;
  let service: FlakinessAnalysisService;

  let projectAId: string;
  let projectBId: string;
  let failureCaseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FlakinessAnalysisService(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A Flakiness' },
        { id: projectBId, name: 'Project B Flakiness' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Requirement for Project A',
        originalText: 'User checkout flows',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Test Case A',
        objective: 'Test checkout flow reliability',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-security-test',
        summary: 'Plan for test case A',
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
        planFingerprint: 'plan-fp-security-test',
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
        errorCode: 'ERR_TIMEOUT',
        errorMessage: 'Element not found within 5000ms',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testRunId: run.id,
        executionId: exec.id,
        title: 'Test Case A Failure',
        failureSignature: 'ERR_TIMEOUT_SUBMIT_BUTTON',
        testCaseVersionNumber: 1,
        status: 'READY',
        triggeringExecutionStatus: 'FAILED',
      },
    });
    failureCaseAId = fc.id;
  });

  it('strictly isolates projects: rejects cross-project analyzeFlakiness request', async () => {
    await assert.rejects(
      () =>
        service.analyzeFlakiness({
          projectId: projectBId, // Mismatched tenant
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FlakinessCrossProjectError);
        assert.strictEqual(err.code, 'FLAKINESS_ANALYSIS_CROSS_PROJECT');
        return true;
      },
    );
  });

  it('strictly isolates projects: rejects cross-project getFlakinessAnalysis request', async () => {
    await assert.rejects(
      () =>
        service.getFlakinessAnalysis({
          projectId: projectBId,
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FlakinessCrossProjectError);
        return true;
      },
    );
  });

  it('strictly isolates projects: rejects cross-project reanalyzeFlakiness request', async () => {
    await assert.rejects(
      () =>
        service.reanalyzeFlakiness({
          projectId: projectBId,
          failureCaseId: failureCaseAId,
          reanalysisReason: 'Operator requested reanalysis',
        }),
      (err: unknown) => {
        assert.ok(err instanceof FlakinessCrossProjectError);
        return true;
      },
    );
  });

  it('strictly isolates projects: rejects cross-project listFlakinessHistory request', async () => {
    await assert.rejects(
      () =>
        service.listFlakinessHistory({
          projectId: projectBId,
          failureCaseId: failureCaseAId,
        }),
      (err: unknown) => {
        assert.ok(err instanceof FlakinessCrossProjectError);
        return true;
      },
    );
  });

  it('throws FlakinessAnalysisNotFoundError for non-existent failure case', async () => {
    await assert.rejects(
      () =>
        service.analyzeFlakiness({
          projectId: projectAId,
          failureCaseId: crypto.randomUUID(),
        }),
      (err: unknown) => {
        assert.ok(err instanceof FlakinessAnalysisNotFoundError);
        assert.strictEqual(err.code, 'FLAKINESS_ANALYSIS_NOT_FOUND');
        return true;
      },
    );
  });

  it('enforces single authoritative record per failure case and maintains audit history on reanalysis', async () => {
    // Initial analysis
    const initial = await service.analyzeFlakiness({
      projectId: projectAId,
      failureCaseId: failureCaseAId,
    });

    assert.ok(initial.id);
    assert.strictEqual(initial.isAuthoritative, true);

    // Reanalysis with reason
    const reanalyzed = await service.reanalyzeFlakiness({
      projectId: projectAId,
      failureCaseId: failureCaseAId,
      reanalysisReason: 'Controlled reproduction executed by QA operator',
    });

    assert.ok(reanalyzed.id);
    assert.strictEqual(reanalyzed.isAuthoritative, true);
    assert.notStrictEqual(reanalyzed.id, initial.id);

    // Verify history contains both records
    const history = await service.listFlakinessHistory({
      projectId: projectAId,
      failureCaseId: failureCaseAId,
    });

    assert.strictEqual(history.length, 2);
    const first = history[0];
    const second = history[1];
    assert.ok(first);
    assert.ok(second);
    assert.strictEqual(first.id, reanalyzed.id);
    assert.strictEqual(first.isAuthoritative, true);
    assert.strictEqual(second.id, initial.id);
    assert.strictEqual(second.isAuthoritative, false);
  });
});
