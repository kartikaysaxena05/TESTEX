/**
 * @file packages/core/src/requirements/classification/classification-types.ts
 * Types, interfaces, and constants for requirement classification and metadata enrichment.
 */

import type {
  RequirementCategory,
  RequirementSubCategory,
  RequirementPriority,
  RequirementRiskLevel,
  RequirementCriticality,
  ClassificationMethod,
  ClassificationReviewStatus,
  ClassificationReasonCode,
} from '@ai-quality/contracts';

export const CLASSIFIER_VERSION = 'requirement-classifier-v1';

export const CLASSIFICATION_LIMITS = {
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 50,
  MAX_DOMAIN_LENGTH: 100,
  MAX_MODULE_LENGTH: 100,
  MAX_BUSINESS_CAPABILITY_LENGTH: 255,
  MAX_ACTORS: 20,
  MAX_BATCH_SIZE: 100,
} as const;

export interface RequirementClassificationDraft {
  readonly category: RequirementCategory;
  readonly subCategory: RequirementSubCategory | null;
  readonly domain: string | null;
  readonly module: string | null;
  readonly businessCapability: string | null;
  readonly actors: readonly string[];
  readonly securityRelevant: boolean;
  readonly performanceRelevant: boolean;
  readonly complianceRelevant: boolean;
  readonly complianceStandards: readonly string[];
  readonly priority: RequirementPriority;
  readonly riskLevel: RequirementRiskLevel;
  readonly criticality: RequirementCriticality;
  readonly tags: readonly string[];
  readonly reasons: readonly ClassificationReasonCode[];
  readonly classifierVersion: string;
}

export interface CreateMetadataRecordInput {
  readonly projectId: string;
  readonly requirementId: string;
  readonly category: RequirementCategory;
  readonly subCategory: RequirementSubCategory | null;
  readonly domain: string | null;
  readonly module: string | null;
  readonly businessCapability: string | null;
  readonly actors: readonly string[];
  readonly securityRelevant: boolean;
  readonly performanceRelevant: boolean;
  readonly complianceRelevant: boolean;
  readonly complianceStandards: readonly string[];
  readonly priority: RequirementPriority;
  readonly riskLevel: RequirementRiskLevel;
  readonly criticality: RequirementCriticality;
  readonly tags: readonly string[];
  readonly classificationMethod: ClassificationMethod;
  readonly classifierVersion: string;
  readonly reviewStatus: ClassificationReviewStatus;
  readonly reasons: readonly ClassificationReasonCode[];
  readonly sourceRequirementTextSha256: string;
}
