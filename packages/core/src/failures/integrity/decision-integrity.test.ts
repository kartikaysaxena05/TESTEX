/**
 * @file packages/core/src/failures/integrity/decision-integrity.test.ts
 * Comprehensive test suite for Classification Decision Integrity, Cross-Evidence Arbitration & Runtime Enforcement (V6 Phase 78).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { ClassificationDecisionIntegrityService } from './classification-decision-integrity-service.js';
import { FailureDeterministicClassifier } from '../classification/failure-deterministic-classifier.js';
import { CrossEvidenceArbitrationEngine } from './arbitration-engine.js';
import { generateDecisionFingerprint } from './decision-fingerprint.js';
import type { PrismaClient, TestRunStatus, EnvironmentEquivalenceStatus } from '@prisma/client';

describe('Classification Decision Integrity & Arbitration (V6 Phase 78)', () => {
  let prisma: PrismaClient;
  let service: ClassificationDecisionIntegrityService;
  let classifier: FailureDeterministicClassifier;

  let testProjectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let planId: string;
  let testRunId: string;

  beforeEach(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;
    service = new ClassificationDecisionIntegrityService(prisma);
    classifier = new FailureDeterministicClassifier(prisma);

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Decision Integrity Project' },
        { id: otherProjectId, name: 'Other Integrity Project' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Integrity Check Requirement',
        originalText: 'User must authenticate and checkout',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Integrity Test Case',
        objective: 'Test decision integrity and arbitration',
        reviewStatus: 'APPROVED',
        currentVersionNumber: 1,
        sourceRequirementId: req.id,
        sourceRequirementKey: req.requirementKey,
      },
    });
    testCaseId = tc.id;

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-integrity',
        summary: 'Executable integrity plan',
        status: 'VALID',
        isExecutable: true,
      },
    });
    planId = plan.id;

    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        status: 'FAILED',
        planFingerprint: 'plan-fp-integrity',
        testCaseTitle: tc.title,
      },
    });
    testRunId = run.id;
  });

  async function createFixture(params: {
    status?: TestRunStatus;
    errorCode?: string;
    errorMessage?: string;
    corruptEvidence?: boolean;
    hasBrowserCrash?: boolean;
    hasHttp5xx?: boolean;
    hasTargetUnreachable?: boolean;
    reproductionAttempts?: Array<{
      status: 'REPRODUCED' | 'NOT_REPRODUCED' | 'BLOCKED' | 'INCONCLUSIVE';
      equivalence: EnvironmentEquivalenceStatus;
      blockerReason?: string;
      createdAt?: Date;
    }>;
  }) {
    const execution = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        attempt: 1,
        status: params.status ?? 'FAILED',
        errorCode:
          params.errorCode ??
          (params.hasBrowserCrash ? 'BROWSER_RUNTIME_ERROR' : 'ASSERTION_FAILED'),
        errorMessage:
          params.errorMessage ??
          (params.hasBrowserCrash
            ? 'Target crashed: Page crashed'
            : params.hasTargetUnreachable
              ? 'net::ERR_CONNECTION_REFUSED'
              : 'Assertion failed: expected 200 but got 400'),
        terminalReason: 'Test execution failed',
      },
    });

    const step = await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId: execution.id,
        stepIndex: 0,
        actionType: 'CLICK',
        status: 'FAILED',
        errorMessage: 'Step failed',
      },
    });

    if (!params.hasBrowserCrash && !params.hasTargetUnreachable) {
      await prisma.assertionExecutionRecord.create({
        data: {
          projectId: testProjectId,
          testRunId,
          executionId: execution.id,
          stepExecutionId: step.id,
          assertionType: 'ELEMENT_TEXT',
          operator: 'EQUALS',
          status: 'FAILED',
          expectedValueJson: 'Success',
          actualValueJson: 'Failure',
          errorMessage: 'Expected Success but got Failure',
        },
      });
    }

    const failureCase = await prisma.failureCase.create({
      data: {
        projectId: testProjectId,
        title: 'Test Failure Case',
        testCaseId,
        testCaseVersionNumber: 1,
        testRunId,
        executionId: execution.id,
        triggeringExecutionStatus: execution.status,
        status: 'PENDING',
        failureSummary: 'Test failure summary',
        errorCode: execution.errorCode,
        errorMessage: execution.errorMessage,
        failureSignature: `SIG-${Date.now()}-${Math.random()}`,
        evidenceCompleteness: 'COMPLETE',
      },
    });

    const evidenceRef = await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        executionId: execution.id,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'execution.log',
        storageIdentity: `/var/storage/${failureCase.id}/execution.log`,
        byteSize: 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mimeType: 'text/plain',
        integrityStatus: params.corruptEvidence ? 'CORRUPT' : 'VERIFIED',
      },
    });

    if (params.reproductionAttempts) {
      let idx = 1;
      for (const ra of params.reproductionAttempts) {
        await prisma.failureReproductionAttempt.create({
          data: {
            projectId: testProjectId,
            failureCaseId: failureCase.id,
            originalExecutionId: execution.id,
            testCaseId,
            testCaseVersionNumber: 1,
            attemptNumber: idx++,
            status: ra.status,
            environmentEquivalence: ra.equivalence,
            blockerReason: ra.blockerReason,
            createdAt: ra.createdAt ?? new Date(),
          },
        });
      }
    }

    return { execution, failureCase, evidenceRef };
  }

  it('evaluates decision integrity for a consistent application failure', async () => {
    const { failureCase } = await createFixture({
      status: 'FAILED',
      errorCode: 'ASSERTION_FAILED',
      errorMessage: 'Assertion failed: expected Success but got Error',
    });

    // Run deterministic classification first
    const classification = await classifier.classify({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    assert.strictEqual(classification.category, 'APPLICATION_FAILURE');

    // Evaluate decision integrity
    const integrity = await service.evaluateDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
      classificationId: classification.id,
    });

    assert.strictEqual(integrity.decisionState, 'VALID');
    assert.strictEqual(integrity.evidenceFreshnessState, 'CURRENT');
    assert.strictEqual(integrity.consistencyState, 'CONSISTENT');
    assert.strictEqual(integrity.arbitrationState, 'SUPPORTED');
    assert.strictEqual(integrity.isAuthoritative, true);
    assert.ok(integrity.decisionFingerprint.length === 64);
    assert.strictEqual(integrity.blockingReasons.length, 0);
  });

  it('computes deterministic invariant SHA-256 fingerprint', () => {
    const facts1 = {
      category: 'APPLICATION_FAILURE' as const,
      subcategory: 'ASSERTION_MISMATCH' as const,
      classifierVersion: '1.0.0',
      taxonomyVersion: '1.0.0',
      primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
      matchedRuleIds: ['APP_ASSERTION_MISMATCH_001', 'APP_GENERIC_002'],
      conflictingRuleIds: [],
      normalizedEvidenceIdentities: ['ev-1:sha256:VERIFIED', 'ev-2:sha256:VERIFIED'],
      reproductionSnapshotIdentity: 'repro-snap-1',
      environmentEquivalence: 'EQUIVALENT',
      failedStepIdentity: 'step-0:CLICK',
      failureSignature: 'SIG-CANONICAL-TEST',
    };

    const facts2 = {
      ...facts1,
      // Pass arrays in different order to test canonical sorting
      matchedRuleIds: ['APP_GENERIC_002', 'APP_ASSERTION_MISMATCH_001'],
      normalizedEvidenceIdentities: ['ev-2:sha256:VERIFIED', 'ev-1:sha256:VERIFIED'],
    };

    const fp1 = generateDecisionFingerprint(facts1);
    const fp2 = generateDecisionFingerprint(facts2);

    assert.strictEqual(fp1, fp2);
    assert.strictEqual(fp1.length, 64);
  });

  it('marks decision STALE when a new reproduction attempt is recorded after classification', async () => {
    const { failureCase } = await createFixture({
      status: 'FAILED',
      errorCode: 'ASSERTION_FAILED',
    });

    const classification = await classifier.classify({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    // Add a newer reproduction attempt after classification
    await prisma.failureReproductionAttempt.create({
      data: {
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        originalExecutionId: failureCase.executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        attemptNumber: 1,
        status: 'REPRODUCED',
        environmentEquivalence: 'EQUIVALENT',
        createdAt: new Date(Date.now() + 5000),
      },
    });

    const integrity = await service.evaluateDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
      classificationId: classification.id,
      forceRecompute: true,
    });

    assert.strictEqual(integrity.evidenceFreshnessState, 'STALE');
    assert.strictEqual(integrity.decisionState, 'STALE');
    assert.ok(integrity.warningReasons.some(w => w.toLowerCase().includes('reproduction attempt')));
  });

  it('marks decision INVALIDATED when underlying evidence is corrupted', async () => {
    const { failureCase } = await createFixture({
      status: 'FAILED',
      corruptEvidence: true,
    });

    const classification = await classifier.classify({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    const integrity = await service.evaluateDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
      classificationId: classification.id,
    });

    assert.strictEqual(integrity.decisionState, 'INVALIDATED');
    assert.ok(
      integrity.blockingReasons.some(
        b => b.includes('CORRUPT') || b.toLowerCase().includes('integrity verification failed'),
      ),
    );
  });

  it('marks decision CONFLICTED when contradiction engine detects browser crash against application failure', async () => {
    const engine = new CrossEvidenceArbitrationEngine();
    const result = engine.arbitrate({
      category: 'APPLICATION_FAILURE',
      subcategory: 'ASSERTION_MISMATCH',
      primaryRuleId: 'APP_ASSERTION_MISMATCH_001',
      matchedRuleIds: ['APP_ASSERTION_MISMATCH_001'],
      conflictingRuleIds: [],
      executionStatus: 'FAILED',
      hasBrowserCrash: true,
      hasTargetUnreachable: false,
      hasHttp5xx: false,
      hasAssertionFailure: false,
      hasTestDataFailure: false,
      hasInvalidTestSteps: false,
      hasRequirementConflict: false,
      verifiedFixturePresent: false,
      cleanStepsCompletedCount: 0,
      totalStepsCount: 1,
      reproductionAttempts: [],
      classificationCreatedAt: new Date(),
      evidencePackageIntegrityStatus: 'VERIFIED',
      evidenceCompleteness: 'COMPLETE',
    });

    assert.strictEqual(result.arbitrationState, 'OVERRIDDEN');
    assert.strictEqual(result.consistencyState, 'INCONSISTENT');
    assert.strictEqual(result.isContradictionDetected, true);
    assert.ok(
      result.blockingReasons.some(
        r => r.toLowerCase().includes('browser') && r.toLowerCase().includes('crash'),
      ),
    );
  });

  it('supports idempotent reads via getDecisionIntegrity without mutation', async () => {
    const { failureCase } = await createFixture({
      status: 'FAILED',
    });

    const _classification = await classifier.classify({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    // Before evaluation, get returns null
    const before = await service.getDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });
    assert.strictEqual(before, null);

    // Initial evaluation
    const initial = await service.evaluateDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    // Idempotent read returns the exact same record
    const after1 = await service.getDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });
    const after2 = await service.getDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    assert.ok(after1);
    assert.ok(after2);
    assert.strictEqual(after1?.id, initial.id);
    assert.strictEqual(after2?.id, initial.id);
    assert.strictEqual(after1?.decisionFingerprint, initial.decisionFingerprint);
  });

  it('recomputeDecisionIntegrity forces new authoritative record and archives previous record', async () => {
    const { failureCase } = await createFixture({
      status: 'FAILED',
    });

    const _classification = await classifier.classify({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    const first = await service.evaluateDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    assert.strictEqual(first.isAuthoritative, true);

    const recomputed = await service.recomputeDecisionIntegrity({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    assert.notStrictEqual(recomputed.id, first.id);
    assert.strictEqual(recomputed.isAuthoritative, true);

    const history = await service.listDecisionIntegrityHistory({
      projectId: testProjectId,
      failureCaseId: failureCase.id,
    });

    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0]!.id, recomputed.id);
    assert.strictEqual(history[0]!.isAuthoritative, true);
    assert.strictEqual(history[1]!.id, first.id);
    assert.strictEqual(history[1]!.isAuthoritative, false);
  });
});
