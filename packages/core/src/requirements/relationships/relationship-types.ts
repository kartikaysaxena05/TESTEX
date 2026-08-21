/**
 * @file packages/core/src/requirements/relationships/relationship-types.ts
 * Type definitions, taxonomy maps, and constants for requirement relationship mapping.
 */

import type {
  RequirementRelationshipType,
  RelationshipDetectionMethod,
  RelationshipStatus,
  RelationshipReasonCode,
} from '@ai-quality/contracts';

export const RELATIONSHIP_ANALYZER_VERSION = 'requirement-relationship-analyzer-v1';

export const INVERSE_RELATIONSHIP_MAP: Readonly<
  Record<RequirementRelationshipType, RequirementRelationshipType>
> = {
  DEPENDS_ON: 'REQUIRED_BY',
  REQUIRED_BY: 'DEPENDS_ON',
  REFINES: 'REFINED_BY',
  REFINED_BY: 'REFINES',
  PARENT_OF: 'CHILD_OF',
  CHILD_OF: 'PARENT_OF',
  CONSTRAINS: 'CONSTRAINED_BY',
  CONSTRAINED_BY: 'CONSTRAINS',
  RELATED_TO: 'RELATED_TO',
  CONFLICTS_WITH: 'CONFLICTS_WITH',
  DUPLICATES: 'DUPLICATES',
  OVERLAPS_WITH: 'OVERLAPS_WITH',
};

export const SYMMETRIC_RELATIONSHIPS = new Set<RequirementRelationshipType>([
  'RELATED_TO',
  'CONFLICTS_WITH',
  'DUPLICATES',
  'OVERLAPS_WITH',
]);

export interface RelationshipInputRequirement {
  readonly id: string;
  readonly projectId: string;
  readonly requirementKey: string;
  readonly title: string;
  readonly originalText: string;
  readonly externalKey?: string | null;
  readonly sectionPath?: string | null;
  readonly type?: string;
  readonly sha256: string;
}

export interface ProposedRelationshipDraft {
  readonly sourceRequirementId: string;
  readonly targetRequirementId: string;
  readonly relationshipType: RequirementRelationshipType;
  readonly detectionMethod: RelationshipDetectionMethod;
  readonly status: RelationshipStatus;
  readonly reasonCodes: readonly RelationshipReasonCode[];
  readonly evidence: string | null;
  readonly sourceRequirementTextSha256: string;
  readonly targetRequirementTextSha256: string;
}

export interface RelationshipAnalysisResult {
  readonly proposedRelationships: readonly ProposedRelationshipDraft[];
  readonly unresolvedReferences: readonly string[];
}
