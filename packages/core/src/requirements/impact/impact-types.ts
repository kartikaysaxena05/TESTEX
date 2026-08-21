/**
 * @file packages/core/src/requirements/impact/impact-types.ts
 * Type definitions and constants for Requirement Change Impact candidate analysis.
 */

import type { RequirementImpactType, RequirementImpactStatus } from '@ai-quality/contracts';

export const MAX_IMPACT_DEPTH = 3;
export const MAX_IMPACT_CANDIDATES = 100;
export const DEFAULT_IMPACT_DEPTH = 3;

export interface ImpactCandidateDraft {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementVersionId: string;
  readonly impactType: RequirementImpactType;
  readonly targetRequirementId?: string | null;
  readonly repositoryEvidenceId?: string | null;
  readonly projectSourceId?: string | null;
  readonly indexedFileId?: string | null;
  readonly symbolId?: string | null;
  readonly reasonCode: string;
  readonly depth: number;
  readonly status?: RequirementImpactStatus;
  readonly reviewRationale?: string | null;
}
