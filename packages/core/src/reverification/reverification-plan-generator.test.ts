/**
 * @file packages/core/src/reverification/reverification-plan-generator.test.ts
 * Unit tests for reverification plan generation without browser execution (V7 Phase 97).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReverificationPlanGenerator } from './reverification-plan-generator.js';
import type {
  HistoricalProvenanceResult,
  FixProvenanceResult,
  EnvironmentSafetyResult,
} from './reverification-types.js';
import type { ProjectEnvironment } from '@prisma/client';

describe('ReverificationPlanGenerator (Phase 97)', () => {
  const generator = new ReverificationPlanGenerator();

  const historical: HistoricalProvenanceResult = {
    failureCaseId: '00000000-0000-0000-0000-000000000010',
    failureAnalysisId: null,
    bugReportId: '00000000-0000-0000-0000-000000000020',
    externalIssueLinkId: null,
    originalTestRunId: '00000000-0000-0000-0000-000000000030',
    originalExecutionId: '00000000-0000-0000-0000-000000000040',
    originalTestCaseId: '00000000-0000-0000-0000-000000000050',
    originalTestCaseVersionId: '00000000-0000-0000-0000-000000000060',
    originalTestCaseVersionNumber: 2,
    originalTitle: 'Invalid Login Returns 401',
    originalSteps: [
      { id: 's1', stepNumber: 1, action: 'NAVIGATE to /login' },
      {
        id: 's2',
        stepNumber: 2,
        action: 'FILL #username with invalid',
        expectedResult: 'Username filled',
      },
      {
        id: 's3',
        stepNumber: 3,
        action: 'CLICK #submit',
        expectedResult: 'Invalid credentials rejected',
      },
    ],
    originalEnvironmentId: '00000000-0000-0000-0000-000000000070',
    requirementId: '00000000-0000-0000-0000-000000000080',
    requirementKey: 'REQ-AUTH-01',
    requirementVersionId: null,
    requirementVersionNumber: 1,
    failureSignature: 'SIG-AUTH-500',
    failedStepIndex: 3,
    failedStepAction: 'CLICK #submit',
    expectedResult: 'Invalid credentials rejected with error banner.',
    actualResult: 'Server returned 500 Internal Server Error.',
    errorMessage: 'HTTP 500 Internal Server Error',
  };

  const fix: FixProvenanceResult = {
    fixReference: 'commit:abcdef123456',
    commitSha: 'abcdef123456',
    branch: 'fix/auth-500',
    pullRequestUrl: 'https://github.com/org/repo/pull/42',
    source: 'GIT_COMMIT',
    isKnown: true,
    rawDetails: {},
  };

  const environment: ProjectEnvironment = {
    id: '00000000-0000-0000-0000-000000000090',
    projectId: '00000000-0000-0000-0000-000000000001',
    targetApplicationId: null,
    name: 'Staging Test Env',
    type: 'STAGING',
    baseUrl: 'https://staging.example.com',
    apiUrl: null,
    isDefault: false,
    isEnabled: true,
    isProduction: false,
    productionSafetyPolicy: 'SAFE_MODE',
    browserEngine: 'chromium',
    headless: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    ignoreHttpsErrors: false,
    permissions: [],
    extraHeaders: null,
    variables: null,
    secretReferences: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const safetyResult: EnvironmentSafetyResult = {
    isSafe: true,
    safetyStatus: 'SAFE',
    safetyReason: 'Target environment allows execution.',
    isProduction: false,
    policy: 'SAFE_MODE',
    mutatingStepIndices: [],
    detectedMutatingKeywords: [],
  };

  it('generates an execution-ready plan preserving historical test version', () => {
    const plan = generator.generatePlan({
      reverificationId: '00000000-0000-0000-0000-000000000999',
      historicalProvenance: historical,
      fixProvenance: fix,
      targetEnvironment: environment,
      safetyResult,
    });

    assert.equal(plan.reverificationId, '00000000-0000-0000-0000-000000000999');
    assert.equal(plan.testExecutionSpec.testCaseVersionNumber, 2);
    assert.equal(plan.testExecutionSpec.historicalTestVersionPreserved, true);
    assert.equal(plan.originalFailureBaseline.failureSignature, 'SIG-AUTH-500');
    assert.equal(plan.originalFailureBaseline.failedStepIndex, 3);
    assert.match(plan.expectedFixVerificationCondition.expectedCorrection, /Step 3/);
    assert.equal(plan.evidenceRequirements.captureScreenshots, true);
    assert.equal(plan.evidenceRequirements.captureTrace, true);
  });

  it('accurately reflects explicit selection of a newer test case version', () => {
    const plan = generator.generatePlan({
      reverificationId: '00000000-0000-0000-0000-000000000999',
      historicalProvenance: historical,
      fixProvenance: fix,
      targetEnvironment: environment,
      safetyResult,
      selectedTestCaseVersionNumber: 4,
      testVersionSelectionReason: 'Reverifying against updated auth flow specification v4',
    });

    assert.equal(plan.testExecutionSpec.testCaseVersionNumber, 4);
    assert.equal(plan.testExecutionSpec.historicalTestVersionPreserved, false);
    // Baseline still records the original failure!
    assert.equal(plan.originalFailureBaseline.failedStepIndex, 3);
  });
});
