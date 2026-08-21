/**
 * @file packages/core/src/requirements/versioning/versioning-types.ts
 * Type definitions and constants for Requirement Versioning and History tracking.
 */

import type {
  RequirementChangeKind,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
} from '@ai-quality/contracts';

export const VERSIONING_ENGINE_VERSION = 'requirement-versioning-v1';
export const MAX_CHANGE_REASON_LENGTH = 1000;
export const DEFAULT_HISTORY_PAGE_SIZE = 50;
export const MAX_HISTORY_PAGE_SIZE = 100;
export const MAX_DIFF_TOKEN_LIMIT = 20000;

export interface RequirementVersionSnapshotData {
  readonly title: string;
  readonly originalText: string;
  readonly type: RequirementType;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
}

export interface RequirementVersionDraft {
  readonly projectId: string;
  readonly requirementId: string;
  readonly versionNumber: number;
  readonly requirementKeySnapshot: string;
  readonly title: string;
  readonly originalText: string;
  readonly type: RequirementType;
  readonly priority: RequirementPriority;
  readonly status: RequirementStatus;
  readonly sourceRequirementTextSha256: string;
  readonly changeKind: RequirementChangeKind;
  readonly changeReason?: string | null;
  readonly changedFields: readonly string[];
  readonly createdByActorId?: string | null;
}
