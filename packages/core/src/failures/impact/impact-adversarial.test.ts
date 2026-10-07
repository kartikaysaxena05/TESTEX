/**
 * @file packages/core/src/failures/impact/impact-adversarial.test.ts
 * Adversarial edge cases and robustness tests for FailureImpactAssessmentService (Phase 84).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureImpactAssessmentService } from './failure-impact-assessment-service.js';

test('FailureImpactAssessment: Adversarial & Edge Cases', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for adversarial test');

  const service = new FailureImpactAssessmentService(prisma);

  const projectId = crypto.randomUUID();
  await prisma.project.create({ data: { id: projectId, name: 'Adversarial Project' } });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-ADV-${Date.now()}`,
      title: 'Adversarial Test Case',
      objective: 'Verify robustness against extreme inputs',
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
    '1. Handles SQL injection, unicode, and extreme string lengths in error message safely',
    async () => {
      const maliciousPayload =
        "'; DROP TABLE users; -- <script>alert('xss')</script> " +
        '🔥'.repeat(200) +
        'a'.repeat(4000);

      const exec = await prisma.testCaseExecution.create({
        data: {
          projectId,
          testRunId: tr.id,
          testCaseId: tc.id,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          status: 'FAILED',
          errorMessage: maliciousPayload,
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
          title: 'SQLi & Unicode Extreme Payload',
          errorMessage: maliciousPayload,
          failureSignature: `sig-adv-${Date.now()}`,
          isEligible: true,
        },
      });

      const result = await service.assessImpact({
        projectId,
        failureCaseId: fc.id,
      });

      assert.ok(result.id);
      assert.equal(result.isAuthoritative, true);
      assert.ok(result.assessmentFingerprint.length === 64);
    },
  );

  await t.test(
    '2. Factual deterministic evidence overrides conflicting AI suggestions',
    async () => {
      const tr2 = await prisma.testRun.create({
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
          testRunId: tr2.id,
          testCaseId: tc.id,
          executableTestPlanId: plan.id,
          testCaseVersionNumber: 1,
          status: 'FAILED',
          errorMessage: 'Element locator not found: #submit-btn timed out',
        },
      });

      const fc = await prisma.failureCase.create({
        data: {
          projectId,
          executionId: exec.id,
          testRunId: tr2.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          stepIndex: 1,
          title: 'Selector Timeout',
          errorMessage: 'Element locator not found: #submit-btn timed out',
          failureSignature: `sig-conflict-${Date.now()}`,
          isEligible: true,
        },
      });

      // Upstream Phase 80: Deterministic domain separation verified automation failure
      await prisma.failureDomainSeparation.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          domain: 'AUTOMATION_FAILURE',
          domainSubreason: 'ElementSelectorNotFound',
          primaryRationale: 'Element locator failed due to invalid selector',
          decisionExplanation: 'Automation framework error',
          separationFingerprint: 'fp-dom-adv',
          isAuthoritative: true,
        },
      });

      // Upstream Phase 82: Conflicting AI assessment suggests product bug
      await prisma.failureAiAssessment.create({
        data: {
          projectId,
          failureCaseId: fc.id,
          testCaseId: tc.id,
          testCaseVersionNumber: 1,
          aiCategory: 'APPLICATION_FAILURE',
          agreementState: 'DISAGREES',
          confidenceLevel: 'LOW',
          confidenceScore: 0.3,
          confidenceBasis: [],
          primaryReasoning: 'AI hallucinated that page crashed with product bug',
          humanExplanation: 'AI explanation',
          supportingEvidence: [],
          contradictingEvidence: [],
          alternativeHypotheses: [],
          uncertainties: [],
          modelProvider: 'fake',
          modelName: 'mock-model',
          promptVersion: '1.0.0',
          schemaVersion: '1.0.0',
          assessmentFingerprint: 'fp-ai-adv',
          isAuthoritative: true,
        },
      });

      const result = await service.assessImpact({
        projectId,
        failureCaseId: fc.id,
      });

      // Factual evidence MUST prevail: product severity is NOT_APPLICABLE
      assert.equal(result.severity, 'NOT_APPLICABLE');
      // Conflicting signal MUST be recorded
      assert.ok(result.conflictingSignals.some(s => s.includes('AUTOMATION_FAILURE')));
    },
  );
});
