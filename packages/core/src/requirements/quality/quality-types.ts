/**
 * @file packages/core/src/requirements/quality/quality-types.ts
 * Type definitions, limits, deduction weights, and finding templates for Requirement Quality Analysis.
 */

import type {
  RequirementTestabilityStatus,
  QualityFindingSeverity,
  QualityFindingCategory,
  QualityFindingCode,
} from '@ai-quality/contracts';

export const ANALYZER_VERSION = 'requirement-quality-analyzer-v1';

export const QUALITY_LIMITS = {
  MAX_BATCH_SIZE: 100,
  MAX_FINDINGS_PER_REQ: 50,
  MAX_CLARIFICATION_QUESTIONS: 20,
  MAX_REVIEW_RATIONALE_LENGTH: 1000,
  MAX_CLARIFICATION_RESPONSE_LENGTH: 1000,
} as const;

export const QUALITY_SCORE_WEIGHTS: Record<QualityFindingSeverity, number> = {
  ERROR: 25,
  WARNING: 10,
  INFO: 2,
};

export interface QualityFindingDraft {
  readonly code: QualityFindingCode;
  readonly category: QualityFindingCategory;
  readonly severity: QualityFindingSeverity;
  readonly message: string;
  readonly evidenceText: string | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  readonly suggestedClarification: string | null;
}

export interface QualityAnalysisDraft {
  readonly testabilityStatus: RequirementTestabilityStatus;
  readonly qualityScore: number | null;
  readonly analyzerVersion: string;
  readonly findings: readonly QualityFindingDraft[];
  readonly clarificationQuestions: readonly string[];
}

export interface QualityAnalyzerInput {
  readonly originalText: string;
  readonly normalizedText?: string | null;
  readonly actor?: string | null;
  readonly action?: string | null;
  readonly object?: string | null;
  readonly conditions?: readonly unknown[];
  readonly constraints?: readonly unknown[];
  readonly quantitativeValues?: readonly unknown[];
  readonly expectedOutcome?: string | null;
}
