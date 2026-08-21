/**
 * @file packages/core/src/requirements/normalization/normalization-types.ts
 * Types, interfaces, and constants for structured requirement representation and normalization.
 */

import type {
  RequirementModality,
  NormalizationStatus,
  NormalizationMethod,
  RepresentationReviewStatus,
  NormalizationWarningCode,
  RequirementConditionDto,
  RequirementConstraintDto,
  RequirementQuantitativeValueDto,
} from '@ai-quality/contracts';

export const NORMALIZER_VERSION = 'requirement-normalizer-v1';

export const NORMALIZATION_LIMITS = {
  MAX_NORMALIZED_TEXT_LENGTH: 50_000,
  MAX_ACTOR_LENGTH: 255,
  MAX_ACTION_LENGTH: 255,
  MAX_OBJECT_LENGTH: 5_000,
  MAX_EXPECTED_OUTCOME_LENGTH: 5_000,
  MAX_CONDITIONS: 50,
  MAX_CONSTRAINTS: 50,
  MAX_QUANTITATIVE_VALUES: 50,
  MAX_BATCH_SIZE: 100,
} as const;

export interface StructuredRequirementDraft {
  readonly normalizedText: string;
  readonly actor: string | null;
  readonly modality: RequirementModality;
  readonly negated: boolean;
  readonly action: string | null;
  readonly object: string | null;
  readonly conditions: readonly RequirementConditionDto[];
  readonly constraints: readonly RequirementConstraintDto[];
  readonly quantitativeValues: readonly RequirementQuantitativeValueDto[];
  readonly expectedOutcome: string | null;
  readonly warnings: readonly NormalizationWarningCode[];
  readonly normalizerVersion: string;
}

export interface CreateRepresentationInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly normalizedText: string;
  readonly actor: string | null;
  readonly modality: RequirementModality;
  readonly negated: boolean;
  readonly action: string | null;
  readonly object: string | null;
  readonly conditions: readonly RequirementConditionDto[];
  readonly constraints: readonly RequirementConstraintDto[];
  readonly quantitativeValues: readonly RequirementQuantitativeValueDto[];
  readonly expectedOutcome: string | null;
  readonly sourceRequirementTextSha256: string;
  readonly normalizationStatus: NormalizationStatus;
  readonly normalizationMethod: NormalizationMethod;
  readonly normalizerVersion: string;
  readonly reviewStatus: RepresentationReviewStatus;
  readonly warnings: readonly NormalizationWarningCode[];
}
