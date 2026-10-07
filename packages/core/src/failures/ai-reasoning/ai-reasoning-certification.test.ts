/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-certification.test.ts
 * Comprehensive Phase 82 Certification Suite verifying advisory AI classification,
 * agreement states, dynamic staleness detection, and explainable confidence calibration.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureAiReasoningService } from './failure-ai-reasoning-service.js';
import { AiPromptExecutionService } from '../../ai/ai-prompt-execution-service.js';
import { PromptRegistry } from '../../ai/prompt-registry.js';
import { AiProviderRegistry } from '../../ai/ai-provider-registry.js';
import { AiProviderGateway } from '../../ai/ai-provider-gateway.js';
import { FakeAiProvider } from '../../ai/fake-ai-provider.js';

test('V6 Phase 82 — AI-Assisted Failure Classification & Reasoning Certification Suite', async t => {
  let prisma: PrismaClient;
  let service: FailureAiReasoningService;
  let fakeProvider: FakeAiProvider;

  let projectId: string;
  let failureCaseId: string;
  let deterministicClassId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Project AI Certification Phase 82' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-AI-CERT-01',
        title: 'AI Classification Certification Requirement',
        originalText: 'System must produce advisory AI reasoning over deterministic baseline',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-AI-CERT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Payment Checkout Test',
        objective: 'Certify Phase 82 AI reasoning end-to-end',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-cert-ai',
        summary: 'Cert Plan',
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
        planFingerprint: 'plan-fp-cert-ai',
        testCaseTitle: tc.title,
      },
    });

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        durationMs: 4500,
        errorMessage: 'Payment gateway timed out: HTTP 504 Gateway Timeout on /checkout',
        browserEngine: 'chromium',
      },
    });

    const fc = await prisma.failureCase.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Payment Gateway 504 Timeout',
        errorMessage: 'HTTP 504 Gateway Timeout on /checkout',
      },
    });
    failureCaseId = fc.id;

    // Attach deterministic classification baseline (Phase 77)
    const classification = await prisma.failureClassification.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        category: 'ENVIRONMENT_FAILURE',
        subcategory: 'TIMEOUT',
        primaryRuleId: 'RULE_HTTP_504_GATEWAY_TIMEOUT',
        ruleExplanationsJson: ['Upstream gateway timeout detected from reverse proxy'],
        isAuthoritative: true,
      },
    });
    deterministicClassId = classification.id;

    // Attach Phase 80 domain separation
    await prisma.failureDomainSeparation.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        testCaseId: tc.id,
        domain: 'ENVIRONMENT_FAILURE',
        domainSubreason: 'Reverse Proxy / Gateway Timeout',
        primaryRationale: 'Server network perimeter returned 504',
        decisionExplanation: 'Infrastructure gateway unresponsive',
        separationFingerprint: 'sep-fp-' + crypto.randomUUID().slice(0, 16),
        isAuthoritative: true,
      },
    });

    // Attach Phase 81 technical cause localization
    await prisma.failureTechnicalLocalization.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        testCaseId: tc.id,
        primaryLayer: 'ENVIRONMENT',
        primaryTargetType: 'API_ENDPOINT',
        primaryTargetIdentifier: '/checkout',
        httpEndpoint: '/checkout',
        httpMethod: 'POST',
        httpStatusCode: 504,
        localizationRationale: 'Direct gateway timeout on payment submission',
        localizationFingerprint: 'loc-fp-' + crypto.randomUUID().slice(0, 16),
        isAuthoritative: true,
      },
    });

    // Attach Phase 75 diagnostic evidence bundle
    const bundle = await prisma.executionEvidenceBundle.create({
      data: {
        projectId,
        testRunId: run.id,
        executionId: exec.id,
        status: 'COMPLETE',
      },
    });

    await prisma.failureEvidenceReference.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        executionId: exec.id,
        bundleId: bundle.id,
        artifactType: 'NETWORK_LOG',
        logicalName: 'network-har.json',
        byteSize: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        metadataJson: {
          requests: [
            {
              url: 'https://payment.example.com/checkout',
              method: 'POST',
              statusCode: 504,
              error: 'Gateway Timeout',
            },
          ],
        },
      },
    });

    // Setup Fake AI Provider with configurable responses
    fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify({
        aiCategory: 'ENVIRONMENT_FAILURE',
        aiSubcategory: 'DEPENDENCY_UNAVAILABLE',
        confidenceScore: 0.95,
        primaryReasoning: 'Network logs confirm HTTP 504 Gateway Timeout from payment gateway.',
        humanExplanation:
          'The checkout operation failed because the external payment gateway did not respond in time.',
        supportingEvidence: [
          {
            id: 'ev-cert-1',
            fact: 'POST /checkout failed with HTTP status 504 Gateway Timeout',
            significance: 'CRITICAL',
            evidenceType: 'NETWORK_LOG',
          },
        ],
        contradictingEvidence: [],
        alternativeHypotheses: [
          {
            category: 'APPLICATION_FAILURE',
            rationale: 'Could be application deadlocking payment request',
            plausibility: 'LOW',
            disqualifyingFactor: 'Reverse proxy responded with standard 504 header',
          },
        ],
        uncertainties: [],
      }),
    });

    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    service = new FailureAiReasoningService(prisma, {
      promptExecutionService: promptService,
    });
  });

  await t.test(
    '1. Generates advisory AI classification with agreementState=AGREES when AI agrees with baseline',
    async () => {
      const assessment = await service.assessFailureWithAi({ projectId, failureCaseId });

      assert.ok(assessment.id);
      assert.equal(assessment.aiCategory, 'ENVIRONMENT_FAILURE');
      assert.equal(assessment.agreementState, 'AGREES');
      assert.ok(assessment.confidenceScore >= 0.8);
      assert.ok(
        assessment.confidenceLevel === 'HIGH' || assessment.confidenceLevel === 'VERY_HIGH',
      );
      assert.equal(assessment.isAuthoritative, true);
      assert.equal(assessment.isStale, false);
      assert.equal(assessment.deterministicClassificationId, deterministicClassId);
      assert.equal(assessment.supportingEvidence.length, 1);
      assert.equal(assessment.alternativeHypotheses.length, 1);
    },
  );

  await t.test(
    '2. Records agreementState=DISAGREES when AI classification differs from deterministic category',
    async () => {
      // Configure AI to evaluate as APPLICATION_FAILURE
      fakeProvider.setOptions({
        defaultResponse: JSON.stringify({
          aiCategory: 'APPLICATION_FAILURE',
          aiSubcategory: 'HTTP_ERROR_RESPONSE',
          confidenceScore: 0.88,
          primaryReasoning: 'Internal application handler stalled before sending upstream payload.',
          humanExplanation: 'Application internal error prevented checkout.',
          supportingEvidence: [
            {
              id: 'ev-cert-2',
              fact: 'Internal handler stack trace suggests unhandled promise rejection',
              significance: 'HIGH',
              evidenceType: 'CONSOLE_LOG',
            },
          ],
          contradictingEvidence: [
            {
              id: 'ev-cert-contra-1',
              fact: 'HTTP 504 status returned from reverse proxy',
              tensionDescription:
                'Typically indicates environment/network issue rather than app bug',
              evidenceType: 'NETWORK_LOG',
            },
          ],
          alternativeHypotheses: [],
          uncertainties: [],
        }),
      });

      const assessment = await service.reassessFailureWithAi({
        projectId,
        failureCaseId,
        reanalysisReason: 'Re-evaluating with deeper application logs',
      });

      assert.equal(assessment.aiCategory, 'APPLICATION_FAILURE');
      assert.equal(assessment.agreementState, 'DISAGREES');
      assert.equal(assessment.contradictingEvidence.length, 1);
    },
  );

  await t.test(
    '3. Records agreementState=PARTIAL_AGREEMENT when baseline classification is INCONCLUSIVE',
    async () => {
      // Update deterministic classification to INCONCLUSIVE
      await prisma.failureClassification.update({
        where: { id: deterministicClassId },
        data: { category: 'INCONCLUSIVE' },
      });

      const agreement = FailureAiReasoningService.evaluateAgreement(
        'ENVIRONMENT_FAILURE',
        'INCONCLUSIVE',
      );
      assert.equal(agreement, 'PARTIAL_AGREEMENT');
    },
  );

  await t.test(
    '4. Dynamic Staleness Detection: New evidence attached after assessment marks record stale',
    async () => {
      // Initial fresh assessment
      const initial = await service.assessFailureWithAi({ projectId, failureCaseId });
      assert.equal(initial.isStale, false);

      // Sleep 15ms so timestamp is strictly in the future
      await new Promise(res => setTimeout(res, 15));

      // Ingest new evidence artifact
      const exec = await prisma.testCaseExecution.findFirstOrThrow({ where: { projectId } });

      await prisma.failureEvidenceReference.create({
        data: {
          projectId,
          failureCaseId,
          executionId: exec.id,
          artifactType: 'CONSOLE_LOG',
          logicalName: 'console-tail.log',
          byteSize: 256,
          sha256: crypto.randomBytes(32).toString('hex'),
          attachedAt: new Date(Date.now() + 1000), // explicitly newer
        },
      });

      // Read through getAiAssessment (without calling LLM)
      const readResult = await service.getAiAssessment({ projectId, failureCaseId });

      assert.ok(readResult);
      assert.equal(readResult.isStale, true);
      assert.ok(readResult.stalenessReason?.includes('new evidence artifact(s) attached'));
    },
  );

  await t.test(
    '5. Dynamic Staleness Detection: Technical cause relocalization marks assessment stale',
    async () => {
      // Reset to fresh assessment
      const fresh = await service.reassessFailureWithAi({
        projectId,
        failureCaseId,
        reanalysisReason: 'Fresh assessment for localization staleness check',
      });
      assert.equal(fresh.isStale, false);

      // Update localization with newer timestamp
      await prisma.failureTechnicalLocalization.create({
        data: {
          projectId,
          failureCaseId,
          testCaseId: (await prisma.testCase.findFirstOrThrow({ where: { projectId } })).id,
          primaryLayer: 'BACKEND_API',
          primaryTargetType: 'API_ENDPOINT',
          primaryTargetIdentifier: '/checkout/v2',
          localizationRationale: 'Updated to v2 endpoint',
          localizationFingerprint: 'loc-fp-updated-' + crypto.randomUUID().slice(0, 16),
          isAuthoritative: true,
          localizedAt: new Date(Date.now() + 2000),
        },
      });

      const readResult = await service.getAiAssessment({ projectId, failureCaseId });

      assert.ok(readResult);
      assert.equal(readResult.isStale, true);
      assert.ok(readResult.stalenessReason?.includes('Technical cause localization updated'));
    },
  );
});
