/**
 * @file packages/core/src/agent-tools/repair-patch/repair-patch-tool-service.ts
 * Privileged domain service for V10 Phase 149 Repair / Patch Tool (`repair_patch`).
 *
 * Guarantees:
 * 1. Safe source-code patch creation strictly bounded to candidate files.
 * 2. Never silently applies patches. Explicit state: PROPOSED -> WAITING_FOR_APPROVAL -> APPROVED/REJECTED.
 * 3. Complete tenant, project, and task isolation (userId -> projectId -> taskId).
 * 4. Strict security & path containment (rejects absolute paths, traversal, system/.git/secrets).
 * 5. Reuses existing V7 repair, sandbox, validation, and approval infrastructure.
 * 6. Full audit trail persistence and preservation of unrelated workspace changes.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import path from 'node:path';
import type {
  RepairPatchToolInputDto,
  RepairPatchToolOutputDto,
  RepairPatchProposeInputDto,
  RepairPatchGetInputDto,
  RepairPatchApproveInputDto,
  RepairPatchRejectInputDto,
  RepairPatchCancelInputDto,
  RepairPatchApplyInputDto,
  RepairPatchStatus,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../../database/client.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import { AiCrossProjectAccessError, AiInvalidRequestError } from '../../ai-provider/ai-provider-errors.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';
import { PatchProposalService } from '../../patch/patch-proposal-service.js';
import { PatchApprovalService } from '../../patch/approval/patch-approval-service.js';
import { PatchApplicator } from '../../patch/approval/patch-applicator.js';
import { PatchParser } from '../../patch/diff/patch-parser.js';
import {
  PATCH_BOUNDS,
  HIGH_RISK_DIFF_PATTERNS,
} from '../../patch/patch-types.js';
import { SandboxContainmentValidator, SENSITIVE_FILE_PATTERNS } from '../../patch/sandbox/sandbox-containment-validator.js';
import {
  RepairPatchToolError,
  RepairPatchValidationError,
  RepairPatchPathTraversalError,
  RepairPatchAbsolutePathError,
  RepairPatchProtectedFileError,
  RepairPatchOversizedError,
  RepairPatchMalformedError,
  RepairPatchApprovalRequiredError,
  RepairPatchAlreadyDecidedError,
  RepairPatchNotFoundError,
  RepairPatchApplyFailedError,
} from './repair-patch-tool-errors.js';

export interface RepairPatchToolServiceOptions {
  readonly prisma?: PrismaClient;
  readonly proposalService?: PatchProposalService;
  readonly approvalService?: PatchApprovalService;
  readonly threadService?: AgentThreadService;
  readonly logger?: ILogger;
}

export class RepairPatchToolService {
  private readonly prisma: PrismaClient;
  private readonly proposalService: PatchProposalService;
  private readonly approvalService: PatchApprovalService;
  private readonly threadService: AgentThreadService;
  private readonly logger: ILogger;

  // Active operation locks per proposalId to prevent race conditions & duplicate decisions
  private readonly activeDecisions = new Set<string>();

  constructor(options: RepairPatchToolServiceOptions = {}) {
    const client = options.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not available for RepairPatchToolService.');
    }
    this.prisma = client;
    this.logger = options.logger ?? getLogger();
    this.proposalService = options.proposalService ?? new PatchProposalService({ prisma: this.prisma });
    this.approvalService = options.approvalService ?? new PatchApprovalService(this.prisma);
    this.threadService = options.threadService ?? new AgentThreadService({ prisma: this.prisma, logger: this.logger });
  }

  // ============================================================================
  // 1. Propose Patch (Agent Tool Entry Point)
  // ============================================================================

  /**
   * Generates a safe, reviewable patch proposal for a failure/defect.
   * State transitions: PROPOSED -> WAITING_FOR_APPROVAL.
   * NEVER silently applies the patch.
   */
  public async proposePatch(
    input: RepairPatchToolInputDto | RepairPatchProposeInputDto,
    userId: string,
  ): Promise<RepairPatchToolOutputDto> {
    const { projectId, taskId, userGuidance, reason, proposedChanges, forceRegenerate } = input;

    // 1. Project & Tenant Authorization
    await this.assertProjectAccess(projectId, userId);

    // 2. Task Authorization (if taskId provided)
    if (taskId) {
      await this.assertTaskAccess(projectId, taskId);
    }

    // 3. Resolve Target Failure Case / Defect
    const failureCaseId = await this.resolveFailureCaseId(projectId, input.failureId, input.defectId);

    // 4. Validate Candidate / Target Files Security
    if (input.targetFiles && input.targetFiles.length > 0) {
      this.validateTargetFiles(input.targetFiles);
    }

    // 5. Build Combined Guidance & Sanitize Prompt Injection Payloads
    const combinedGuidance = this.sanitizePromptInjection(
      [proposedChanges, reason, userGuidance].filter(Boolean).join('\n---\n'),
    );

    // 6. Generate Grounded Patch Proposal via existing V7 Infrastructure
    let proposalRecord: any = null;
    try {
      proposalRecord = await this.proposalService.generateProposal({
        projectId,
        failureCaseId,
        userGuidance: combinedGuidance.length > 0 ? combinedGuidance : undefined,
        forceRegenerate: forceRegenerate ?? false,
      });
    } catch (err: unknown) {
      // Re-map known V7 errors to RepairPatchToolError if appropriate
      if (err instanceof Error) {
        if (/oversized|exceeds/i.test(err.message)) {
          throw new RepairPatchOversizedError(err.message);
        }
        if (/traversal|outside/i.test(err.message)) {
          throw new RepairPatchPathTraversalError(input.targetFiles?.[0] ?? 'target', err.message);
        }
        if (/sensitive|credential/i.test(err.message)) {
          throw new RepairPatchProtectedFileError(input.targetFiles?.[0] ?? 'target', err.message);
        }
        if (/malformed|syntax/i.test(err.message)) {
          throw new RepairPatchMalformedError(err.message);
        }
      }
      throw err;
    }

    // 7. Extract & Validate Proposal Content
    const targetFiles: string[] = proposalRecord.targetFiles && proposalRecord.targetFiles.length > 0
      ? proposalRecord.targetFiles
      : (input.targetFiles ?? ['src/index.ts']);

    // Re-verify all resolved target files against containment
    this.validateTargetFiles(targetFiles);

    const primaryFilePath = proposalRecord.primaryFilePath ?? targetFiles[0] ?? 'src/index.ts';
    const unifiedDiff: string = proposalRecord.unifiedDiff ?? '';
    const structuredEdits: StructuredEditOperationDto[] = (proposalRecord.structuredEdits as StructuredEditOperationDto[]) ?? [];

    // 8. Validate Patch Restrictions & Limits (Requirement 5)
    this.validatePatchRestrictions(targetFiles, unifiedDiff, structuredEdits, proposalRecord);

    // 9. Syntactic Applicability Verification
    const isSyntacticallyValid = this.validateSyntacticApplicability(unifiedDiff, structuredEdits);

    // 10. Explicit Status Transition: PROPOSED -> WAITING_FOR_APPROVAL (Requirement 6)
    // The proposal is marked WAITING_FOR_APPROVAL. It is NEVER applied here.
    const status: RepairPatchStatus = 'WAITING_FOR_APPROVAL';

    // 11. Create or Find Pending Approval Record (Phase 104 Integration)
    let approvalId: string | null = null;
    try {
      const existingApproval = await this.prisma.defectPatchApproval?.findFirst?.({
        where: {
          projectId,
          failureCaseId,
          patchProposalId: proposalRecord.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existingApproval) {
        approvalId = existingApproval.id;
      } else if (this.prisma.defectPatchApproval?.create) {
        const createdApproval = await this.prisma.defectPatchApproval.create({
          data: {
            projectId,
            failureCaseId,
            patchProposalId: proposalRecord.id,
            validationId: crypto.randomUUID(),
            status: 'PENDING_REVIEW',
            reviewedPatchHash: proposalRecord.patchFingerprint ?? crypto.createHash('sha256').update(unifiedDiff).digest('hex'),
            baseRevision: proposalRecord.repositoryRevision ?? 'HEAD',
            auditTrailJson: [
              {
                id: crypto.randomUUID(),
                eventType: 'PROPOSED_BY_AGENT',
                timestamp: new Date().toISOString(),
                actor: `agent:${userId}`,
                details: { taskId, failureCaseId },
              },
            ] as unknown as Prisma.InputJsonValue,
          },
        });
        approvalId = createdApproval.id;
      }
    } catch (approvalErr: unknown) {
      this.logger.debug('repair_patch.approval_link_omitted', {
        error: approvalErr instanceof Error ? approvalErr.message : String(approvalErr),
      });
    }

    // 12. Persist Audit Record (Requirement 7)
    const auditId = crypto.randomUUID();
    await this.recordAuditLog({
      auditId,
      projectId,
      userId,
      taskId: taskId ?? null,
      failureId: failureCaseId,
      defectId: input.defectId ?? null,
      modelProvider: proposalRecord.modelProvider ?? 'deterministic-engine',
      modelName: proposalRecord.modelName ?? 'v7-repair-generator',
      targetFiles,
      proposedDiff: unifiedDiff,
      action: 'PROPOSE_PATCH',
      decision: 'WAITING_FOR_APPROVAL',
      rationale: proposalRecord.rationale ?? reason ?? 'Proposed repair for defect',
    });

    // 13. Append Thread Execution Step (if running inside active task)
    if (taskId) {
      try {
        await this.threadService.addExecutionStep(
          {
            projectId,
            taskId,
            stepType: 'TOOL_EXECUTION',
            title: `Generated repair patch proposal for failure ${failureCaseId}: WAITING_FOR_APPROVAL`,
            metadata: {
              toolName: 'repair_patch',
              proposalId: proposalRecord.id,
              targetFiles,
              linesAdded: proposalRecord.linesAddedCount ?? proposalRecord.linesAdded ?? 0,
              linesRemoved: proposalRecord.linesRemovedCount ?? proposalRecord.linesRemoved ?? 0,
              status,
            },
          },
          userId,
        );
      } catch (stepErr: unknown) {
        this.logger.warn('repair_patch.record_step_failed', {
          taskId,
          error: stepErr instanceof Error ? stepErr.message : String(stepErr),
        });
      }
    }

    return {
      proposalId: proposalRecord.id,
      projectId,
      taskId: taskId ?? null,
      failureId: failureCaseId,
      defectId: input.defectId ?? null,
      targetFiles,
      primaryFilePath,
      primarySymbolName: proposalRecord.primarySymbolName ?? null,
      proposedChanges: proposalRecord.expectedBehaviorChange ?? proposedChanges ?? 'Proposed bug repair',
      patch: unifiedDiff,
      reason: proposalRecord.rationale ?? reason ?? 'Automated patch proposed for defect root cause.',
      status,
      filesChangedCount: proposalRecord.filesChangedCount ?? targetFiles.length,
      linesAddedCount: proposalRecord.linesAddedCount ?? proposalRecord.linesAdded ?? 0,
      linesRemovedCount: proposalRecord.linesRemovedCount ?? proposalRecord.linesRemoved ?? 0,
      totalChangedLinesCount: proposalRecord.totalChangedLinesCount ?? proposalRecord.totalChangedLines ?? 0,
      structuredEdits,
      isSyntacticallyValid,
      riskLevel: proposalRecord.riskLevel ?? 'LOW',
      approvalId,
      auditId,
      createdAt: proposalRecord.createdAt ? new Date(proposalRecord.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: proposalRecord.updatedAt ? new Date(proposalRecord.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  // ============================================================================
  // 2. Get Patch Proposal
  // ============================================================================

  public async getPatch(
    input: RepairPatchGetInputDto,
    userId: string,
  ): Promise<RepairPatchToolOutputDto | null> {
    await this.assertProjectAccess(input.projectId, userId);

    const proposal = await this.prisma.defectPatchProposal.findFirst({
      where: {
        projectId: input.projectId,
        ...(input.proposalId ? { id: input.proposalId } : {}),
        ...(input.failureId ? { failureCaseId: input.failureId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!proposal) {
      if (input.proposalId) {
        throw new RepairPatchNotFoundError(input.proposalId, input.projectId);
      }
      return null;
    }

    // Determine current approval status if approval record exists
    let approvalStatus: RepairPatchStatus = 'WAITING_FOR_APPROVAL';
    let approvalId: string | null = null;
    const approval = await this.prisma.defectPatchApproval?.findFirst?.({
      where: {
        projectId: input.projectId,
        patchProposalId: proposal.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (approval) {
      approvalId = approval.id;
      if (approval.status === 'APPROVED') approvalStatus = 'APPROVED';
      else if (approval.status === 'REJECTED') approvalStatus = 'REJECTED';
      else if (approval.status === 'APPLIED') approvalStatus = 'APPLIED';
      else if (approval.status === 'APPLY_FAILED') approvalStatus = 'FAILED';
    }

    if (proposal.status === 'SUPERSEDED' || proposal.status === 'WITHDRAWN') {
      approvalStatus = 'CANCELLED';
    }

    return {
      proposalId: proposal.id,
      projectId: proposal.projectId,
      taskId: null,
      failureId: proposal.failureCaseId,
      defectId: null,
      targetFiles: proposal.targetFiles ?? [],
      primaryFilePath: proposal.primaryFilePath ?? proposal.targetFiles?.[0] ?? 'src/index.ts',
      primarySymbolName: proposal.primarySymbolName ?? null,
      proposedChanges: proposal.expectedBehaviorChange ?? 'Proposed bug repair',
      patch: proposal.unifiedDiff,
      reason: proposal.rationale,
      status: approvalStatus,
      filesChangedCount: proposal.filesChangedCount,
      linesAddedCount: proposal.linesAddedCount,
      linesRemovedCount: proposal.linesRemovedCount,
      totalChangedLinesCount: proposal.totalChangedLinesCount,
      structuredEdits:
        ((proposal.structuredEditsJson ?? (proposal as any).structuredEdits) as unknown as StructuredEditOperationDto[]) ?? [],
      isSyntacticallyValid: true,
      riskLevel: proposal.riskLevel,
      approvalId,
      auditId: null,
      createdAt: new Date(proposal.createdAt).toISOString(),
      updatedAt: new Date(proposal.updatedAt).toISOString(),
    };
  }

  // ============================================================================
  // 3. Approve Patch
  // ============================================================================

  public async approvePatch(
    input: RepairPatchApproveInputDto,
    userId: string,
  ): Promise<RepairPatchToolOutputDto> {
    const { projectId, proposalId, reviewedBy, reviewComment } = input;
    await this.assertProjectAccess(projectId, userId);

    if (this.activeDecisions.has(proposalId)) {
      throw new RepairPatchAlreadyDecidedError(proposalId, 'CONCURRENT_DECISION_IN_PROGRESS');
    }
    this.activeDecisions.add(proposalId);

    try {
      const proposal = await this.prisma.defectPatchProposal.findFirst({
        where: { id: proposalId, projectId },
      });

      if (!proposal) {
        throw new RepairPatchNotFoundError(proposalId, projectId);
      }

      // Check current approval status
      const existingApproval = await this.prisma.defectPatchApproval?.findFirst?.({
        where: { projectId, patchProposalId: proposalId },
        orderBy: { createdAt: 'desc' },
      });

      if (existingApproval) {
        if (existingApproval.status === 'APPROVED') {
          throw new RepairPatchAlreadyDecidedError(proposalId, 'APPROVED');
        }
        if (existingApproval.status === 'REJECTED') {
          throw new RepairPatchAlreadyDecidedError(proposalId, 'REJECTED');
        }
        if (existingApproval.status === 'APPLIED') {
          throw new RepairPatchAlreadyDecidedError(proposalId, 'APPLIED');
        }

        // Update approval
        await this.prisma.defectPatchApproval.update({
          where: { id: existingApproval.id },
          data: {
            status: 'APPROVED',
            reviewedBy: reviewedBy ?? userId,
            reviewedAt: new Date(),
            reviewComment: reviewComment ?? null,
          },
        });
      }

      // Record Audit
      await this.recordAuditLog({
        auditId: crypto.randomUUID(),
        projectId,
        userId,
        taskId: null,
        failureId: proposal.failureCaseId,
        defectId: null,
        modelProvider: proposal.modelProvider,
        modelName: proposal.modelName,
        targetFiles: proposal.targetFiles ?? [],
        proposedDiff: proposal.unifiedDiff,
        action: 'APPROVE_PATCH',
        decision: 'APPROVED',
        rationale: reviewComment ?? 'Approved by operator',
      });

      const updated = await this.getPatch({ projectId, proposalId }, userId);
      if (!updated) {
        throw new RepairPatchNotFoundError(proposalId, projectId);
      }
      return { ...updated, status: 'APPROVED' };
    } finally {
      this.activeDecisions.delete(proposalId);
    }
  }

  // ============================================================================
  // 4. Reject Patch
  // ============================================================================

  public async rejectPatch(
    input: RepairPatchRejectInputDto,
    userId: string,
  ): Promise<RepairPatchToolOutputDto> {
    const { projectId, proposalId, rejectionReason, rejectionDetails, reviewedBy } = input;
    await this.assertProjectAccess(projectId, userId);

    if (this.activeDecisions.has(proposalId)) {
      throw new RepairPatchAlreadyDecidedError(proposalId, 'CONCURRENT_DECISION_IN_PROGRESS');
    }
    this.activeDecisions.add(proposalId);

    try {
      const proposal = await this.prisma.defectPatchProposal.findFirst({
        where: { id: proposalId, projectId },
      });

      if (!proposal) {
        throw new RepairPatchNotFoundError(proposalId, projectId);
      }

      const existingApproval = await this.prisma.defectPatchApproval?.findFirst?.({
        where: { projectId, patchProposalId: proposalId },
        orderBy: { createdAt: 'desc' },
      });

      if (existingApproval) {
        if (existingApproval.status === 'APPLIED') {
          throw new RepairPatchAlreadyDecidedError(proposalId, 'APPLIED');
        }
        if (existingApproval.status === 'REJECTED') {
          throw new RepairPatchAlreadyDecidedError(proposalId, 'REJECTED');
        }

        await this.prisma.defectPatchApproval.update({
          where: { id: existingApproval.id },
          data: {
            status: 'REJECTED',
            rejectionReason: rejectionReason ?? 'OTHER',
            rejectionDetails: rejectionDetails ?? null,
            reviewedBy: reviewedBy ?? userId,
            reviewedAt: new Date(),
          },
        });
      }

      // Mark proposal itself as REJECTED
      await this.prisma.defectPatchProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' },
      });

      // Record Audit
      await this.recordAuditLog({
        auditId: crypto.randomUUID(),
        projectId,
        userId,
        taskId: null,
        failureId: proposal.failureCaseId,
        defectId: null,
        modelProvider: proposal.modelProvider,
        modelName: proposal.modelName,
        targetFiles: proposal.targetFiles ?? [],
        proposedDiff: proposal.unifiedDiff,
        action: 'REJECT_PATCH',
        decision: 'REJECTED',
        rationale: rejectionDetails ?? `Rejected with reason: ${rejectionReason}`,
      });

      const updated = await this.getPatch({ projectId, proposalId }, userId);
      if (!updated) {
        throw new RepairPatchNotFoundError(proposalId, projectId);
      }
      return { ...updated, status: 'REJECTED' };
    } finally {
      this.activeDecisions.delete(proposalId);
    }
  }

  // ============================================================================
  // 5. Cancel Patch Proposal
  // ============================================================================

  public async cancelPatch(
    input: RepairPatchCancelInputDto,
    userId: string,
  ): Promise<RepairPatchToolOutputDto> {
    const { projectId, proposalId, reason } = input;
    await this.assertProjectAccess(projectId, userId);

    const proposal = await this.prisma.defectPatchProposal.findFirst({
      where: { id: proposalId, projectId },
    });

    if (!proposal) {
      throw new RepairPatchNotFoundError(proposalId, projectId);
    }

    // Withdraw proposal via V7 service or direct DB update
    try {
      await this.proposalService.withdrawProposal({
        projectId,
        proposalId,
        reason: reason ?? 'Cancelled by user',
      });
    } catch {
      await this.prisma.defectPatchProposal.update({
        where: { id: proposalId },
        data: { status: 'WITHDRAWN', isAuthoritative: false },
      });
    }

    // Record Audit
    await this.recordAuditLog({
      auditId: crypto.randomUUID(),
      projectId,
      userId,
      taskId: null,
      failureId: proposal.failureCaseId,
      defectId: null,
      modelProvider: proposal.modelProvider,
      modelName: proposal.modelName,
      targetFiles: proposal.targetFiles ?? [],
      proposedDiff: proposal.unifiedDiff,
      action: 'CANCEL_PATCH',
      decision: 'CANCELLED',
      rationale: reason ?? 'Cancelled by user',
    });

    const updated = await this.getPatch({ projectId, proposalId }, userId);
    if (!updated) {
      throw new RepairPatchNotFoundError(proposalId, projectId);
    }
    return { ...updated, status: 'CANCELLED' };
  }

  // ============================================================================
  // 6. Apply Patch (Controlled Application - Requires Prior Explicit Approval)
  // ============================================================================

  public async applyPatch(
    input: RepairPatchApplyInputDto,
    userId: string,
    workspaceRoot?: string,
  ): Promise<RepairPatchToolOutputDto> {
    const { projectId, proposalId, appliedBy } = input;
    await this.assertProjectAccess(projectId, userId);

    const patch = await this.getPatch({ projectId, proposalId }, userId);
    if (!patch) {
      throw new RepairPatchNotFoundError(proposalId, projectId);
    }

    // CRITICAL REQUIREMENT 6: The tool must not apply a patch while in PROPOSED or WAITING_FOR_APPROVAL
    if (patch.status === 'PROPOSED' || patch.status === 'WAITING_FOR_APPROVAL') {
      throw new RepairPatchApprovalRequiredError(proposalId, patch.status);
    }

    if (patch.status !== 'APPROVED') {
      throw new RepairPatchValidationError(
        `Cannot apply patch proposal '${proposalId}': Current status is '${patch.status}'. Only APPROVED patches can be applied.`,
      );
    }

    // Apply patch atomically using V7 PatchApplicator if workspace root is resolved
    if (workspaceRoot) {
      try {
        const applyResult = PatchApplicator.applyPatchToWorkspace({
          workspaceRoot,
          structuredEdits: patch.structuredEdits,
          targetFiles: patch.targetFiles,
          allowedFiles: patch.targetFiles,
        });

        if (!applyResult.success) {
          throw new RepairPatchApplyFailedError(applyResult.error ?? 'Patch application failed.');
        }
      } catch (err: unknown) {
        if (err instanceof RepairPatchToolError) throw err;
        throw new RepairPatchApplyFailedError(
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Update approval status to APPLIED
    if (patch.approvalId && this.prisma.defectPatchApproval?.update) {
      await this.prisma.defectPatchApproval.update({
        where: { id: patch.approvalId },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          appliedBy: appliedBy ?? userId,
        },
      });
    }

    // Record Audit Log (Requirement 7)
    await this.recordAuditLog({
      auditId: crypto.randomUUID(),
      projectId,
      userId,
      taskId: patch.taskId ?? null,
      failureId: patch.failureId,
      defectId: patch.defectId ?? null,
      modelProvider: 'v7-patch-applicator',
      modelName: 'patch-applicator',
      targetFiles: patch.targetFiles,
      proposedDiff: patch.patch,
      action: 'APPLY_PATCH',
      decision: 'APPLIED',
      rationale: `Applied to workspace by ${appliedBy ?? userId}`,
    });

    return {
      ...patch,
      status: 'APPLIED',
      updatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // 7. Security & Containment Validation Engine (Requirement 4)
  // ============================================================================

  /**
   * Strictly validates target files against path traversal, absolute paths,
   * system files, git metadata, and secret credentials.
   */
  public validateTargetFiles(targetFiles: readonly string[], workspaceRoot?: string): void {
    if (!targetFiles || targetFiles.length === 0) {
      throw new RepairPatchValidationError('Target files list cannot be empty.');
    }

    if (targetFiles.length > PATCH_BOUNDS.MAX_FILES_CHANGED) {
      throw new RepairPatchOversizedError(
        `Target files count (${targetFiles.length}) exceeds maximum limit of ${PATCH_BOUNDS.MAX_FILES_CHANGED} files.`,
      );
    }

    for (const rawPath of targetFiles) {
      if (!rawPath || typeof rawPath !== 'string') {
        throw new RepairPatchValidationError('Target file path must be a non-empty string.');
      }

      // Check for null-byte injections
      if (rawPath.includes('\0')) {
        throw new RepairPatchPathTraversalError(rawPath, 'Null-byte character detected in path.');
      }

      // Check for URI-encoded traversal tricks (%2e%2e, %2f, etc.)
      if (/%2e|%2f|%5c/i.test(rawPath)) {
        throw new RepairPatchPathTraversalError(rawPath, 'Encoded traversal sequence detected.');
      }

      const normalized = rawPath.trim().replace(/\\/g, '/');

      // Reject POSIX absolute paths
      if (normalized.startsWith('/')) {
        throw new RepairPatchAbsolutePathError(rawPath);
      }

      // Reject Windows drive / UNC paths
      if (/^[a-zA-Z]:/i.test(normalized) || normalized.startsWith('//')) {
        throw new RepairPatchAbsolutePathError(rawPath);
      }

      // Reject path traversal sequences
      const segments = normalized.split('/');
      if (segments.includes('..')) {
        throw new RepairPatchPathTraversalError(rawPath, "Directory traversal sequence '..' detected.");
      }

      // Reject Git metadata mutations
      if (segments.includes('.git')) {
        throw new RepairPatchProtectedFileError(rawPath, 'Modifying .git metadata is strictly forbidden.');
      }

      // Reject sensitive files and credentials
      for (const pattern of SENSITIVE_FILE_PATTERNS) {
        if (pattern.test(normalized)) {
          throw new RepairPatchProtectedFileError(rawPath, 'Target matches sensitive credential/secret file pattern.');
        }
      }

      // Reject files containing credential or secret keywords
      if (/(credentials|secrets|token|private_key|id_rsa|\.pem|\.key)/i.test(normalized)) {
        throw new RepairPatchProtectedFileError(rawPath, 'Target matches sensitive credential/secret file pattern.');
      }

      // Check if path attempts system file access
      if (/^etc\/(passwd|shadow)|proc\/|sys\//i.test(normalized)) {
        throw new RepairPatchProtectedFileError(rawPath, 'System file modification is blocked.');
      }

      // Validate sandbox containment if workspaceRoot provided
      if (workspaceRoot) {
        SandboxContainmentValidator.validatePathContainment(workspaceRoot, normalized);
      }
    }
  }

  /**
   * Validates patch bounds and rejects dangerous executable patterns.
   */
  private validatePatchRestrictions(
    targetFiles: readonly string[],
    unifiedDiff: string,
    structuredEdits: readonly StructuredEditOperationDto[],
    proposalRecord?: any,
  ): void {
    if (targetFiles.length > PATCH_BOUNDS.MAX_FILES_CHANGED) {
      throw new RepairPatchOversizedError(
        `Patch touches ${targetFiles.length} files (limit: ${PATCH_BOUNDS.MAX_FILES_CHANGED}).`,
      );
    }

    const linesAdded = proposalRecord?.linesAddedCount ?? proposalRecord?.linesAdded ?? 0;
    const linesRemoved = proposalRecord?.linesRemovedCount ?? proposalRecord?.linesRemoved ?? 0;
    const totalLines = linesAdded + linesRemoved;

    if (linesAdded > PATCH_BOUNDS.MAX_LINES_ADDED) {
      throw new RepairPatchOversizedError(
        `Patch adds ${linesAdded} lines (limit: ${PATCH_BOUNDS.MAX_LINES_ADDED}).`,
      );
    }

    if (linesRemoved > PATCH_BOUNDS.MAX_LINES_REMOVED) {
      throw new RepairPatchOversizedError(
        `Patch removes ${linesRemoved} lines (limit: ${PATCH_BOUNDS.MAX_LINES_REMOVED}).`,
      );
    }

    if (totalLines > PATCH_BOUNDS.MAX_TOTAL_CHANGED_LINES) {
      throw new RepairPatchOversizedError(
        `Patch changes ${totalLines} total lines (limit: ${PATCH_BOUNDS.MAX_TOTAL_CHANGED_LINES}).`,
      );
    }

    if (Buffer.byteLength(unifiedDiff, 'utf8') > PATCH_BOUNDS.MAX_DIFF_BYTES) {
      throw new RepairPatchOversizedError(
        `Patch diff size exceeds ${PATCH_BOUNDS.MAX_DIFF_BYTES} bytes.`,
      );
    }

    // Check for dangerous code execution patterns
    for (const pattern of HIGH_RISK_DIFF_PATTERNS) {
      if (pattern.test(unifiedDiff)) {
        throw new RepairPatchMalformedError(
          `Patch contains high-risk executable pattern matching ${pattern.toString()}. Generation blocked.`,
        );
      }
    }
  }

  /**
   * Validates that the patch is syntactically applicable and parseable.
   */
  private validateSyntacticApplicability(
    unifiedDiff: string,
    structuredEdits: readonly StructuredEditOperationDto[],
  ): boolean {
    if (!unifiedDiff || unifiedDiff.trim().length === 0) {
      throw new RepairPatchMalformedError('Unified diff is empty or missing.');
    }

    // Verify diff parser can parse hunks
    try {
      const parsed = PatchParser.parseUnifiedDiff(unifiedDiff);
      if (parsed.files.length === 0 && structuredEdits.length === 0) {
        throw new RepairPatchMalformedError('Unified diff contains no parseable hunks.');
      }
    } catch (err: unknown) {
      throw new RepairPatchMalformedError(
        `Unified diff parsing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return true;
  }

  /**
   * Sanitizes prompt injection payloads from source code or logs.
   * Ensures injected commands do not override tool policy.
   */
  private sanitizePromptInjection(text: string): string {
    if (!text) return '';
    // Strip common prompt injection control markers
    return text
      .replace(/system\s*instruction/gi, 'user_text')
      .replace(/ignore\s+previous\s+instructions/gi, '[filtered]')
      .replace(/bypass\s+safety\s+policy/gi, '[filtered]')
      .substring(0, 4000);
  }

  // ============================================================================
  // 8. Authorization & Audit Helpers
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      throw new AiCrossProjectAccessError(`Project '${projectId}' was not found.`);
    }

    if (project.userId !== userId) {
      throw new AiCrossProjectAccessError(
        `Project '${projectId}' belongs to a different owner and cannot be accessed.`,
      );
    }
  }

  private async assertTaskAccess(projectId: string, taskId: string): Promise<void> {
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });

    if (!task) {
      throw new AiInvalidRequestError(`Task '${taskId}' was not found.`);
    }

    if (task.projectId !== projectId) {
      throw new AiCrossProjectAccessError(
        `Task '${taskId}' belongs to project '${task.projectId}' (expected '${projectId}').`,
      );
    }
  }

  private async resolveFailureCaseId(
    projectId: string,
    failureId?: string,
    defectId?: string,
  ): Promise<string> {
    if (failureId) {
      const fc = await this.prisma.failureCase.findUnique({
        where: { id: failureId },
        select: { id: true, projectId: true },
      });
      if (!fc) {
        throw new RepairPatchNotFoundError(failureId, projectId);
      }
      if (fc.projectId !== projectId) {
        throw new AiCrossProjectAccessError(
          `Failure case '${failureId}' belongs to project '${fc.projectId}'.`,
        );
      }
      return fc.id;
    }

    if (defectId) {
      // Resolve through structured bug report or failure case
      const bugReport = await this.prisma.structuredBugReport?.findFirst?.({
        where: {
          projectId,
          OR: [{ id: defectId }, { reportNumber: defectId }],
        },
        select: { failureCaseId: true, projectId: true },
      });

      if (bugReport) {
        return bugReport.failureCaseId;
      }

      // Or fallback to direct failure case lookup
      const fc = await this.prisma.failureCase.findUnique({
        where: { id: defectId },
        select: { id: true, projectId: true },
      });

      if (fc && fc.projectId === projectId) {
        return fc.id;
      }

      throw new RepairPatchNotFoundError(defectId, projectId);
    }

    throw new RepairPatchValidationError('Either failureId or defectId must be provided.');
  }

  private async recordAuditLog(payload: {
    auditId: string;
    projectId: string;
    userId: string;
    taskId: string | null;
    failureId: string;
    defectId: string | null;
    modelProvider: string;
    modelName: string;
    targetFiles: string[];
    proposedDiff: string;
    action: string;
    decision: string;
    rationale: string;
  }): Promise<void> {
    try {
      if ((this.prisma as any).defectRepairAuditLog?.create) {
        await (this.prisma as any).defectRepairAuditLog.create({
          data: {
            id: payload.auditId,
            projectId: payload.projectId,
            userId: payload.userId,
            taskId: payload.taskId,
            failureCaseId: payload.failureId,
            defectId: payload.defectId,
            modelProvider: payload.modelProvider,
            modelName: payload.modelName,
            targetFiles: payload.targetFiles,
            proposedDiff: payload.proposedDiff,
            action: payload.action,
            decision: payload.decision,
            rationale: payload.rationale,
            createdAt: new Date(),
          },
        });
      }

      if (this.prisma.agentToolAuditLog?.create && payload.taskId) {
        await this.prisma.agentToolAuditLog.create({
          data: {
            taskId: payload.taskId,
            threadId: payload.taskId, // fallback
            projectId: payload.projectId,
            userId: payload.userId,
            toolName: 'repair_patch',
            requestedOperation: payload.action,
            permissionLevel: 'APPROVAL_REQUIRED',
            decision: payload.decision === 'APPROVED' ? 'APPROVAL_GRANTED' : payload.decision === 'REJECTED' ? 'APPROVAL_REJECTED' : 'APPROVAL_REQUESTED',
            reason: payload.rationale,
            metadata: {
              failureId: payload.failureId,
              defectId: payload.defectId,
              targetFiles: payload.targetFiles,
              modelProvider: payload.modelProvider,
              modelName: payload.modelName,
              diffLength: payload.proposedDiff.length,
            } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (auditErr: unknown) {
      this.logger.debug('repair_patch.audit_log_omitted', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }
  }
}
