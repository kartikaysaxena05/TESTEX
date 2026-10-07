/**
 * @file packages/core/src/reverification/reverification-eligibility-engine.test.ts
 * Unit tests for the 11 factual eligibility criteria (V7 Phase 97).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReverificationEligibilityEngine } from './reverification-eligibility-engine.js';
import type { HistoricalProvenanceResult } from './reverification-types.js';
import type { ProjectEnvironment } from '@prisma/client';

describe('ReverificationEligibilityEngine (Phase 97)', () => {
  const projectId = '00000000-0000-0000-0000-000000000001';
  const failureCaseId = '00000000-0000-0000-0000-000000000010';

  const validHistorical: HistoricalProvenanceResult = {
    failureCaseId,
    failureAnalysisId: null,
    bugReportId: '00000000-0000-0000-0000-000000000020',
    externalIssueLinkId: null,
    originalTestRunId: 'run-1',
    originalExecutionId: 'exec-1',
    originalTestCaseId: 'tc-1',
    originalTestCaseVersionId: 'ver-1',
    originalTestCaseVersionNumber: 1,
    originalTitle: 'Test Case Title',
    originalSteps: [
      { id: 's1', stepNumber: 1, action: 'NAVIGATE /login' },
      { id: 's2', stepNumber: 2, action: 'ASSERT_VISIBLE #logo' },
    ],
    originalEnvironmentId: 'env-1',
    requirementId: 'req-1',
    requirementKey: 'REQ-01',
    requirementVersionId: null,
    requirementVersionNumber: 1,
    failureSignature: 'SIG-01',
    failedStepIndex: 2,
    failedStepAction: 'ASSERT_VISIBLE #logo',
    expectedResult: 'Logo visible',
    actualResult: 'Logo missing',
    errorMessage: 'Element not found',
  };

  const validEnv: ProjectEnvironment = {
    id: '00000000-0000-0000-0000-000000000099',
    projectId,
    targetApplicationId: null,
    name: 'Dev Environment',
    type: 'DEVELOPMENT',
    baseUrl: 'http://localhost:3000',
    apiUrl: null,
    isDefault: true,
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

  it('evaluates a compliant defect as ELIGIBLE', async () => {
    const mockPrisma: any = {
      project: { findUnique: async () => ({ id: projectId, status: 'ACTIVE' }) },
      bugWorkflowState: { findUnique: async () => ({ currentStatus: 'RESOLVED' }) },
      structuredBugReport: {
        findUnique: async () => ({ id: 'bug-1', isAuthoritative: true, supersededById: null }),
      },
      defectReverification: { findFirst: async () => null },
    };

    const engine = new ReverificationEligibilityEngine(mockPrisma);
    const result = await engine.evaluateEligibility({
      projectId,
      failureCaseId,
      historicalProvenance: validHistorical,
      targetEnvironment: validEnv,
    });

    assert.equal(result.eligibility, 'ELIGIBLE');
    assert.equal(result.safetyStatus, 'SAFE');
    assert.ok(
      result.reasons.some(r => r.includes('All 11 factual eligibility criteria satisfied')),
    );
  });

  it('evaluates defect as NOT_ELIGIBLE if workflow state is WONT_FIX', async () => {
    const mockPrisma: any = {
      project: { findUnique: async () => ({ id: projectId, status: 'ACTIVE' }) },
      bugWorkflowState: { findUnique: async () => ({ currentStatus: 'WONT_FIX' }) },
      structuredBugReport: {
        findUnique: async () => ({ id: 'bug-1', isAuthoritative: true, supersededById: null }),
      },
      defectReverification: { findFirst: async () => null },
    };

    const engine = new ReverificationEligibilityEngine(mockPrisma);
    const result = await engine.evaluateEligibility({
      projectId,
      failureCaseId,
      historicalProvenance: validHistorical,
      targetEnvironment: validEnv,
    });

    assert.equal(result.eligibility, 'NOT_ELIGIBLE');
    assert.ok(result.reasons.some(r => r.includes('WONT_FIX')));
  });

  it('evaluates defect as BLOCKED if target environment violates production safety', async () => {
    const prodEnv: ProjectEnvironment = {
      ...validEnv,
      isProduction: true,
      productionSafetyPolicy: 'PROHIBITED',
    };

    const mockPrisma: any = {
      project: { findUnique: async () => ({ id: projectId, status: 'ACTIVE' }) },
      bugWorkflowState: { findUnique: async () => ({ currentStatus: 'RESOLVED' }) },
      structuredBugReport: {
        findUnique: async () => ({ id: 'bug-1', isAuthoritative: true, supersededById: null }),
      },
      defectReverification: { findFirst: async () => null },
    };

    const engine = new ReverificationEligibilityEngine(mockPrisma);
    const result = await engine.evaluateEligibility({
      projectId,
      failureCaseId,
      historicalProvenance: validHistorical,
      targetEnvironment: prodEnv,
    });

    assert.equal(result.eligibility, 'BLOCKED');
    assert.equal(result.safetyStatus, 'BLOCKED');
    assert.equal(result.isProductionBlocked, true);
    assert.ok(result.reasons.some(r => r.includes('PROHIBITED')));
  });

  it('evaluates defect as BLOCKED if an active execution is already in progress', async () => {
    const mockPrisma: any = {
      project: { findUnique: async () => ({ id: projectId, status: 'ACTIVE' }) },
      bugWorkflowState: { findUnique: async () => ({ currentStatus: 'RESOLVED' }) },
      structuredBugReport: {
        findUnique: async () => ({ id: 'bug-1', isAuthoritative: true, supersededById: null }),
      },
      defectReverification: {
        findFirst: async () => ({ id: 'active-run-1', status: 'EXECUTING' }),
      },
    };

    const engine = new ReverificationEligibilityEngine(mockPrisma);
    const result = await engine.evaluateEligibility({
      projectId,
      failureCaseId,
      historicalProvenance: validHistorical,
      targetEnvironment: validEnv,
    });

    assert.equal(result.eligibility, 'BLOCKED');
    assert.ok(result.reasons.some(r => r.includes('already currently in progress')));
  });
});
