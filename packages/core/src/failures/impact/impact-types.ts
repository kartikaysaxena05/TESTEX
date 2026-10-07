/**
 * @file packages/core/src/failures/impact/impact-types.ts
 * Domain types and bounds for V6 Phase 84 Severity, Priority & Impact Intelligence.
 */

import type {
  DefectSeverityDto,
  DefectPriorityDto,
  ReleaseRecommendationDto,
  DataImpactDto,
  SecurityImpactDto,
  UserImpactScopeDto,
  AvailabilityImpactDto,
  BlastRadiusDto,
  WorkaroundStatusDto,
  ImpactSupportingEvidenceItemDto,
  FailureImpactAssessmentDto,
  AssessImpactInputDto,
  GetImpactAssessmentInputDto,
  ReassessImpactInputDto,
  ListImpactHistoryInputDto,
} from '@ai-quality/contracts';

export const IMPACT_BOUNDS = {
  MAX_STRING_LENGTH: 4000,
  MAX_RATIONALE_LENGTH: 2000,
  MAX_EVIDENCE_ITEMS: 50,
  MAX_FACT_LENGTH: 500,
  SEVERITY_MODEL_VERSION: '1.0.0',
  PRIORITY_MODEL_VERSION: '1.0.0',
  IMPACT_MODEL_VERSION: '1.0.0',
} as const;

export interface ImpactRawFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;

  // Failure Case & Execution
  readonly failureTitle: string;
  readonly failureErrorMessage?: string | null;
  readonly executionStatus?: string | null;
  readonly executionErrorMessage?: string | null;
  readonly browserEngine?: string | null;
  readonly environmentType?: string | null;

  // Requirement & Test Metadata
  readonly testCaseTitle: string;
  readonly testCasePriority?: string | null;
  readonly requirementId?: string | null;
  readonly requirementKey?: string | null;
  readonly requirementTitle?: string | null;
  readonly requirementCriticality?: string | null;

  // Evidence Facts (Phase 75)
  readonly evidenceArtifactCount: number;
  readonly hasConsoleErrors: boolean;
  readonly consoleErrorSnippets: readonly string[];
  readonly hasNetworkFailures: boolean;
  readonly failedHttpEndpoints: readonly { url: string; method?: string; statusCode?: number }[];
  readonly hasDomSnapshot: boolean;
  readonly evidenceItemReferences: readonly {
    id: string;
    type: string;
    logicalName: string;
    sha256?: string | null;
  }[];

  // Reproduction Facts (Phase 76)
  readonly isReproductionAttempted: boolean;
  readonly isReproducible?: boolean | null;
  readonly reproductionRate?: number | null;
  readonly reproductionEnvironmentDrift?: boolean | null;

  // Classification & Integrity (Phases 77-78)
  readonly classificationCategory?: string | null;
  readonly classificationRuleId?: string | null;
  readonly isIntegrityBlocked?: boolean | null;

  // Flakiness (Phase 79)
  readonly isFlaky?: boolean | null;
  readonly flakinessScore?: number | null;

  // Domain Separation (Phase 80)
  readonly domain?: string | null;
  readonly domainSubreason?: string | null;

  // Technical Localization (Phase 81)
  readonly technicalLayer?: string | null;
  readonly technicalTargetType?: string | null;
  readonly technicalTargetIdentifier?: string | null;
  readonly matchedFilePath?: string | null;
  readonly httpStatusCode?: number | null;
  readonly httpEndpoint?: string | null;

  // AI Reasoning (Phase 82)
  readonly aiCategory?: string | null;
  readonly aiConfidenceLevel?: string | null;
  readonly aiAgreementState?: string | null;

  // Root-Cause Analysis (Phase 83)
  readonly rootCauseStatus?: string | null;
  readonly rootCauseProbableLayer?: string | null;
  readonly rootCauseProbableComponent?: string | null;
  readonly rootCauseProbableCause?: string | null;
  readonly repositoryContextAvailable: boolean;

  // Overrides / Operator Options
  readonly environmentOverride?: string | null;
  readonly releaseBlockingOverride?: boolean | null;
}

export interface SeverityRuleEvaluation {
  readonly severity: DefectSeverityDto;
  readonly ruleId: string;
  readonly rationale: string;
  readonly reasons: readonly string[];
  readonly supportingEvidence: readonly ImpactSupportingEvidenceItemDto[];
}

export interface PriorityRuleEvaluation {
  readonly priority: DefectPriorityDto;
  readonly ruleId: string;
  readonly rationale: string;
  readonly reasons: readonly string[];
}

export interface ImpactDimensionsEvaluation {
  readonly userImpact: UserImpactScopeDto;
  readonly userImpactDetails?: string | null;
  readonly functionalImpact: string;
  readonly businessImpact: string;
  readonly businessCriticality: string;
  readonly dataImpact: DataImpactDto;
  readonly dataImpactDetails?: string | null;
  readonly securityImpact: SecurityImpactDto;
  readonly securityImpactDetails?: string | null;
  readonly availabilityImpact: AvailabilityImpactDto;
  readonly integrationImpact: string;
  readonly blastRadius: BlastRadiusDto;
  readonly workaroundStatus: WorkaroundStatusDto;
  readonly workaroundDetails?: string | null;
  readonly releaseRecommendation: ReleaseRecommendationDto;
  readonly releaseRecommendationRationale: string;
  readonly conflictingSignals: readonly string[];
  readonly unknownFactors: readonly string[];
}

export interface IFailureImpactAssessmentService {
  assessImpact(input: AssessImpactInputDto): Promise<FailureImpactAssessmentDto>;
  getImpactAssessment(
    input: GetImpactAssessmentInputDto,
  ): Promise<FailureImpactAssessmentDto | null>;
  reassessImpact(input: ReassessImpactInputDto): Promise<FailureImpactAssessmentDto>;
  listImpactHistory(
    input: ListImpactHistoryInputDto,
  ): Promise<readonly FailureImpactAssessmentDto[]>;
}
