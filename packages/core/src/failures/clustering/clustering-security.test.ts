/**
 * @file packages/core/src/failures/clustering/clustering-security.test.ts
 * Security and tenant isolation test suite for Defect Clustering (V6 Phase 85).
 * Tests multi-tenant boundary enforcement and secret redaction in cluster fingerprints.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { DefectClusteringService } from './defect-clustering-service.js';
import { generateClusterFingerprint } from './clustering-fingerprint.js';
import { DefectClusterCrossProjectError, DefectClusterNotFoundError } from './clustering-errors.js';

test('DefectClustering: Security & Tenant Isolation Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for security test');

  const service = new DefectClusteringService(prisma);

  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();

  await prisma.project.create({ data: { id: projectA, name: 'Project A - Cluster Security' } });
  await prisma.project.create({ data: { id: projectB, name: 'Project B - Cluster Security' } });

  const tcA = await prisma.testCase.create({
    data: {
      projectId: projectA,
      testCaseKey: `TC-SEC-A-${Date.now()}`,
      title: 'Security TC A',
      objective: 'Verify isolation A',
      currentVersionNumber: 1,
    },
  });

  const tcB = await prisma.testCase.create({
    data: {
      projectId: projectB,
      testCaseKey: `TC-SEC-B-${Date.now()}`,
      title: 'Security TC B',
      objective: 'Verify isolation B',
      currentVersionNumber: 1,
    },
  });

  const planA = await prisma.executableTestPlan.create({
    data: {
      projectId: projectA,
      testCaseId: tcA.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-sec-a-${Date.now()}`,
      summary: 'Plan Sec A',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const planB = await prisma.executableTestPlan.create({
    data: {
      projectId: projectB,
      testCaseId: tcB.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-sec-b-${Date.now()}`,
      summary: 'Plan Sec B',
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

  const fcA = await prisma.failureCase.create({
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
      failureSignature: `sig-sec-a-${Date.now()}`,
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
      failureSignature: `sig-sec-b-${Date.now()}`,
      isEligible: true,
    },
  });

  // Cluster Project A's failure
  const clustersA = await service.clusterDefects({
    projectId: projectA,
    failureCaseIds: [fcA.id],
  });
  assert.ok(clustersA.length > 0);
  const clusterA = clustersA[0]!;

  // Cluster Project B's failure
  const clustersB = await service.clusterDefects({
    projectId: projectB,
    failureCaseIds: [fcB.id],
  });
  assert.ok(clustersB.length > 0);
  const clusterB = clustersB[0]!;

  await t.test(
    '1. Cross-project clusterDefects is rejected with DefectClusterCrossProjectError',
    async () => {
      await assert.rejects(
        async () => {
          await service.clusterDefects({
            projectId: projectA,
            failureCaseIds: [fcA.id, fcB.id], // fcB belongs to projectB!
          });
        },
        (err: any) => err instanceof DefectClusterCrossProjectError,
      );
    },
  );

  await t.test('2. Cross-project getCluster is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.getCluster({
          projectId: projectA,
          clusterId: clusterB.id, // clusterB belongs to projectB!
        });
      },
      (err: any) =>
        err instanceof DefectClusterCrossProjectError || err instanceof DefectClusterNotFoundError,
    );
  });

  await t.test('3. Cross-project mergeClusters is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.mergeClusters({
          projectId: projectA,
          sourceClusterId: clusterA.id,
          targetClusterId: clusterB.id, // target belongs to projectB!
          reason: 'Attempt cross-tenant cluster merge',
        });
      },
      (err: any) =>
        err instanceof DefectClusterCrossProjectError || err instanceof DefectClusterNotFoundError,
    );
  });

  await t.test('4. Cross-project splitCluster is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.splitCluster({
          projectId: projectA,
          clusterId: clusterB.id, // clusterB belongs to projectB!
          failureCaseIdsToExtract: [fcB.id],
          reason: 'Attempt cross-tenant split',
        });
      },
      (err: any) =>
        err instanceof DefectClusterCrossProjectError || err instanceof DefectClusterNotFoundError,
    );
  });

  await t.test('5. Cross-project overrideMembership is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.overrideMembership({
          projectId: projectA,
          failureCaseId: fcB.id, // belongs to projectB!
          action: 'DETACH',
          reason: 'Attempt cross-tenant override',
        });
      },
      (err: any) => err instanceof DefectClusterCrossProjectError,
    );
  });

  await t.test(
    '6. Secret Redaction: Bearer tokens and passwords redacted from fingerprints',
    () => {
      const rawSignalsWithSecret = [
        'ENDPOINT:/api/v1/auth?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supersecrettoken',
        'AUTH:Bearer sk_live_51Abcdef1234567890XYZ',
        'PARAM:password=MySuperSecretPassword!123',
      ];

      const fp = generateClusterFingerprint({
        projectId: 'proj-sec',
        clusterKey: 'CLU-0001',
        representativeFailureId: fcA.id,
        activeMemberFailureIds: [fcA.id],
        affectedRoutes: rawSignalsWithSecret,
        version: 1,
      });

      assert.equal(typeof fp, 'string');
      assert.equal(fp.length, 64);

      // Verify secret strings are not present in plain form in the fingerprint
      assert.ok(!fp.includes('supersecrettoken'));
      assert.ok(!fp.includes('MySuperSecretPassword!123'));
    },
  );
});
