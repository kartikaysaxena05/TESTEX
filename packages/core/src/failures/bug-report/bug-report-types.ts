/**
 * @file packages/core/src/failures/bug-report/bug-report-types.ts
 * Type definitions, bounds, and service interfaces for V6 Phase 87:
 * Structured Bug Report Generation & Failure Intelligence Workspace.
 */

import type {
  BugReportStatusDto,
  ApplicationDefectStateDto,
  DerivedReproductionStepDto,
  ReportEvidenceReferenceDto,
  StructuredBugReportDto,
  CreateBugReportInputDto,
  GetBugReportInputDto,
  ListBugReportsInputDto,
  RegenerateBugReportInputDto,
  ListBugReportHistoryInputDto,
} from '@ai-quality/contracts';

export type {
  BugReportStatusDto,
  ApplicationDefectStateDto,
  DerivedReproductionStepDto,
  ReportEvidenceReferenceDto,
  StructuredBugReportDto,
  CreateBugReportInputDto,
  GetBugReportInputDto,
  ListBugReportsInputDto,
  RegenerateBugReportInputDto,
  ListBugReportHistoryInputDto,
};

/**
 * System-wide bounds, constants, and limits for Structured Bug Reports.
 */
export const BUG_REPORT_BOUNDS = {
  GENERATOR_VERSION: '1.0.0',
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  MAX_TITLE_LENGTH: 256,
  MAX_SUMMARY_LENGTH: 5000,
  MAX_REASON_LENGTH: 1000,
  MAX_LIMITATIONS: 50,
  MAX_PRECONDITIONS: 50,
  MAX_REPRODUCTION_STEPS: 200,
  MAX_REVISION: 1000,
} as const;

/**
 * Result of evaluating failure eligibility for application defect status.
 */
export interface EligibilityEvaluationResult {
  readonly defectState: ApplicationDefectStateDto;
  readonly isApplicationDefect: boolean;
  readonly eligibilityReason: string;
  readonly decisionEvidence: readonly string[];
}

/**
 * Comprehensive facts assembled from Phases 74–86 to build a structured bug report.
 */
export interface StructuredBugReportFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly analysisRunId?: string | null;

  // Failure Case & Project Facts
  readonly failureCase: {
    readonly id: string;
    readonly projectId: string;
    readonly executionId: string;
    readonly title: string;
    readonly failureSummary: string | null;
    readonly metadataJson?: Record<string, unknown> | null;
    readonly status: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly project: {
    readonly id: string;
    readonly key: string;
    readonly name: string;
  };

  // Phase 74 / Test Execution Facts
  readonly testExecution: {
    readonly id: string;
    readonly testCaseId: string;
    readonly testCaseVersionNumber: number;
    readonly status: string;
    readonly errorMessage: string | null;
    readonly errorStack: string | null;
    readonly startedAt: Date;
    readonly completedAt: Date | null;
    readonly environmentId: string | null;
    readonly environmentSnapshotJson?: Record<string, unknown> | null;
    readonly browserConfigJson?: Record<string, unknown> | null;
    readonly executableTestPlanId?: string | null;
    readonly stepExecutions: readonly {
      readonly id: string;
      readonly stepIndex: number;
      readonly actionType: string;
      readonly targetSummary: string | null;
      readonly actionDataJson: string | null;
      readonly expectedSummary: string | null;
      readonly actualSummary: string | null;
      readonly status: string;
      readonly errorMessage: string | null;
      readonly durationMs: number | null;
      readonly screenshotPath: string | null;
    }[];
  };

  // Test Case & Requirement Versioned Traceability Facts
  readonly testCase?: {
    readonly id: string;
    readonly key: string;
    readonly title: string;
    readonly version: number;
    readonly preconditions: readonly string[];
    readonly overallExpectedResult: string | null;
    readonly sourceRequirementId: string | null;
    readonly sourceRequirementKey: string | null;
    readonly sourceRequirementVersionNumber: number | null;
  } | null;

  readonly requirement?: {
    readonly id: string;
    readonly key: string;
    readonly title: string;
    readonly version: number;
  } | null;

  // Phase 75: Evidence Package & References
  readonly evidenceReferences: readonly ReportEvidenceReferenceDto[];

  // Phase 76: Reproduction Summary
  readonly reproductionSummary?: {
    readonly status: string; // 'REPRODUCED' | 'NOT_REPRODUCED' | 'INCONCLUSIVE' | etc.
    readonly attemptCount: number;
    readonly reproducedCount: number;
    readonly environmentalSensitivity: string | null;
  } | null;

  // Phase 77 / 78: Classification Facts
  readonly classification?: {
    readonly category: string;
    readonly confidence: number;
    readonly rationale: string;
  } | null;

  // Phase 79: Flakiness Facts
  readonly flakiness?: {
    readonly flakinessState: string;
    readonly overallScore: number;
    readonly isFlaky: boolean;
  } | null;

  // Phase 80: Domain Separation Facts
  readonly domainSeparation?: {
    readonly domain: string;
    readonly rationale: string;
    readonly confidenceScore: number;
  } | null;

  // Phase 81: Technical Cause Localization
  readonly technicalLocalization?: {
    readonly probableLayer: string | null;
    readonly probableComponent: string | null;
    readonly localizationSummary: string | null;
    readonly primaryFailurePoint: string | null;
  } | null;

  // Phase 82: AI Assessment
  readonly aiAssessment?: {
    readonly defectSummary: string | null;
    readonly probableRootCause: string | null;
    readonly aiConfidence: number | null;
  } | null;

  // Phase 83: Root Cause Analysis
  readonly rootCauseAnalysis?: {
    readonly rootCauseHypothesis: string | null;
    readonly epistemicStatus: string | null;
    readonly plausibilityScore: number | null;
    readonly isPrimaryCandidate: boolean;
    readonly contributingFactors: readonly string[];
    readonly probableLayer?: string | null;
    readonly probableComponent?: string | null;
  } | null;

  // Phase 84: Severity & Priority Impact Assessment
  readonly impactAssessment?: {
    readonly assessedSeverity: string | null;
    readonly assessedPriority: string | null;
    readonly businessImpact: string | null;
    readonly userImpact: string | null;
    readonly severityConfidence: number | null;
    readonly priorityConfidence: number | null;
  } | null;

  // Phase 85: Duplicate Clustering Membership
  readonly clusterMembership?: {
    readonly clusterId: string;
    readonly clusterKey: string;
    readonly clusterTitle: string;
    readonly clusterSize: number;
  } | null;

  // Phase 86: Confidence Scoring & Calibration
  readonly confidenceAssessment?: {
    readonly calibratedScore: number | null;
    readonly confidenceBand: string | null;
    readonly explanation: string | null;
  } | null;
}

/**
 * Result payload from the Bug Report Generator.
 */
export interface GeneratedBugReportContent {
  readonly defectState: ApplicationDefectStateDto;
  readonly isApplicationDefect: boolean;
  readonly title: string;
  readonly summary: string;
  readonly environmentSummary: Record<string, unknown>;
  readonly requirementId?: string | null;
  readonly requirementKey?: string | null;
  readonly requirementVersion?: number | null;
  readonly testCaseId?: string | null;
  readonly testCaseKey?: string | null;
  readonly testCaseVersion?: number | null;
  readonly executionPlanId?: string | null;
  readonly preconditions: readonly string[];
  readonly reproductionSteps: readonly DerivedReproductionStepDto[];
  readonly expectedBehavior: string;
  readonly actualBehavior: string;
  readonly failedStepIndex?: number | null;
  readonly rootCauseHypothesis?: string | null;
  readonly probableLayer?: string | null;
  readonly probableComponent?: string | null;
  readonly severity?: string | null;
  readonly priority?: string | null;
  readonly clusterKey?: string | null;
  readonly clusterMemberCount?: number | null;
  readonly calibratedScore?: number | null;
  readonly evidenceReferences: readonly ReportEvidenceReferenceDto[];
  readonly limitationsAndUnknowns: readonly string[];
  readonly reportMarkdown: string;
  readonly reportFingerprint: string;
  readonly generatorVersion: string;
}

/**
 * Service interface for Phase 87 Structured Bug Report operations.
 */
export interface IStructuredBugReportService {
  createBugReport(input: CreateBugReportInputDto): Promise<StructuredBugReportDto>;
  getBugReport(input: GetBugReportInputDto): Promise<StructuredBugReportDto | null>;
  listBugReports(input: ListBugReportsInputDto): Promise<{
    readonly items: readonly StructuredBugReportDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>;
  regenerateBugReport(input: RegenerateBugReportInputDto): Promise<StructuredBugReportDto>;
  listBugReportHistory(
    input: ListBugReportHistoryInputDto,
  ): Promise<readonly StructuredBugReportDto[]>;
}
