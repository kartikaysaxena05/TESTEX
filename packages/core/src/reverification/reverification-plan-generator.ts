/**
 * @file packages/core/src/reverification/reverification-plan-generator.ts
 * Generates deterministic execution-ready reverification plans without browser execution.
 */

import type { ProjectEnvironment } from '@prisma/client';
import type {
  HistoricalProvenanceResult,
  FixProvenanceResult,
  EnvironmentSafetyResult,
  ReverificationPlanStructure,
} from './reverification-types.js';

export interface PlanGenerationInput {
  readonly reverificationId: string;
  readonly historicalProvenance: HistoricalProvenanceResult;
  readonly fixProvenance: FixProvenanceResult;
  readonly targetEnvironment: ProjectEnvironment;
  readonly safetyResult: EnvironmentSafetyResult;
  readonly selectedTestCaseVersionNumber?: number;
  readonly testVersionSelectionReason?: string;
}

export class ReverificationPlanGenerator {
  /**
   * Constructs an immutable, deterministic execution plan for Phase 98 execution.
   */
  public generatePlan(input: PlanGenerationInput): ReverificationPlanStructure {
    const {
      reverificationId,
      historicalProvenance,
      targetEnvironment,
      safetyResult,
      selectedTestCaseVersionNumber,
    } = input;

    const selectedVersion =
      selectedTestCaseVersionNumber ?? historicalProvenance.originalTestCaseVersionNumber;
    const isHistoricalPreserved =
      selectedVersion === historicalProvenance.originalTestCaseVersionNumber;

    const failedStep = historicalProvenance.failedStepIndex;
    const originalAction = historicalProvenance.failedStepAction ?? 'unknown action';

    const expectedCorrection = failedStep
      ? `Step ${failedStep} ('${originalAction}') must succeed without error and satisfy assertion: ${historicalProvenance.expectedResult}`
      : `Test case must complete all ${historicalProvenance.originalSteps.length} steps successfully without triggering error: ${historicalProvenance.errorMessage || historicalProvenance.actualResult}`;

    return {
      reverificationId,
      failureCaseId: historicalProvenance.failureCaseId,
      bugReportId: historicalProvenance.bugReportId,
      originalExecutionId: historicalProvenance.originalExecutionId,
      originalFailureBaseline: {
        failureSignature: historicalProvenance.failureSignature,
        triggeringStatus: 'FAILED',
        failedStepIndex: historicalProvenance.failedStepIndex,
        failedStepAction: historicalProvenance.failedStepAction,
        expectedResult: historicalProvenance.expectedResult,
        actualResult: historicalProvenance.actualResult,
        environmentId: historicalProvenance.originalEnvironmentId,
      },
      expectedFixVerificationCondition: {
        description: `Verify that defect '${historicalProvenance.originalTitle}' is resolved in target environment '${targetEnvironment.name}'.`,
        originalFailedStepIndex: historicalProvenance.failedStepIndex,
        originalFailureSignature: historicalProvenance.failureSignature,
        expectedCorrection,
      },
      testExecutionSpec: {
        testCaseId: historicalProvenance.originalTestCaseId,
        testCaseVersionNumber: selectedVersion,
        historicalTestVersionPreserved: isHistoricalPreserved,
        title: historicalProvenance.originalTitle,
        steps: historicalProvenance.originalSteps.map(s => ({
          stepNumber: s.stepNumber,
          action: s.action,
          expectedResult: s.expectedResult || null,
        })),
      },
      targetEnvironment: {
        id: targetEnvironment.id,
        name: targetEnvironment.name,
        baseUrl: targetEnvironment.baseUrl,
        isProduction: targetEnvironment.isProduction,
        browserEngine: targetEnvironment.browserEngine || 'chromium',
      },
      evidenceRequirements: {
        captureScreenshots: true,
        captureConsoleLogs: true,
        captureNetworkRequests: true,
        captureDomSnapshots: true,
        captureTrace: true,
      },
      safetyPolicy: {
        isSafe: safetyResult.isSafe,
        safetyStatus: safetyResult.safetyStatus,
        reason: safetyResult.safetyReason,
      },
    };
  }
}
