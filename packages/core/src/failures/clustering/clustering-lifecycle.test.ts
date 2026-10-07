/**
 * @file packages/core/src/failures/clustering/clustering-lifecycle.test.ts
 * Lifecycle test suite for DefectClusteringService (V6 Phase 85).
 * Tests formation, member additions, representative updates, merge, split, manual override,
 * audit history, and cross-restart persistence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { DefectClusteringService } from './defect-clustering-service.js';

test('DefectClustering: Complete Lifecycle Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for lifecycle test');

  let service = new DefectClusteringService(prisma);
  const projectId = crypto.randomUUID();

  await prisma.project.create({
    data: { id: projectId, name: `Lifecycle Clustering ${Date.now()}` },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-LIFE-${Date.now()}`,
      title: 'Lifecycle Test Case',
      objective: 'Verify clustering lifecycle',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-life-${Date.now()}`,
      summary: 'Plan Life',
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

  let executionCounter = 0;

  // Helper to create test failure cases
  async function createFailure(params: {
    title: string;
    errorMessage: string;
    stepIndex: number;
    failureSignature?: string;
    hasReproduction?: boolean;
    reproductionStatus?: 'REPRODUCED' | 'NOT_REPRODUCED';
    sourceFile?: string;
    symbol?: string;
  }) {
    executionCounter++;
    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: tr.id,
        testCaseId: tc.id,
        executableTestPlanId: plan.id,
        testCaseVersionNumber: 1,
        attempt: executionCounter,
        status: 'FAILED',
        errorMessage: params.errorMessage,
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
        stepIndex: params.stepIndex,
        title: params.title,
        errorMessage: params.errorMessage,
        failureSignature:
          params.failureSignature ??
          `sig-life-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        isEligible: true,
        metadataJson: {
          endpoint: '/api/orders',
          httpStatus: 500,
        },
      },
    });

    if (params.hasReproduction) {
      await prisma.failureReproductionAttempt.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          originalExecutionId: exec.id,
          attemptNumber: 1,
          status: params.reproductionStatus ?? 'REPRODUCED',
          originalFailureSignature: fc.failureSignature,
        },
      });
    }

    if (params.sourceFile) {
      await prisma.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          primaryLayer: 'BACKEND_SERVICE',
          primaryTargetType: 'REPOSITORY_FILE',
          primaryTargetIdentifier: params.sourceFile,
          matchedFilePath: params.sourceFile,
          matchedSymbolName: params.symbol ?? null,
          httpEndpoint: '/api/orders',
          httpStatusCode: 500,
          localizationRationale: 'Direct match in source file',
          localizationFingerprint: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          isAuthoritative: true,
        },
      });
    }

    return fc;
  }

  // Create two exact duplicate failures
  const fc1 = await createFailure({
    title: 'Order creation deadlock 1',
    errorMessage: 'Database deadlock during order placement in OrderService.createOrder',
    stepIndex: 1,
    failureSignature: 'sig-life-order-deadlock',
    sourceFile: 'src/orders/order.service.ts',
    symbol: 'OrderService.createOrder',
    hasReproduction: false,
  });

  const fc2 = await createFailure({
    title: 'Order creation deadlock 2',
    errorMessage:
      'Database deadlock during order placement in OrderService.createOrder with coupon',
    stepIndex: 1,
    failureSignature: 'sig-life-order-deadlock',
    sourceFile: 'src/orders/order.service.ts',
    symbol: 'OrderService.createOrder',
    hasReproduction: true,
    reproductionStatus: 'REPRODUCED',
  });

  let cluster1Id: string = '';

  await t.test('1. Cluster Formation: Two duplicates form one cluster with 2 members', async () => {
    const clusters = await service.clusterDefects({
      projectId,
      failureCaseIds: [fc1.id, fc2.id],
    });

    assert.equal(clusters.length, 1, 'Two duplicates should form exactly 1 cluster');
    const cluster = clusters[0];
    assert.ok(cluster);
    cluster1Id = cluster.id;

    assert.equal(cluster.clusterStatus, 'ACTIVE');
    assert.equal(cluster.memberCount, 2);
    assert.equal(cluster.memberships?.length, 2);

    // fc2 has reproduction = true, so fc2 must be selected as the representative!
    assert.equal(
      cluster.representativeFailureId,
      fc2.id,
      'Reproduced failure fc2 must be selected as representative',
    );
  });

  await t.test(
    '2. Member Addition: Ingesting a 3rd duplicate adds it to the existing cluster',
    async () => {
      const fc3 = await createFailure({
        title: 'Order creation deadlock 3',
        errorMessage:
          'Database deadlock during order placement in OrderService.createOrder under high load',
        stepIndex: 1,
        failureSignature: 'sig-life-order-deadlock',
        sourceFile: 'src/orders/order.service.ts',
        symbol: 'OrderService.createOrder',
        hasReproduction: true,
        reproductionStatus: 'REPRODUCED',
      });

      const clusters = await service.clusterDefects({
        projectId,
        failureCaseIds: [fc3.id],
      });

      // Should return the updated cluster
      assert.ok(clusters.length > 0);
      const updated = await service.getCluster({ projectId, clusterId: cluster1Id });
      assert.ok(updated);
      assert.equal(updated.memberCount, 3);
      assert.ok(updated.memberships?.some(m => m.failureCaseId === fc3.id));
    },
  );

  let cluster2Id: string = '';
  let fc4Id: string = '';
  let fc5Id: string = '';

  await t.test(
    '3. Distinct Cluster Formation: Separate defect creates distinct cluster',
    async () => {
      const fc4 = await createFailure({
        title: 'Stripe webhook 400 Bad Request',
        errorMessage: 'Stripe webhook signature verification failed: invalid timestamp',
        stepIndex: 3,
        failureSignature: 'sig-life-stripe-webhook',
        sourceFile: 'src/billing/stripe.webhook.ts',
        symbol: 'handleStripeWebhook',
        hasReproduction: true,
      });
      fc4Id = fc4.id;

      const fc5 = await createFailure({
        title: 'Stripe webhook invalid signature',
        errorMessage: 'Stripe webhook signature verification failed: missing header',
        stepIndex: 3,
        failureSignature: 'sig-life-stripe-webhook',
        sourceFile: 'src/billing/stripe.webhook.ts',
        symbol: 'handleStripeWebhook',
        hasReproduction: false,
      });
      fc5Id = fc5.id;

      const clusters = await service.clusterDefects({
        projectId,
        failureCaseIds: [fc4.id, fc5.id],
      });

      const mem4 = await service.getFailureMembership({ projectId, failureCaseId: fc4.id });
      assert.ok(mem4, 'fc4 must have a membership');
      cluster2Id = mem4.clusterId;
      assert.notEqual(cluster2Id, cluster1Id);

      const cluster2 = clusters.find(c => c.id === cluster2Id);
      assert.ok(cluster2);
      assert.equal(cluster2.memberCount, 2);
    },
  );

  await t.test(
    '4. Cluster Merge: Merging Cluster 2 into Cluster 1 merges members and marks source MERGED',
    async () => {
      const merged = await service.mergeClusters({
        projectId,
        sourceClusterId: cluster2Id,
        targetClusterId: cluster1Id,
        reason: 'Admin verified both relate to payment gateway pipeline',
      });

      assert.equal(merged.id, cluster1Id);
      assert.equal(merged.memberCount, 5); // 3 from cluster1 + 2 from cluster2

      // Check source cluster is now MERGED
      const sourceCluster = await service.getCluster({ projectId, clusterId: cluster2Id });
      assert.ok(sourceCluster);
      assert.equal(sourceCluster.clusterStatus, 'MERGED');
      assert.equal(sourceCluster.mergedIntoClusterId, cluster1Id);
    },
  );

  let newExtractedClusterId: string = '';

  await t.test('5. Cluster Split: Extracting members into a new cluster', async () => {
    const { remainingCluster, newCluster } = await service.splitCluster({
      projectId,
      clusterId: cluster1Id,
      failureCaseIdsToExtract: [fc4Id, fc5Id],
      reason: 'Separating webhook issues into dedicated defect cluster',
    });

    assert.ok(newCluster.id);
    newExtractedClusterId = newCluster.id;
    assert.equal(newCluster.memberCount, 2);
    assert.equal(newCluster.clusterStatus, 'ACTIVE');

    // Original cluster retains 3 members
    assert.equal(remainingCluster.memberCount, 3);
  });

  await t.test('6. Manual Override: Moving a member to another cluster', async () => {
    const overrideResult = await service.overrideMembership({
      projectId,
      failureCaseId: fc1.id,
      targetClusterId: newExtractedClusterId,
      action: 'MOVE',
      reason: 'Manual QA triage relocation',
    });

    assert.ok(overrideResult);
    assert.equal(overrideResult.clusterId, newExtractedClusterId);

    // Original cluster now has 2 members
    const orig = await service.getCluster({ projectId, clusterId: cluster1Id });
    assert.ok(orig);
    assert.equal(orig.memberCount, 2);

    // Target cluster now has 3 members
    const target = await service.getCluster({ projectId, clusterId: newExtractedClusterId });
    assert.ok(target);
    assert.equal(target.memberCount, 3);
  });

  await t.test('7. Audit History: History reflects lifecycle events', async () => {
    const history = await service.listClusterHistory({
      projectId,
      clusterId: cluster1Id,
    });

    assert.ok(history.length >= 3);
    const eventTypes = history.map(h => h.eventType);
    assert.ok(eventTypes.includes('CREATED'));
    assert.ok(eventTypes.includes('MERGED') || eventTypes.includes('MEMBER_ADDED'));
    assert.ok(eventTypes.includes('SPLIT') || eventTypes.includes('MANUAL_OVERRIDE'));
  });

  await t.test(
    '8. Restart Persistence: A fresh service instance loads state accurately',
    async () => {
      // Instantiate brand new service instance
      service = new DefectClusteringService(prisma);

      const reloaded = await service.getCluster({ projectId, clusterId: cluster1Id });
      assert.ok(reloaded);
      assert.equal(reloaded.id, cluster1Id);
      assert.equal(reloaded.memberCount, 2);
      assert.ok(reloaded.clusterFingerprint.length === 64);
    },
  );
});
