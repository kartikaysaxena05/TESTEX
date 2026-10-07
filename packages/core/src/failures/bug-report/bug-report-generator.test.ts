/**
 * @file packages/core/src/failures/bug-report/bug-report-generator.test.ts
 * Unit tests for BugReportGenerator (V6 Phase 87).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BugReportGenerator } from './bug-report-generator.js';
import type { StructuredBugReportFacts } from './bug-report-types.js';

function createFullFacts(): StructuredBugReportFacts {
  return {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    analysisRunId: '33333333-3333-3333-3333-333333333333',
    failureCase: {
      id: '22222222-2222-2222-2222-222222222222',
      projectId: '11111111-1111-1111-1111-111111111111',
      executionId: 'exec-1234',
      title: 'Checkout payment submission fails with 500',
      failureSummary:
        'POST /api/v1/checkout returns HTTP 500 with unhandled NullReferenceException',
      metadataJson: {},
      status: 'OPEN',
      createdAt: new Date('2026-09-08T10:00:00Z'),
      updatedAt: new Date('2026-09-08T10:00:00Z'),
    },
    project: {
      id: '11111111-1111-1111-1111-111111111111',
      key: 'ECOM',
      name: 'E-Commerce Platform',
    },
    testExecution: {
      id: 'exec-1234',
      testCaseId: 'tc-checkout-01',
      testCaseVersionNumber: 3,
      status: 'FAILED',
      errorMessage: 'Expected 200 OK but received 500 Internal Server Error',
      errorStack: 'Error at OrderService.ts:42',
      startedAt: new Date('2026-09-08T09:59:00Z'),
      completedAt: new Date('2026-09-08T10:00:00Z'),
      environmentId: 'env-staging',
      environmentSnapshotJson: { baseUrl: 'https://staging.example.com', os: 'linux' },
      browserConfigJson: { browserEngine: 'chromium', viewport: { width: 1280, height: 720 } },
      executableTestPlanId: 'plan-checkout-v3',
      stepExecutions: [
        {
          id: 'step-1',
          stepIndex: 1,
          actionType: 'NAVIGATE',
          targetSummary: 'https://staging.example.com/cart',
          actionDataJson: JSON.stringify({ url: 'https://staging.example.com/cart' }),
          expectedSummary: 'Cart page rendered',
          actualSummary: 'Cart page loaded successfully',
          status: 'PASSED',
          errorMessage: null,
          durationMs: 450,
          screenshotPath: 'artifacts/step1.png',
        },
        {
          id: 'step-2',
          stepIndex: 2,
          actionType: 'CLICK',
          targetSummary: 'button#btn-checkout',
          actionDataJson: null,
          expectedSummary: 'Checkout modal opens',
          actualSummary: 'Modal visible',
          status: 'PASSED',
          errorMessage: null,
          durationMs: 200,
          screenshotPath: 'artifacts/step2.png',
        },
        {
          id: 'step-3',
          stepIndex: 3,
          actionType: 'CLICK',
          targetSummary: 'button#submit-order',
          actionDataJson: JSON.stringify({ token: 'tok_live_secret12345' }),
          expectedSummary: 'Order confirmation page displayed with orderId',
          actualSummary: 'Server returned 500 Internal Server Error',
          status: 'FAILED',
          errorMessage: 'Request failed with status code 500',
          durationMs: 1200,
          screenshotPath: 'artifacts/step3-fail.png',
        },
      ],
    },
    testCase: {
      id: 'tc-checkout-01',
      key: 'TC-ECOM-042',
      title: 'Submit order with valid credit card payment',
      version: 3,
      preconditions: [
        'User logged in with verified account',
        'Shopping cart contains at least one item',
      ],
      overallExpectedResult: 'Order confirmation page displayed with valid orderId',
      sourceRequirementId: 'req-checkout-flow',
      sourceRequirementKey: 'REQ-CHECKOUT-01',
      sourceRequirementVersionNumber: 2,
    },
    requirement: {
      id: 'req-checkout-flow',
      key: 'REQ-CHECKOUT-01',
      title: 'Secure Checkout and Payment Flow',
      version: 2,
    },
    evidenceReferences: [
      {
        id: 'ev-1',
        evidenceType: 'SCREENSHOT',
        filePath: 'artifacts/checkout-fail.png',
        sha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
        byteSize: 104857,
        mimeType: 'image/png',
        integrityStatus: 'VERIFIED',
        description: 'Screenshot of 500 error toast',
      },
      {
        id: 'ev-2',
        evidenceType: 'NETWORK_HAR',
        filePath: 'artifacts/network.har',
        sha256: 'b2c3d4e5f6a10000000000000000000000000000000000000000000000000000',
        byteSize: 52428,
        mimeType: 'application/json',
        integrityStatus: 'VERIFIED',
        description: 'HAR network trace',
      },
    ],
    reproductionSummary: {
      status: 'REPRODUCED',
      attemptCount: 3,
      reproducedCount: 3,
      environmentalSensitivity: null,
    },
    classification: {
      category: 'PRODUCT_DEFECT',
      confidence: 1.0,
      rationale: 'Deterministic classification rules matched',
    },
    flakiness: {
      flakinessState: 'STABLE_FAILURE',
      overallScore: 0.0,
      isFlaky: false,
    },
    domainSeparation: {
      domain: 'APPLICATION_DEFECT_CANDIDATE',
      rationale: 'Backend server returned unhandled 500',
      confidenceScore: 0.95,
    },
    technicalLocalization: {
      probableLayer: 'BACKEND_SERVICE',
      probableComponent: 'OrderProcessingService',
      localizationSummary: 'Exception raised in OrderProcessingService.ts:145',
      primaryFailurePoint: 'src/services/OrderProcessingService.ts',
    },
    aiAssessment: {
      defectSummary: 'NullReferenceException in payment confirmation handler',
      probableRootCause: 'Payment gateway response missing transactionId property',
      aiConfidence: 0.92,
    },
    rootCauseAnalysis: {
      rootCauseHypothesis:
        'Payment gateway payload omitted transactionId causing NullReferenceException',
      epistemicStatus: 'SUPPORTED_HYPOTHESIS',
      plausibilityScore: 0.88,
      isPrimaryCandidate: true,
      contributingFactors: [
        'Missing null check on payment payload',
        'Third-party API schema change',
      ],
    },
    impactAssessment: {
      assessedSeverity: 'CRITICAL',
      assessedPriority: 'P0_IMMEDIATE',
      businessImpact: 'Users unable to complete purchases resulting in revenue loss',
      userImpact: 'Checkout process broken for all credit card users',
      severityConfidence: 0.95,
      priorityConfidence: 0.95,
    },
    clusterMembership: {
      clusterId: 'cluster-checkout-500',
      clusterKey: 'CLUST-ECOM-001',
      clusterTitle: 'Checkout 500 NullReferenceException Failures',
      clusterSize: 4,
    },
    confidenceAssessment: {
      calibratedScore: 0.94,
      confidenceBand: 'VERY_HIGH',
      explanation:
        'Autonomous reproduction confirmed 3/3; HAR network evidence verified; root cause localized to OrderProcessingService',
    },
  };
}

test('BugReportGenerator Test Suite', async t => {
  const generator = new BugReportGenerator();

  await t.test('generates complete structured bug report from full multi-phase facts', () => {
    const facts = createFullFacts();
    const result = generator.generate(facts, {
      reportNumber: 'BUG-000001',
      revision: 1,
    });

    // Check Eligibility & Defect State
    assert.equal(result.defectState, 'CONFIRMED_APPLICATION_DEFECT');
    assert.equal(result.isApplicationDefect, true);

    // Check Title & Summary
    assert.ok(result.title.includes('[CONFIRMED_APPLICATION_DEFECT]'));
    assert.ok(result.title.includes('TC-ECOM-042'));
    assert.ok(result.summary.includes('CONFIRMED_APPLICATION_DEFECT'));

    // Check Traceability
    assert.equal(result.requirementKey, 'REQ-CHECKOUT-01');
    assert.equal(result.requirementVersion, 2);
    assert.equal(result.testCaseKey, 'TC-ECOM-042');
    assert.equal(result.testCaseVersion, 3);
    assert.equal(result.executionPlanId, 'plan-checkout-v3');
    assert.equal(result.preconditions.length, 2);

    // Check Reproduction Steps
    assert.equal(result.reproductionSteps.length, 3);
    assert.equal(result.failedStepIndex, 3);
    assert.equal(result.reproductionSteps[2]?.isFailureStep, true);
    assert.equal(result.reproductionSteps[2]?.status, 'FAILED');

    // Check Expected vs Actual
    assert.ok(result.expectedBehavior.includes('Order confirmation page'));
    assert.ok(result.actualBehavior.includes('500'));

    // Check Root Cause Hypothesis (Epistemic classification)
    assert.ok(result.rootCauseHypothesis?.startsWith('[SUPPORTED_HYPOTHESIS]'));
    assert.ok(result.rootCauseHypothesis?.includes('Payment gateway payload'));

    // Check Triage Metadata
    assert.equal(result.probableLayer, 'BACKEND_SERVICE');
    assert.equal(result.probableComponent, 'OrderProcessingService');
    assert.equal(result.severity, 'CRITICAL');
    assert.equal(result.priority, 'P0_IMMEDIATE');
    assert.equal(result.clusterKey, 'CLUST-ECOM-001');
    assert.equal(result.clusterMemberCount, 4);
    assert.equal(result.calibratedScore, 0.94);

    // Check Evidence References
    assert.equal(result.evidenceReferences.length, 2);
    assert.equal(result.evidenceReferences[0]?.integrityStatus, 'VERIFIED');

    // Check Markdown Report
    assert.ok(result.reportMarkdown.includes('# BUG-000001 (Rev 1)'));
    assert.ok(result.reportMarkdown.includes('## Triage & Classification Overview'));
    assert.ok(result.reportMarkdown.includes('## Requirement-to-Test Traceability'));
    assert.ok(result.reportMarkdown.includes('## Step-by-Step Reproduction Procedure'));
    assert.ok(result.reportMarkdown.includes('## Expected vs. Actual Behavior'));
    assert.ok(result.reportMarkdown.includes('## Root-Cause Hypothesis & Technical Localization'));
    assert.ok(result.reportMarkdown.includes('## Evidence Artifacts & Verification'));
    assert.ok(result.reportMarkdown.includes('## Known Limitations & Epistemic Boundaries'));

    // Check Fingerprint
    assert.ok(result.reportFingerprint);
    assert.equal(result.reportFingerprint.length, 64);
  });

  await t.test('handles missing step telemetry gracefully without fabricating steps', () => {
    const facts = createFullFacts();
    (facts.testExecution as any).stepExecutions = [];

    const result = generator.generate(facts, {
      reportNumber: 'BUG-000002',
      revision: 1,
    });

    assert.equal(result.reproductionSteps.length, 0);
    assert.equal(result.failedStepIndex, null);
    assert.ok(
      result.limitationsAndUnknowns.some(lim =>
        lim.includes('Step-level telemetry was not captured'),
      ),
    );
    assert.ok(result.reportMarkdown.includes('No step execution records recorded'));
  });

  await t.test('redacts sensitive secrets from step inputs and action data', () => {
    const facts = createFullFacts();
    const result = generator.generate(facts, {
      reportNumber: 'BUG-000003',
      revision: 1,
    });

    // Verify step 3 token was sanitized
    const step3 = result.reproductionSteps[2];
    assert.ok(step3);
    assert.ok(!step3.description.includes('secret12345'));
    assert.ok(step3.description.includes('[REDACTED]') || step3.description.includes('***'));

    // Verify markdown report does not contain the raw secret
    assert.ok(!result.reportMarkdown.includes('secret12345'));
  });

  await t.test('respects titleOverride when provided and sanitizes it', () => {
    const facts = createFullFacts();
    const result = generator.generate(facts, {
      reportNumber: 'BUG-000004',
      revision: 1,
      titleOverride: 'Custom Critical Defect Title for Triage',
    });

    assert.equal(result.title, 'Custom Critical Defect Title for Triage');
    assert.ok(result.reportMarkdown.includes('Custom Critical Defect Title for Triage'));
  });

  await t.test('computes deterministic fingerprint for identical inputs', () => {
    const facts1 = createFullFacts();
    const facts2 = createFullFacts();

    const res1 = generator.generate(facts1, { reportNumber: 'BUG-000005', revision: 1 });
    const res2 = generator.generate(facts2, { reportNumber: 'BUG-000005', revision: 1 });

    assert.equal(res1.reportFingerprint, res2.reportFingerprint);
  });
});
