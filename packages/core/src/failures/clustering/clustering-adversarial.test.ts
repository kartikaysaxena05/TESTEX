/**
 * @file packages/core/src/failures/clustering/clustering-adversarial.test.ts
 * Adversarial edge cases and transitivity safety tests for Defect Clustering (Phase 85).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { DefectClusteringService } from './defect-clustering-service.js';

test('DefectClustering: Adversarial & Transitivity Safety Suite', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for adversarial test');

  const service = new DefectClusteringService(prisma);
  const projectId = crypto.randomUUID();

  await prisma.project.create({
    data: { id: projectId, name: `Adversarial Clustering ${Date.now()}` },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-ADV-${Date.now()}`,
      title: 'Adversarial Test Case',
      objective: 'Verify transitivity and adversarial inputs',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-adv-${Date.now()}`,
      summary: 'Plan Adv',
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

  await t.test(
    '1. Transitivity Protection: Member contradictory to existing member is NOT admitted',
    async () => {
      // Failure A: Backend checkout payment failure (Application Defect, 500 on /api/pay)
      const execA = await prisma.testCaseExecution.create({
        data: {
          projectId,
          testRunId: tr.id,
          testCaseId: tc.id,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          attempt: 1,
          status: 'FAILED',
          errorMessage: 'Database deadlock during order placement in OrderService.charge',
        },
      });
      const fcA = await prisma.failureCase.create({
        data: {
          projectId,
          executionId: execA.id,
          testRunId: tr.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          stepIndex: 1,
          title: 'Checkout DB Deadlock',
          errorMessage: 'Database deadlock during order placement in OrderService.charge',
          failureSignature: 'sig-trans-checkout-deadlock',
          isEligible: true,
          metadataJson: {
            endpoint: '/api/pay',
            httpStatus: 500,
          },
        },
      });
      // Add technical localization & domain separation for A
      await prisma.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId: fcA.id,
          testCaseId: tc.id,
          domain: 'APPLICATION_DEFECT_CANDIDATE',
          primaryRationale: 'Backend database deadlock indicates application defect',
          decisionExplanation: 'Application server returned deadlock',
          separationFingerprint: `sep-a-${Date.now()}`,
          isAuthoritative: true,
        },
      });
      await prisma.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId: fcA.id,
          testCaseId: tc.id,
          primaryLayer: 'BACKEND_SERVICE',
          primaryTargetType: 'REPOSITORY_FILE',
          primaryTargetIdentifier: 'src/orders/order.service.ts',
          matchedFilePath: 'src/orders/order.service.ts',
          matchedSymbolName: 'OrderService.charge',
          httpEndpoint: '/api/pay',
          httpStatusCode: 500,
          localizationRationale: 'Direct failure in order charge method',
          localizationFingerprint: `loc-a-${Date.now()}`,
          isAuthoritative: true,
        },
      });

      // Failure B: Same backend checkout payment failure (matches A closely)
      const execB = await prisma.testCaseExecution.create({
        data: {
          projectId,
          testRunId: tr.id,
          testCaseId: tc.id,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          attempt: 2,
          status: 'FAILED',
          errorMessage:
            'Database deadlock during order placement in OrderService.charge with coupons',
        },
      });
      const fcB = await prisma.failureCase.create({
        data: {
          projectId,
          executionId: execB.id,
          testRunId: tr.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          stepIndex: 1,
          title: 'Checkout DB Deadlock with coupons',
          errorMessage:
            'Database deadlock during order placement in OrderService.charge with coupons',
          failureSignature: 'sig-trans-checkout-deadlock',
          isEligible: true,
          metadataJson: {
            endpoint: '/api/pay',
            httpStatus: 500,
          },
        },
      });
      await prisma.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId: fcB.id,
          testCaseId: tc.id,
          domain: 'APPLICATION_DEFECT_CANDIDATE',
          primaryRationale: 'Backend database deadlock indicates application defect',
          decisionExplanation: 'Application server returned deadlock',
          separationFingerprint: `sep-b-${Date.now()}`,
          isAuthoritative: true,
        },
      });
      await prisma.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId: fcB.id,
          testCaseId: tc.id,
          primaryLayer: 'BACKEND_SERVICE',
          primaryTargetType: 'REPOSITORY_FILE',
          primaryTargetIdentifier: 'src/orders/order.service.ts',
          matchedFilePath: 'src/orders/order.service.ts',
          matchedSymbolName: 'OrderService.charge',
          httpEndpoint: '/api/pay',
          httpStatusCode: 500,
          localizationRationale: 'Direct failure in order charge method',
          localizationFingerprint: `loc-b-${Date.now()}`,
          isAuthoritative: true,
        },
      });

      // Failure C: Automation test script locator failure that happens to mention words like "order placement"
      // Domain separation is AUTOMATION_FAILURE!
      const execC = await prisma.testCaseExecution.create({
        data: {
          projectId,
          testRunId: tr.id,
          testCaseId: tc.id,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          attempt: 3,
          status: 'FAILED',
          errorMessage: 'Timeout waiting for button#place-order during order placement',
        },
      });
      const fcC = await prisma.failureCase.create({
        data: {
          projectId,
          executionId: execC.id,
          testRunId: tr.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          stepIndex: 2,
          title: 'Locator timeout for button',
          errorMessage: 'Timeout waiting for button#place-order during order placement',
          failureSignature: `sig-trans-c-${Date.now()}`,
          isEligible: true,
        },
      });
      await prisma.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId: fcC.id,
          testCaseId: tc.id,
          domain: 'AUTOMATION_FAILURE',
          primaryRationale: 'Locator timeout is an automation script flaw',
          decisionExplanation: 'Client locator timeout',
          separationFingerprint: `sep-c-${Date.now()}`,
          isAuthoritative: true,
        },
      });

      // Run clustering on all three: A, B, and C
      const _clusters = await service.clusterDefects({
        projectId,
        failureCaseIds: [fcA.id, fcB.id, fcC.id],
      });

      // Find the cluster containing A
      const memA = await service.getFailureMembership({ projectId, failureCaseId: fcA.id });
      assert.ok(memA, 'Failure A must have a cluster');

      const clusterWithA = await service.getCluster({ projectId, clusterId: memA.clusterId });
      assert.ok(clusterWithA);
      const memberIds = (clusterWithA.memberships || []).map(m => m.failureCaseId);

      // Assert: A and B are in the cluster
      assert.ok(memberIds.includes(fcA.id), 'Cluster must contain Failure A');
      assert.ok(memberIds.includes(fcB.id), 'Cluster must contain Failure B');

      // Transitivity Safety Guarantee: C MUST NOT be admitted to A and B's cluster
      assert.ok(
        !memberIds.includes(fcC.id),
        'Transitivity Safety Violation: Automation failure C was incorrectly merged with Application failures A & B!',
      );
    },
  );

  await t.test('2. Handles extreme adversarial input strings without crashing', async () => {
    const extremePayload =
      "<script>alert('XSS')</script> " +
      '\'; DROP TABLE "DefectCluster"; -- ' +
      '🔥💥⚡️'.repeat(100) +
      '\\u0000\u001F' +
      'A'.repeat(5000);

    const execAdv = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: tr.id,
        testCaseId: tc.id,
        executableTestPlanId: plan.id,
        testCaseVersionNumber: 1,
        attempt: 4,
        status: 'FAILED',
        errorMessage: extremePayload,
      },
    });

    const fcAdv = await prisma.failureCase.create({
      data: {
        projectId,
        executionId: execAdv.id,
        testRunId: tr.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        stepIndex: 1,
        title: 'Adversarial String Failure',
        errorMessage: extremePayload,
        failureSignature: `sig-adv-extreme-${Date.now()}`,
        isEligible: true,
      },
    });

    const result = await service.clusterDefects({
      projectId,
      failureCaseIds: [fcAdv.id],
    });

    assert.ok(result.length > 0);
    const cluster = result.find(c => (c.memberships || []).some(m => m.failureCaseId === fcAdv.id));
    assert.ok(cluster);
    assert.ok(cluster.clusterFingerprint.length === 64);
  });
});
