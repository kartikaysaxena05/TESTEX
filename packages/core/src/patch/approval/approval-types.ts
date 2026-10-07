/**
 * @file packages/core/src/patch/approval/approval-types.ts
 * Types and interfaces for V7 Phase 104 Human Approval, Reject & Apply Workflow.
 */

import type {
  ApprovePatchInputDto,
  ApplyPatchInputDto,
  DefectPatchApprovalDto,
  GetPatchApprovalInputDto,
  ListPatchApprovalsInputDto,
  RejectPatchInputDto,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';

export const APPROVAL_BOUNDS = {
  MAX_REVIEW_COMMENT_LENGTH: 2000,
  MAX_REJECTION_DETAILS_LENGTH: 2000,
  MAX_ACTOR_NAME_LENGTH: 128,
  APPLY_TIMEOUT_MS: 60000,
} as const;

export interface WorkspaceApplyOptions {
  readonly workspaceRoot: string;
  readonly structuredEdits: readonly StructuredEditOperationDto[];
  readonly targetFiles: readonly string[];
  readonly allowedFiles: readonly string[];
  readonly abortSignal?: AbortSignal;
}

export interface WorkspaceApplyResult {
  readonly success: boolean;
  readonly affectedFiles: readonly string[];
  readonly filesModifiedCount: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly appliedUnifiedDiff: string;
  readonly appliedRevision: string;
  readonly error?: string;
  readonly errorCategory?: string;
}

export interface CreateApprovalRequestInput {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly patchProposalId: string;
  readonly validationId: string;
  readonly repositoryId?: string | null;
  readonly actor?: string;
}

export interface IPatchApprovalService {
  getOrCreateApproval(input: CreateApprovalRequestInput): Promise<DefectPatchApprovalDto>;
  getApproval(input: GetPatchApprovalInputDto): Promise<DefectPatchApprovalDto | null>;
  listApprovals(input: ListPatchApprovalsInputDto): Promise<readonly DefectPatchApprovalDto[]>;
  approvePatch(input: ApprovePatchInputDto): Promise<DefectPatchApprovalDto>;
  rejectPatch(input: RejectPatchInputDto): Promise<DefectPatchApprovalDto>;
  applyPatch(input: ApplyPatchInputDto): Promise<DefectPatchApprovalDto>;
}
