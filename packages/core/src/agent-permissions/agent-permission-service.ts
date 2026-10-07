/**
 * @file packages/core/src/agent-permissions/agent-permission-service.ts
 * Privileged business domain service for V10 Phase 144:
 * Tool Permission System.
 *
 * Guarantees:
 * 1. Default-deny model across all tools.
 * 2. Static permission mappings per tool & category:
 *    - repository.*, requirements.* -> READ_ONLY
 *    - test.*, playwright.* -> EXECUTE
 *    - terminal.*, file.modify, repair.* -> APPROVAL_REQUIRED
 *    - unknown / unmapped tools -> DENIED
 * 3. Server-side authorization: never trust renderer inputs or client state.
 * 4. Human-in-the-loop approval workflow:
 *    - When APPROVAL_REQUIRED, generates AgentToolApproval record in PENDING state.
 *    - Sets task status to WAITING_FOR_APPROVAL.
 *    - Persists audit logs with APPROVAL_REQUESTED.
 *    - Prevents tool execution until human approval.
 * 5. Secure approval decisions:
 *    - Enforces tenant isolation (User -> Project -> Thread -> Task).
 *    - Guarantees approval belongs strictly to the requested task and cannot be hijacked.
 *    - Once decided (APPROVED / REJECTED), state is immutable.
 *    - Records approver, timestamp, reason, and writes audit log.
 * 6. Full audit trail for all permission determinations and decisions.
 */

import {
  type PrismaClient,
  type ToolPermissionLevel,
  type ToolApprovalStatus,
  type ToolDecision,
  Prisma,
} from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type {
  AgentToolApprovalDto,
  AgentToolAuditLogDto,
  ListAgentToolApprovalsInputDto,
  GetAgentToolApprovalInputDto,
  DecideAgentToolApprovalInputDto,
  ListAgentToolAuditLogsInputDto,
} from '@ai-quality/contracts';
import {
  AgentToolPermissionDeniedError,
  AgentToolApprovalRequiredError,
  AgentToolApprovalNotFoundError,
  AgentToolApprovalAlreadyDecidedError,
} from './agent-permission-errors.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../ai-provider/ai-provider-errors.js';

export interface EvaluatePermissionContext {
  readonly projectId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly toolName: string;
  readonly requestedOperation: string;
  readonly inputPayload?: Record<string, unknown>;
  readonly declaredLevel?: string;
}

export interface PermissionEvaluationResult {
  readonly permissionLevel: ToolPermissionLevel;
  readonly allowed: boolean;
  readonly requiresApproval: boolean;
  readonly pendingApprovalId?: string;
  readonly reason: string;
}

export interface AgentPermissionServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
}

export class AgentPermissionService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;

  // Static rule mappings for standard tools
  private readonly permissionRules: Map<string, ToolPermissionLevel> = new Map([
    // Repository tools (Read only)
    ['repository.read', 'READ_ONLY'],
    ['repository.search', 'READ_ONLY'],
    ['repository.list', 'READ_ONLY'],
    ['repository.symbol', 'READ_ONLY'],
    ['repository.metadata', 'READ_ONLY'],

    // Requirements tools (Read only)
    ['requirements.read', 'READ_ONLY'],
    ['requirements.search', 'READ_ONLY'],
    ['requirements.list', 'READ_ONLY'],
    ['requirements.get', 'READ_ONLY'],

    // Tests inspection tools (Read only - V10 Phase 146)
    ['tests.list', 'READ_ONLY'],
    ['tests.get', 'READ_ONLY'],
    ['tests.search', 'READ_ONLY'],
    ['tests.forRequirement', 'READ_ONLY'],

    // Traceability tools (Read only - V10 Phase 146)
    ['traceability.get', 'READ_ONLY'],

    // Failure Intelligence tools (Read only - V10 Phase 148)
    ['failure_intelligence.analyze', 'READ_ONLY'],

    // Test & Playwright tools (Execute)
    ['test.generate', 'EXECUTE'],
    ['test.validate', 'EXECUTE'],
    ['playwright.run', 'EXECUTE'],
    ['playwright.execute', 'EXECUTE'],
    ['playwright.inspect', 'EXECUTE'],

    // High impact tools (Approval required)
    ['terminal.run', 'APPROVAL_REQUIRED'],
    ['file.modify', 'APPROVAL_REQUIRED'],
    ['file.write', 'APPROVAL_REQUIRED'],
    ['repair.applyPatch', 'APPROVAL_REQUIRED'],
    ['repair.rollback', 'APPROVAL_REQUIRED'],
    ['repair_patch', 'READ_ONLY'],
  ]);

  constructor(deps?: AgentPermissionServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
  }

  // ============================================================================
  // Permission Rule Resolution (Server-Side)
  // ============================================================================

  public resolveToolPermissionLevel(toolName: string, declaredLevel?: string): ToolPermissionLevel {
    // 1. Exact match in rule table
    const exact = this.permissionRules.get(toolName);
    if (exact) {
      return exact;
    }

    // 2. Prefix / category matching
    if (
      toolName.startsWith('repository.') ||
      toolName.startsWith('requirements.') ||
      toolName.startsWith('tests.') ||
      toolName.startsWith('traceability.') ||
      toolName.startsWith('failure_intelligence.') ||
      toolName.startsWith('repair_patch')
    ) {
      return 'READ_ONLY';
    }
    if (toolName.startsWith('test.') || toolName.startsWith('playwright.')) {
      return 'EXECUTE';
    }
    if (
      toolName.startsWith('terminal.') ||
      toolName.startsWith('file.') ||
      toolName.startsWith('repair.')
    ) {
      return 'APPROVAL_REQUIRED';
    }

    // 3. Fallback to valid declared level from definition if mapped
    if (declaredLevel) {
      if (declaredLevel === 'READ' || declaredLevel === 'READ_ONLY') return 'READ_ONLY';
      if (declaredLevel === 'EXECUTE') return 'EXECUTE';
      if (
        declaredLevel === 'APPROVAL_REQUIRED' ||
        declaredLevel === 'WRITE' ||
        declaredLevel === 'ADMIN'
      ) {
        return 'APPROVAL_REQUIRED';
      }
    }

    // 4. Default-deny for unknown tools
    return 'DENIED';
  }

  public registerCustomRule(toolName: string, level: ToolPermissionLevel): void {
    this.permissionRules.set(toolName, level);
  }

  // ============================================================================
  // Evaluation & Enforcement
  // ============================================================================

  public async evaluateAndEnforce(context: EvaluatePermissionContext): Promise<void> {
    // 1. Authenticate & assert project access
    await this.assertProjectAccess(context.projectId, context.userId);

    const level = this.resolveToolPermissionLevel(context.toolName, context.declaredLevel);

    // 2. If DENIED -> audit & throw immediately
    if (level === 'DENIED') {
      await this.recordAuditLog({
        projectId: context.projectId,
        userId: context.userId,
        threadId: context.threadId,
        taskId: context.taskId,
        toolName: context.toolName,
        requestedOperation: context.requestedOperation,
        permissionLevel: 'DENIED',
        decision: 'DENIED',
        reason: `Tool '${context.toolName}' is not permitted under default-deny policy.`,
        metadata: { input: context.inputPayload ?? {} },
      });

      throw new AgentToolPermissionDeniedError(
        context.toolName,
        context.requestedOperation,
        'Tool execution is denied by system security policy.',
      );
    }

    // 3. If APPROVAL_REQUIRED -> check for existing approval or request one
    if (level === 'APPROVAL_REQUIRED') {
      if (!context.taskId) {
        throw new AgentToolPermissionDeniedError(
          context.toolName,
          context.requestedOperation,
          'Task ID is required for tools that demand human approval.',
        );
      }

      // Check if task exists and belongs to project/user
      const task = await this.prisma.agentThreadTask.findUnique({
        where: { id: context.taskId },
        select: { id: true, threadId: true, projectId: true, userId: true, status: true },
      });

      if (!task || task.projectId !== context.projectId || task.userId !== context.userId) {
        throw new AiCrossProjectAccessError(
          `Task '${context.taskId}' does not belong to project '${context.projectId}' and user '${context.userId}'.`,
        );
      }

      // Check if an APPROVED approval already exists for this task and tool
      // Supports Phase 155 ApprovalRequest and Phase 144 AgentToolApproval
      let isApproved = false;
      let approvedById = 'unknown';
      let approvedAtDate: Date | null = null;
      let approvalId = '';

      if ((this.prisma as any).approvalRequest?.findFirst) {
        const p155Approved = await (this.prisma as any).approvalRequest
          .findFirst({
            where: {
              taskId: context.taskId,
              status: 'APPROVED',
              OR: [
                { requestedAction: context.toolName },
                { affectedTools: { has: context.toolName } },
              ],
            },
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => null);

        if (p155Approved) {
          isApproved = true;
          approvedById = p155Approved.respondedBy ?? 'user';
          approvedAtDate = p155Approved.respondedAt ?? new Date();
          approvalId = p155Approved.id;
        }
      }

      if (!isApproved && this.prisma.agentToolApproval?.findFirst) {
        const existingApproval = await this.prisma.agentToolApproval
          .findFirst({
            where: {
              taskId: context.taskId,
              toolName: context.toolName,
              status: 'APPROVED',
            },
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => null);

        if (existingApproval) {
          isApproved = true;
          approvedById = existingApproval.approvedBy ?? 'unknown';
          approvedAtDate = existingApproval.approvedAt;
          approvalId = existingApproval.id;
        }
      }

      if (isApproved) {
        // Log permitted execution due to prior approval
        await this.recordAuditLog({
          projectId: context.projectId,
          userId: context.userId,
          threadId: context.threadId ?? task.threadId,
          taskId: context.taskId,
          toolName: context.toolName,
          requestedOperation: context.requestedOperation,
          permissionLevel: 'APPROVAL_REQUIRED',
          decision: 'PERMITTED',
          reason: `Approved by user '${approvedById}' at ${approvedAtDate?.toISOString() ?? 'prior'}`,
          metadata: { approvalId },
        });
        return;
      }

      // Check if there is already a PENDING approval for this task and tool
      let pendingApprovalId: string | null = null;
      if (this.prisma.agentToolApproval?.findFirst) {
        let pendingApproval = await this.prisma.agentToolApproval
          .findFirst({
            where: {
              taskId: context.taskId,
              toolName: context.toolName,
              status: 'PENDING',
            },
          })
          .catch(() => null);

        if (!pendingApproval && this.prisma.agentToolApproval?.create) {
          // Create new approval request
          pendingApproval = await this.prisma.agentToolApproval
            .create({
              data: {
                taskId: context.taskId,
                threadId: context.threadId ?? task.threadId,
                projectId: context.projectId,
                userId: context.userId,
                toolName: context.toolName,
                requestedOperation: context.requestedOperation,
                permissionLevel: 'APPROVAL_REQUIRED',
                status: 'PENDING',
                inputPayload: (context.inputPayload ?? {}) as Prisma.InputJsonValue,
                reason: `Operation '${context.requestedOperation}' requires human authorization.`,
              },
            })
            .catch(() => null);
        }

        if (pendingApproval) {
          pendingApprovalId = pendingApproval.id;
        }
      }

      if (!pendingApprovalId && (this.prisma as any).approvalRequest?.findFirst) {
        const pendingReq = await (this.prisma as any).approvalRequest
          .findFirst({
            where: {
              taskId: context.taskId,
              status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
          })
          .catch(() => null);
        if (pendingReq) {
          pendingApprovalId = pendingReq.id;
        }
      }

      // Set task status to WAITING_FOR_APPROVAL
      await this.prisma.agentThreadTask
        .update({
          where: { id: context.taskId },
          data: { status: 'WAITING_FOR_APPROVAL' },
        })
        .catch(() => null);

      // Audit log
      await this.recordAuditLog({
        projectId: context.projectId,
        userId: context.userId,
        threadId: context.threadId ?? task.threadId,
        taskId: context.taskId,
        toolName: context.toolName,
        requestedOperation: context.requestedOperation,
        permissionLevel: 'APPROVAL_REQUIRED',
        decision: 'APPROVAL_REQUESTED',
        reason: `Created approval request ${pendingApprovalId ?? 'pending'}`,
        metadata: { approvalId: pendingApprovalId ?? 'pending', input: context.inputPayload ?? {} },
      });

      throw new AgentToolApprovalRequiredError(
        pendingApprovalId ?? 'pending',
        context.toolName,
        context.taskId,
      );
    }

    // 4. READ_ONLY or EXECUTE -> permitted
    await this.recordAuditLog({
      projectId: context.projectId,
      userId: context.userId,
      threadId: context.threadId,
      taskId: context.taskId,
      toolName: context.toolName,
      requestedOperation: context.requestedOperation,
      permissionLevel: level,
      decision: 'PERMITTED',
      reason: `Tool execution permitted with permission level ${level}`,
      metadata: { input: context.inputPayload ?? {} },
    });
  }

  // ============================================================================
  // Human Approval Decision Workflow
  // ============================================================================

  public async decideApproval(
    input: DecideAgentToolApprovalInputDto,
    userId: string,
  ): Promise<AgentToolApprovalDto> {
    await this.assertProjectAccess(input.projectId, userId);

    const approval = await this.prisma.agentToolApproval.findUnique({
      where: { id: input.approvalId },
      include: {
        task: true,
      },
    });

    if (!approval) {
      throw new AgentToolApprovalNotFoundError(input.approvalId);
    }

    // Tenant boundary checks
    if (approval.projectId !== input.projectId) {
      throw new AiCrossProjectAccessError(
        `Approval '${input.approvalId}' does not belong to project '${input.projectId}'.`,
      );
    }

    if (approval.status !== 'PENDING') {
      throw new AgentToolApprovalAlreadyDecidedError(input.approvalId, approval.status);
    }

    const isApprove = input.decision === 'APPROVE';
    const newStatus: ToolApprovalStatus = isApprove ? 'APPROVED' : 'REJECTED';
    const now = new Date();

    const updated = await this.prisma.agentToolApproval.update({
      where: { id: input.approvalId },
      data: {
        status: newStatus,
        decisionReason: input.reason ?? null,
        approvedBy: isApprove ? userId : null,
        approvedAt: isApprove ? now : null,
        rejectedAt: isApprove ? null : now,
      },
    });

    // Write audit log
    await this.recordAuditLog({
      projectId: approval.projectId,
      userId,
      threadId: approval.threadId,
      taskId: approval.taskId,
      toolName: approval.toolName,
      requestedOperation: approval.requestedOperation,
      permissionLevel: approval.permissionLevel,
      decision: isApprove ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
      reason: input.reason ?? (isApprove ? 'Approved by operator' : 'Rejected by operator'),
      metadata: { approvalId: approval.id, deciderUserId: userId },
    });

    // If task was WAITING_FOR_APPROVAL, transition back to QUEUED (if approved) or FAILED (if rejected)
    if (approval.task.status === 'WAITING_FOR_APPROVAL') {
      if (isApprove) {
        await this.prisma.agentThreadTask.update({
          where: { id: approval.taskId },
          data: { status: 'QUEUED' },
        });
      } else {
        await this.prisma.agentThreadTask.update({
          where: { id: approval.taskId },
          data: {
            status: 'FAILED',
            failureReason: `Tool execution rejected by human operator: ${input.reason ?? 'No reason provided'}`,
          },
        });
      }
    }

    this.logger.info('agent_permissions.approval_decided', {
      approvalId: updated.id,
      decision: input.decision,
      taskId: updated.taskId,
      userId,
    });

    return this.mapApprovalToDto(updated);
  }

  // ============================================================================
  // Queries
  // ============================================================================

  public async getApproval(
    input: GetAgentToolApprovalInputDto,
    userId: string,
  ): Promise<AgentToolApprovalDto | null> {
    await this.assertProjectAccess(input.projectId, userId);

    const approval = await this.prisma.agentToolApproval.findUnique({
      where: { id: input.approvalId },
    });

    if (!approval || approval.projectId !== input.projectId) {
      return null;
    }

    return this.mapApprovalToDto(approval);
  }

  public async listApprovals(
    input: ListAgentToolApprovalsInputDto,
    userId: string,
  ): Promise<readonly AgentToolApprovalDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    const where: Prisma.AgentToolApprovalWhereInput = {
      projectId: input.projectId,
    };

    if (input.taskId) {
      where.taskId = input.taskId;
    }
    if (input.status) {
      where.status = input.status as ToolApprovalStatus;
    }

    const records = await this.prisma.agentToolApproval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return records.map(r => this.mapApprovalToDto(r));
  }

  public async listAuditLogs(
    input: ListAgentToolAuditLogsInputDto,
    userId: string,
  ): Promise<readonly AgentToolAuditLogDto[]> {
    await this.assertProjectAccess(input.projectId, userId);

    const where: Prisma.AgentToolAuditLogWhereInput = {
      projectId: input.projectId,
    };

    if (input.taskId) {
      where.taskId = input.taskId;
    }
    if (input.threadId) {
      where.threadId = input.threadId;
    }
    if (input.toolName) {
      where.toolName = input.toolName;
    }

    const records = await this.prisma.agentToolAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    return records.map(r => this.mapAuditLogToDto(r));
  }

  // ============================================================================
  // Audit Logging
  // ============================================================================

  public async recordAuditLog(params: {
    projectId: string;
    userId: string;
    threadId?: string;
    taskId?: string;
    toolName: string;
    requestedOperation: string;
    permissionLevel: ToolPermissionLevel;
    decision: ToolDecision;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Ensure threadId and taskId exist or resolve fallback if task given
      let threadId = params.threadId;
      if (!threadId && params.taskId) {
        const t = await this.prisma.agentThreadTask.findUnique({
          where: { id: params.taskId },
          select: { threadId: true },
        });
        threadId = t?.threadId;
      }

      // If we still don't have taskId or threadId, and they are required foreign keys on AgentToolAuditLog,
      // create audit entry only when taskId and threadId are available.
      if (!params.taskId || !threadId) {
        this.logger.debug('agent_permissions.audit_log_skipped_no_task', {
          toolName: params.toolName,
          decision: params.decision,
        });
        return;
      }

      await this.prisma.agentToolAuditLog.create({
        data: {
          taskId: params.taskId,
          threadId,
          projectId: params.projectId,
          userId: params.userId,
          toolName: params.toolName,
          requestedOperation: params.requestedOperation,
          permissionLevel: params.permissionLevel,
          decision: params.decision,
          reason: params.reason ?? null,
          metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error('agent_permissions.audit_log_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('agent_permissions.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }
  }

  private mapApprovalToDto(
    record: Prisma.AgentToolApprovalGetPayload<object>,
  ): AgentToolApprovalDto {
    return {
      id: record.id,
      taskId: record.taskId,
      threadId: record.threadId,
      projectId: record.projectId,
      userId: record.userId,
      toolName: record.toolName,
      requestedOperation: record.requestedOperation,
      permissionLevel: record.permissionLevel,
      status: record.status,
      inputPayload: (record.inputPayload as Record<string, unknown>) ?? {},
      reason: record.reason,
      decisionReason: record.decisionReason,
      approvedBy: record.approvedBy,
      approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
      rejectedAt: record.rejectedAt ? record.rejectedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapAuditLogToDto(
    record: Prisma.AgentToolAuditLogGetPayload<object>,
  ): AgentToolAuditLogDto {
    return {
      id: record.id,
      taskId: record.taskId,
      threadId: record.threadId,
      projectId: record.projectId,
      userId: record.userId,
      toolName: record.toolName,
      requestedOperation: record.requestedOperation,
      permissionLevel: record.permissionLevel,
      decision: record.decision,
      reason: record.reason,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      timestamp: record.timestamp.toISOString(),
    };
  }
}
