/**
 * @file packages/core/src/failures/classification/failure-classification-security.test.ts
 * Security isolation and secret redaction tests for Deterministic Classification (V6 Phase 77).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FailureDeterministicClassifier } from './failure-deterministic-classifier.js';
import { ClassificationCrossProjectError } from './classification-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('Failure Classification Security & Isolation (V6 Phase 77)', () => {
  let prisma: PrismaClient;
  let classifier: FailureDeterministicClassifier;

  let projectAId: string;
  let projectBId: string;
  let caseAId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Prisma client unavailable');
    prisma = client;
    classifier = new FailureDeterministicClassifier(prisma);

    projectAId = crypto.randomUUID();
    projectBId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: projectAId, name: 'Project A' },
        { id: projectBId, name: 'Project B' },
      ],
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: projectAId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Project A Test Case',
        objective: 'Test A',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-a',
        summary: 'Plan A',
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
        planFingerprint: 'plan-fp-a',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: projectAId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'AUTH_FAILED',
        errorMessage:
          'Authorization failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretToken and password="SuperSecretPassword123!"',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId: projectAId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Project A Failure Case',
        errorCode: 'AUTH_FAILED',
        errorMessage:
          'Failed with Authorization: Bearer secret-token-xyz and token=super_secret_api_key_value',
      },
    });
    caseAId = fc.id;
  });

  describe('Project Isolation & Cross-Project Protection', () => {
    it('strictly prevents classifying a Case belonging to Project A when called with Project B', async () => {
      await assert.rejects(
        () =>
          classifier.classify({
            projectId: projectBId, // wrong project!
            failureCaseId: caseAId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ClassificationCrossProjectError);
          assert.strictEqual(err.code, 'CROSS_PROJECT_MISMATCH');
          return true;
        },
      );
    });

    it('strictly prevents reading a Case classification from another project', async () => {
      // First classify under valid Project A
      await classifier.classify({
        projectId: projectAId,
        failureCaseId: caseAId,
      });

      // Try reading with Project B
      await assert.rejects(
        () =>
          classifier.getClassification({
            projectId: projectBId,
            failureCaseId: caseAId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ClassificationCrossProjectError);
          return true;
        },
      );
    });

    it('strictly prevents listing classification history from another project', async () => {
      await assert.rejects(
        () =>
          classifier.listClassificationHistory({
            projectId: projectBId,
            failureCaseId: caseAId,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ClassificationCrossProjectError);
          return true;
        },
      );
    });

    it('strictly prevents reclassifying a Case from another project', async () => {
      await assert.rejects(
        () =>
          classifier.reclassify({
            projectId: projectBId,
            failureCaseId: caseAId,
            reclassificationReason: 'Unauthorized reclassification',
          }),
        (err: unknown) => {
          assert.ok(err instanceof ClassificationCrossProjectError);
          return true;
        },
      );
    });
  });

  describe('Secret Redaction', () => {
    it('redacts sensitive bearer tokens and passwords from rule explanations and supporting evidence', async () => {
      const result = await classifier.classify({
        projectId: projectAId,
        failureCaseId: caseAId,
      });

      // Verify no raw bearer token or password is in the returned DTO
      const resultStr = JSON.stringify(result);
      assert.ok(!resultStr.includes('secret-token-xyz'));
      assert.ok(!resultStr.includes('super_secret_api_key_value'));
      assert.ok(!resultStr.includes('SuperSecretPassword123!'));
    });

    it('redacts inline credentials in reclassification reason', async () => {
      await classifier.classify({
        projectId: projectAId,
        failureCaseId: caseAId,
      });

      const reclassified = await classifier.reclassify({
        projectId: projectAId,
        failureCaseId: caseAId,
        reclassificationReason:
          'Updated token Bearer highly-confidential-token-12345 in execution environment',
      });

      assert.ok(!reclassified.reclassificationReason?.includes('highly-confidential-token-12345'));
      assert.ok(reclassified.reclassificationReason?.includes('[REDACTED]'));
    });
  });
});
