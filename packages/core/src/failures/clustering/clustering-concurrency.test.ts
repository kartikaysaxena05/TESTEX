/**
 * @file packages/core/src/failures/clustering/clustering-concurrency.test.ts
 * Concurrency, race-condition, and mutex serialization tests for DefectClusteringService (Phase 85).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { DefectClusteringService } from './defect-clustering-service.js';

test('DefectClustering: Concurrency & Mutex Serialization Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for concurrency test');

  const service = new DefectClusteringService(prisma);
  const projectId = crypto.randomUUID();

  await prisma.project.create({
    data: { id: projectId, name: `Concurrent Clustering Project ${Date.now()}` },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-CONC-${Date.now()}`,
      title: 'Concurrency Test Case',
      objective: 'Verify concurrency serialization',
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

  // Create 6 distinct failure cases
  const failureCaseIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: tr.id,
        testCaseId: tc.id,
        executableTestPlanId: plan.id,
        testCaseVersionNumber: 1,
        attempt: i + 1,
        status: 'FAILED',
        errorMessage: `Concurrent unique failure message ${i} - module_${i}`,
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
        stepIndex: i + 1,
        title: `Concurrent Failure ${i}`,
        errorMessage: `Concurrent unique failure message ${i} - module_${i}`,
        failureSignature: `sig-conc-${i}-${Date.now()}`,
        isEligible: true,
      },
    });
    failureCaseIds.push(fc.id);
  }

  await t.test(
    '1. Concurrent clusterDefects invocations execute safely without deadlock or duplicate keys',
    async () => {
      const ids1: [string, string, string] = [
        failureCaseIds[0]!,
        failureCaseIds[1]!,
        failureCaseIds[2]!,
      ];
      const ids2: [string, string, string] = [
        failureCaseIds[3]!,
        failureCaseIds[4]!,
        failureCaseIds[5]!,
      ];

      // Run two concurrent clusterDefects requests on subsets of failures
      const [result1, result2] = await Promise.all([
        service.clusterDefects({
          projectId,
          failureCaseIds: ids1,
        }),
        service.clusterDefects({
          projectId,
          failureCaseIds: ids2,
        }),
      ]);

      assert.ok(Array.isArray(result1));
      assert.ok(Array.isArray(result2));

      // Verify all clusters created have unique clusterKeys
      const allClusters = await service.listClusters({ projectId });
      const keys = allClusters.map(c => c.clusterKey);
      const uniqueKeys = new Set(keys);
      assert.equal(keys.length, uniqueKeys.size, 'All cluster keys must be distinct');

      // Verify all clusterKeys match the format CLU-XXXX
      for (const key of keys) {
        assert.match(key, /^CLU-\d{4}$/, `Cluster key ${key} must match format CLU-XXXX`);
      }
    },
  );

  await t.test(
    '2. Re-clustering same failures concurrently returns stable idempotency',
    async () => {
      const [idempotent1, idempotent2] = await Promise.all([
        service.clusterDefects({
          projectId,
          failureCaseIds: [failureCaseIds[0]!],
        }),
        service.clusterDefects({
          projectId,
          failureCaseIds: [failureCaseIds[0]!],
        }),
      ]);

      assert.ok(idempotent1[0]);
      assert.ok(idempotent2[0]);
      assert.equal(
        idempotent1[0].id,
        idempotent2[0].id,
        'Same failure should resolve to identical cluster',
      );
    },
  );
});
