/**
 * @file packages/core/src/file-review/file-review-service.ts
 * Production-grade domain service for V10 Phase 156: File & Diff Review Workspace.
 *
 * Guarantees:
 * 1. Safe, read-only inspection of project files with strict path containment & secret redaction.
 * 2. Immutable original proposal persistence with SHA-256 canonical checksum verification.
 * 3. Deterministic state machine: PENDING_REVIEW -> APPROVED -> APPLIED, REJECTED, CANCELLED.
 * 4. Apply gate strictly enforces pre-approval: cannot apply unless previously APPROVED.
 * 5. Reuses existing V7 PatchApplicator and PatchParser atomic apply mechanism.
 * 6. Concurrency safety: atomic database transactions prevent race conditions.
 * 7. Multi-tenant hierarchy enforcement: userId -> projectId -> threadId -> taskId -> reviewId.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type PrismaClient, type Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type {
  FileDiffReviewDto,
  CreateFileReviewInputDto,
  GetFileReviewInputDto,
  ListFileReviewsInputDto,
  ApproveFileReviewInputDto,
  RejectFileReviewInputDto,
  CancelFileReviewInputDto,
  ApplyFileReviewInputDto,
  ApplyFileReviewResultDto,
  GetFileReviewContentInputDto,
  FileReviewContentDto,
  FileReviewStatus,
  StructuredEditOperationDto,
} from '@ai-quality/contracts';
import {
  FileReviewNotFoundError,
  FileReviewAlreadyDecidedError,
  FileReviewNotApprovedError,
  FileReviewAlreadyAppliedError,
  FileReviewInvalidStateTransitionError,
  FileReviewPathTraversalError,
  FileReviewFileNotFoundError,
  FileReviewFileTooLargeError,
  FileReviewUnauthorizedError,
  FileReviewValidationError,
  FileReviewApplyFailedError,
  FileReviewChecksumMismatchError,
} from './file-review-errors.js';
import { PatchParser } from '../patch/diff/patch-parser.js';
import { PatchApplicator } from '../patch/approval/patch-applicator.js';
import { SecureProjectRootGuard } from '../local-folders/secure-project-root-guard.js';
import { SandboxContainmentValidator } from '../patch/sandbox/sandbox-containment-validator.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { GitChangeAnalyzer } from '../git-review/git-change-analyzer.js';
import { SourceContentPolicy } from '../sources/content/source-content-policy.js';
import { ApprovalService } from '../agent-approval/approval-service.js';

/**
 * Sanitizes credentials, tokens, AWS keys, GitHub tokens, and sensitive patterns
 * from diff and file contents using pattern analysis and registered secret redaction.
 */
export function sanitizeReviewContent(text: string): string {
  if (!text || typeof text !== 'string') return '';
  const gitRedacted = GitChangeAnalyzer.redactSecrets(text).sanitizedDiff;
  return SecretRedactor.redactText(gitRedacted);
}

export interface FileReviewServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly approvalService?: ApprovalService;
}

export function detectFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'typescriptreact';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'javascriptreact';
    case '.json':
      return 'json';
    case '.md':
    case '.markdown':
      return 'markdown';
    case '.html':
    case '.htm':
      return 'html';
    case '.css':
      return 'css';
    case '.scss':
    case '.sass':
      return 'scss';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.sql':
      return 'sql';
    case '.sh':
    case '.bash':
    case '.zsh':
      return 'shell';
    case '.yaml':
    case '.yml':
      return 'yaml';
    case '.xml':
      return 'xml';
    case '.toml':
      return 'toml';
    case '.dockerfile':
      return 'dockerfile';
    default:
      if (path.basename(filePath).toLowerCase() === 'dockerfile') return 'dockerfile';
      return 'plaintext';
  }
}

export class FileReviewService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly approvalService: ApprovalService;

  constructor(deps?: FileReviewServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.approvalService = deps?.approvalService ?? new ApprovalService({ prisma: client });
  }

  // ============================================================================
  // 1. Create File & Diff Review Record
  // ============================================================================

  public async createReview(
    input: CreateFileReviewInputDto,
    userId: string,
  ): Promise<FileDiffReviewDto> {
    await this.assertProjectAccess(input.projectId, userId);

    if (
      !input.originalDiff ||
      typeof input.originalDiff !== 'string' ||
      !input.originalDiff.trim()
    ) {
      throw new FileReviewValidationError('Original diff cannot be empty.');
    }

    // Validate Task hierarchy and ownership
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        projectId: true,
        threadId: true,
        userId: true,
      },
    });

    if (!task || task.projectId !== input.projectId) {
      throw new FileReviewUnauthorizedError(
        `Task "${input.taskId}" does not belong to project "${input.projectId}".`,
      );
    }

    if (task.threadId !== input.threadId) {
      throw new FileReviewValidationError(
        `Task "${input.taskId}" does not belong to thread "${input.threadId}".`,
      );
    }

    // Redact sensitive secrets from the diff
    const sanitizedDiff = sanitizeReviewContent(input.originalDiff);

    // Compute deterministic SHA-256 canonical hash of the immutable diff
    const diffChecksum = crypto.createHash('sha256').update(sanitizedDiff).digest('hex');

    // Extract or verify affected files using PatchParser
    let affectedFiles = input.affectedFiles ? [...input.affectedFiles] : [];
    try {
      const parsed = PatchParser.parseUnifiedDiff(sanitizedDiff);
      const extractedFiles = parsed.files.map(f => f.filePath);
      if (affectedFiles.length === 0) {
        affectedFiles = extractedFiles;
      }
    } catch {
      // Diff may be a non-standard or raw patch, use affectedFiles provided
    }

    // Check if an existing approval request can be linked if not explicitly provided
    let approvalRequestId = input.approvalRequestId ?? null;
    if (!approvalRequestId) {
      const pendingApproval = await this.prisma.approvalRequest.findFirst({
        where: {
          taskId: input.taskId,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (pendingApproval) {
        approvalRequestId = pendingApproval.id;
      }
    }

    const created = await this.prisma.fileDiffReview.create({
      data: {
        userId,
        projectId: input.projectId,
        threadId: input.threadId,
        taskId: input.taskId,
        approvalRequestId,
        title: input.title,
        description: input.description,
        affectedFiles,
        originalDiff: sanitizedDiff,
        diffChecksum,
        status: 'PENDING_REVIEW',
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.info('[file_review.created]', {
      reviewId: created.id,
      taskId: created.taskId,
      projectId: created.projectId,
      diffChecksum,
      affectedFilesCount: affectedFiles.length,
    });

    return this.mapToDto(created);
  }

  // ============================================================================
  // 2. Get Review by ID
  // ============================================================================

  public async getReview(
    input: GetFileReviewInputDto,
    userId: string,
  ): Promise<FileDiffReviewDto | null> {
    await this.assertProjectAccess(input.projectId, userId);

    const review = await this.prisma.fileDiffReview.findUnique({
      where: { id: input.reviewId },
    });

    if (!review || review.projectId !== input.projectId) {
      return null;
    }

    return this.mapToDto(review);
  }

  // ============================================================================
  // 3. List Reviews for Project / Thread / Task
  // ============================================================================

  public async listReviews(
    input: ListFileReviewsInputDto,
    userId: string,
  ): Promise<readonly FileDiffReviewDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    const where: Prisma.FileDiffReviewWhereInput = {
      projectId: input.projectId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.status ? { status: input.status } : {}),
    };

    const limit = Math.min(input.limit ?? 50, 100);
    const offset = input.offset ?? 0;

    const reviews = await this.prisma.fileDiffReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return reviews.map(r => this.mapToDto(r));
  }

  // ============================================================================
  // 4. Approve Review (PENDING_REVIEW -> APPROVED)
  // ============================================================================

  public async approveReview(
    input: ApproveFileReviewInputDto,
    userId: string,
  ): Promise<FileDiffReviewDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const review = await tx.fileDiffReview.findUnique({
        where: { id: input.reviewId },
      });

      if (!review) {
        throw new FileReviewNotFoundError(input.reviewId);
      }

      if (review.projectId !== input.projectId) {
        throw new FileReviewUnauthorizedError(
          `Review "${input.reviewId}" does not belong to project "${input.projectId}".`,
        );
      }

      // State machine validation
      if (review.status === 'APPLIED') {
        throw new FileReviewAlreadyAppliedError(input.reviewId);
      }
      if (review.status === 'APPROVED') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }
      if (review.status === 'REJECTED') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }
      if (review.status === 'CANCELLED') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }
      if (review.status !== 'PENDING_REVIEW') {
        throw new FileReviewInvalidStateTransitionError(review.status, 'APPROVED');
      }

      const updated = await tx.fileDiffReview.update({
        where: { id: input.reviewId },
        data: {
          status: 'APPROVED',
          reviewedBy: userId,
          reviewedAt: now,
          decisionReason: input.reason ?? 'Approved by human reviewer',
        },
      });

      // Synchronize associated ApprovalRequest if pending
      if (review.approvalRequestId) {
        const approvalReq = await tx.approvalRequest.findUnique({
          where: { id: review.approvalRequestId },
        });
        if (approvalReq && approvalReq.status === 'PENDING') {
          await tx.approvalRequest.update({
            where: { id: review.approvalRequestId },
            data: {
              status: 'APPROVED',
              respondedBy: userId,
              respondedAt: now,
              responseReason: input.reason ?? 'Approved via file diff review workspace',
            },
          });

          await tx.approvalAuditLog.create({
            data: {
              approvalId: approvalReq.id,
              projectId: approvalReq.projectId,
              threadId: approvalReq.threadId,
              taskId: approvalReq.taskId,
              userId,
              eventType: 'APPROVAL_APPROVED',
              actorType: 'USER',
              actorId: userId,
              transition: 'PENDING -> APPROVED',
              metadata: {
                reviewId: review.id,
                diffChecksum: review.diffChecksum,
                reason: input.reason ?? 'Approved via file diff review workspace',
              },
            },
          });
        }
      }

      this.logger.info('[file_review.approved]', {
        reviewId: updated.id,
        taskId: updated.taskId,
        userId,
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 5. Reject Review (PENDING_REVIEW -> REJECTED)
  // ============================================================================

  public async rejectReview(
    input: RejectFileReviewInputDto,
    userId: string,
  ): Promise<FileDiffReviewDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const review = await tx.fileDiffReview.findUnique({
        where: { id: input.reviewId },
      });

      if (!review) {
        throw new FileReviewNotFoundError(input.reviewId);
      }

      if (review.projectId !== input.projectId) {
        throw new FileReviewUnauthorizedError(
          `Review "${input.reviewId}" does not belong to project "${input.projectId}".`,
        );
      }

      // State machine validation
      if (review.status === 'APPLIED') {
        throw new FileReviewAlreadyAppliedError(input.reviewId);
      }
      if (review.status !== 'PENDING_REVIEW') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }

      const updated = await tx.fileDiffReview.update({
        where: { id: input.reviewId },
        data: {
          status: 'REJECTED',
          reviewedBy: userId,
          reviewedAt: now,
          decisionReason: input.reason ?? 'Rejected by human reviewer',
        },
      });

      // Synchronize associated ApprovalRequest if pending
      if (review.approvalRequestId) {
        const approvalReq = await tx.approvalRequest.findUnique({
          where: { id: review.approvalRequestId },
        });
        if (approvalReq && approvalReq.status === 'PENDING') {
          await tx.approvalRequest.update({
            where: { id: review.approvalRequestId },
            data: {
              status: 'REJECTED',
              respondedBy: userId,
              respondedAt: now,
              responseReason: input.reason ?? 'Rejected via file diff review workspace',
            },
          });

          await tx.approvalAuditLog.create({
            data: {
              approvalId: approvalReq.id,
              projectId: approvalReq.projectId,
              threadId: approvalReq.threadId,
              taskId: approvalReq.taskId,
              userId,
              eventType: 'APPROVAL_REJECTED',
              actorType: 'USER',
              actorId: userId,
              transition: 'PENDING -> REJECTED',
              metadata: {
                reviewId: review.id,
                diffChecksum: review.diffChecksum,
                reason: input.reason ?? 'Rejected via file diff review workspace',
              },
            },
          });
        }
      }

      this.logger.info('[file_review.rejected]', {
        reviewId: updated.id,
        taskId: updated.taskId,
        userId,
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 6. Cancel Review (PENDING_REVIEW / APPROVED -> CANCELLED)
  // ============================================================================

  public async cancelReview(
    input: CancelFileReviewInputDto,
    userId: string,
  ): Promise<FileDiffReviewDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const review = await tx.fileDiffReview.findUnique({
        where: { id: input.reviewId },
      });

      if (!review) {
        throw new FileReviewNotFoundError(input.reviewId);
      }

      if (review.projectId !== input.projectId) {
        throw new FileReviewUnauthorizedError(
          `Review "${input.reviewId}" does not belong to project "${input.projectId}".`,
        );
      }

      // State machine validation
      if (review.status === 'APPLIED') {
        throw new FileReviewAlreadyAppliedError(input.reviewId);
      }
      if (review.status === 'CANCELLED') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }
      if (review.status === 'REJECTED') {
        throw new FileReviewAlreadyDecidedError(input.reviewId, review.status);
      }

      const updated = await tx.fileDiffReview.update({
        where: { id: input.reviewId },
        data: {
          status: 'CANCELLED',
          reviewedBy: userId,
          reviewedAt: now,
          decisionReason: input.reason ?? 'Cancelled by user',
        },
      });

      // Synchronize associated ApprovalRequest if pending
      if (review.approvalRequestId) {
        const approvalReq = await tx.approvalRequest.findUnique({
          where: { id: review.approvalRequestId },
        });
        if (approvalReq && approvalReq.status === 'PENDING') {
          await tx.approvalRequest.update({
            where: { id: review.approvalRequestId },
            data: {
              status: 'CANCELLED',
              respondedBy: userId,
              respondedAt: now,
              responseReason: input.reason ?? 'Cancelled via file diff review workspace',
            },
          });

          await tx.approvalAuditLog.create({
            data: {
              approvalId: approvalReq.id,
              projectId: approvalReq.projectId,
              threadId: approvalReq.threadId,
              taskId: approvalReq.taskId,
              userId,
              eventType: 'APPROVAL_CANCELLED',
              actorType: 'USER',
              actorId: userId,
              transition: 'PENDING -> CANCELLED',
              metadata: {
                reviewId: review.id,
                diffChecksum: review.diffChecksum,
                reason: input.reason ?? 'Cancelled via file diff review workspace',
              },
            },
          });
        }
      }

      this.logger.info('[file_review.cancelled]', {
        reviewId: updated.id,
        taskId: updated.taskId,
        userId,
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 7. Apply Review Patch (APPROVED -> APPLIED) via V7 PatchApplicator
  // ============================================================================

  public async applyReview(
    input: ApplyFileReviewInputDto,
    userId: string,
  ): Promise<ApplyFileReviewResultDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const review = await this.prisma.fileDiffReview.findUnique({
      where: { id: input.reviewId },
    });

    if (!review) {
      throw new FileReviewNotFoundError(input.reviewId);
    }

    if (review.projectId !== input.projectId) {
      throw new FileReviewUnauthorizedError(
        `Review "${input.reviewId}" does not belong to project "${input.projectId}".`,
      );
    }

    // MANDATORY GATE: Cannot apply unless previously APPROVED!
    if (review.status === 'APPLIED') {
      throw new FileReviewAlreadyAppliedError(input.reviewId);
    }
    if (review.status !== 'APPROVED') {
      throw new FileReviewNotApprovedError(input.reviewId, review.status);
    }

    // Integrity Check: Verify original proposal diff has not been modified/tampered
    const currentChecksum = crypto.createHash('sha256').update(review.originalDiff).digest('hex');
    if (currentChecksum !== review.diffChecksum) {
      throw new FileReviewChecksumMismatchError(input.reviewId);
    }

    // Workspace Resolution
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      include: { source: true },
    });

    if (!project?.source?.rootPath) {
      throw new FileReviewApplyFailedError('Project has no connected local workspace source root.');
    }

    const workspaceRoot = path.resolve(project.source.rootPath);
    if (!fs.existsSync(workspaceRoot)) {
      throw new FileReviewApplyFailedError(
        `Workspace root "${workspaceRoot}" does not exist on disk.`,
      );
    }

    // Parse unified diff into structured hunks and edit operations
    let parsedDiff;
    try {
      parsedDiff = PatchParser.parseUnifiedDiff(review.originalDiff);
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new FileReviewApplyFailedError(`Malformed diff could not be parsed: ${msg}`);
    }

    const allStructuredEdits: StructuredEditOperationDto[] = [];
    const targetFilesList: string[] = [];

    for (const fileDiff of parsedDiff.files) {
      targetFilesList.push(fileDiff.filePath);
      for (const edit of fileDiff.structuredEdits) {
        allStructuredEdits.push(edit);
      }
    }

    const allowedFiles = review.affectedFiles.length > 0 ? review.affectedFiles : targetFilesList;

    // Apply patch using existing atomic V7 PatchApplicator
    let applyResult;
    try {
      applyResult = PatchApplicator.applyPatchToWorkspace({
        workspaceRoot,
        structuredEdits: allStructuredEdits,
        targetFiles: targetFilesList,
        allowedFiles,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new FileReviewApplyFailedError(msg);
    }

    const now = new Date();
    const appliedCommit = `review-${review.id.substring(0, 8)}`;

    // Update review record to APPLIED
    await this.prisma.fileDiffReview.update({
      where: { id: review.id },
      data: {
        status: 'APPLIED',
        appliedAt: now,
        appliedCommit,
      },
    });

    this.logger.info('[file_review.applied]', {
      reviewId: review.id,
      taskId: review.taskId,
      appliedCommit,
      filesModifiedCount: applyResult.filesModifiedCount,
      linesAdded: applyResult.linesAdded,
      linesRemoved: applyResult.linesRemoved,
    });

    return {
      reviewId: review.id,
      status: 'APPLIED',
      appliedAt: now.toISOString(),
      appliedCommit,
      filesModifiedCount: applyResult.filesModifiedCount,
      affectedFiles: [...applyResult.affectedFiles],
      linesAdded: applyResult.linesAdded,
      linesRemoved: applyResult.linesRemoved,
    };
  }

  // ============================================================================
  // 8. Safe Project File Inspection (Read-Only, Zero Code Execution)
  // ============================================================================

  public async getFileContent(
    input: GetFileReviewContentInputDto,
    userId: string,
  ): Promise<FileReviewContentDto> {
    await this.assertProjectAccess(input.projectId, userId);

    if (!input.filePath || typeof input.filePath !== 'string' || !input.filePath.trim()) {
      throw new FileReviewValidationError('File path is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      include: { source: true },
    });

    if (!project?.source?.rootPath) {
      throw new FileReviewFileNotFoundError(
        'Project has no connected local workspace source root.',
      );
    }

    const rawProjectRoot = project.source.rootPath;
    if (!fs.existsSync(rawProjectRoot)) {
      throw new FileReviewFileNotFoundError(`Workspace root "${rawProjectRoot}" does not exist.`);
    }

    // Security: SecureProjectRootGuard enforces path traversal, null-byte, and protocol protections
    let resolution;
    try {
      const guard = new SecureProjectRootGuard(rawProjectRoot);
      resolution = guard.resolveSecurePath(input.filePath);
    } catch (guardErr: unknown) {
      const msg = guardErr instanceof Error ? guardErr.message : input.filePath;
      throw new FileReviewPathTraversalError(msg);
    }

    // Additional containment check
    try {
      SandboxContainmentValidator.validatePathContainment(
        resolution.canonicalRoot,
        resolution.relativePath,
      );
      SandboxContainmentValidator.validateGitMetadata(resolution.relativePath);
      SandboxContainmentValidator.validateSymlinkEscape(
        resolution.canonicalRoot,
        resolution.relativePath,
      );
    } catch (containmentErr: unknown) {
      const msg = containmentErr instanceof Error ? containmentErr.message : input.filePath;
      throw new FileReviewPathTraversalError(msg);
    }

    if (!resolution.exists) {
      throw new FileReviewFileNotFoundError(
        `Project file "${resolution.relativePath}" does not exist.`,
      );
    }

    const stat = fs.statSync(resolution.resolvedPath);
    if (stat.isDirectory()) {
      throw new FileReviewValidationError(
        `Target "${resolution.relativePath}" is a directory, not a file.`,
      );
    }

    const maxSizeBytes = Math.min(input.maxSizeBytes ?? 5 * 1024 * 1024, 20 * 1024 * 1024);
    if (stat.size > maxSizeBytes) {
      throw new FileReviewFileTooLargeError(resolution.relativePath, stat.size, maxSizeBytes);
    }

    const ext = path.extname(resolution.resolvedPath).toLowerCase();
    let isBinary = SourceContentPolicy.isBinaryExtension(ext);

    // If extension is not known binary, inspect sample buffer for NUL bytes
    if (!isBinary && stat.size > 0) {
      const sampleSize = Math.min(stat.size, 512);
      const sampleBuf = Buffer.alloc(sampleSize);
      const fd = fs.openSync(resolution.resolvedPath, 'r');
      try {
        fs.readSync(fd, sampleBuf, 0, sampleSize, 0);
        isBinary = SourceContentPolicy.containsBinaryNullBytes(sampleBuf);
      } finally {
        fs.closeSync(fd);
      }
    }

    const language = detectFileLanguage(resolution.relativePath);

    if (isBinary) {
      return {
        filePath: resolution.relativePath,
        language,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isBinary: true,
        content: '[Binary file content omitted]',
        lineCount: 0,
      };
    }

    const rawText = fs.readFileSync(resolution.resolvedPath, 'utf8');
    // Secret redaction: never expose sensitive tokens, passwords, or keys
    const content = sanitizeReviewContent(rawText);
    const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;

    return {
      filePath: resolution.relativePath,
      language,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      isBinary: false,
      content,
      lineCount,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    if (!projectId) {
      throw new FileReviewValidationError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, deletedAt: true },
    });

    if (!project || project.deletedAt) {
      throw new FileReviewNotFoundError(`Project "${projectId}" was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('[file_review.cross_project_violation]', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new FileReviewUnauthorizedError('Unauthorized: project belongs to another user.');
    }
  }

  private mapToDto(record: {
    id: string;
    userId: string;
    projectId: string;
    threadId: string;
    taskId: string;
    approvalRequestId: string | null;
    title: string;
    description: string;
    affectedFiles: string[];
    originalDiff: string;
    diffChecksum: string;
    status: FileReviewStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    decisionReason: string | null;
    appliedAt: Date | null;
    appliedCommit: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): FileDiffReviewDto {
    return {
      id: record.id,
      userId: record.userId,
      projectId: record.projectId,
      threadId: record.threadId,
      taskId: record.taskId,
      approvalRequestId: record.approvalRequestId,
      title: record.title,
      description: record.description,
      affectedFiles: record.affectedFiles,
      originalDiff: record.originalDiff,
      diffChecksum: record.diffChecksum,
      status: record.status,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
      decisionReason: record.decisionReason,
      appliedAt: record.appliedAt ? record.appliedAt.toISOString() : null,
      appliedCommit: record.appliedCommit,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
