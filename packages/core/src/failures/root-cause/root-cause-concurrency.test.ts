/**
 * @file packages/core/src/failures/root-cause/root-cause-concurrency.test.ts
 * Concurrency, mutex serialization, idempotency, and revision lineage tests for Phase 83 Root-Cause Analysis.
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { FailureRootCauseService } from './failure-root-cause-service.js';
import { AiPromptExecutionService } from '../../ai/ai-prompt-execution-service.js';
import { PromptRegistry } from '../../ai/prompt-registry.js';
import { AiProviderRegistry } from '../../ai/ai-provider-registry.js';
import { AiProviderGateway } from '../../ai/ai-provider-gateway.js';
import { FakeAiProvider } from '../../ai/fake-ai-provider.js';

test('Root-Cause Concurrency, Mutex Serialization & Revision Lineage (Phase 83)', async t => {
  let prisma: PrismaClient;
  let service: FailureRootCauseService;

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
      data: { id: projectId, name: 'Project RCA Concurrency' },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId,
        requirementKey: `REQ-RCA-CONC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'RCA Concurrency Requirement',
        originalText: 'System must serialize concurrent root-cause runs',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId,
        testCaseKey: `TC-RCA-CONC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: 'Concurrency RCA Test Case',
        objective: 'Verify mutex serialization in RCA',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: `plan-fp-conc-rca-${Date.now()}`,
        summary: 'RCA Conc Plan',
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
        planFingerprint: `plan-fp-conc-rca-${Date.now()}`,
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
        errorMessage: '500 Server Crash during root-cause concurrency test',
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
        title: 'Concurrent RCA Failure Case',
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

    // Setup Fake AI Provider with RootCauseRawOutput structure
    const mockRcaResponse = JSON.stringify({
      rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
      probableLayer: 'BACKEND',
      probableComponent: 'AuthGateway',
      relatedEndpoint: '/api/v1/auth',
      probableCause: 'Null pointer dereference in auth token session validator.',
      humanExplanation: 'A crash occurred on the server while validating expired session tokens.',
      affectedExecutionPath: [
        'POST /api/v1/auth',
        'Token validation failed',
        'Server returned 500',
      ],
      supportingEvidence: [
        {
          id: 'ev-rca-1',
          fact: 'Backend server returned HTTP 500 with unhandled NullReferenceException',
          significance: 'CRITICAL',
          evidenceType: 'CONSOLE_LOG',
        },
      ],
      contradictingEvidence: [],
      alternativeHypotheses: [
        {
          layer: 'AUTHENTICATION',
          probableCause: 'Malformed token format rejected by identity provider',
          rationale: 'Could be bad token signature rather than server bug',
          plausibility: 'LOW',
          disqualifyingFactor: 'Server threw unhandled 500 rather than 401 Unauthorized',
        },
      ],
      repositoryReferences: [],
      limitations: [],
      uncertainties: [],
    });

    const fakeProvider = new FakeAiProvider({
      defaultResponse: mockRcaResponse,
    });

    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    service = new FailureRootCauseService(prisma, {
      promptExecutionService: promptService,
    });
  });

  await t.test(
    '1. Serializes concurrent analyzeRootCause calls with exactly 1 authoritative record and shared result',
    async () => {
      // Launch 3 concurrent analyses
      const [res1, res2, res3] = await Promise.all([
        service.analyzeRootCause({ projectId, failureCaseId }),
        service.analyzeRootCause({ projectId, failureCaseId }),
        service.analyzeRootCause({ projectId, failureCaseId }),
      ]);

      assert.ok(res1.id);
      assert.ok(res2.id);
      assert.ok(res3.id);
      // Due to mutex locking and fingerprint idempotency, all should resolve to the same analysis id
      assert.equal(res1.id, res2.id);
      assert.equal(res2.id, res3.id);

      const authoritativeRecords = await prisma.failureRootCauseAnalysis.findMany({
        where: { failureCaseId, isAuthoritative: true },
      });

      assert.equal(authoritativeRecords.length, 1);
      assert.equal(authoritativeRecords[0]?.id, res1.id);
      assert.equal(authoritativeRecords[0]?.reanalysisCount, 0);
    },
  );

  await t.test(
    '2. Reanalysis un-authorizes previous record and sets supersededById lineage',
    async () => {
      // Initial analysis
      const initial = await service.analyzeRootCause({ projectId, failureCaseId });
      assert.equal(initial.isAuthoritative, true);
      assert.equal(initial.reanalysisCount, 0);

      // Reanalyze
      const reanalyzed = await service.reanalyzeRootCause({
        projectId,
        failureCaseId,
        reanalysisReason: 'Retesting after database index migration',
      });

      assert.notEqual(initial.id, reanalyzed.id);
      assert.equal(reanalyzed.isAuthoritative, true);
      assert.equal(reanalyzed.reanalysisCount, 1);
      assert.equal(reanalyzed.reanalysisReason, 'Retesting after database index migration');

      // Verify initial record in database
      const oldRecord = await prisma.failureRootCauseAnalysis.findUniqueOrThrow({
        where: { id: initial.id },
      });
      assert.equal(oldRecord.isAuthoritative, false);
      assert.equal(oldRecord.supersededById, reanalyzed.id);

      // History should contain both records in descending order
      const history = await service.listRootCauseHistory({ projectId, failureCaseId });
      assert.equal(history.length, 2);
      assert.equal(history[0]?.id, reanalyzed.id);
      assert.equal(history[1]?.id, initial.id);
    },
  );
});
