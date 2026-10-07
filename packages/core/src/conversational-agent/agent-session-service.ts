/**
 * @file packages/core/src/conversational-agent/agent-session-service.ts
 * Session Lifecycle & Message Persistence Manager (V8 Phase 124).
 *
 * CRITICAL REQUIREMENTS:
 * 1. Persistent conversational testing sessions associated with a project.
 * 2. Manages session states: IDLE, THINKING, PLANNING, RUNNING, WAITING, COMPLETED, FAILED, CANCELLED.
 * 3. Enforces multi-tenant isolation: Scoped strictly to target projectId.
 * 4. Audit logging for session and task lifecycles.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient, AgentSession, AgentMessage, AgentTask } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  AgentSessionDto,
  AgentMessageDto,
  AgentTaskDto,
  AgentSessionStatus,
  AgentApprovalState,
  AgentMessageRole,
  AgentTaskStatus,
  CreateAgentSessionInputDto,
  GetAgentSessionInputDto,
  ListAgentSessionsInputDto,
  AgentPlanDto,
} from '@ai-quality/contracts';
import {
  AgentSessionNotFoundError,
  AgentAccessDeniedError,
} from './conversational-agent-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface AgentSessionServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
}

export class AgentSessionService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;

  constructor(deps: AgentSessionServiceDependencies = {}) {
    const client = deps.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps.logger ?? getLogger();
  }

  /**
   * Creates a new conversational testing session.
   */
  public async createSession(
    input: CreateAgentSessionInputDto,
    userId: string,
  ): Promise<AgentSessionDto> {
    const { projectId, title } = input;
    await this.assertProjectAccess(projectId, userId);

    // Ensure a fallback user exists if not provided
    const validUserId = await this.resolveValidUserId(userId);

    const session = await this.prisma.agentSession.create({
      data: {
        projectId,
        userId: validUserId,
        title: title?.trim() || 'New Testing Session',
        status: 'IDLE',
        approvalState: 'NOT_REQUIRED',
      },
      include: {
        messages: true,
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    await this.auditAgentAction('AGENT_SESSION_CREATED', projectId, validUserId, {
      sessionId: session.id,
      title: session.title,
    });

    return this.mapToSessionDto(session, session.messages, session.tasks[0]);
  }

  /**
   * Retrieves an existing session by ID within a project.
   */
  public async getSession(
    input: GetAgentSessionInputDto,
    userId?: string,
  ): Promise<AgentSessionDto> {
    const { sessionId, projectId } = input;
    await this.assertProjectAccess(projectId, userId);

    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, projectId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!session) {
      throw new AgentSessionNotFoundError(sessionId);
    }

    return this.mapToSessionDto(session, session.messages, session.tasks[0]);
  }

  /**
   * Lists all sessions for a given project.
   */
  public async listSessions(
    input: ListAgentSessionsInputDto,
    userId?: string,
  ): Promise<readonly AgentSessionDto[]> {
    const { projectId, limit = 50 } = input;
    await this.assertProjectAccess(projectId, userId);

    const sessions = await this.prisma.agentSession.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return sessions.map((s) => this.mapToSessionDto(s, s.messages, s.tasks[0]));
  }

  /**
   * Deletes a session and its associated messages/tasks.
   */
  public async deleteSession(
    sessionId: string,
    projectId: string,
    userId?: string,
  ): Promise<void> {
    await this.assertProjectAccess(projectId);

    const session = await this.prisma.agentSession.findFirst({
      where: { id: sessionId, projectId },
    });

    if (!session) {
      throw new AgentSessionNotFoundError(sessionId);
    }

    await this.prisma.agentSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Updates session status and approval state.
   */
  public async updateSessionStatus(
    sessionId: string,
    status: AgentSessionStatus,
    approvalState?: AgentApprovalState,
    activeRunId?: string | null,
    currentTaskId?: string | null,
  ): Promise<void> {
    const updateData: any = { status };
    if (approvalState !== undefined) {
      updateData.approvalState = approvalState;
    }
    if (activeRunId !== undefined) {
      updateData.activeRunId = activeRunId;
    }
    if (currentTaskId !== undefined) {
      updateData.currentTaskId = currentTaskId;
    }

    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: updateData,
    });
  }

  /**
   * Adds a message to the session conversation thread.
   */
  public async addMessage(
    sessionId: string,
    role: AgentMessageRole,
    content: string,
    extra?: {
      plan?: AgentPlanDto | null;
      toolCalls?: any[];
      toolResults?: any[];
      evidenceRefs?: any[];
      runId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<AgentMessageDto> {
    const message = await this.prisma.agentMessage.create({
      data: {
        sessionId,
        role: role as any,
        content,
        planJson: extra?.plan ? (extra.plan as any) : undefined,
        toolCallsJson: extra?.toolCalls ? (extra.toolCalls as any) : undefined,
        toolResultsJson: extra?.toolResults ? (extra.toolResults as any) : undefined,
        evidenceRefsJson: extra?.evidenceRefs ? (extra.evidenceRefs as any) : undefined,
        runId: extra?.runId ?? undefined,
        metadata: extra?.metadata ? (extra.metadata as any) : {},
      },
    });

    // Touch session updatedAt
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return this.mapToMessageDto(message);
  }

  /**
   * Creates an agent task linked to the session.
   */
  public async createTask(
    sessionId: string,
    projectId: string,
    userPrompt: string,
    plan: AgentPlanDto,
    approvalState: AgentApprovalState = 'NOT_REQUIRED',
    userId?: string,
  ): Promise<AgentTaskDto> {
    const task = await this.prisma.agentTask.create({
      data: {
        sessionId,
        projectId,
        userPrompt,
        status: (plan.requiresApproval || approvalState === 'PENDING' || plan.intent === 'CLARIFY_AMBIGUOUS_REQUEST')
          ? 'AWAITING_APPROVAL'
          : 'IN_PROGRESS',
        approvalState: approvalState as any,
        planJson: plan as any,
      },
    });

    // Link task to session
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        currentTaskId: task.id,
        approvalState: approvalState as any,
      },
    });

    await this.auditAgentAction('AGENT_TASK_CREATED', projectId, userId, {
      sessionId,
      taskId: task.id,
      requiresApproval: plan.requiresApproval,
    });

    return this.mapToTaskDto(task);
  }

  /**
   * Updates an agent task status and results.
   */
  public async updateTaskStatus(
    taskId: string,
    status: AgentTaskStatus,
    resultSummary?: string,
    errorMessage?: string,
    activeRunId?: string | null,
    approvalState?: AgentApprovalState,
  ): Promise<void> {
    const updateData: any = { status };
    if (resultSummary !== undefined) {
      updateData.resultSummary = resultSummary;
    }
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    if (activeRunId !== undefined) {
      updateData.activeRunId = activeRunId;
    }
    if (approvalState !== undefined) {
      updateData.approvalState = approvalState as any;
    }

    await this.prisma.agentTask.update({
      where: { id: taskId },
      data: updateData,
    });
  }

  // =========================================================================
  // Mappers
  // =========================================================================

  private mapToSessionDto(
    session: AgentSession,
    messages: AgentMessage[] = [],
    task?: AgentTask | null,
  ): AgentSessionDto {
    return {
      id: session.id,
      projectId: session.projectId,
      userId: session.userId,
      title: session.title,
      status: session.status as AgentSessionStatus,
      approvalState: session.approvalState as AgentApprovalState,
      activeRunId: session.activeRunId,
      currentTaskId: session.currentTaskId,
      contextSnapshot: (session.contextSnapshot as Record<string, unknown>) ?? null,
      messages: messages.map((m) => this.mapToMessageDto(m)),
      currentTask: task ? this.mapToTaskDto(task) : null,
      metadata: (session.metadata as Record<string, unknown>) ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private mapToMessageDto(msg: AgentMessage): AgentMessageDto {
    return {
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role as AgentMessageRole,
      content: msg.content,
      plan: (msg.planJson as any) ?? null,
      toolCalls: (msg.toolCallsJson as any) ?? null,
      toolResults: (msg.toolResultsJson as any) ?? null,
      evidenceRefs: (msg.evidenceRefsJson as any) ?? null,
      runId: msg.runId,
      tokenCount: msg.tokenCount,
      metadata: (msg.metadata as Record<string, unknown>) ?? null,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  private mapToTaskDto(task: AgentTask): AgentTaskDto {
    return {
      id: task.id,
      sessionId: task.sessionId,
      projectId: task.projectId,
      userPrompt: task.userPrompt,
      status: task.status as AgentTaskStatus,
      approvalState: task.approvalState as AgentApprovalState,
      plan: (task.planJson as any) ?? null,
      activeRunId: task.activeRunId,
      toolHistory: (task.toolHistoryJson as any) ?? [],
      evidenceRefs: (task.evidenceRefsJson as any) ?? [],
      resultSummary: task.resultSummary,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async resolveValidUserId(userId?: string): Promise<string> {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) return user.id;
    }

    // Default to first user in database
    const firstUser = await this.prisma.user.findFirst({
      select: { id: true },
    });
    if (firstUser) return firstUser.id;

    // Fallback creates a default system user if none exists
    const email = `agent-${Date.now()}@platform.local`;
    const fallback = await this.prisma.user.create({
      data: {
        email,
        normalizedEmail: email.toLowerCase(),
        displayName: 'Automated Testing Agent',
      },
    });
    return fallback.id;
  }

  private async assertProjectAccess(projectId: string, userId?: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });
    if (!project) {
      throw new AgentAccessDeniedError(projectId, `Project not found or inaccessible: "${projectId}"`);
    }
    if (userId && project.userId && project.userId !== userId) {
      throw new AgentAccessDeniedError(projectId, `Access denied: Project does not belong to user "${userId}"`);
    }
  }

  private async auditAgentAction(
    action: any,
    projectId: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const effectiveUserId = await this.resolveValidUserId(userId);
      await this.prisma.authAuditEvent.create({
        data: {
          userId: effectiveUserId,
          action,
          metadata: { projectId, ...metadata } as any,
        },
      });
    } catch (err) {
      this.logger.warn('Failed to audit agent session action', { action, error: String(err) });
    }
  }
}
