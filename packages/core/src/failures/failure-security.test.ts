/**
 * @file packages/core/src/failures/failure-security.test.ts
 * Security, cross-project isolation, and adversarial attack tests for V6 Failure Intelligence.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/client.js';
import { FailureCaseService } from './failure-case-service.js';
import {
  CrossProjectAccessDeniedError,
  FailureCaseNotFoundError,
  FailureAnalysisRunNotFoundError,
} from './failure-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('Failure Security & Project Isolation (V6 Phase 74)', () => {
  let prisma: PrismaClient;
  let service: FailureCaseService;

  let projectA: string;
  let projectB: string;
  let executionA: string;
  let executionB: string;
  let caseA: string;
  let caseB: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new FailureCaseService({ prisma });

    projectA = crypto.randomUUID();
    projectB = crypto.randomUUID();

    // 1. Projects
    await prisma.project.createMany({
      data: [
        { id: projectA, name: 'Project A - Bank Application' },
        { id: projectB, name: 'Project B - Health Portal' },
      ],
    });

    // 2. Setup Project A Test Case, Plan, Run, Execution
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectA,
        requirementKey: `REQ-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project A Requirement',
        originalText: 'Confidential project A requirement details',
        status: 'ACTIVE',
      },
    });

    const tcA = await prisma.testCase.create({
      data: {
        projectId: projectA,
        testCaseKey: `TC-A-${Date.now().toString(36).toUpperCase()}`,
        title: 'Confidential Transfer Test',
        objective: 'Transfer money securely',
        sourceRequirementId: reqA.id,
      },
    });

    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: projectA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'fingerprint-a',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const runA = await prisma.testRun.create({
      data: {
        projectId: projectA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        status: 'FAILED',
        planFingerprint: 'fingerprint-a',
        testCaseTitle: tcA.title,
      },
    });

    const execA = await prisma.testCaseExecution.create({
      data: {
        projectId: projectA,
        testRunId: runA.id,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'FUNDS_MISMATCH',
        errorMessage: 'Account balance did not update',
      },
    });
    executionA = execA.id;

    // 3. Setup Project B Test Case, Plan, Run, Execution
    const reqB = await prisma.requirement.create({
      data: {
        projectId: projectB,
        requirementKey: `REQ-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project B Requirement',
        originalText: 'Medical history requirement details',
        status: 'ACTIVE',
      },
    });

    const tcB = await prisma.testCase.create({
      data: {
        projectId: projectB,
        testCaseKey: `TC-B-${Date.now().toString(36).toUpperCase()}`,
        title: 'Patient Record View Test',
        objective: 'View patient medical chart',
        sourceRequirementId: reqB.id,
      },
    });

    const planB = await prisma.executableTestPlan.create({
      data: {
        projectId: projectB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'fingerprint-b',
        status: 'VALID',
        isExecutable: true,
      },
    });

    const runB = await prisma.testRun.create({
      data: {
        projectId: projectB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        status: 'FAILED',
        planFingerprint: 'fingerprint-b',
        testCaseTitle: tcB.title,
      },
    });

    const execB = await prisma.testCaseExecution.create({
      data: {
        projectId: projectB,
        testRunId: runB.id,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'CHART_LOAD_ERROR',
        errorMessage: 'Failed to decrypt health record',
      },
    });
    executionB = execB.id;

    // 4. Create FailureCases in respective projects
    const createdA = await service.createFailureCase({
      projectId: projectA,
      executionId: executionA,
    });
    caseA = createdA.id;

    const createdB = await service.createFailureCase({
      projectId: projectB,
      executionId: executionB,
    });
    caseB = createdB.id;
  });

  describe('Cross-Project ID Substitution Attacks', () => {
    it('ATTACK: Project A creates FailureCase using Project B executionId -> REJECT', async () => {
      await assert.rejects(
        () =>
          service.createFailureCase({
            projectId: projectA,
            executionId: executionB,
          }),
        (err: unknown) => {
          assert.ok(err instanceof CrossProjectAccessDeniedError);
          assert.strictEqual(err.code, 'CROSS_PROJECT_MISMATCH');
          return true;
        },
      );
    });

    it('ATTACK: Project A gets FailureCase belonging to Project B -> REJECT NOT FOUND', async () => {
      await assert.rejects(
        () =>
          service.getFailureCase({
            projectId: projectA,
            failureCaseId: caseB,
          }),
        (err: unknown) => {
          assert.ok(err instanceof FailureCaseNotFoundError);
          assert.strictEqual(err.code, 'FAILURE_CASE_NOT_FOUND');
          return true;
        },
      );
    });

    it('ATTACK: Project A starts analysis on FailureCase belonging to Project B -> REJECT NOT FOUND', async () => {
      await assert.rejects(
        () =>
          service.startAnalysis({
            projectId: projectA,
            failureCaseId: caseB,
          }),
        FailureCaseNotFoundError,
      );
    });

    it('ATTACK: Project A lists failure cases -> returns ONLY Project A cases (0 leaks of Project B)', async () => {
      const listA = await service.listFailureCases({
        projectId: projectA,
      });

      assert.strictEqual(listA.items.length, 1);
      assert.strictEqual(listA.items[0]?.id, caseA);
      assert.strictEqual(listA.items[0]?.title, 'Confidential Transfer Test');

      // Verify no Project B data present in Project A results
      const leakedB = listA.items.some(
        c => c.projectId === projectB || c.id === caseB || c.title.includes('Patient'),
      );
      assert.strictEqual(leakedB, false);
    });

    it('ATTACK: Project A attempts to mark Project B FailureCase as STALE -> REJECT', async () => {
      await assert.rejects(
        () =>
          service.markStale({
            projectId: projectA,
            failureCaseId: caseB,
            reason: 'Malicious mutation attempt',
          }),
        FailureCaseNotFoundError,
      );
    });

    it('ATTACK: Project A attempts to complete analysis run in Project B -> REJECT', async () => {
      const runB = await service.startAnalysis({
        projectId: projectB,
        failureCaseId: caseB,
      });

      await assert.rejects(
        () =>
          service.completeAnalysis({
            projectId: projectA,
            failureCaseId: caseB,
            analysisRunId: runB.id,
          }),
        FailureAnalysisRunNotFoundError,
      );
    });
  });

  describe('Non-Existent & Archived Projects', () => {
    it('rejects operations with non-existent fake projectId', async () => {
      const fakeProjectId = crypto.randomUUID();
      await assert.rejects(
        () =>
          service.createFailureCase({
            projectId: fakeProjectId,
            executionId: executionA,
          }),
        CrossProjectAccessDeniedError,
      );
    });

    it('rejects operations when project is ARCHIVED', async () => {
      await prisma.project.update({
        where: { id: projectA },
        data: { status: 'ARCHIVED' },
      });

      await assert.rejects(
        () =>
          service.createFailureCase({
            projectId: projectA,
            executionId: executionA,
          }),
        CrossProjectAccessDeniedError,
      );
    });
  });

  describe('Mass Assignment & Protected-Field Injection', () => {
    it('rejects protected-field injection through payload', async () => {
      // Create a raw malicious payload attempting to inject status and version
      const maliciousPayload = {
        projectId: projectA,
        executionId: executionA,
        status: 'COMPLETED', // attempt to bypass lifecycle
        analysisAttemptCount: 999, // attempt to forge attempt count
        id: crypto.randomUUID(), // attempt to override UUID
      };

      // Ensure input schema strips/rejects unpermitted fields
      const sanitized = await service.ensureFailureCaseFromExecution(maliciousPayload as any);
      assert.strictEqual(sanitized.id, caseA);
      assert.strictEqual(sanitized.analysisAttemptCount, 0);
      assert.strictEqual(sanitized.status, 'READY');
    });
  });
});
