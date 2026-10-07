/**
 * @file packages/core/src/failures/classification/failure-deterministic-classifier.test.ts
 * Comprehensive test suite for Failure Taxonomy & Deterministic Classification Foundation (V6 Phase 77).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FailureDeterministicClassifier } from './failure-deterministic-classifier.js';
import {
  failureCategorySchema,
  failureSubcategorySchema,
  type FailureCategory,
} from '@ai-quality/contracts';
import type { PrismaClient, TestRunStatus, EnvironmentEquivalenceStatus } from '@prisma/client';

describe('FailureDeterministicClassifier (V6 Phase 77)', () => {
  let prisma: PrismaClient;
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
    classifier = new FailureDeterministicClassifier(prisma);

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();

    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Deterministic Classification Project' },
        { id: otherProjectId, name: 'Other Project' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Authentication & Checkout',
        originalText: 'User must authenticate and complete payment',
        status: 'ACTIVE',
      },
    });

    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Checkout Test Case',
        objective: 'Test checkout and payment assertions',
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
        planFingerprint: 'plan-fp-1',
        summary: 'Executable checkout plan',
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
        planFingerprint: 'plan-fp-1',
        testCaseTitle: tc.title,
      },
    });
    testRunId = run.id;
  });

  // Helper to create execution + failure case
  async function createFixture(params: {
    status?: TestRunStatus;
    errorCode?: string;
    errorMessage?: string;
    failureSummary?: string;
    completeness?: 'COMPLETE' | 'PARTIAL' | 'MINIMAL' | 'INSUFFICIENT';
    metadataJson?: Record<string, unknown>;
    steps?: Array<{
      stepIndex: number;
      action: string;
      status: 'PASSED' | 'FAILED' | 'PENDING';
      errorMessage?: string;
      assertions?: Array<{
        assertionType: string;
        expectedValueJson?: any;
        actualValueJson?: any;
        status: 'PASSED' | 'FAILED';
        errorMessage?: string;
      }>;
    }>;
    reproduction?: {
      status: 'REPRODUCED' | 'NOT_REPRODUCED' | 'BLOCKED' | 'INCONCLUSIVE';
      equivalence: EnvironmentEquivalenceStatus;
      blockerReason?: string;
    };
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
        errorCode: params.errorCode ?? 'ASSERTION_FAILED',
        errorMessage: params.errorMessage ?? 'Assertion failed: expected 200 but got 500',
        terminalReason: 'Test execution failed',
      },
    });

    if (params.steps) {
      for (const s of params.steps) {
        const stepRec = await prisma.stepExecutionRecord.create({
          data: {
            projectId: testProjectId,
            testRunId,
            executionId: execution.id,
            stepIndex: s.stepIndex,
            actionType: s.action,
            status: s.status,
            errorMessage: s.errorMessage,
          },
        });

        if (s.assertions) {
          for (const a of s.assertions) {
            await prisma.assertionExecutionRecord.create({
              data: {
                projectId: testProjectId,
                testRunId,
                executionId: execution.id,
                stepExecutionId: stepRec.id,
                assertionType: a.assertionType,
                operator: 'EQUALS',
                status: a.status,
                expectedValueJson: a.expectedValueJson,
                actualValueJson: a.actualValueJson,
                errorMessage: a.errorMessage,
              },
            });
          }
        }
      }
    }

    const failureCase = await prisma.failureCase.create({
      data: {
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        testRunId,
        executionId: execution.id,
        triggeringExecutionStatus: params.status ?? 'FAILED',
        status: 'PENDING',
        title: 'Failure Case for ' + (params.errorMessage ?? 'Generic Failure'),
        failureSummary: params.failureSummary ?? 'Detailed failure summary',
        errorCode: params.errorCode ?? 'ASSERTION_FAILED',
        errorMessage: params.errorMessage ?? 'Expected total $90 but got $100',
        evidenceCompleteness: params.completeness ?? 'COMPLETE',
        metadataJson: (params.metadataJson as any) ?? {},
      },
    });

    if (params.reproduction) {
      await prisma.failureReproductionAttempt.create({
        data: {
          projectId: testProjectId,
          failureCaseId: failureCase.id,
          originalExecutionId: execution.id,
          attemptNumber: 1,
          testCaseId,
          testCaseVersionNumber: 1,
          status: params.reproduction.status,
          environmentEquivalence: params.reproduction.equivalence,
          blockerReason: params.reproduction.blockerReason,
        },
      });
    }

    return { execution, failureCase };
  }

  // ---------------------------------------------------------------------------
  // 1. Taxonomy Completeness
  // ---------------------------------------------------------------------------
  describe('Taxonomy Completeness', () => {
    it('verifies all 9 mandatory failure categories are represented in the contract schema', () => {
      const categories: FailureCategory[] = [
        'APPLICATION_FAILURE',
        'AUTOMATION_FAILURE',
        'TEST_DATA_FAILURE',
        'ENVIRONMENT_FAILURE',
        'REQUIREMENT_AMBIGUITY',
        'INVALID_TEST',
        'BLOCKED_EXECUTION',
        'UNKNOWN',
        'INCONCLUSIVE',
      ];

      for (const cat of categories) {
        assert.doesNotThrow(() => failureCategorySchema.parse(cat));
      }
      assert.strictEqual(failureCategorySchema.options.length, 9);
    });

    it('verifies factual subcategories are present in contract schema', () => {
      const subcategories = [
        'ASSERTION_MISMATCH',
        'HTTP_ERROR_RESPONSE',
        'LOCATOR_NOT_FOUND',
        'BROWSER_CRASH',
        'TIMEOUT',
        'TARGET_UNREACHABLE',
        'MISSING_TEST_DATA',
        'ENVIRONMENT_DRIFT',
      ];

      for (const sub of subcategories) {
        assert.doesNotThrow(() => failureSubcategorySchema.parse(sub));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Deterministic Rule Precedence
  // ---------------------------------------------------------------------------
  describe('Deterministic Rule Precedence', () => {
    it('precedence 1: classifies as BLOCKED_EXECUTION when reproduction is explicitly blocked', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Expected button to be visible',
        reproduction: {
          status: 'BLOCKED',
          equivalence: 'UNKNOWN',
          blockerReason: 'Database migration not applied on target host',
        },
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'BLOCKED_EXECUTION');
      assert.strictEqual(classification.primaryRuleId, 'BLK_REPRODUCTION_BLOCKED_001');
      assert.ok(classification.ruleExplanations[0]?.explanation.includes('blocked'));
    });

    it('precedence 2: classifies as AUTOMATION_FAILURE when browser crashed even if assertion failed', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Target page, context or browser has been closed (Browser process crashed)',
        steps: [
          {
            stepIndex: 1,
            action: 'click',
            status: 'FAILED',
            errorMessage: 'Target page, context or browser has been closed',
            assertions: [
              {
                assertionType: 'ELEMENT_TEXT',
                expectedValueJson: 'Success',
                actualValueJson: null,
                status: 'FAILED',
                errorMessage: 'Element not found',
              },
            ],
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'AUTOMATION_FAILURE');
      assert.strictEqual(classification.subcategory, 'BROWSER_CRASH');
      assert.strictEqual(classification.primaryRuleId, 'AUTO_BROWSER_CRASH_001');
    });

    it('precedence 3: classifies as ENVIRONMENT_FAILURE when target URL is unreachable (ERR_CONNECTION_REFUSED)', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/checkout',
        steps: [
          {
            stepIndex: 1,
            action: 'navigate',
            status: 'FAILED',
            errorMessage: 'net::ERR_CONNECTION_REFUSED',
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'ENVIRONMENT_FAILURE');
      assert.strictEqual(classification.subcategory, 'TARGET_UNREACHABLE');
      assert.strictEqual(classification.primaryRuleId, 'ENV_TARGET_UNREACHABLE_001');
    });

    it('precedence 4: classifies as TEST_DATA_FAILURE when required test fixture is missing', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Required test fixture "users.seed.json" is missing from data store',
        steps: [
          {
            stepIndex: 1,
            action: 'fill',
            status: 'FAILED',
            errorMessage: 'Test account does not exist: user account not found',
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'TEST_DATA_FAILURE');
      assert.strictEqual(classification.subcategory, 'MISSING_TEST_DATA');
      assert.strictEqual(classification.primaryRuleId, 'DATA_REQUIRED_FIXTURE_MISSING_001');
    });

    it('precedence 5: classifies as INVALID_TEST when test definition contains zero executable steps', async () => {
      const { failureCase } = await createFixture({
        status: 'FAILED',
        errorMessage: 'Executable test plan contains 0 executable steps',
        steps: [], // empty steps
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'INVALID_TEST');
      assert.strictEqual(classification.subcategory, 'TEST_DEFINITION_INVALID');
      assert.strictEqual(classification.primaryRuleId, 'TEST_INVALID_STEPS_001');
    });

    it('precedence 5b: classifies as REQUIREMENT_AMBIGUITY when requirement conflict is flagged', async () => {
      const { failureCase } = await createFixture({
        errorMessage:
          'Conflicting expected outcomes: requirement conflict detected between REQ-1 and REQ-2',
        steps: [
          {
            stepIndex: 1,
            action: 'click',
            status: 'FAILED',
            errorMessage: 'Requirement conflict detected',
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'REQUIREMENT_AMBIGUITY');
      assert.strictEqual(classification.subcategory, 'REQUIREMENT_INCONSISTENCY');
      assert.strictEqual(classification.primaryRuleId, 'REQ_AMBIGUITY_DETECTED_001');
    });

    it('precedence 6: classifies as APPLICATION_FAILURE when assertion fails on healthy runtime', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Assertion failed: expected $90.00 but got $100.00',
        steps: [
          {
            stepIndex: 1,
            action: 'assert',
            status: 'FAILED',
            errorMessage: 'Assertion mismatch',
            assertions: [
              {
                assertionType: 'ELEMENT_TEXT',
                expectedValueJson: '$90.00',
                actualValueJson: '$100.00',
                status: 'FAILED',
                errorMessage: 'Value mismatch on #order-total',
              },
            ],
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'APPLICATION_FAILURE');
      assert.strictEqual(classification.subcategory, 'ASSERTION_MISMATCH');
      assert.strictEqual(classification.primaryRuleId, 'APP_ASSERTION_MISMATCH_001');
      assert.strictEqual(classification.ruleExplanations[0]?.signalStrength, 'STRONG');
    });

    it('precedence 6b: classifies as APPLICATION_FAILURE when application console error occurred', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Application runtime failure in frontend script',
        metadataJson: {
          consoleErrors: [
            'Uncaught TypeError: Cannot read properties of undefined (reading "id") at app.js:42',
          ],
        },
        steps: [
          {
            stepIndex: 1,
            action: 'click',
            status: 'FAILED',
            errorMessage: 'Click failed after script error',
          },
        ],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'APPLICATION_FAILURE');
      assert.strictEqual(classification.subcategory, 'APPLICATION_CONSOLE_ERROR');
      assert.strictEqual(classification.primaryRuleId, 'APP_CONSOLE_ERROR_001');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. UNKNOWN vs INCONCLUSIVE Handling
  // ---------------------------------------------------------------------------
  describe('UNKNOWN vs INCONCLUSIVE Semantics', () => {
    it('classifies as UNKNOWN when mandatory evidence is INSUFFICIENT', async () => {
      const { failureCase } = await createFixture({
        completeness: 'INSUFFICIENT',
        errorMessage: 'Error string alone without step logs or evidence bundles',
        steps: [],
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'UNKNOWN');
      assert.strictEqual(classification.primaryRuleId, 'UNKNOWN_INSUFFICIENT_EVIDENCE_001');
    });

    it('classifies as INCONCLUSIVE when contradictory signals exist between environment unreachable and application assertion', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Expected 200 but got 500 AND net::ERR_CONNECTION_REFUSED on api endpoint',
        steps: [
          {
            stepIndex: 1,
            action: 'assert',
            status: 'FAILED',
            errorMessage: 'Assertion failed: expected OK',
            assertions: [
              {
                assertionType: 'ELEMENT_TEXT',
                expectedValueJson: 'Success',
                actualValueJson: 'Error',
                status: 'FAILED',
                errorMessage: 'Text mismatch',
              },
            ],
          },
        ],
        metadataJson: {
          networkErrors: [
            {
              url: 'http://localhost:3000/api/checkout',
              status: 503,
              error: 'net::ERR_CONNECTION_REFUSED',
            },
          ],
        },
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'INCONCLUSIVE');
      assert.strictEqual(classification.primaryRuleId, 'INCONCLUSIVE_CONTRADICTORY_SIGNALS_001');
      assert.ok(
        classification.ruleExplanations[0]?.explanation.includes('Conflicting factual signals'),
      );
    });

    it('classifies as INCONCLUSIVE when reproduction fails differently with drifted environment', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Assertion failed: expected $90 but got $100',
        reproduction: {
          status: 'NOT_REPRODUCED',
          equivalence: 'DRIFTED',
        },
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'INCONCLUSIVE');
      assert.strictEqual(classification.primaryRuleId, 'INCONCLUSIVE_CONTRADICTORY_SIGNALS_001');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Phase 76 Reproduction Integration
  // ---------------------------------------------------------------------------
  describe('Phase 76 Reproduction Integration', () => {
    it('strengthens assertion mismatch to DEFINITIVE when Phase 76 reproduction reproduced identical outcome', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Assertion mismatch on discount code calculation',
        steps: [
          {
            stepIndex: 1,
            action: 'assert',
            status: 'FAILED',
            assertions: [
              {
                assertionType: 'ELEMENT_TEXT',
                expectedValueJson: '$80.00',
                actualValueJson: '$100.00',
                status: 'FAILED',
                errorMessage: 'Value mismatch',
              },
            ],
          },
        ],
        reproduction: {
          status: 'REPRODUCED',
          equivalence: 'EXACT',
        },
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.category, 'APPLICATION_FAILURE');
      assert.strictEqual(classification.subcategory, 'ASSERTION_MISMATCH');
      const primaryExplanation = classification.ruleExplanations.find(
        e => e.ruleId === 'APP_ASSERTION_MISMATCH_001',
      );
      assert.ok(primaryExplanation);
      assert.strictEqual(primaryExplanation.signalStrength, 'DEFINITIVE');
      assert.ok(
        primaryExplanation.supportingEvidence.some(e => e.includes('reproduction confirmed')),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Versioning, Idempotency & Reclassification Auditability
  // ---------------------------------------------------------------------------
  describe('Persistence, Versioning & Reclassification', () => {
    it('persists classifier and taxonomy versions', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Timeout 30000ms exceeded while waiting for selector',
      });

      const classification = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(classification.classifierVersion, '1.0.0');
      assert.strictEqual(classification.taxonomyVersion, '1.0.0');
      assert.strictEqual(classification.isAuthoritative, true);
    });

    it('returns existing classification idempotently on repeated calls without re-evaluating', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Waiting for selector "#submit" to be visible failed',
      });

      const first = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      const second = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });

      assert.strictEqual(first.id, second.id);
      assert.strictEqual(first.createdAt, second.createdAt);
    });

    it('supports reclassification with mandatory reason and maintains audit trail lineage', async () => {
      const { failureCase } = await createFixture({
        errorMessage: 'Waiting for selector "#submit" to be visible failed',
      });

      const initial = await classifier.classify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(initial.isAuthoritative, true);

      // Reclassify
      const reclassified = await classifier.reclassify({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
        reclassificationReason:
          'Additional network evidence confirmed unreachable upstream service',
      });

      assert.notStrictEqual(initial.id, reclassified.id);
      assert.strictEqual(reclassified.isAuthoritative, true);
      assert.strictEqual(
        reclassified.reclassificationReason,
        'Additional network evidence confirmed unreachable upstream service',
      );

      // Verify prior record was superseded in database
      const priorInDb = await prisma.failureClassification.findUnique({
        where: { id: initial.id },
      });
      assert.ok(priorInDb);
      assert.strictEqual(priorInDb.isAuthoritative, false);
      assert.strictEqual(priorInDb.supersededById, reclassified.id);

      // List history
      const history = await classifier.listClassificationHistory({
        projectId: testProjectId,
        failureCaseId: failureCase.id,
      });
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0]?.id, reclassified.id);
      assert.strictEqual(history[1]?.id, initial.id);
    });
  });
});
