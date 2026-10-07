/**
 * @file packages/core/src/failures/confidence/confidence-security.test.ts
 * Security, multi-tenant isolation, and secret redaction test suite for Confidence Assessment (V6 Phase 86).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { ConfidenceAssessmentService } from './confidence-assessment-service.js';
import {
  ConfidenceAssessmentCrossProjectError,
  ConfidenceAssessmentNotFoundError,
} from './confidence-errors.js';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

test('Confidence Assessment: Security & Tenant Isolation Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for security test');

  const service = new ConfidenceAssessmentService(prisma);
  const redactor = new FailureEvidenceRedactor();

  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();

  await prisma.project.create({ data: { id: projectA, name: 'Project A - Confidence Security' } });
  await prisma.project.create({ data: { id: projectB, name: 'Project B - Confidence Security' } });

  const tcA = await prisma.testCase.create({
    data: {
      projectId: projectA,
      testCaseKey: `TC-CONF-A-${Date.now()}`,
      title: 'Confidence Security TC A',
      objective: 'Verify confidence isolation A',
      currentVersionNumber: 1,
    },
  });

  const tcB = await prisma.testCase.create({
    data: {
      projectId: projectB,
      testCaseKey: `TC-CONF-B-${Date.now()}`,
      title: 'Confidence Security TC B',
      objective: 'Verify confidence isolation B',
      currentVersionNumber: 1,
    },
  });

  const planA = await prisma.executableTestPlan.create({
    data: {
      projectId: projectA,
      testCaseId: tcA.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-conf-a-${Date.now()}`,
      summary: 'Plan Conf A',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const planB = await prisma.executableTestPlan.create({
    data: {
      projectId: projectB,
      testCaseId: tcB.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-conf-b-${Date.now()}`,
      summary: 'Plan Conf B',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const trA = await prisma.testRun.create({
    data: {
      projectId: projectA,
      testCaseId: tcA.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: planA.id,
      status: 'FAILED',
      planFingerprint: planA.planFingerprint,
      testCaseTitle: tcA.title,
    },
  });

  const trB = await prisma.testRun.create({
    data: {
      projectId: projectB,
      testCaseId: tcB.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: planB.id,
      status: 'FAILED',
      planFingerprint: planB.planFingerprint,
      testCaseTitle: tcB.title,
    },
  });

  const execA = await prisma.testCaseExecution.create({
    data: {
      projectId: projectA,
      testRunId: trA.id,
      testCaseId: tcA.id,
      executableTestPlanId: planA.id,
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Unhandled crash in Project A',
    },
  });

  const execB = await prisma.testCaseExecution.create({
    data: {
      projectId: projectB,
      testRunId: trB.id,
      testCaseId: tcB.id,
      executableTestPlanId: planB.id,
      testCaseVersionNumber: 1,
      status: 'FAILED',
      errorMessage: 'Unhandled crash in Project B',
    },
  });

  const _fcA = await prisma.failureCase.create({
    data: {
      projectId: projectA,
      executionId: execA.id,
      testRunId: trA.id,
      testCaseId: tcA.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 1,
      title: 'Crash in Project A',
      errorMessage: 'Unhandled crash in Project A',
      failureSignature: `sig-conf-a-${Date.now()}`,
      isEligible: true,
    },
  });

  const fcB = await prisma.failureCase.create({
    data: {
      projectId: projectB,
      executionId: execB.id,
      testRunId: trB.id,
      testCaseId: tcB.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 1,
      title: 'Crash in Project B',
      errorMessage: 'Unhandled crash in Project B',
      failureSignature: `sig-conf-b-${Date.now()}`,
      isEligible: true,
    },
  });

  t.after(async () => {
    await prisma.confidenceAssessment.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.failureCase.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.testCaseExecution.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.testRun.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.executableTestPlan.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.testCase.deleteMany({
      where: { projectId: { in: [projectA, projectB] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectA, projectB] } },
    });
  });

  await t.test('Cross-project assessConfidence request is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.assessConfidence({
          projectId: projectA, // Project A
          failureCaseId: fcB.id, // Belongs to Project B
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ConfidenceAssessmentCrossProjectError);
        assert.strictEqual(err.code, 'CONFIDENCE_ASSESSMENT_CROSS_PROJECT');
        return true;
      },
    );
  });

  await t.test('Cross-project getConfidence request is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.getConfidence({
          projectId: projectA,
          failureCaseId: fcB.id,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ConfidenceAssessmentCrossProjectError);
        return true;
      },
    );
  });

  await t.test('Non-existent failure case throws ConfidenceAssessmentNotFoundError', async () => {
    const fakeId = crypto.randomUUID();
    await assert.rejects(
      async () => {
        await service.assessConfidence({
          projectId: projectA,
          failureCaseId: fakeId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ConfidenceAssessmentNotFoundError);
        assert.strictEqual(err.code, 'CONFIDENCE_ASSESSMENT_NOT_FOUND');
        return true;
      },
    );
  });

  await t.test('Secret redaction sanitizes tokens and passwords in explanations', () => {
    const rawText =
      'Connection failed with authorization Bearer sk-ant-api03-abcdef1234567890abcdef1234567890 and password=superSecretPassword123!';
    const redacted = redactor.redactText(rawText);

    assert.ok(!redacted.redacted.includes('sk-ant-api03-'));
    assert.ok(!redacted.redacted.includes('superSecretPassword123!'));
    assert.ok(redacted.redacted.includes('[REDACTED]'));
  });
});
