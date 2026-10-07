/**
 * @file packages/core/src/patch/rollback/rollback-types.ts
 * Type definitions and interfaces for V7 Phase 105 Patch Rollback & Recovery.
 */

import type {
  DefectPatchApprovalDto,
  DefectPatchProposalDto,
  DefectPatchRollbackDto,
  ExecutePatchRollbackInputDto,
  GetPatchRollbackInputDto,
  ListPatchRollbacksInputDto,
  PatchRollbackConflictTypeDto,
  PatchRollbackPlanResultDto,
  PlanPatchRollbackInputDto,
  ResumePatchRollbackRecoveryInputDto,
  RollbackConflictItemDto,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';

export interface RollbackPlanOptions {
  workspaceRoot: string;
  approval: any;
  patchProposal: any;
  abortSignal?: AbortSignal;
}

export interface RollbackPlanResult {
  canRollback: boolean;
  conflicts: RollbackConflictItemDto[];
  targetFiles: string[];
  reverseDiff: string | null;
  structuredReverseEdits: StructuredEditOperationDto[];
  preRollbackHashes: Record<string, string>;
  expectedPostRollbackHashes: Record<string, string>;
  targetPrePatchHashes: Record<string, string>;
  preservedFiles: string[];
}

export interface RecoveryPointSnapshot {
  recoveryPointId: string;
  createdAt: string;
  workspaceRoot: string;
  files: Record<
    string,
    {
      sha256: string;
      content: string;
      byteSize: number;
    }
  >;
}

export interface RollbackVerificationResult {
  integrityVerified: boolean;
  postRollbackHashes: Record<string, string>;
  unrelatedFilesPreserved: string[];
  details: Record<string, unknown>;
}

export interface IPatchRollbackService {
  planRollback(input: PlanPatchRollbackInputDto): Promise<PatchRollbackPlanResultDto>;
  executeRollback(input: ExecutePatchRollbackInputDto): Promise<DefectPatchRollbackDto>;
  getRollback(input: GetPatchRollbackInputDto): Promise<DefectPatchRollbackDto | null>;
  listRollbacks(input: ListPatchRollbacksInputDto): Promise<readonly DefectPatchRollbackDto[]>;
  resumeRecovery(input: ResumePatchRollbackRecoveryInputDto): Promise<DefectPatchRollbackDto>;
}
