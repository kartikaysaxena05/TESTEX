/**
 * @file apps/desktop/src/main/ipc/agent-thread-handlers.ts
 * Privileged IPC handlers for V10 Phase 142 Task / Conversation / Thread Model.
 * Exposes thread, task, message, execution-step, and tool-call APIs.
 * Enforces authenticated sender verification and project tenant isolation.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  AgentThreadService,
  AgentThreadError,
  AgentThreadNotFoundError,
  AgentThreadArchivedError,
  AgentTaskNotFoundError,
  AgentTaskInvalidStateError,
  AgentTaskImmutableError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
  UnauthorizedError,
  AutonomousTestingWorkflowService,
  AutonomousWorkflowError,
  AutonomousWorkflowNotFoundError,
  AutonomousWorkflowSecurityError,
} from '@ai-quality/core';
import {
  createAgentThreadInputSchema,
  listAgentThreadsInputSchema,
  getAgentThreadInputSchema,
  archiveAgentThreadInputSchema,
  createAgentThreadTaskInputSchema,
  getAgentThreadTaskInputSchema,
  listAgentThreadTasksInputSchema,
  cancelAgentThreadTaskInputSchema,
  retryAgentThreadTaskInputSchema,
  resumeAgentThreadTaskInputSchema,
  stopAgentThreadTaskInputSchema,
  pauseAgentThreadTaskInputSchema,
  listAgentTaskControlAuditLogsInputSchema,
  listAgentThreadMessagesInputSchema,
  listAgentExecutionStepsInputSchema,
  listAgentToolCallsInputSchema,
  getTaskRecoveryStateInputSchema,
  listRecoverableTasksInputSchema,
  listAgentTaskCheckpointsInputSchema,
  executeAutonomousWorkflowInputSchema,
  getAutonomousWorkflowReportInputSchema,
  approveWorkflowFixInputSchema,
  rejectWorkflowFixInputSchema,
  type CreateAgentThreadInputDto,
  type ListAgentThreadsInputDto,
  type GetAgentThreadInputDto,
  type ArchiveAgentThreadInputDto,
  type CreateAgentThreadTaskInputDto,
  type GetAgentThreadTaskInputDto,
  type ListAgentThreadTasksInputDto,
  type CancelAgentThreadTaskInputDto,
  type RetryAgentThreadTaskInputDto,
  type ResumeAgentThreadTaskInputDto,
  type StopAgentThreadTaskInputDto,
  type PauseAgentThreadTaskInputDto,
  type ListAgentTaskControlAuditLogsInputDto,
  type AgentTaskControlAuditLogDto,
  type ListAgentThreadMessagesInputDto,
  type ListAgentExecutionStepsInputDto,
  type ListAgentToolCallsInputDto,
  type GetTaskRecoveryStateInputDto,
  type ListRecoverableTasksInputDto,
  type ListAgentTaskCheckpointsInputDto,
  type TaskRecoverySummaryDto,
  type AgentTaskCheckpointDto,
  type AgentAutonomousWorkflowReportDto,
  type ExecuteAutonomousWorkflowInputDto,
  type GetAutonomousWorkflowReportInputDto,
  type ApproveWorkflowFixInputDto,
  type RejectWorkflowFixInputDto,
  type AgentThreadDto,
  type AgentThreadTaskDto,
  type AgentThreadMessageDto,
  type AgentExecutionStepDto,
  type AgentToolCallRecordDto,
  type DesktopResult,
  type DesktopErrorCode,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultAgentThreadService: AgentThreadService | null = null;
let defaultWorkflowService: AutonomousTestingWorkflowService | null = null;

export function getAgentThreadService(): AgentThreadService {
  if (!defaultAgentThreadService) {
    defaultAgentThreadService = new AgentThreadService();
  }
  return defaultAgentThreadService;
}

export function setAgentThreadServiceForTest(service: AgentThreadService | null): void {
  defaultAgentThreadService = service;
}

export function getAutonomousWorkflowService(): AutonomousTestingWorkflowService {
  if (!defaultWorkflowService) {
    defaultWorkflowService = new AutonomousTestingWorkflowService();
  }
  return defaultWorkflowService;
}

export function setAutonomousWorkflowServiceForTest(
  service: AutonomousTestingWorkflowService | null,
): void {
  defaultWorkflowService = service;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string> {
  if (!event) {
    throw new UnauthorizedError('Authentication required.');
  }
  const user = await assertAuthenticated(event);
  return user.userId;
}

function mapErrorToResult<T>(err: unknown): DesktopResult<T> {
  let code: DesktopErrorCode = 'AGENT_RUNTIME_ERROR';
  let message = 'An unexpected error occurred in agent thread runtime.';

  if (err instanceof AutonomousWorkflowSecurityError) {
    code = 'SECURITY_POLICY_VIOLATION' as DesktopErrorCode;
    message = err.message;
  } else if (err instanceof AutonomousWorkflowNotFoundError) {
    code = 'AGENT_TASK_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AutonomousWorkflowError) {
    code = (err.code as DesktopErrorCode) || 'AGENT_RUNTIME_ERROR';
    message = err.message;
  } else if (err instanceof AgentThreadNotFoundError) {
    code = 'AGENT_THREAD_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentThreadArchivedError) {
    code = 'AGENT_THREAD_ARCHIVED';
    message = err.message;
  } else if (err instanceof AgentTaskNotFoundError) {
    code = 'AGENT_TASK_NOT_FOUND';
    message = err.message;
  } else if (err instanceof AgentTaskInvalidStateError) {
    code = 'AGENT_TASK_INVALID_STATE';
    message = err.message;
  } else if (err instanceof AgentTaskImmutableError) {
    code = 'AGENT_TASK_IMMUTABLE';
    message = err.message;
  } else if (err instanceof AiCrossProjectAccessError) {
    code = 'AI_CROSS_PROJECT_ACCESS';
    message = err.message;
  } else if (err instanceof AiInvalidRequestError) {
    code = 'AI_INVALID_REQUEST';
    message = err.message;
  } else if (err instanceof UnauthorizedError) {
    code = 'AUTHENTICATION_FAILED';
    message = err.message;
  } else if (err instanceof ZodError) {
    code = 'VALIDATION_ERROR';
    message = err.errors.map(e => e.message).join(' ');
  } else if (err instanceof AgentThreadError) {
    code = (err.code as DesktopErrorCode) || 'AGENT_RUNTIME_ERROR';
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  }

  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

// ============================================================================
// Thread Handlers
// ============================================================================

export async function handleCreateAgentThread(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = createAgentThreadInputSchema.parse(rawInput) as CreateAgentThreadInputDto;
    const thread = await service.createThread(parsed, userId);
    return { ok: true, data: thread };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentThreads(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentThreadDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentThreadsInputSchema.parse(rawInput) as ListAgentThreadsInputDto;
    const threads = await service.listThreads(parsed, userId);
    return { ok: true, data: threads };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentThread(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAgentThreadInputSchema.parse(rawInput) as GetAgentThreadInputDto;
    const thread = await service.getThread(parsed, userId);
    return { ok: true, data: thread };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleArchiveAgentThread(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = archiveAgentThreadInputSchema.parse(rawInput) as ArchiveAgentThreadInputDto;
    const thread = await service.archiveThread(parsed, userId);
    return { ok: true, data: thread };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

// ============================================================================
// Task Handlers
// ============================================================================

export async function handleCreateAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = createAgentThreadTaskInputSchema.parse(
      rawInput,
    ) as CreateAgentThreadTaskInputDto;
    const task = await service.createTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAgentThreadTaskInputSchema.parse(rawInput) as GetAgentThreadTaskInputDto;
    const task = await service.getTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentThreadTasks(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentThreadTaskDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentThreadTasksInputSchema.parse(rawInput) as ListAgentThreadTasksInputDto;
    const tasks = await service.listTasks(parsed, userId);
    return { ok: true, data: tasks };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleCancelAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = cancelAgentThreadTaskInputSchema.parse(
      rawInput,
    ) as CancelAgentThreadTaskInputDto;
    const task = await service.cancelTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleRetryAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = retryAgentThreadTaskInputSchema.parse(rawInput) as RetryAgentThreadTaskInputDto;
    const task = await service.retryTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleResumeAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = resumeAgentThreadTaskInputSchema.parse(
      rawInput,
    ) as ResumeAgentThreadTaskInputDto;
    const task = await service.resumeTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleStopAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = stopAgentThreadTaskInputSchema.parse(rawInput) as StopAgentThreadTaskInputDto;
    const task = await service.stopTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handlePauseAgentThreadTask(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<AgentThreadTaskDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = pauseAgentThreadTaskInputSchema.parse(rawInput) as PauseAgentThreadTaskInputDto;
    const task = await service.pauseTask(parsed, userId);
    return { ok: true, data: task };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentTaskControlAuditLogs(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentTaskControlAuditLogDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentTaskControlAuditLogsInputSchema.parse(
      rawInput,
    ) as ListAgentTaskControlAuditLogsInputDto;
    const logs = await service.listTaskControlAuditLogs(parsed, userId);
    return { ok: true, data: logs };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

// ============================================================================
// Messages, Steps & Tool-Calls Handlers
// ============================================================================

export async function handleListAgentThreadMessages(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentThreadMessageDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentThreadMessagesInputSchema.parse(
      rawInput,
    ) as ListAgentThreadMessagesInputDto;
    const messages = await service.listMessages(parsed, userId);
    return { ok: true, data: messages };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentExecutionSteps(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentExecutionStepDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentExecutionStepsInputSchema.parse(
      rawInput,
    ) as ListAgentExecutionStepsInputDto;
    const steps = await service.listExecutionSteps(parsed, userId);
    return { ok: true, data: steps };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentToolCalls(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentToolCallRecordDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentToolCallsInputSchema.parse(rawInput) as ListAgentToolCallsInputDto;
    const calls = await service.listToolCalls(parsed, userId);
    return { ok: true, data: calls };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetTaskRecoveryState(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<TaskRecoverySummaryDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getTaskRecoveryStateInputSchema.parse(rawInput) as GetTaskRecoveryStateInputDto;
    const summary = await service.getTaskRecoveryState(parsed, userId);
    return { ok: true, data: summary };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListRecoverableTasks(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly TaskRecoverySummaryDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listRecoverableTasksInputSchema.parse(rawInput) as ListRecoverableTasksInputDto;
    const tasks = await service.listRecoverableTasks(parsed, userId);
    return { ok: true, data: tasks };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleListAgentTaskCheckpoints(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AgentThreadService = getAgentThreadService(),
): Promise<DesktopResult<readonly AgentTaskCheckpointDto[]>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = listAgentTaskCheckpointsInputSchema.parse(
      rawInput,
    ) as ListAgentTaskCheckpointsInputDto;
    const checkpoints = await service.listTaskCheckpoints(parsed, userId);
    return { ok: true, data: checkpoints };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

// ============================================================================
// Phase 159: Autonomous Testing + Fix Workflow Handlers
// ============================================================================

export async function handleExecuteAutonomousWorkflow(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AutonomousTestingWorkflowService = getAutonomousWorkflowService(),
): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = executeAutonomousWorkflowInputSchema.parse(
      rawInput,
    ) as ExecuteAutonomousWorkflowInputDto;
    const report = await service.executeWorkflow(parsed, userId);
    return { ok: true, data: report };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleGetAutonomousWorkflowReport(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AutonomousTestingWorkflowService = getAutonomousWorkflowService(),
): Promise<DesktopResult<AgentAutonomousWorkflowReportDto | null>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = getAutonomousWorkflowReportInputSchema.parse(
      rawInput,
    ) as GetAutonomousWorkflowReportInputDto;
    const report = await service.getWorkflowReport(parsed, userId);
    return { ok: true, data: report };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleApproveWorkflowFix(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AutonomousTestingWorkflowService = getAutonomousWorkflowService(),
): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = approveWorkflowFixInputSchema.parse(rawInput) as ApproveWorkflowFixInputDto;
    const report = await service.approveWorkflowFix(parsed, userId);
    return { ok: true, data: report };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

export async function handleRejectWorkflowFix(
  event?: IpcMainInvokeEvent,
  rawInput?: unknown,
  service: AutonomousTestingWorkflowService = getAutonomousWorkflowService(),
): Promise<DesktopResult<AgentAutonomousWorkflowReportDto>> {
  try {
    if (event && !isTrustedIpcSender(event)) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted sender frame.' },
      };
    }
    const userId = await extractUser(event);
    const parsed = rejectWorkflowFixInputSchema.parse(rawInput) as RejectWorkflowFixInputDto;
    const report = await service.rejectWorkflowFix(parsed, userId);
    return { ok: true, data: report };
  } catch (err) {
    return mapErrorToResult(err);
  }
}
