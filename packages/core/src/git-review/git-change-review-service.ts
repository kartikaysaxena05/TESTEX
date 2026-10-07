/**
 * @file packages/core/src/git-review/git-change-review-service.ts
 * Privileged orchestration service for V10 Phase 150 Git Diff & Change Review.
 *
 * Guarantees:
 * 1. Project, Thread, and Task tenant isolation (userId -> projectId -> taskId).
 * 2. Connects to existing project sources to resolve verified workspace directory.
 * 3. Persists reviews: reviewId, projectId, taskId, baseRef, changedFiles, additions, deletions, diff, analysis, status.
 * 4. Lifecycles: PENDING -> REVIEWED -> APPROVED / REJECTED -> APPLIED.
 * 5. Prevents AI autonomous self-approval (reviews require explicit human/operator decision).
 * 6. Concurrency safety: atomic locks per reviewId prevent race conditions.
 * 7. Records execution steps to AgentThreadTask.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import type {
  GitWorkingStatusDto,
  GitDiffResultDto,
  AgentGitChangeReviewDto,
  GitDiffGetStatusInputDto,
  GitDiffGetInputDto,
  CreateGitChangeReviewInputDto,
  GetGitChangeReviewInputDto,
  ApproveGitChangeReviewInputDto,
  RejectGitChangeReviewInputDto,
  GitChangeAnalysisMetadataDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import { AiCrossProjectAccessError, AiInvalidRequestError } from '../ai-provider/ai-provider-errors.js';
import { GitDiffService } from './git-diff-service.js';
import { GitChangeAnalyzer } from './git-change-analyzer.js';
import {
  GitReviewNotFoundError,
  GitReviewAlreadyDecidedError,
  GitReviewUnauthorizedApprovalError,
  GitReviewValidationError,
} from './git-review-errors.js';

export interface GitChangeReviewServiceOptions {
  readonly prisma?: PrismaClient;
  readonly diffService?: GitDiffService;
  readonly logger?: ILogger;
}

export class GitChangeReviewService {
  private readonly prisma: PrismaClient;
  private readonly diffService: GitDiffService;
  private readonly logger: ILogger;

  private readonly activeDecisions = new Set<string>();

  constructor(options: GitChangeReviewServiceOptions = {}) {
    const client = options.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not available for GitChangeReviewService.');
    }
    this.prisma = client;
    this.diffService = options.diffService ?? new GitDiffService();
    this.logger = options.logger ?? getLogger();
  }

  /**
   * Retrieves Git working status for a project's repository.
   */
  public async getStatus(input: GitDiffGetStatusInputDto, userId: string): Promise<GitWorkingStatusDto> {
    const { projectId } = input;
    await this.assertProjectAccess(projectId, userId);

    const workspaceRoot = await this.resolveProjectWorkspaceRoot(projectId);
    return this.diffService.getWorkingStatus(workspaceRoot);
  }

  /**
   * Computes Git diff with secret redaction and file risk analysis.
   */
  public async getDiff(input: GitDiffGetInputDto, userId: string): Promise<GitDiffResultDto> {
    const { projectId, staged, commitBaseRef, commitTargetRef, filePaths } = input;
    await this.assertProjectAccess(projectId, userId);

    const workspaceRoot = await this.resolveProjectWorkspaceRoot(projectId);
    return this.diffService.getDiff(workspaceRoot, {
      staged,
      commitBaseRef,
      commitTargetRef,
      filePaths,
    });
  }

  /**
   * Creates a persisted Git change review tied to an active task.
   */
  public async createReview(
    input: CreateGitChangeReviewInputDto,
    userId: string,
  ): Promise<AgentGitChangeReviewDto> {
    const { projectId, taskId, staged, commitBaseRef, commitTargetRef, filePaths, customDiff } = input;

    await this.assertProjectAccess(projectId, userId);
    await this.assertTaskAccess(projectId, taskId);

    let diffContent = '';
    let changedFiles: string[] = [];
    let additions = 0;
    let deletions = 0;
    let analysis: GitChangeAnalysisMetadataDto;

    if (customDiff) {
      // Reviewing custom proposed diff (e.g. from Phase 149 repair patch)
      const redaction = GitChangeAnalyzer.redactSecrets(customDiff);
      diffContent = redaction.sanitizedDiff;
      changedFiles = filePaths ?? [];
      const lines = diffContent.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }
      analysis = GitChangeAnalyzer.generateAnalysis(
        changedFiles.map((f) => ({
          filePath: f,
          status: 'MODIFIED',
          staged: staged ?? false,
          additions,
          deletions,
          binary: false,
          ...GitChangeAnalyzer.classifyFile(f),
        })),
        { hasRedactions: redaction.hasRedactions, redactionCount: redaction.redactionCount },
      );
    } else {
      // Live repository diff
      const workspaceRoot = await this.resolveProjectWorkspaceRoot(projectId);
      const diffResult = await this.diffService.getDiff(workspaceRoot, {
        staged,
        commitBaseRef,
        commitTargetRef,
        filePaths,
      });

      diffContent = diffResult.diff;
      changedFiles = diffResult.files.map((f) => f.filePath);
      for (const f of diffResult.files) {
        additions += f.additions;
        deletions += f.deletions;
      }
      analysis = diffResult.analysis;
    }

    const reviewId = crypto.randomUUID();
    const created = await (this.prisma as any).agentGitChangeReview.create({
      data: {
        id: reviewId,
        projectId,
        taskId,
        commitBaseRef: commitBaseRef ?? null,
        status: 'PENDING',
        changedFiles,
        additions,
        deletions,
        diffContent,
        diffRef: commitTargetRef ?? null,
        analysisJson: analysis as unknown as Prisma.InputJsonValue,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Record execution step on active thread task
    try {
      if (this.prisma.agentExecutionStep?.create) {
        await this.prisma.agentExecutionStep.create({
          data: {
            taskId,
            stepType: 'TOOL_EXECUTION',
            title: `Created Git Change Review (${reviewId.slice(0, 8)}): PENDING`,
            outputReference: JSON.stringify({
              reviewId,
              changedFilesCount: changedFiles.length,
              additions,
              deletions,
              safetyAssessment: analysis.safetyAssessment,
            }),
            metadata: {
              reviewId,
              changedFilesCount: changedFiles.length,
            } as Prisma.InputJsonValue,
            status: 'COMPLETED',
          },
        });
      }
    } catch {
      // Omit step write if table not available
    }

    return this.mapRecordToDto(created, analysis);
  }

  /**
   * Retrieves a specific change review.
   */
  public async getReview(
    input: GetGitChangeReviewInputDto,
    userId: string,
  ): Promise<AgentGitChangeReviewDto | null> {
    const { projectId, reviewId } = input;
    await this.assertProjectAccess(projectId, userId);

    const review = await (this.prisma as any).agentGitChangeReview.findFirst({
      where: { id: reviewId, projectId },
    });

    if (!review) return null;
    return this.mapRecordToDto(review);
  }

  /**
   * Approves a change review.
   * Safety Invariant: Prevents autonomous self-approval (actor cannot be 'agent' / model).
   */
  public async approveReview(
    input: ApproveGitChangeReviewInputDto,
    userId: string,
  ): Promise<AgentGitChangeReviewDto> {
    const { projectId, reviewId, reviewedBy, decisionComment } = input;
    await this.assertProjectAccess(projectId, userId);

    if (this.activeDecisions.has(reviewId)) {
      throw new GitReviewValidationError(`Decision for review '${reviewId}' is currently in progress.`);
    }
    this.activeDecisions.add(reviewId);

    try {
      const review = await (this.prisma as any).agentGitChangeReview.findFirst({
        where: { id: reviewId, projectId },
      });

      if (!review) {
        throw new GitReviewNotFoundError(reviewId, projectId);
      }

      if (review.status === 'APPROVED' || review.status === 'REJECTED' || review.status === 'APPLIED') {
        throw new GitReviewAlreadyDecidedError(reviewId, review.status);
      }

      // Check actor: Autonomous agents cannot approve their own changes
      const reviewer = reviewedBy ?? userId;
      if (reviewer.toLowerCase().startsWith('agent') || reviewer.toLowerCase().startsWith('ai_')) {
        throw new GitReviewUnauthorizedApprovalError(
          `Unauthorized: Agent identity '${reviewer}' cannot approve change reviews. Human decision required.`,
        );
      }

      const updated = await (this.prisma as any).agentGitChangeReview.update({
        where: { id: reviewId },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewer,
          reviewedAt: new Date(),
          decisionComment: decisionComment ?? null,
        },
      });

      return this.mapRecordToDto(updated);
    } finally {
      this.activeDecisions.delete(reviewId);
    }
  }

  /**
   * Rejects a change review.
   */
  public async rejectReview(
    input: RejectGitChangeReviewInputDto,
    userId: string,
  ): Promise<AgentGitChangeReviewDto> {
    const { projectId, reviewId, reviewedBy, reason } = input;
    await this.assertProjectAccess(projectId, userId);

    if (this.activeDecisions.has(reviewId)) {
      throw new GitReviewValidationError(`Decision for review '${reviewId}' is currently in progress.`);
    }
    this.activeDecisions.add(reviewId);

    try {
      const review = await (this.prisma as any).agentGitChangeReview.findFirst({
        where: { id: reviewId, projectId },
      });

      if (!review) {
        throw new GitReviewNotFoundError(reviewId, projectId);
      }

      if (review.status === 'APPROVED' || review.status === 'REJECTED' || review.status === 'APPLIED') {
        throw new GitReviewAlreadyDecidedError(reviewId, review.status);
      }

      const updated = await (this.prisma as any).agentGitChangeReview.update({
        where: { id: reviewId },
        data: {
          status: 'REJECTED',
          reviewedBy: reviewedBy ?? userId,
          reviewedAt: new Date(),
          decisionComment: reason,
        },
      });

      return this.mapRecordToDto(updated);
    } finally {
      this.activeDecisions.delete(reviewId);
    }
  }

  // ============================================================================
  // Security & Isolation Helpers
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

  private async resolveProjectWorkspaceRoot(projectId: string): Promise<string> {
    const source = await this.prisma.projectSource.findFirst({
      where: { projectId },
      select: { rootPath: true },
    });

    if (source?.rootPath) {
      return source.rootPath;
    }

    // Fallback: check environment or default workspace
    return process.cwd();
  }

  private mapRecordToDto(
    record: any,
    explicitAnalysis?: GitChangeAnalysisMetadataDto,
  ): AgentGitChangeReviewDto {
    const analysis: GitChangeAnalysisMetadataDto =
      explicitAnalysis ??
      (record.analysisJson as unknown as GitChangeAnalysisMetadataDto) ?? {
        filesChangedCount: record.changedFiles?.length ?? 0,
        linesAddedCount: record.additions ?? 0,
        linesRemovedCount: record.deletions ?? 0,
        newFiles: [],
        deletedFiles: [],
        modifiedFiles: record.changedFiles ?? [],
        potentiallyDangerousFiles: [],
        dependencyConfigFiles: [],
        testFiles: [],
        generatedFiles: [],
        hasSecretRedactions: false,
        redactedSecretOccurrences: 0,
        safetyAssessment: 'STANDARD',
      };

    return {
      id: record.id,
      projectId: record.projectId,
      taskId: record.taskId,
      commitBaseRef: record.commitBaseRef ?? null,
      status: record.status,
      changedFiles: record.changedFiles ?? [],
      additions: record.additions ?? 0,
      deletions: record.deletions ?? 0,
      diffContent: record.diffContent,
      diffRef: record.diffRef ?? null,
      reviewedBy: record.reviewedBy ?? null,
      reviewedAt: record.reviewedAt ? new Date(record.reviewedAt).toISOString() : null,
      decisionComment: record.decisionComment ?? null,
      analysis,
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
    };
  }
}
