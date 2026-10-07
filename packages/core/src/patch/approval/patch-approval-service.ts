/**
 * @file packages/core/src/patch/approval/patch-approval-service.ts
 * Privileged business service governing V7 Phase 104 Human Approval, Reject & Apply Workflow.
 * Enforces explicit human approval, patch immutability, repository base drift defense,
 * atomic patch application, and comprehensive audit history with zero automatic commits/pushes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type Prisma, PrismaClient } from '@prisma/client';
import {
  type ApprovePatchInputDto,
  type ApplyPatchInputDto,
  type DefectPatchApprovalDto,
  type GetPatchApprovalInputDto,
  type ListPatchApprovalsInputDto,
  type PatchApprovalAuditEntryDto,
  type RejectPatchInputDto,
  type StructuredEditOperationDto,
  approvePatchInputSchema,
  applyPatchInputSchema,
  getPatchApprovalInputSchema,
  listPatchApprovalsInputSchema,
  rejectPatchInputSchema,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../../database/index.js';
import { GitCommandRunner } from '../../git/git-command-runner.js';
import { getLogger } from '../../logging/logger.js';
import {
  PatchApprovalAlreadyAppliedError,
  PatchApprovalApplyFailedError,
  PatchApprovalConcurrentMutationError,
  PatchApprovalCrossProjectError,
  PatchApprovalHashMismatchError,
  PatchApprovalInvalidStateTransitionError,
  PatchApprovalNotApprovedError,
  PatchApprovalNotFoundError,
  PatchApprovalRepositoryDriftError,
  PatchApprovalValidationNotValidError,
} from './approval-errors.js';
import { PatchApplicator } from './patch-applicator.js';
import type { CreateApprovalRequestInput, IPatchApprovalService } from './approval-types.js';

export class PatchApprovalService implements IPatchApprovalService {
  private readonly activeOperations = new Set<string>();
  private readonly prisma: PrismaClient;
  private readonly gitRunner: GitCommandRunner;

  constructor(prisma?: PrismaClient, gitRunner?: GitCommandRunner) {
    this.prisma = prisma ?? getPrismaClient() ?? new PrismaClient();
    this.gitRunner = gitRunner ?? new GitCommandRunner();
  }

  /**
   * Creates or returns an existing DefectPatchApproval record in PENDING_REVIEW status
   * for a validated candidate patch.
   */
  public async getOrCreateApproval(
    input: CreateApprovalRequestInput,
  ): Promise<DefectPatchApprovalDto> {
    const {
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
      repositoryId,
      actor = 'SYSTEM',
    } = input;

    const validation = await this.prisma.defectPatchValidation.findUnique({
      where: { id: validationId },
      include: { patchProposal: true },
    });

    if (!validation) {
      throw new PatchApprovalNotFoundError(`Patch validation '${validationId}' not found.`);
    }

    if (validation.projectId !== projectId) {
      throw new PatchApprovalCrossProjectError(
        `Cross-project forbidden: Validation '${validationId}' does not belong to project '${projectId}'.`,
      );
    }

    if (validation.validationOutcome !== 'VALID') {
      throw new PatchApprovalValidationNotValidError(
        `Cannot create approval request: Validation outcome must be 'VALID' (current: '${validation.validationOutcome}').`,
      );
    }

    // Check for existing approval on this validation
    const existing = await this.prisma.defectPatchApproval.findFirst({
      where: {
        projectId,
        validationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return this.mapToDto(existing);
    }

    // Mark any older pending approvals for the same failure case as SUPERSEDED
    await this.prisma.defectPatchApproval.updateMany({
      where: {
        projectId,
        failureCaseId,
        status: 'PENDING_REVIEW',
      },
      data: {
        status: 'SUPERSEDED',
      },
    });

    const initialAudit: PatchApprovalAuditEntryDto = {
      id: crypto.randomUUID(),
      eventType: 'REVIEW_OPENED',
      timestamp: new Date().toISOString(),
      actor,
      details: {
        validationId,
        patchProposalId,
        validationOutcome: validation.validationOutcome,
      },
    };

    const created = await this.prisma.defectPatchApproval.create({
      data: {
        projectId,
        failureCaseId,
        patchProposalId,
        validationId,
        repositoryId: repositoryId ?? validation.repositoryId ?? null,
        status: 'PENDING_REVIEW',
        reviewedPatchHash: validation.patchHash,
        baseRevision: validation.baseRevision,
        auditTrailJson: [initialAudit] as unknown as Prisma.InputJsonValue,
      },
    });

    getLogger().info('patch_approval.opened', {
      approvalId: created.id,
      projectId,
      failureCaseId,
      patchProposalId,
      validationId,
    });

    return this.mapToDto(created);
  }

  /**
   * Retrieves a single DefectPatchApproval by ID or query criteria.
   */
  public async getApproval(
    input: GetPatchApprovalInputDto,
  ): Promise<DefectPatchApprovalDto | null> {
    const validated = getPatchApprovalInputSchema.parse(input);
    const { projectId, approvalId, failureCaseId, patchProposalId, validationId } = validated;

    let record = null;
    if (approvalId) {
      record = await this.prisma.defectPatchApproval.findUnique({
        where: { id: approvalId },
      });
    } else if (validationId) {
      record = await this.prisma.defectPatchApproval.findFirst({
        where: { projectId, validationId },
        orderBy: { createdAt: 'desc' },
      });
    } else if (patchProposalId) {
      record = await this.prisma.defectPatchApproval.findFirst({
        where: { projectId, patchProposalId },
        orderBy: { createdAt: 'desc' },
      });
    } else if (failureCaseId) {
      record = await this.prisma.defectPatchApproval.findFirst({
        where: { projectId, failureCaseId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!record) return null;

    if (record.projectId !== projectId) {
      throw new PatchApprovalCrossProjectError(
        `Cross-project forbidden: Approval '${record.id}' does not belong to project '${projectId}'.`,
      );
    }

    return this.mapToDto(record);
  }

  /**
   * Lists DefectPatchApproval records with filtering.
   */
  public async listApprovals(
    input: ListPatchApprovalsInputDto,
  ): Promise<readonly DefectPatchApprovalDto[]> {
    const validated = listPatchApprovalsInputSchema.parse(input);
    const { projectId, failureCaseId, patchProposalId, status } = validated;

    const records = await this.prisma.defectPatchApproval.findMany({
      where: {
        projectId,
        ...(failureCaseId ? { failureCaseId } : {}),
        ...(patchProposalId ? { patchProposalId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.mapToDto(r));
  }

  /**
   * Explicitly approves a candidate patch.
   * Derives authoritative fields in main/core process.
   */
  public async approvePatch(input: ApprovePatchInputDto): Promise<DefectPatchApprovalDto> {
    const validated = approvePatchInputSchema.parse(input);
    const { projectId, approvalId, reviewedBy = 'HUMAN_REVIEWER', reviewComment } = validated;

    if (this.activeOperations.has(approvalId)) {
      throw new PatchApprovalConcurrentMutationError(
        `Mutation already in progress for approval '${approvalId}'.`,
      );
    }
    this.activeOperations.add(approvalId);

    try {
      const approval = await this.prisma.defectPatchApproval.findUnique({
        where: { id: approvalId },
        include: { validation: true, patchProposal: true },
      });

      if (!approval) {
        throw new PatchApprovalNotFoundError(`Patch approval record '${approvalId}' not found.`);
      }

      if (approval.projectId !== projectId) {
        throw new PatchApprovalCrossProjectError(
          `Cross-project forbidden: Approval '${approvalId}' does not belong to project '${projectId}'.`,
        );
      }

      // State check
      if (approval.status === 'APPROVED') {
        return this.mapToDto(approval);
      }

      if (approval.status !== 'PENDING_REVIEW') {
        throw new PatchApprovalInvalidStateTransitionError(
          `Cannot approve patch: Status is '${approval.status}'. Only PENDING_REVIEW patches can be approved.`,
        );
      }

      // Validation check
      if (approval.validation.validationOutcome !== 'VALID') {
        throw new PatchApprovalValidationNotValidError(
          `Cannot approve patch: Associated Phase 103 validation outcome is '${approval.validation.validationOutcome}'. Only VALID patches can be approved.`,
        );
      }

      // Patch immutability check
      if (
        approval.patchProposal.patchFingerprint &&
        approval.patchProposal.patchFingerprint !== approval.reviewedPatchHash
      ) {
        throw new PatchApprovalHashMismatchError(
          `Patch proposal fingerprint '${approval.patchProposal.patchFingerprint}' does not match reviewed hash '${approval.reviewedPatchHash}'.`,
        );
      }

      const existingAudit =
        (approval.auditTrailJson as unknown as PatchApprovalAuditEntryDto[]) || [];
      const approveAudit: PatchApprovalAuditEntryDto = {
        id: crypto.randomUUID(),
        eventType: 'APPROVED',
        timestamp: new Date().toISOString(),
        actor: reviewedBy,
        details: {
          comment: reviewComment ?? null,
          reviewedPatchHash: approval.reviewedPatchHash,
        },
      };

      const updated = await this.prisma.defectPatchApproval.update({
        where: { id: approvalId },
        data: {
          status: 'APPROVED',
          reviewedBy,
          reviewedAt: new Date(),
          reviewComment: reviewComment ?? null,
          auditTrailJson: [...existingAudit, approveAudit] as unknown as Prisma.InputJsonValue,
        },
      });

      getLogger().info('patch_approval.approved', {
        approvalId: updated.id,
        projectId,
        reviewedBy,
      });

      return this.mapToDto(updated);
    } finally {
      this.activeOperations.delete(approvalId);
    }
  }

  /**
   * Explicitly rejects a candidate patch with a reason.
   * Guarantees strictly 0 repository mutations.
   */
  public async rejectPatch(input: RejectPatchInputDto): Promise<DefectPatchApprovalDto> {
    const validated = rejectPatchInputSchema.parse(input);
    const {
      projectId,
      approvalId,
      rejectionReason,
      rejectionDetails,
      reviewedBy = 'HUMAN_REVIEWER',
    } = validated;

    if (this.activeOperations.has(approvalId)) {
      throw new PatchApprovalConcurrentMutationError(
        `Mutation already in progress for approval '${approvalId}'.`,
      );
    }
    this.activeOperations.add(approvalId);

    try {
      const approval = await this.prisma.defectPatchApproval.findUnique({
        where: { id: approvalId },
      });

      if (!approval) {
        throw new PatchApprovalNotFoundError(`Patch approval record '${approvalId}' not found.`);
      }

      if (approval.projectId !== projectId) {
        throw new PatchApprovalCrossProjectError(
          `Cross-project forbidden: Approval '${approvalId}' does not belong to project '${projectId}'.`,
        );
      }

      if (approval.status === 'APPLIED') {
        throw new PatchApprovalInvalidStateTransitionError(
          'Cannot reject patch: Patch has already been APPLIED to workspace.',
        );
      }

      if (approval.status === 'REJECTED') {
        return this.mapToDto(approval);
      }

      const existingAudit =
        (approval.auditTrailJson as unknown as PatchApprovalAuditEntryDto[]) || [];
      const rejectAudit: PatchApprovalAuditEntryDto = {
        id: crypto.randomUUID(),
        eventType: 'REJECTED',
        timestamp: new Date().toISOString(),
        actor: reviewedBy,
        details: {
          rejectionReason,
          rejectionDetails: rejectionDetails ?? null,
        },
      };

      const updated = await this.prisma.defectPatchApproval.update({
        where: { id: approvalId },
        data: {
          status: 'REJECTED',
          rejectionReason,
          rejectionDetails: rejectionDetails ?? null,
          reviewedBy,
          reviewedAt: new Date(),
          auditTrailJson: [...existingAudit, rejectAudit] as unknown as Prisma.InputJsonValue,
        },
      });

      getLogger().info('patch_approval.rejected', {
        approvalId: updated.id,
        projectId,
        rejectionReason,
        reviewedBy,
      });

      return this.mapToDto(updated);
    } finally {
      this.activeOperations.delete(approvalId);
    }
  }

  /**
   * Applies an approved patch to the authorized workspace root.
   * Requires explicit prior APPROVED status.
   * Enforces repository base drift check, atomic application, rollback on failure,
   * and strictly 0 git commits/pushes.
   */
  public async applyPatch(input: ApplyPatchInputDto): Promise<DefectPatchApprovalDto> {
    const validated = applyPatchInputSchema.parse(input);
    const { projectId, approvalId, appliedBy = 'HUMAN_REVIEWER', expectedBaseRevision } = validated;

    if (this.activeOperations.has(approvalId)) {
      throw new PatchApprovalConcurrentMutationError(
        `Application or mutation already in progress for approval '${approvalId}'.`,
      );
    }
    this.activeOperations.add(approvalId);

    const startTime = new Date();

    try {
      const approval = await this.prisma.defectPatchApproval.findUnique({
        where: { id: approvalId },
        include: {
          validation: true,
          patchProposal: true,
        },
      });

      if (!approval) {
        throw new PatchApprovalNotFoundError(`Patch approval record '${approvalId}' not found.`);
      }

      if (approval.projectId !== projectId) {
        throw new PatchApprovalCrossProjectError(
          `Cross-project forbidden: Approval '${approvalId}' does not belong to project '${projectId}'.`,
        );
      }

      // 1. Critical Safety Invariant: Must be explicitly APPROVED
      if (approval.status === 'APPLIED') {
        throw new PatchApprovalAlreadyAppliedError(
          `Patch approval '${approvalId}' has already been applied.`,
        );
      }

      if (approval.status !== 'APPROVED') {
        throw new PatchApprovalNotApprovedError(
          `Cannot apply patch: Status is '${approval.status}'. Explicit human approval is strictly required before application.`,
        );
      }

      // 2. Patch Immutability Invariant: Reviewed hash must match current patch hash
      const currentPatchHash = approval.patchProposal.patchFingerprint;
      if (currentPatchHash && currentPatchHash !== approval.reviewedPatchHash) {
        throw new PatchApprovalHashMismatchError(
          `Patch immutability violation: Patch proposal hash '${currentPatchHash}' does not match reviewed hash '${approval.reviewedPatchHash}'. New review required.`,
        );
      }

      // 3. Validation Outcome Invariant: Must be VALID
      if (approval.validation.validationOutcome !== 'VALID') {
        throw new PatchApprovalValidationNotValidError(
          `Cannot apply patch: Associated validation outcome is '${approval.validation.validationOutcome}'. Only VALID patches can be applied.`,
        );
      }

      // 4. Resolve Authoritative Workspace Root
      let repository: { id: string; rootPath: string | null } | null = null;
      if (approval.repositoryId) {
        repository = await this.prisma.projectSource.findUnique({
          where: { id: approval.repositoryId },
        });
      } else if (approval.patchProposal.repositoryId) {
        repository = await this.prisma.projectSource.findUnique({
          where: { id: approval.patchProposal.repositoryId },
        });
      } else {
        repository = await this.prisma.projectSource.findFirst({
          where: { projectId },
        });
      }

      let workspaceRoot: string | null = null;
      if (repository?.rootPath && fs.existsSync(repository.rootPath)) {
        workspaceRoot = path.resolve(repository.rootPath);
      }

      if (!workspaceRoot) {
        throw new PatchApprovalApplyFailedError(
          `Authoritative workspace root not found or inaccessible for project '${projectId}'.`,
        );
      }

      // 5. Repository Base Drift Check (Commit SHA & Expected Revision)
      let currentHeadCommit = approval.baseRevision;
      try {
        const head = await this.gitRunner.getHeadCommit(workspaceRoot);
        if (head) {
          currentHeadCommit = head;
        }
      } catch {
        // Fallback to baseRevision
      }

      if (
        currentHeadCommit &&
        approval.baseRevision &&
        currentHeadCommit !== approval.baseRevision
      ) {
        throw new PatchApprovalRepositoryDriftError(
          `Repository base revision has drifted from '${approval.baseRevision}' to '${currentHeadCommit}'. Apply blocked until re-validation.`,
        );
      }

      if (expectedBaseRevision && currentHeadCommit !== expectedBaseRevision) {
        throw new PatchApprovalRepositoryDriftError(
          `Repository revision mismatch: Expected '${expectedBaseRevision}' but repository is at '${currentHeadCommit}'.`,
        );
      }

      // 6. Transition to APPLYING
      const existingAudit =
        (approval.auditTrailJson as unknown as PatchApprovalAuditEntryDto[]) || [];
      const startAudit: PatchApprovalAuditEntryDto = {
        id: crypto.randomUUID(),
        eventType: 'APPLY_STARTED',
        timestamp: startTime.toISOString(),
        actor: appliedBy,
        details: {
          baseRevision: currentHeadCommit,
        },
      };

      await this.prisma.defectPatchApproval.update({
        where: { id: approvalId },
        data: {
          status: 'APPLYING',
          applyRequestedAt: startTime,
          applyStartedAt: startTime,
          appliedBy,
          auditTrailJson: [...existingAudit, startAudit] as unknown as Prisma.InputJsonValue,
        },
      });

      // 7. Execute Atomic Workspace Apply
      const structuredEdits =
        (approval.patchProposal.structuredEditsJson as unknown as StructuredEditOperationDto[]) ||
        [];
      const targetFiles = approval.patchProposal.targetFiles || [];

      let applyResult;
      try {
        applyResult = PatchApplicator.applyPatchToWorkspace({
          workspaceRoot,
          structuredEdits,
          targetFiles,
          allowedFiles: targetFiles,
        });
      } catch (err: any) {
        // Update to APPLY_FAILED
        const failAudit: PatchApprovalAuditEntryDto = {
          id: crypto.randomUUID(),
          eventType: 'APPLY_FAILED',
          timestamp: new Date().toISOString(),
          actor: appliedBy,
          details: {
            error: err?.message ?? String(err),
            errorCategory: err?.code ?? 'APPLY_ERROR',
          },
        };

        await this.prisma.defectPatchApproval.update({
          where: { id: approvalId },
          data: {
            status: 'APPLY_FAILED',
            applyError: err?.message ?? 'Failed to apply patch to workspace.',
            applyErrorCategory: err?.code ?? 'APPLY_ERROR',
            auditTrailJson: [
              ...existingAudit,
              startAudit,
              failAudit,
            ] as unknown as Prisma.InputJsonValue,
          },
        });

        throw err;
      }

      // 8. Update to APPLIED
      const successAudit: PatchApprovalAuditEntryDto = {
        id: crypto.randomUUID(),
        eventType: 'APPLY_SUCCEEDED',
        timestamp: new Date().toISOString(),
        actor: appliedBy,
        details: {
          affectedFiles: applyResult.affectedFiles,
          filesModifiedCount: applyResult.filesModifiedCount,
          linesAdded: applyResult.linesAdded,
          linesRemoved: applyResult.linesRemoved,
          appliedRevision: currentHeadCommit,
        },
      };

      const updated = await this.prisma.defectPatchApproval.update({
        where: { id: approvalId },
        data: {
          status: 'APPLIED',
          appliedPatchHash: approval.reviewedPatchHash,
          appliedRevision: currentHeadCommit,
          appliedAt: new Date(),
          affectedFiles: [...applyResult.affectedFiles],
          filesModifiedCount: applyResult.filesModifiedCount,
          linesAdded: applyResult.linesAdded,
          linesRemoved: applyResult.linesRemoved,
          appliedUnifiedDiff: applyResult.appliedUnifiedDiff,
          auditTrailJson: [
            ...existingAudit,
            startAudit,
            successAudit,
          ] as unknown as Prisma.InputJsonValue,
        },
      });

      getLogger().info('patch_approval.applied', {
        approvalId: updated.id,
        projectId,
        appliedBy,
        filesModified: applyResult.filesModifiedCount,
      });

      return this.mapToDto(updated);
    } finally {
      this.activeOperations.delete(approvalId);
    }
  }

  private mapToDto(record: any): DefectPatchApprovalDto {
    return {
      id: record.id,
      projectId: record.projectId,
      failureCaseId: record.failureCaseId,
      patchProposalId: record.patchProposalId,
      validationId: record.validationId,
      repositoryId: record.repositoryId ?? null,
      status: record.status,

      reviewedPatchHash: record.reviewedPatchHash,
      appliedPatchHash: record.appliedPatchHash ?? null,
      baseRevision: record.baseRevision,
      appliedRevision: record.appliedRevision ?? null,

      reviewedBy: record.reviewedBy ?? null,
      reviewedAt: record.reviewedAt ? new Date(record.reviewedAt).toISOString() : null,
      reviewComment: record.reviewComment ?? null,

      rejectionReason: record.rejectionReason ?? null,
      rejectionDetails: record.rejectionDetails ?? null,

      applyRequestedAt: record.applyRequestedAt
        ? new Date(record.applyRequestedAt).toISOString()
        : null,
      applyStartedAt: record.applyStartedAt ? new Date(record.applyStartedAt).toISOString() : null,
      appliedAt: record.appliedAt ? new Date(record.appliedAt).toISOString() : null,
      appliedBy: record.appliedBy ?? null,
      applyError: record.applyError ?? null,
      applyErrorCategory: record.applyErrorCategory ?? null,

      affectedFiles: Array.isArray(record.affectedFiles) ? record.affectedFiles : [],
      filesModifiedCount: record.filesModifiedCount ?? 0,
      linesAdded: record.linesAdded ?? 0,
      linesRemoved: record.linesRemoved ?? 0,
      appliedUnifiedDiff: record.appliedUnifiedDiff ?? null,

      auditTrail: Array.isArray(record.auditTrailJson) ? record.auditTrailJson : [],

      createdAt: record.createdAt
        ? new Date(record.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: record.updatedAt
        ? new Date(record.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  }
}
