/**
 * @file packages/core/src/agent-approval/approval-service.ts
 * Production-grade human approval service for V10 Phase 155: Human Approval Gates.
 *
 * Guarantees:
 * 1. Persistent, strongly validated approval requests and immutable audit trail.
 * 2. Deterministic policy integration via ApprovalPolicyEngine.
 * 3. Strict multi-tenant isolation: User -> Project -> Thread -> Task -> Approval.
 * 4. Concurrency safety: Atomic database transactions prevent double decisions,
 *    approve-after-reject, reject-after-approve, or races.
 * 5. Tamper protection: Verifies actionHash before approval to prevent substituted input.
 * 6. Expiration management: Auto-expires stale requests past expiresAt.
 * 7. Zero secret leakage: All audit metadata is recursively sanitized.
 */

import { type PrismaClient, type Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type {
  ApprovalRequestDto,
  ApprovalAuditLogDto,
  CreateApprovalInputDto,
  GetApprovalInputDto,
  ListApprovalsInputDto,
  ApproveApprovalInputDto,
  RejectApprovalInputDto,
  CancelApprovalInputDto,
  GetPendingApprovalInputDto,
  StructuredApprovalDecisionDto,
  ApprovalAuditEventType,
} from '@ai-quality/contracts';
import {
  ApprovalNotFoundError,
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalCancelledError,
  ApprovalActionModifiedError,
  ApprovalUnauthorizedError,
  ApprovalValidationError,
} from './agent-approval-errors.js';
import { ApprovalPolicyEngine, computeActionHash } from './approval-policy-engine.js';
import { sanitizeActivityPayload } from '../agent-activity/agent-activity-sanitizer.js';

export interface ApprovalServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly policyEngine?: ApprovalPolicyEngine;
}

export class ApprovalService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly policyEngine: ApprovalPolicyEngine;

  constructor(deps?: ApprovalServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.policyEngine = deps?.policyEngine ?? new ApprovalPolicyEngine();
  }

  public getPolicyEngine(): ApprovalPolicyEngine {
    return this.policyEngine;
  }

  // ============================================================================
  // 1. Create Approval Request
  // ============================================================================

  public async createRequest(
    input: CreateApprovalInputDto,
    userId: string,
  ): Promise<ApprovalRequestDto> {
    await this.assertProjectAccess(input.projectId, userId);

    // Validate Task existence and ownership
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: input.taskId },
      select: {
        id: true,
        projectId: true,
        threadId: true,
        userId: true,
        status: true,
      },
    });

    if (!task || task.projectId !== input.projectId) {
      throw new ApprovalUnauthorizedError(
        `Task "${input.taskId}" does not belong to project "${input.projectId}".`,
      );
    }

    if (task.threadId !== input.threadId) {
      throw new ApprovalValidationError(
        `Task "${input.taskId}" does not belong to thread "${input.threadId}".`,
      );
    }

    // Compute tamper-proof action hash
    const toolName = input.affectedTools?.[0] ?? input.requestedAction;
    const actionHash = computeActionHash(
      toolName,
      input.requestedAction,
      (input.requestedInput ?? {}) as Record<string, unknown>,
    );

    // Calculate expiration timestamp (default: 24 hours if not specified)
    const expiresInSeconds = input.expiresInSeconds ?? 86400;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const sanitizedInput = sanitizeActivityPayload(
      input.requestedInput ?? {},
    ) as Prisma.InputJsonValue;
    const sanitizedMetadata = sanitizeActivityPayload(
      input.metadata ?? {},
    ) as Prisma.InputJsonValue;

    // Persist ApprovalRequest in PENDING state
    const created = await this.prisma.$transaction(async tx => {
      const req = await tx.approvalRequest.create({
        data: {
          projectId: input.projectId,
          threadId: input.threadId,
          taskId: input.taskId,
          userId,
          executionStepId: input.executionStepId ?? null,
          approvalType: input.approvalType,
          title: input.title,
          description: input.description,
          riskLevel: input.riskLevel,
          requestedAction: input.requestedAction,
          requestedInput: sanitizedInput,
          actionHash,
          affectedFiles: (input.affectedFiles ?? []) as Prisma.InputJsonValue,
          affectedTools: (input.affectedTools ?? []) as Prisma.InputJsonValue,
          status: 'PENDING',
          expiresAt,
          metadata: sanitizedMetadata,
        },
      });

      // Update Task status to WAITING_FOR_APPROVAL
      await tx.agentThreadTask.update({
        where: { id: input.taskId },
        data: { status: 'WAITING_FOR_APPROVAL' },
      });

      // Write immutable audit log
      await tx.approvalAuditLog.create({
        data: {
          approvalId: req.id,
          projectId: input.projectId,
          threadId: input.threadId,
          taskId: input.taskId,
          userId,
          executionStepId: input.executionStepId ?? null,
          eventType: 'APPROVAL_CREATED',
          actorType: 'AGENT',
          actorId: userId,
          transition: 'NONE -> PENDING',
          metadata: {
            title: req.title,
            riskLevel: req.riskLevel,
            approvalType: req.approvalType,
            actionHash,
            ...(typeof sanitizedMetadata === 'object' && sanitizedMetadata !== null
              ? (sanitizedMetadata as Record<string, unknown>)
              : {}),
          } as Prisma.InputJsonValue,
        },
      });

      return req;
    });

    this.logger.info('approval.created', {
      approvalId: created.id,
      taskId: created.taskId,
      riskLevel: created.riskLevel,
      approvalType: created.approvalType,
    });

    return this.mapToDto(created);
  }

  // ============================================================================
  // 2. Get Approval Request
  // ============================================================================

  public async getRequest(
    input: GetApprovalInputDto,
    userId: string,
  ): Promise<ApprovalRequestDto | null> {
    await this.assertProjectAccess(input.projectId, userId);

    let request = await this.prisma.approvalRequest.findUnique({
      where: { id: input.approvalId },
    });

    if (!request || request.projectId !== input.projectId) {
      return null;
    }

    // Check expiration on read
    if (
      request.status === 'PENDING' &&
      request.expiresAt &&
      request.expiresAt.getTime() <= Date.now()
    ) {
      request = await this.expireRequest(request.id, 'AUTOMATIC_EXPIRATION');
    }

    return this.mapToDto(request);
  }

  // ============================================================================
  // 3. List Approval Requests
  // ============================================================================

  public async listRequests(
    input: ListApprovalsInputDto,
    userId: string,
  ): Promise<readonly ApprovalRequestDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    // Auto-expire pending requests that are overdue
    await this.sweepExpired(input.projectId);

    const where: Prisma.ApprovalRequestWhereInput = {
      projectId: input.projectId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.approvalType ? { approvalType: input.approvalType } : {}),
    };

    const requests = await this.prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 50,
      skip: input.offset ?? 0,
    });

    return requests.map(r => this.mapToDto(r));
  }

  // ============================================================================
  // 4. Get Pending Approval Request
  // ============================================================================

  public async getPendingRequest(
    input: GetPendingApprovalInputDto,
    userId: string,
  ): Promise<ApprovalRequestDto | null> {
    await this.assertProjectAccess(input.projectId, userId);
    await this.sweepExpired(input.projectId);

    const where: Prisma.ApprovalRequestWhereInput = {
      projectId: input.projectId,
      status: 'PENDING',
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    };

    const pending = await this.prisma.approvalRequest.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return pending ? this.mapToDto(pending) : null;
  }

  // ============================================================================
  // 5. Approve Request (Atomic & Tamper-Safe)
  // ============================================================================

  public async approve(
    input: ApproveApprovalInputDto,
    userId: string,
  ): Promise<ApprovalRequestDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: input.approvalId },
        include: { task: true },
      });

      if (!request) {
        throw new ApprovalNotFoundError(input.approvalId);
      }

      // Project ownership validation
      if (request.projectId !== input.projectId) {
        throw new ApprovalUnauthorizedError(
          `Approval "${input.approvalId}" does not belong to project "${input.projectId}".`,
        );
      }

      // Check task terminal states: cannot approve after task cancellation or completion
      if (request.task?.status === 'CANCELLED' || request.task?.status === 'COMPLETED') {
        throw new ApprovalCancelledError(
          `Cannot approve request "${input.approvalId}": task is already ${request.task.status}.`,
        );
      }

      // Ensure request is still pending
      if (request.status === 'EXPIRED') {
        throw new ApprovalExpiredError(input.approvalId);
      }
      if (request.status === 'CANCELLED') {
        throw new ApprovalCancelledError(input.approvalId);
      }
      if (request.status !== 'PENDING') {
        throw new ApprovalAlreadyDecidedError(input.approvalId, request.status);
      }

      // Check expiration
      if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
        await tx.approvalRequest.update({
          where: { id: input.approvalId },
          data: { status: 'EXPIRED' },
        });
        await tx.approvalAuditLog.create({
          data: {
            approvalId: request.id,
            projectId: request.projectId,
            threadId: request.threadId,
            taskId: request.taskId,
            userId,
            eventType: 'APPROVAL_EXPIRED',
            actorType: 'SYSTEM',
            actorId: 'system',
            transition: 'PENDING -> EXPIRED',
            metadata: { reason: 'Approval request expired before user response' },
          },
        });
        throw new ApprovalExpiredError(input.approvalId);
      }

      // Validate actionHash invariance (tamper protection)
      if (input.actionHash && input.actionHash !== request.actionHash) {
        throw new ApprovalActionModifiedError(
          input.approvalId,
          request.actionHash,
          input.actionHash,
        );
      }

      // Mark request APPROVED
      const updated = await tx.approvalRequest.update({
        where: { id: input.approvalId },
        data: {
          status: 'APPROVED',
          respondedBy: userId,
          respondedAt: now,
          responseReason: input.reason ?? null,
        },
      });

      // Write immutable audit log
      await tx.approvalAuditLog.create({
        data: {
          approvalId: updated.id,
          projectId: updated.projectId,
          threadId: updated.threadId,
          taskId: updated.taskId,
          userId,
          executionStepId: updated.executionStepId,
          eventType: 'APPROVAL_APPROVED',
          actorType: 'USER',
          actorId: userId,
          transition: 'PENDING -> APPROVED',
          metadata: {
            reason: input.reason ?? 'Approved by operator',
            actionHash: updated.actionHash,
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.info('approval.approved', {
        approvalId: updated.id,
        taskId: updated.taskId,
        userId,
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 6. Reject Request (Atomic & Safe Stopping)
  // ============================================================================

  public async reject(input: RejectApprovalInputDto, userId: string): Promise<ApprovalRequestDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: input.approvalId },
        include: { task: true },
      });

      if (!request) {
        throw new ApprovalNotFoundError(input.approvalId);
      }

      if (request.projectId !== input.projectId) {
        throw new ApprovalUnauthorizedError(
          `Approval "${input.approvalId}" does not belong to project "${input.projectId}".`,
        );
      }

      if (request.status === 'EXPIRED') {
        throw new ApprovalExpiredError(input.approvalId);
      }
      if (request.status === 'CANCELLED') {
        throw new ApprovalCancelledError(input.approvalId);
      }
      if (request.status !== 'PENDING') {
        throw new ApprovalAlreadyDecidedError(input.approvalId, request.status);
      }

      // Check expiration
      if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
        await tx.approvalRequest.update({
          where: { id: input.approvalId },
          data: { status: 'EXPIRED' },
        });
        await tx.approvalAuditLog.create({
          data: {
            approvalId: request.id,
            projectId: request.projectId,
            threadId: request.threadId,
            taskId: request.taskId,
            userId,
            eventType: 'APPROVAL_EXPIRED',
            actorType: 'SYSTEM',
            actorId: 'system',
            transition: 'PENDING -> EXPIRED',
            metadata: { reason: 'Approval request expired before user rejection' },
          },
        });
        throw new ApprovalExpiredError(input.approvalId);
      }

      const rejectionReason = input.reason ?? 'Operation rejected by operator';

      const updated = await tx.approvalRequest.update({
        where: { id: input.approvalId },
        data: {
          status: 'REJECTED',
          respondedBy: userId,
          respondedAt: now,
          responseReason: rejectionReason,
        },
      });

      // Write immutable audit log
      await tx.approvalAuditLog.create({
        data: {
          approvalId: updated.id,
          projectId: updated.projectId,
          threadId: updated.threadId,
          taskId: updated.taskId,
          userId,
          executionStepId: updated.executionStepId,
          eventType: 'APPROVAL_REJECTED',
          actorType: 'USER',
          actorId: userId,
          transition: 'PENDING -> REJECTED',
          metadata: {
            reason: rejectionReason,
            actionHash: updated.actionHash,
          } as Prisma.InputJsonValue,
        },
      });

      // Update task failure reason if WAITING_FOR_APPROVAL
      if (request.task?.status === 'WAITING_FOR_APPROVAL') {
        await tx.agentThreadTask.update({
          where: { id: request.taskId },
          data: {
            failureReason: `Operation was rejected by user: ${rejectionReason}`,
          },
        });
      }

      // Mark execution step failed if step id exists
      if (request.executionStepId) {
        await tx.agentExecutionStep.update({
          where: { id: request.executionStepId },
          data: {
            status: 'FAILED',
            error: `Rejected by human operator: ${rejectionReason}`,
            completedAt: now,
          },
        });
      }

      this.logger.info('approval.rejected', {
        approvalId: updated.id,
        taskId: updated.taskId,
        reason: rejectionReason,
        userId,
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 7. Cancel Request
  // ============================================================================

  public async cancel(input: CancelApprovalInputDto, userId: string): Promise<ApprovalRequestDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const now = new Date();

    return await this.prisma.$transaction(async tx => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: input.approvalId },
      });

      if (!request) {
        throw new ApprovalNotFoundError(input.approvalId);
      }

      if (request.projectId !== input.projectId) {
        throw new ApprovalUnauthorizedError(
          `Approval "${input.approvalId}" does not belong to project "${input.projectId}".`,
        );
      }

      if (request.status === 'EXPIRED') {
        throw new ApprovalExpiredError(input.approvalId);
      }
      if (request.status === 'CANCELLED') {
        throw new ApprovalCancelledError(input.approvalId);
      }
      if (request.status !== 'PENDING') {
        throw new ApprovalAlreadyDecidedError(input.approvalId, request.status);
      }

      // Check expiration
      if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
        await tx.approvalRequest.update({
          where: { id: input.approvalId },
          data: { status: 'EXPIRED' },
        });
        await tx.approvalAuditLog.create({
          data: {
            approvalId: request.id,
            projectId: request.projectId,
            threadId: request.threadId,
            taskId: request.taskId,
            userId,
            eventType: 'APPROVAL_EXPIRED',
            actorType: 'SYSTEM',
            actorId: 'system',
            transition: 'PENDING -> EXPIRED',
            metadata: { reason: 'Approval request expired before user cancellation' },
          },
        });
        throw new ApprovalExpiredError(input.approvalId);
      }

      const cancelReason = input.reason ?? 'Approval cancelled';

      const updated = await tx.approvalRequest.update({
        where: { id: input.approvalId },
        data: {
          status: 'CANCELLED',
          respondedBy: userId,
          respondedAt: now,
          responseReason: cancelReason,
        },
      });

      await tx.approvalAuditLog.create({
        data: {
          approvalId: updated.id,
          projectId: updated.projectId,
          threadId: updated.threadId,
          taskId: updated.taskId,
          userId,
          executionStepId: updated.executionStepId,
          eventType: 'APPROVAL_CANCELLED',
          actorType: 'USER',
          actorId: userId,
          transition: 'PENDING -> CANCELLED',
          metadata: { reason: cancelReason },
        },
      });

      return this.mapToDto(updated);
    });
  }

  // ============================================================================
  // 8. Immutable Audit History
  // ============================================================================

  public async getAuditHistory(
    input: GetApprovalInputDto,
    userId: string,
  ): Promise<readonly ApprovalAuditLogDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: input.approvalId },
      select: { id: true, projectId: true },
    });

    if (!request || request.projectId !== input.projectId) {
      throw new ApprovalNotFoundError(input.approvalId);
    }

    const logs = await this.prisma.approvalAuditLog.findMany({
      where: { approvalId: input.approvalId },
      orderBy: { timestamp: 'asc' },
    });

    return logs.map(l => ({
      id: l.id,
      approvalId: l.approvalId,
      projectId: l.projectId,
      userId: l.userId,
      threadId: l.threadId,
      taskId: l.taskId,
      executionStepId: l.executionStepId,
      eventType: l.eventType as ApprovalAuditEventType,
      actorType: l.actorType,
      actorId: l.actorId,
      transition: l.transition,
      metadata: (l.metadata as Record<string, unknown>) ?? {},
      timestamp: l.timestamp.toISOString(),
    }));
  }

  // ============================================================================
  // 9. Structured Decision Context for Agent
  // ============================================================================

  public async getStructuredDecision(
    approvalId: string,
    projectId: string,
  ): Promise<StructuredApprovalDecisionDto> {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalId },
    });

    if (!request || request.projectId !== projectId) {
      throw new ApprovalNotFoundError(approvalId);
    }

    return {
      approvalId: request.id,
      status: request.status,
      decision:
        request.status === 'APPROVED'
          ? 'APPROVED'
          : request.status === 'REJECTED'
            ? 'REJECTED'
            : request.status === 'EXPIRED'
              ? 'EXPIRED'
              : 'CANCELLED',
      actionHash: request.actionHash,
      respondedAt: request.respondedAt ? request.respondedAt.toISOString() : null,
      reason: request.responseReason ?? null,
    };
  }

  // ============================================================================
  // Expiration Sweep & Helpers
  // ============================================================================

  public async checkAndExpire(approvalId: string): Promise<boolean> {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalId },
    });
    if (!request || request.status !== 'PENDING') {
      return false;
    }
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      await this.expireRequest(approvalId, 'TTL_EXPIRED');
      return true;
    }
    return false;
  }

  public toStructuredDecision(approval: ApprovalRequestDto): StructuredApprovalDecisionDto {
    return {
      approvalId: approval.id,
      status: approval.status,
      decision: approval.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
      actionHash: approval.actionHash,
      respondedAt: approval.respondedAt ?? new Date().toISOString(),
      reason: approval.responseReason ?? null,
    };
  }

  public async sweepExpired(projectId: string): Promise<number> {
    const now = new Date();
    const expiredPending = await this.prisma.approvalRequest.findMany({
      where: {
        projectId,
        status: 'PENDING',
        expiresAt: { lte: now },
      },
      select: { id: true },
    });

    for (const exp of expiredPending) {
      await this.expireRequest(exp.id, 'TTL_EXPIRED').catch(() => {});
    }

    return expiredPending.length;
  }

  private async expireRequest(
    approvalId: string,
    reason: string,
  ): Promise<Prisma.ApprovalRequestGetPayload<object>> {
    const now = new Date();
    return await this.prisma.$transaction(async tx => {
      const updated = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: 'EXPIRED',
          responseReason: reason,
          respondedAt: now,
        },
      });

      await tx.approvalAuditLog.create({
        data: {
          approvalId: updated.id,
          projectId: updated.projectId,
          threadId: updated.threadId,
          taskId: updated.taskId,
          userId: updated.userId,
          executionStepId: updated.executionStepId,
          eventType: 'APPROVAL_EXPIRED',
          actorType: 'SYSTEM',
          actorId: 'system',
          transition: 'PENDING -> EXPIRED',
          metadata: { reason },
        },
      });

      return updated;
    });
  }

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new ApprovalNotFoundError(`Project "${projectId}" not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('approval.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new ApprovalUnauthorizedError(
        `User "${userId}" does not have access to project "${projectId}".`,
      );
    }
  }

  private mapToDto(record: Prisma.ApprovalRequestGetPayload<object>): ApprovalRequestDto {
    return {
      id: record.id,
      userId: record.userId,
      projectId: record.projectId,
      threadId: record.threadId,
      taskId: record.taskId,
      executionStepId: record.executionStepId,
      approvalType: record.approvalType,
      title: record.title,
      description: record.description,
      riskLevel: record.riskLevel,
      requestedAction: record.requestedAction,
      requestedInput: (record.requestedInput as Record<string, unknown>) ?? {},
      actionHash: record.actionHash,
      affectedFiles: (record.affectedFiles as string[]) ?? [],
      affectedTools: (record.affectedTools as string[]) ?? [],
      status: record.status,
      requestedAt: record.requestedAt.toISOString(),
      respondedAt: record.respondedAt ? record.respondedAt.toISOString() : null,
      respondedBy: record.respondedBy,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      responseReason: record.responseReason,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
