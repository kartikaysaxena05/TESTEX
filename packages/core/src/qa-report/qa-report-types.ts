/**
 * @file packages/core/src/qa-report/qa-report-types.ts
 * Type definitions, bounds, constants, and service interfaces for V7 Phase 109
 * Final QA Report & Release Readiness Intelligence.
 */

import type {
  ReleaseReadinessVerdictDto,
  QaReportStatusDto,
  QaReportAuditActionDto,
  QaReportRequirementSummaryDto,
  QaReportTestExecutionSummaryDto,
  QaReportFailureDomainSummaryDto,
  QaReportDefectSummaryDto,
  QaReportReverificationSummaryDto,
  QaReportRegressionSummaryDto,
  QaReportFlakinessSummaryDto,
  QaReportHealthSummaryDto,
  ReleaseBlockerItemDto,
  ResidualRiskItemDto,
  KnownLimitationItemDto,
  TraceabilityMatrixItemDto,
  EvidenceReferenceItemDto,
  FinalQaReportDto,
  QaReportAuditEventDto,
  GenerateQaReportInputDto,
  GetQaReportInputDto,
  ListQaReportsInputDto,
  FinalizeQaReportInputDto,
  ExportQaReportInputDto,
  ExportQaReportResultDto,
  EvaluateReleasePolicyInputDto,
  ReleasePolicyEvaluationResultDto,
  CheckQaReportStalenessInputDto,
  QaReportStalenessResultDto,
} from '@ai-quality/contracts';

export {
  ReleaseReadinessVerdictDto,
  QaReportStatusDto,
  QaReportAuditActionDto,
  QaReportRequirementSummaryDto,
  QaReportTestExecutionSummaryDto,
  QaReportFailureDomainSummaryDto,
  QaReportDefectSummaryDto,
  QaReportReverificationSummaryDto,
  QaReportRegressionSummaryDto,
  QaReportFlakinessSummaryDto,
  QaReportHealthSummaryDto,
  ReleaseBlockerItemDto,
  ResidualRiskItemDto,
  KnownLimitationItemDto,
  TraceabilityMatrixItemDto,
  EvidenceReferenceItemDto,
  FinalQaReportDto,
  QaReportAuditEventDto,
  GenerateQaReportInputDto,
  GetQaReportInputDto,
  ListQaReportsInputDto,
  FinalizeQaReportInputDto,
  ExportQaReportInputDto,
  ExportQaReportResultDto,
  EvaluateReleasePolicyInputDto,
  ReleasePolicyEvaluationResultDto,
  CheckQaReportStalenessInputDto,
  QaReportStalenessResultDto,
};

export const QA_REPORT_POLICY_VERSION = '1.0.0';

export const QA_REPORT_BOUNDS = {
  MAX_RELEASE_ID_LENGTH: 128,
  MAX_BUILD_ID_LENGTH: 128,
  MAX_COMMIT_SHA_LENGTH: 64,
  MAX_BRANCH_LENGTH: 128,
  MAX_ENV_NAME_LENGTH: 80,
  DEFAULT_LIST_LIMIT: 20,
  MAX_LIST_LIMIT: 100,
  MAX_EXPORT_SIZE_BYTES: 25 * 1024 * 1024, // 25MB
  STALENESS_THRESHOLD_MS: 3600_000, // 1 hour
} as const;

/**
 * Standard policy rule codes evaluated for release readiness.
 */
export const POLICY_RULE_CODES = {
  // Blocker Rules
  BLOCK_CRITICAL_OPEN_DEFECT: 'REL_BLOCK_CRITICAL_OPEN_DEFECT',
  BLOCK_HIGH_OPEN_DEFECT: 'REL_BLOCK_HIGH_OPEN_DEFECT',
  BLOCK_MANDATORY_REGRESSION_FAILED: 'REL_BLOCK_MANDATORY_REGRESSION_FAILED',
  BLOCK_MANDATORY_REQUIREMENT_FAILED: 'REL_BLOCK_MANDATORY_REQUIREMENT_FAILED',
  BLOCK_UNVERIFIED_FIX: 'REL_BLOCK_UNVERIFIED_FIX',
  BLOCK_EXECUTION_BLOCKED: 'REL_BLOCK_EXECUTION_BLOCKED',
  BLOCK_ENVIRONMENT_PROHIBITED: 'REL_BLOCK_ENVIRONMENT_PROHIBITED',

  // Warning Rules
  WARN_MEDIUM_DEFECT: 'REL_WARN_MEDIUM_DEFECT',
  WARN_FLAKY_TESTS: 'REL_WARN_FLAKY_TESTS',
  WARN_PARTIAL_COVERAGE: 'REL_WARN_PARTIAL_COVERAGE',
  WARN_ENVIRONMENT_DRIFT: 'REL_WARN_ENVIRONMENT_DRIFT',
} as const;

export type PolicyRuleCode = (typeof POLICY_RULE_CODES)[keyof typeof POLICY_RULE_CODES];

/**
 * Aggregated domain snapshot assembled across V1–V7 submodules.
 */
export interface QaReportSnapshot {
  readonly requirementSummary: QaReportRequirementSummaryDto;
  readonly testExecutionSummary: QaReportTestExecutionSummaryDto;
  readonly failureDomainSummary: QaReportFailureDomainSummaryDto;
  readonly defectSummary: QaReportDefectSummaryDto;
  readonly reverificationSummary: QaReportReverificationSummaryDto;
  readonly regressionSummary: QaReportRegressionSummaryDto;
  readonly flakinessSummary: QaReportFlakinessSummaryDto;
  readonly automationHealth: QaReportHealthSummaryDto;
  readonly environmentHealth: QaReportHealthSummaryDto;
  readonly testDataHealth: QaReportHealthSummaryDto;
  readonly securityFindings: readonly unknown[];
  readonly releaseBlockers: readonly ReleaseBlockerItemDto[];
  readonly residualRisks: readonly ResidualRiskItemDto[];
  readonly knownLimitations: readonly KnownLimitationItemDto[];
  readonly traceabilityMatrix: readonly TraceabilityMatrixItemDto[];
  readonly evidenceReferences: readonly EvidenceReferenceItemDto[];
  readonly snapshotTime: Date;
}

export interface IReleaseReadinessPolicyEngine {
  evaluate(params: {
    readonly snapshot: QaReportSnapshot;
    readonly policyVersion?: string;
  }): ReleasePolicyEvaluationResultDto;
}

export interface IQaReportSnapshotAssembler {
  assembleSnapshot(params: {
    readonly projectId: string;
    readonly environmentId?: string;
  }): Promise<QaReportSnapshot>;
}

export interface IQaReportExporter {
  exportReport(params: {
    readonly report: FinalQaReportDto;
    readonly format: 'JSON' | 'MARKDOWN';
  }): Promise<ExportQaReportResultDto>;
}

export interface IFinalQaReportService {
  generateReport(input: GenerateQaReportInputDto): Promise<FinalQaReportDto>;
  getReport(input: GetQaReportInputDto): Promise<FinalQaReportDto | null>;
  listReports(input: ListQaReportsInputDto): Promise<readonly FinalQaReportDto[]>;
  finalizeReport(input: FinalizeQaReportInputDto): Promise<FinalQaReportDto>;
  exportReport(input: ExportQaReportInputDto): Promise<ExportQaReportResultDto>;
  evaluatePolicy(input: EvaluateReleasePolicyInputDto): Promise<ReleasePolicyEvaluationResultDto>;
  checkStaleness(input: CheckQaReportStalenessInputDto): Promise<QaReportStalenessResultDto>;
}
