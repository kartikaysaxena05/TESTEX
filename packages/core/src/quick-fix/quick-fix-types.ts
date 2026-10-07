/**
 * @file packages/core/src/quick-fix/quick-fix-types.ts
 * Domain types and interfaces for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 */

import type {
  QuickFixEligibilityDecisionDto,
  QuickFixRiskLevelDto,
  QuickFixCandidateSymbolDto,
  QuickFixRiskFactorsDto,
  QuickFixBlastRadiusDto,
  QuickFixRequiredTestDto,
  QuickFixGitStateDto,
  QuickFixEligibilityAssessmentDto,
  EvaluateQuickFixEligibilityInputDto,
  GetQuickFixAssessmentInputDto,
  ListQuickFixAssessmentsInputDto,
} from '@ai-quality/contracts';

export type QuickFixEligibilityDecision = QuickFixEligibilityDecisionDto;
export type QuickFixRiskLevel = QuickFixRiskLevelDto;

export type QuickFixCandidateSymbol = QuickFixCandidateSymbolDto;
export type QuickFixRiskFactors = QuickFixRiskFactorsDto;
export type QuickFixBlastRadius = QuickFixBlastRadiusDto;
export type QuickFixRequiredTest = QuickFixRequiredTestDto;
export type QuickFixGitState = QuickFixGitStateDto;
export type QuickFixEligibilityAssessment = QuickFixEligibilityAssessmentDto;

export type EvaluateQuickFixEligibilityInput = EvaluateQuickFixEligibilityInputDto;
export type GetQuickFixAssessmentInput = GetQuickFixAssessmentInputDto;
export type ListQuickFixAssessmentsInput = ListQuickFixAssessmentsInputDto;

export type QuickFixRuleId =
  | 'QF_REPRODUCIBLE_REQUIRED_001'
  | 'QF_APP_FAILURE_REQUIRED_001'
  | 'QF_SECURITY_PATH_BLOCK_001'
  | 'QF_AUTH_PERMISSION_BLOCK_001'
  | 'QF_FINANCIAL_PAYMENT_BLOCK_001'
  | 'QF_DB_MIGRATION_BLOCK_001'
  | 'QF_DEPENDENCY_CHANGE_BLOCK_001'
  | 'QF_PRODUCTION_CONFIG_BLOCK_001'
  | 'QF_DATA_DESTRUCTIVE_BLOCK_001'
  | 'QF_PUBLIC_API_BREAKING_001'
  | 'QF_DIRTY_WORKTREE_BLOCK_001'
  | 'QF_LARGE_SCOPE_BLOCK_001'
  | 'QF_BLAST_RADIUS_BLOCK_001'
  | 'QF_TEST_COVERAGE_REQUIRED_001'
  | 'QF_ROOT_CAUSE_CONFIDENCE_001'
  | 'QF_SMALL_SCOPE_ELIGIBLE_001';

export interface QuickFixRuleEvaluation {
  readonly ruleId: QuickFixRuleId;
  readonly name: string;
  readonly passed: boolean;
  readonly decisionImpact?: QuickFixEligibilityDecision;
  readonly riskImpact?: QuickFixRiskLevel;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}

export interface QuickFixFacts {
  readonly failureCaseId: string;
  readonly projectId: string;
  readonly isReproduced: boolean;
  readonly failureDomain: string; // e.g. 'APPLICATION_DEFECT_CANDIDATE'
  readonly candidateFiles: readonly string[];
  readonly candidateSymbols: readonly QuickFixCandidateSymbol[];
  readonly blastRadius: QuickFixBlastRadius;
  readonly gitState: QuickFixGitState;
  readonly riskFactors: QuickFixRiskFactors;
  readonly rootCauseConfidence: number;
  readonly rootCauseStatus: string;
  readonly repositoryReferenceCount: number;
  readonly associatedTests: readonly QuickFixRequiredTest[];
}

export interface QuickFixRulesEngineResult {
  readonly decision: QuickFixEligibilityDecision;
  readonly riskLevel: QuickFixRiskLevel;
  readonly confidenceScore: number;
  readonly primaryReason: string;
  readonly reasons: readonly string[];
  readonly matchedRules: readonly string[];
  readonly blockingRules: readonly string[];
  readonly safetyWarnings: readonly string[];
  readonly humanReviewReasons: readonly string[];
  readonly unknownFactors: readonly string[];
  readonly evaluations: readonly QuickFixRuleEvaluation[];
}

export interface IQuickFixEligibilityService {
  evaluateEligibility(
    input: EvaluateQuickFixEligibilityInput,
  ): Promise<QuickFixEligibilityAssessmentDto>;
  getAssessment(
    input: GetQuickFixAssessmentInput,
  ): Promise<QuickFixEligibilityAssessmentDto | null>;
  listAssessments(
    input: ListQuickFixAssessmentsInput,
  ): Promise<readonly QuickFixEligibilityAssessmentDto[]>;
}
