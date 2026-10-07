/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-concurrency.test.ts
 * Concurrency, mutex serialization, idempotency, and revision lineage tests for Phase 82.
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

test('AI Classification Concurrency & Mutex Serialization (Phase 82)', async t => {
  let prisma: PrismaClient;
  let service: FailureAiReasoningService;

  let projectId: string;
  let failureCaseId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    projectId = crypto.randomUUID();

    await prisma.project.create({
      data: { id: projectId, name: 'Project AI Concurrency' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: 'REQ-AI-CONC-01',
        title: 'AI Concurrency Requirement',
        originalText: 'System must serialize concurrent AI reasoning runs',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-AI-CONC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Concurrency Test Case',
        objective: 'Verify mutex serialization',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-conc-ai',
        summary: 'Conc Plan',
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
        planFingerprint: 'plan-fp-conc-ai',
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
        errorMessage: '500 Server Crash during concurrency test',
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
        title: 'Concurrent AI Failure Case',
        errorMessage: '500 Server Crash',
      },
    });
    failureCaseId = fc.id;

    // Attach deterministic classification baseline
    await prisma.failureClassification.create({
      data: {
        projectId,
        failureCaseId: fc.id,
        category: 'APPLICATION_FAILURE',
        primaryRuleId: 'RULE_HTTP_500',
        ruleExplanationsJson: ['Server responded with status 500'],
        isAuthoritative: true,
      },
    });

    // Setup Fake AI Provider
    const mockAiResponse = JSON.stringify({
      aiCategory: 'APPLICATION_FAILURE',
      aiSubcategory: 'HTTP_ERROR_RESPONSE',
      confidenceScore: 0.94,
      primaryReasoning: 'Server returned internal error during API invocation.',
      humanExplanation: 'Application bug causing 500 status on submission.',
      supportingEvidence: [
        {
          id: 'ev-conc-1',
          fact: '500 status received from backend server',
          significance: 'CRITICAL',
          evidenceType: 'NETWORK_LOG',
        },
      ],
      contradictingEvidence: [],
      alternativeHypotheses: [],
      uncertainties: [],
    });

    const fakeProvider = new FakeAiProvider({
      defaultResponse: mockAiResponse,
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
    '1. Serializes concurrent assessFailureWithAi calls with exactly 1 authoritative record and shared result',
    async () => {
      // Launch 3 concurrent assessments
      const [res1, res2, res3] = await Promise.all([
        service.assessFailureWithAi({ projectId, failureCaseId }),
        service.assessFailureWithAi({ projectId, failureCaseId }),
        service.assessFailureWithAi({ projectId, failureCaseId }),
      ]);

      assert.ok(res1.id);
      assert.ok(res2.id);
      assert.ok(res3.id);
      // Because of idempotency with fingerprint, all should resolve to the same assessment id
      assert.equal(res1.id, res2.id);
      assert.equal(res2.id, res3.id);

      const authoritativeRecords = await prisma.failureAiAssessment.findMany({
        where: { failureCaseId, isAuthoritative: true },
      });

      assert.equal(authoritativeRecords.length, 1);
      assert.equal(authoritativeRecords[0]?.id, res1.id);
      assert.equal(authoritativeRecords[0]?.reanalysisCount, 0);
    },
  );

  await t.test(
    '2. Reassessment un-authorizes previous record and sets supersededById lineage',
    async () => {
      // Initial assessment
      const initial = await service.assessFailureWithAi({ projectId, failureCaseId });
      assert.equal(initial.isAuthoritative, true);
      assert.equal(initial.reanalysisCount, 0);

      // Reassess
      const reassessed = await service.reassessFailureWithAi({
        projectId,
        failureCaseId,
        reanalysisReason: 'Retesting after server hotfix applied',
      });

      assert.notEqual(initial.id, reassessed.id);
      assert.equal(reassessed.isAuthoritative, true);
      assert.equal(reassessed.reanalysisCount, 1);
      assert.equal(reassessed.reanalysisReason, 'Retesting after server hotfix applied');

      // Verify initial record in database
      const oldRecord = await prisma.failureAiAssessment.findUniqueOrThrow({
        where: { id: initial.id },
      });
      assert.equal(oldRecord.isAuthoritative, false);
      assert.equal(oldRecord.supersededById, reassessed.id);

      // History should contain both records in descending order
      const history = await service.listAiAssessmentHistory({ projectId, failureCaseId });
      assert.equal(history.length, 2);
      assert.equal(history[0]?.id, reassessed.id);
      assert.equal(history[1]?.id, initial.id);
    },
  );
});
