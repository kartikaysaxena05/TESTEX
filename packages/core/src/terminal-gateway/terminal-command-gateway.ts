/**
 * @file packages/core/src/terminal-gateway/terminal-command-gateway.ts
 * Centralized, sandboxed Terminal Command Gateway for V10 Phase 151.
 *
 * Guarantees:
 * 1. Single entry point for all agent terminal executions.
 * 2. Multi-tenant and worktree containment (User -> Project -> Thread -> Task).
 * 3. Command policy evaluation (SAFE, REQUIRES_APPROVAL, BLOCKED).
 * 4. Human-in-the-loop approval integration with Phase 144 permissions.
 * 5. Environment isolation & secret redaction in output.
 * 6. ExecutionStep and audit log persistence in Postgres.
 * 7. Active process tracking, timeout enforcement, and cancellation.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  TerminalExecuteInputDto,
  AgentTerminalExecutionDto,
  GetTerminalExecutionInputDto,
  ListTerminalExecutionsInputDto,
  ApproveTerminalExecutionInputDto,
  RejectTerminalExecutionInputDto,
  CancelTerminalExecutionInputDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../ai-provider/ai-provider-errors.js';
import { AgentThreadService } from '../agent-threads/agent-thread-service.js';
import { AgentPermissionService } from '../agent-permissions/agent-permission-service.js';
import { CommandPolicyEngine, type CommandEvaluationResult } from './command-policy-engine.js';
import { TerminalSanitizer } from './terminal-sanitizer.js';
import { TerminalProcessRunner } from './terminal-process-runner.js';
import {
  TerminalGatewayError,
  TerminalValidationError,
  TerminalPathTraversalError,
  TerminalOutsideWorktreeError,
  TerminalCommandBlockedError,
  TerminalApprovalRequiredError,
  TerminalSelfApprovalForbiddenError,
  TerminalExecutionNotFoundError,
  TerminalAlreadyDecidedError,
  TerminalCancelledError,
} from './terminal-errors.js';

export interface TerminalGatewayOptions {
  readonly prisma?: PrismaClient;
  readonly threadService?: AgentThreadService;
  readonly permissionService?: AgentPermissionService;
  readonly logger?: ILogger;
}

export class TerminalCommandGateway {
  private readonly prisma: PrismaClient;
  private readonly threadService: AgentThreadService;
  private readonly permissionService: AgentPermissionService;
  private readonly logger: ILogger;

  // Active runners map for task cancellation & abortion
  private readonly activeRunners = new Map<string, { runner: TerminalProcessRunner; abortController: AbortController }>();

  // Active decision locks per executionId
  private readonly activeDecisions = new Set<string>();

  constructor(options: TerminalGatewayOptions = {}) {
    const client = options.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not available for TerminalCommandGateway.');
    }
    this.prisma = client;
    this.logger = options.logger ?? getLogger();
    this.threadService =
      options.threadService ?? new AgentThreadService({ prisma: this.prisma, logger: this.logger });
    this.permissionService =
      options.permissionService ?? new AgentPermissionService({ prisma: this.prisma, logger: this.logger });
  }

  // ============================================================================
  // 1. Execute Command (Main Gateway Entry Point)
  // ============================================================================

  public async executeCommand(
    input: TerminalExecuteInputDto,
    userId: string,
  ): Promise<AgentTerminalExecutionDto> {
    const { projectId, taskId, threadId, command, workingDirectory, timeoutMs, maxOutputBytes, metadata } =
      input;

    // 1. Multi-tenant authorization
    await this.assertProjectAccess(projectId, userId);
    const task = await this.assertTaskAccess(projectId, taskId);
    const resolvedThreadId = threadId ?? task.threadId;

    // 2. Resolve project worktree and validate workingDirectory containment
    const worktreeRoot = await this.resolveProjectWorktreeRoot(projectId);
    const resolvedCwd = await this.validateAndResolveWorkingDirectory(worktreeRoot, workingDirectory);

    // 3. Command policy evaluation
    const evaluation = CommandPolicyEngine.evaluate(command);

    if (evaluation.classification === 'BLOCKED') {
      // Record audit log
      await this.recordAuditLog({
        projectId,
        userId,
        taskId,
        threadId: resolvedThreadId,
        toolName: 'terminal.run',
        requestedOperation: command,
        permissionLevel: 'DENIED',
        decision: 'DENIED',
        reason: evaluation.reason,
        metadata: { command, cwd: resolvedCwd },
      });

      // Persist blocked execution record
      const execution = await (this.prisma as any).agentTerminalExecution.create({
        data: {
          projectId,
          taskId,
          threadId: resolvedThreadId,
          command,
          workingDirectory: resolvedCwd,
          status: 'BLOCKED',
          policyDecision: 'BLOCKED',
          policyReason: evaluation.reason,
          stderr: `Command blocked by security policy: ${evaluation.reason}`,
          timeoutMs: timeoutMs ?? 30000,
          maxOutputBytes: maxOutputBytes ?? 524288,
          metadata: (metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      throw new TerminalCommandBlockedError(command, evaluation.reason);
    }

    // 4. Check if command REQUIRES_APPROVAL
    if (evaluation.classification === 'REQUIRES_APPROVAL') {
      // Check if an existing APPROVED tool approval is present
      const existingApproval = await this.prisma.agentToolApproval.findFirst({
        where: {
          taskId,
          toolName: 'terminal.run',
          status: 'APPROVED',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!existingApproval) {
        // Create execution record in WAITING_FOR_APPROVAL
        const execution = await (this.prisma as any).agentTerminalExecution.create({
          data: {
            projectId,
            taskId,
            threadId: resolvedThreadId,
            command,
            workingDirectory: resolvedCwd,
            status: 'WAITING_FOR_APPROVAL',
            policyDecision: 'REQUIRES_APPROVAL',
            policyReason: evaluation.reason,
            timeoutMs: timeoutMs ?? 30000,
            maxOutputBytes: maxOutputBytes ?? 524288,
            metadata: (metadata ?? {}) as Prisma.InputJsonValue,
          },
        });

        // Trigger Phase 144 tool approval creation & transition task to WAITING_FOR_APPROVAL
        try {
          await this.permissionService.evaluateAndEnforce({
            projectId,
            userId,
            threadId: resolvedThreadId,
            taskId,
            toolName: 'terminal.run',
            requestedOperation: command,
            inputPayload: { command, cwd: resolvedCwd, executionId: execution.id },
            declaredLevel: 'APPROVAL_REQUIRED',
          });
        } catch {
          // Expected AgentToolApprovalRequiredError
        }

        // Add execution step recording waiting status
        try {
          await this.threadService.addExecutionStep(
            {
              projectId,
              taskId,
              stepType: 'TERMINAL_APPROVAL_REQUESTED',
              title: `Terminal command '${evaluation.binary}' requires human approval`,
              inputReference: command,
              metadata: { executionId: execution.id, reason: evaluation.reason },
            },
            userId,
          );
        } catch {
          // Non-critical if step creation fails
        }

        return this.mapExecutionToDto(execution);
      }
    }

    // 5. If SAFE or already APPROVED -> Dispatch process execution
    return this.runProcessInternal({
      executionId: crypto.randomUUID(),
      projectId,
      taskId,
      threadId: resolvedThreadId,
      command,
      binary: evaluation.binary,
      args: evaluation.args,
      workingDirectory: resolvedCwd,
      timeoutMs: timeoutMs ?? 30000,
      maxOutputBytes: maxOutputBytes ?? 524288,
      policyDecision: evaluation.classification,
      policyReason: evaluation.reason,
      userId,
      metadata: metadata ?? {},
    });
  }

  /**
   * Internal process execution orchestrator with step tracking and process lifecycle.
   */
  private async runProcessInternal(params: {
    executionId: string;
    projectId: string;
    taskId: string;
    threadId: string;
    command: string;
    binary: string;
    args: readonly string[];
    workingDirectory: string;
    timeoutMs: number;
    maxOutputBytes: number;
    policyDecision: 'SAFE' | 'REQUIRES_APPROVAL';
    policyReason: string;
    userId: string;
    metadata: Record<string, unknown>;
  }): Promise<AgentTerminalExecutionDto> {
    const {
      executionId,
      projectId,
      taskId,
      threadId,
      command,
      binary,
      args,
      workingDirectory,
      timeoutMs,
      maxOutputBytes,
      policyDecision,
      policyReason,
      userId,
      metadata,
    } = params;

    // Persist execution record in RUNNING status
    const execution = await (this.prisma as any).agentTerminalExecution.create({
      data: {
        id: executionId,
        projectId,
        taskId,
        threadId,
        command,
        workingDirectory,
        status: 'RUNNING',
        policyDecision,
        policyReason,
        timeoutMs,
        maxOutputBytes,
        metadata: metadata as Prisma.InputJsonValue,
        startedAt: new Date(),
      },
    });

    // Create ExecutionStep
    let stepId: string | null = null;
    try {
      const step = await this.threadService.addExecutionStep(
        {
          projectId,
          taskId,
          stepType: 'TERMINAL_EXECUTION',
          title: `Run command: ${command.slice(0, 80)}`,
          inputReference: command,
          metadata: { executionId, binary, cwd: workingDirectory },
        },
        userId,
      );
      stepId = step.id;
      await (this.prisma as any).agentTerminalExecution.update({
        where: { id: executionId },
        data: { stepId },
      });
    } catch {
      // Non-critical
    }

    // Prepare sandboxed runner
    const runner = new TerminalProcessRunner();
    const abortController = new AbortController();
    this.activeRunners.set(executionId, { runner, abortController });

    const cleanEnv = TerminalSanitizer.filterEnvironment(process.env, workingDirectory);

    try {
      const runResult = await runner.execute({
        binary,
        args,
        cwd: workingDirectory,
        env: cleanEnv,
        timeoutMs,
        maxOutputBytes,
        signal: abortController.signal,
      });

      const finalStatus = runResult.cancelled
        ? 'CANCELLED'
        : runResult.timedOut
        ? 'TIMED_OUT'
        : runResult.exitCode === 0
        ? 'COMPLETED'
        : 'FAILED';

      // Update execution in DB
      const updated = await (this.prisma as any).agentTerminalExecution.update({
        where: { id: executionId },
        data: {
          status: finalStatus,
          exitCode: runResult.exitCode,
          stdout: runResult.stdout,
          stderr: runResult.stderr,
          durationMs: runResult.durationMs,
          timedOut: runResult.timedOut,
          cancelled: runResult.cancelled,
          completedAt: new Date(),
        },
      });

      // Update ExecutionStep
      if (stepId) {
        try {
          await this.threadService.updateExecutionStepStatus(
            {
              projectId,
              stepId,
              status: finalStatus === 'COMPLETED' ? 'COMPLETED' : finalStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
              outputReference: runResult.stdout.slice(0, 500),
              error: runResult.stderr ? runResult.stderr.slice(0, 500) : undefined,
            },
            userId,
          );
        } catch {
          // Non-critical
        }
      }

      // Record audit log
      await this.recordAuditLog({
        projectId,
        userId,
        taskId,
        threadId,
        toolName: 'terminal.run',
        requestedOperation: command,
        permissionLevel: policyDecision === 'SAFE' ? 'READ_ONLY' : 'APPROVAL_REQUIRED',
        decision: 'PERMITTED',
        reason: `Process exited with code ${runResult.exitCode ?? 'none'} (${finalStatus})`,
        metadata: {
          executionId,
          durationMs: runResult.durationMs,
          timedOut: runResult.timedOut,
          cancelled: runResult.cancelled,
        },
      });

      return this.mapExecutionToDto(updated);
    } finally {
      this.activeRunners.delete(executionId);
    }
  }

  // ============================================================================
  // 2. Human Approval Gate
  // ============================================================================

  public async approveExecution(
    input: ApproveTerminalExecutionInputDto,
    userId: string,
  ): Promise<AgentTerminalExecutionDto> {
    const { projectId, executionId, approvedBy, reason } = input;
    await this.assertProjectAccess(projectId, userId);

    if (this.activeDecisions.has(executionId)) {
      throw new TerminalValidationError(`Decision for terminal execution '${executionId}' is currently in progress.`);
    }
    this.activeDecisions.add(executionId);

    try {
      const execution = await (this.prisma as any).agentTerminalExecution.findFirst({
        where: { id: executionId, projectId },
      });

      if (!execution) {
        throw new TerminalExecutionNotFoundError(executionId, projectId);
      }

      if (execution.status !== 'WAITING_FOR_APPROVAL') {
        throw new TerminalAlreadyDecidedError(executionId, execution.status);
      }

      // Autonomous actor cannot self-approve
      const approver = approvedBy ?? userId;
      if (approver.toLowerCase().startsWith('agent') || approver.toLowerCase().startsWith('ai_')) {
        throw new TerminalSelfApprovalForbiddenError(approver);
      }

      // Re-evaluate command before execution
      const evaluation = CommandPolicyEngine.evaluate(execution.command);
      if (evaluation.classification === 'BLOCKED') {
        throw new TerminalCommandBlockedError(execution.command, evaluation.reason);
      }

      // Mark approved in DB
      await (this.prisma as any).agentTerminalExecution.update({
        where: { id: executionId },
        data: {
          approvedBy: approver,
          approvedAt: new Date(),
        },
      });

      // Dispatch execution
      return await this.runProcessInternal({
        executionId: execution.id,
        projectId: execution.projectId,
        taskId: execution.taskId,
        threadId: execution.threadId,
        command: execution.command,
        binary: evaluation.binary,
        args: evaluation.args,
        workingDirectory: execution.workingDirectory,
        timeoutMs: execution.timeoutMs,
        maxOutputBytes: execution.maxOutputBytes,
        policyDecision: 'REQUIRES_APPROVAL',
        policyReason: reason ?? 'Approved by human operator.',
        userId,
        metadata: (execution.metadata ?? {}) as Record<string, unknown>,
      });
    } finally {
      this.activeDecisions.delete(executionId);
    }
  }

  public async rejectExecution(
    input: RejectTerminalExecutionInputDto,
    userId: string,
  ): Promise<AgentTerminalExecutionDto> {
    const { projectId, executionId, rejectedBy, reason } = input;
    await this.assertProjectAccess(projectId, userId);

    const execution = await (this.prisma as any).agentTerminalExecution.findFirst({
      where: { id: executionId, projectId },
    });

    if (!execution) {
      throw new TerminalExecutionNotFoundError(executionId, projectId);
    }

    if (execution.status !== 'WAITING_FOR_APPROVAL') {
      throw new TerminalAlreadyDecidedError(executionId, execution.status);
    }

    const updated = await (this.prisma as any).agentTerminalExecution.update({
      where: { id: executionId },
      data: {
        status: 'BLOCKED',
        policyReason: `Rejected by human operator (${rejectedBy}): ${reason}`,
        completedAt: new Date(),
      },
    });

    await this.recordAuditLog({
      projectId,
      userId,
      taskId: execution.taskId,
      threadId: execution.threadId,
      toolName: 'terminal.run',
      requestedOperation: execution.command,
      permissionLevel: 'APPROVAL_REQUIRED',
      decision: 'APPROVAL_REJECTED',
      reason,
      metadata: { executionId, rejectedBy },
    });

    return this.mapExecutionToDto(updated);
  }

  // ============================================================================
  // 3. Cancellation
  // ============================================================================

  public async cancelExecution(
    input: CancelTerminalExecutionInputDto,
    userId: string,
  ): Promise<AgentTerminalExecutionDto> {
    const { projectId, executionId, reason } = input;
    await this.assertProjectAccess(projectId, userId);

    const execution = await (this.prisma as any).agentTerminalExecution.findFirst({
      where: { id: executionId, projectId },
    });

    if (!execution) {
      throw new TerminalExecutionNotFoundError(executionId, projectId);
    }

    // If active process is running, abort and terminate
    const active = this.activeRunners.get(executionId);
    if (active) {
      active.abortController.abort();
      active.runner.cancel();
      this.activeRunners.delete(executionId);
    }

    const updated = await (this.prisma as any).agentTerminalExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED',
        cancelled: true,
        completedAt: new Date(),
        stderr: execution.stderr + (reason ? `\nCancelled: ${reason}` : '\nExecution cancelled by user.'),
      },
    });

    return this.mapExecutionToDto(updated);
  }

  /**
   * Cancels all active terminal executions for a cancelled task.
   */
  public async cancelExecutionsForTask(taskId: string, projectId: string): Promise<void> {
    const running = await (this.prisma as any).agentTerminalExecution.findMany({
      where: { taskId, projectId, status: { in: ['QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL'] } },
    });

    for (const exec of running) {
      const active = this.activeRunners.get(exec.id);
      if (active) {
        active.abortController.abort();
        active.runner.cancel();
        this.activeRunners.delete(exec.id);
      }

      await (this.prisma as any).agentTerminalExecution.update({
        where: { id: exec.id },
        data: {
          status: 'CANCELLED',
          cancelled: true,
          completedAt: new Date(),
        },
      });
    }
  }

  // ============================================================================
  // 4. Retrieval & Querying
  // ============================================================================

  public async getExecution(
    input: GetTerminalExecutionInputDto,
    userId: string,
  ): Promise<AgentTerminalExecutionDto | null> {
    const { projectId, executionId } = input;
    await this.assertProjectAccess(projectId, userId);

    const execution = await (this.prisma as any).agentTerminalExecution.findFirst({
      where: { id: executionId, projectId },
    });

    if (!execution) return null;
    return this.mapExecutionToDto(execution);
  }

  public async listExecutions(
    input: ListTerminalExecutionsInputDto,
    userId: string,
  ): Promise<readonly AgentTerminalExecutionDto[]> {
    const { projectId, taskId, threadId, status, limit } = input;
    await this.assertProjectAccess(projectId, userId);

    const where: any = { projectId };
    if (taskId) where.taskId = taskId;
    if (threadId) where.threadId = threadId;
    if (status) where.status = status;

    const executions = await (this.prisma as any).agentTerminalExecution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ?? 50,
    });

    return executions.map((e: any) => this.mapExecutionToDto(e));
  }

  // ============================================================================
  // 5. Worktree Resolution & Path Validation
  // ============================================================================

  public async resolveProjectWorktreeRoot(projectId: string): Promise<string> {
    const source = await this.prisma.projectSource.findFirst({
      where: { projectId },
      select: { rootPath: true },
    });

    if (source?.rootPath && fs.existsSync(source.rootPath)) {
      return path.resolve(fs.realpathSync(source.rootPath));
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    const fallbackDir = path.resolve(process.cwd());
    return fallbackDir;
  }

  public async validateAndResolveWorkingDirectory(
    worktreeRoot: string,
    requestedCwd?: string,
  ): Promise<string> {
    if (!requestedCwd || requestedCwd.trim().length === 0) {
      return worktreeRoot;
    }

    // Block path traversal and control characters
    if (
      requestedCwd.includes('..') ||
      requestedCwd.includes('\0') ||
      requestedCwd.includes('%2e') ||
      requestedCwd.includes('%2E')
    ) {
      throw new TerminalPathTraversalError(requestedCwd);
    }

    const resolved = path.isAbsolute(requestedCwd)
      ? path.resolve(requestedCwd)
      : path.resolve(worktreeRoot, requestedCwd);

    // Verify resolved directory is inside worktree
    const canonicalWorktree = fs.existsSync(worktreeRoot)
      ? fs.realpathSync(worktreeRoot)
      : path.resolve(worktreeRoot);

    if (!fs.existsSync(resolved)) {
      throw new TerminalValidationError(`Requested working directory '${requestedCwd}' does not exist.`);
    }

    const canonicalResolved = fs.realpathSync(resolved);

    if (
      canonicalResolved !== canonicalWorktree &&
      !canonicalResolved.startsWith(canonicalWorktree + path.sep)
    ) {
      throw new TerminalOutsideWorktreeError(requestedCwd, worktreeRoot);
    }

    return canonicalResolved;
  }

  // ============================================================================
  // 6. Security Assertions & Auditing
  // ============================================================================

  public async assertProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<{ id: string; userId: string | null; name: string }> {
    if (!projectId) {
      throw new AiInvalidRequestError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, name: true, deletedAt: true },
    });

    if (!project || project.deletedAt) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && userId && project.userId !== userId) {
      throw new AiCrossProjectAccessError(
        `User '${userId}' is not authorized to access project '${projectId}'.`,
      );
    }

    return project;
  }

  public async assertTaskAccess(projectId: string, taskId: string): Promise<{ id: string; threadId: string }> {
    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, threadId: true },
    });

    if (!task || task.projectId !== projectId) {
      throw new AiCrossProjectAccessError(
        `Task with ID '${taskId}' does not belong to project '${projectId}'.`,
      );
    }

    return task;
  }

  private async recordAuditLog(log: {
    projectId: string;
    userId: string;
    threadId: string;
    taskId: string;
    toolName: string;
    requestedOperation: string;
    permissionLevel: import('@prisma/client').ToolPermissionLevel;
    decision: import('@prisma/client').ToolDecision;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.agentToolAuditLog.create({
        data: {
          projectId: log.projectId,
          userId: log.userId,
          threadId: log.threadId,
          taskId: log.taskId,
          toolName: log.toolName,
          requestedOperation: log.requestedOperation,
          permissionLevel: log.permissionLevel,
          decision: log.decision,
          reason: log.reason ?? null,
          metadata: (log.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit failure should not crash execution
    }
  }

  private mapExecutionToDto(record: any): AgentTerminalExecutionDto {
    return {
      id: record.id,
      projectId: record.projectId,
      taskId: record.taskId,
      threadId: record.threadId,
      stepId: record.stepId ?? null,
      command: record.command,
      workingDirectory: record.workingDirectory,
      status: record.status,
      policyDecision: record.policyDecision,
      policyReason: record.policyReason ?? null,
      exitCode: record.exitCode ?? null,
      stdout: record.stdout ?? '',
      stderr: record.stderr ?? '',
      durationMs: record.durationMs ?? null,
      timedOut: Boolean(record.timedOut),
      cancelled: Boolean(record.cancelled),
      timeoutMs: record.timeoutMs,
      maxOutputBytes: record.maxOutputBytes,
      approvedBy: record.approvedBy ?? null,
      approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
      metadata: (record.metadata ?? {}) as Record<string, unknown>,
      startedAt: record.startedAt ? record.startedAt.toISOString() : null,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
      updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
    };
  }
}
