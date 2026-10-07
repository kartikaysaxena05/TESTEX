/**
 * @file packages/core/src/reverification/reverification-types.ts
 * Domain types and interfaces for Defect Reverification Foundation (V7 Phase 97).
 */

import type {
  ReverificationStatusDto,
  ReverificationEligibilityDto,
  ReverificationTriggerTypeDto,
  DefectReverificationDto,
  ReverificationAuditEventDto,
  EvaluateReverificationEligibilityInputDto,
  EvaluateReverificationEligibilityOutputDto,
  CreateReverificationRequestInputDto,
  GenerateReverificationPlanInputDto,
  CancelReverificationInputDto,
  ListReverificationAuditEventsInputDto,
  GetReverificationStateInputDto,
} from '@ai-quality/contracts';

export type {
  ReverificationStatusDto,
  ReverificationEligibilityDto,
  ReverificationTriggerTypeDto,
  DefectReverificationDto,
  ReverificationAuditEventDto,
  EvaluateReverificationEligibilityInputDto,
  EvaluateReverificationEligibilityOutputDto,
  CreateReverificationRequestInputDto,
  GenerateReverificationPlanInputDto,
  CancelReverificationInputDto,
  ListReverificationAuditEventsInputDto,
  GetReverificationStateInputDto,
};

export interface HistoricalProvenanceResult {
  readonly failureCaseId: string;
  readonly failureAnalysisId: string | null;
  readonly bugReportId: string | null;
  readonly externalIssueLinkId: string | null;
  readonly originalTestRunId: string;
  readonly originalExecutionId: string;
  readonly originalTestCaseId: string;
  readonly originalTestCaseVersionId: string | null;
  readonly originalTestCaseVersionNumber: number;
  readonly originalTitle: string;
  readonly originalSteps: ReadonlyArray<{
    readonly id: string;
    readonly stepNumber: number;
    readonly action: string;
    readonly expectedResult?: string | null;
  }>;
  readonly originalEnvironmentId: string | null;
  readonly requirementId: string | null;
  readonly requirementKey: string | null;
  readonly requirementVersionId: string | null;
  readonly requirementVersionNumber: number | null;
  readonly failureSignature: string | null;
  readonly failedStepIndex: number | null;
  readonly failedStepAction: string | null;
  readonly expectedResult: string;
  readonly actualResult: string;
  readonly errorMessage: string | null;
}

export interface FixProvenanceResult {
  readonly fixReference: string | null;
  readonly commitSha: string | null;
  readonly branch: string | null;
  readonly pullRequestUrl: string | null;
  readonly source: 'JIRA_STATUS_CHANGE' | 'GIT_COMMIT' | 'MANUAL' | 'UNKNOWN';
  readonly isKnown: boolean;
  readonly rawDetails: Record<string, unknown>;
}

export interface EnvironmentSafetyResult {
  readonly isSafe: boolean;
  readonly safetyStatus: string;
  readonly safetyReason: string | null;
  readonly isProduction: boolean;
  readonly policy: string;
  readonly mutatingStepIndices: readonly number[];
  readonly detectedMutatingKeywords: readonly string[];
}

export interface ReverificationPlanStructure {
  readonly reverificationId: string;
  readonly failureCaseId: string;
  readonly bugReportId: string | null;
  readonly originalExecutionId: string;
  readonly originalFailureBaseline: {
    readonly failureSignature: string | null;
    readonly triggeringStatus: string;
    readonly failedStepIndex: number | null;
    readonly failedStepAction: string | null;
    readonly expectedResult: string;
    readonly actualResult: string;
    readonly environmentId: string | null;
  };
  readonly expectedFixVerificationCondition: {
    readonly description: string;
    readonly originalFailedStepIndex: number | null;
    readonly originalFailureSignature: string | null;
    readonly expectedCorrection: string;
  };
  readonly testExecutionSpec: {
    readonly testCaseId: string;
    readonly testCaseVersionNumber: number;
    readonly historicalTestVersionPreserved: boolean;
    readonly title: string;
    readonly steps: ReadonlyArray<{
      readonly stepNumber: number;
      readonly action: string;
      readonly expectedResult?: string | null;
    }>;
  };
  readonly targetEnvironment: {
    readonly id: string;
    readonly name: string;
    readonly baseUrl: string | null;
    readonly isProduction: boolean;
    readonly browserEngine: string;
  };
  readonly evidenceRequirements: {
    readonly captureScreenshots: boolean;
    readonly captureConsoleLogs: boolean;
    readonly captureNetworkRequests: boolean;
    readonly captureDomSnapshots: boolean;
    readonly captureTrace: boolean;
  };
  readonly safetyPolicy: {
    readonly isSafe: boolean;
    readonly safetyStatus: string;
    readonly reason: string | null;
  };
}

export interface IDefectReverificationService {
  getState(input: GetReverificationStateInputDto): Promise<DefectReverificationDto | null>;
  evaluateEligibility(
    input: EvaluateReverificationEligibilityInputDto,
  ): Promise<EvaluateReverificationEligibilityOutputDto>;
  createRequest(input: CreateReverificationRequestInputDto): Promise<DefectReverificationDto>;
  generatePlan(input: GenerateReverificationPlanInputDto): Promise<DefectReverificationDto>;
  cancel(input: CancelReverificationInputDto): Promise<DefectReverificationDto>;
  listAuditEvents(
    input: ListReverificationAuditEventsInputDto,
  ): Promise<readonly ReverificationAuditEventDto[]>;
}
