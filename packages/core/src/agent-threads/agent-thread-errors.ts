/**
 * @file packages/core/src/agent-threads/agent-thread-errors.ts
 * Typed domain errors for V10 Phase 142 Task / Conversation / Thread Model.
 */

export class AgentThreadError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'AGENT_RUNTIME_ERROR', details?: unknown) {
    super(message);
    this.name = 'AgentThreadError';
    this.code = code;
    this.details = details;
  }
}

export class AgentThreadNotFoundError extends AgentThreadError {
  constructor(threadId: string) {
    super(`Agent thread '${threadId}' was not found.`, 'AGENT_THREAD_NOT_FOUND', { threadId });
    this.name = 'AgentThreadNotFoundError';
  }
}

export class AgentThreadArchivedError extends AgentThreadError {
  constructor(threadId: string) {
    super(
      `Agent thread '${threadId}' is archived and cannot accept new tasks or messages.`,
      'AGENT_THREAD_ARCHIVED',
      { threadId },
    );
    this.name = 'AgentThreadArchivedError';
  }
}

export class AgentTaskNotFoundError extends AgentThreadError {
  constructor(taskId: string) {
    super(`Agent task '${taskId}' was not found.`, 'AGENT_TASK_NOT_FOUND', { taskId });
    this.name = 'AgentTaskNotFoundError';
  }
}

export class AgentTaskInvalidStateError extends AgentThreadError {
  constructor(currentState: string, targetState: string, reason?: string) {
    super(
      `Cannot transition agent task from state '${currentState}' to '${targetState}'${
        reason ? `: ${reason}` : '.'
      }`,
      'AGENT_TASK_INVALID_STATE',
      { currentState, targetState },
    );
    this.name = 'AgentTaskInvalidStateError';
  }
}

export class AgentTaskImmutableError extends AgentThreadError {
  constructor(taskId: string, status: string) {
    super(
      `Agent task '${taskId}' is in terminal status '${status}' and cannot be modified.`,
      'AGENT_TASK_IMMUTABLE',
      { taskId, status },
    );
    this.name = 'AgentTaskImmutableError';
  }
}

export class AgentCheckpointCorruptedError extends AgentThreadError {
  constructor(taskId: string, reason: string) {
    super(
      `Recovery checkpoint for task '${taskId}' is corrupted or malformed: ${reason}`,
      'AGENT_CHECKPOINT_CORRUPTED',
      { taskId, reason },
    );
    this.name = 'AgentCheckpointCorruptedError';
  }
}

export class AgentCheckpointIntegrityError extends AgentThreadError {
  constructor(taskId: string, reason: string) {
    super(
      `Recovery checkpoint integrity validation failed for task '${taskId}': ${reason}`,
      'AGENT_CHECKPOINT_INTEGRITY_VIOLATION',
      { taskId, reason },
    );
    this.name = 'AgentCheckpointIntegrityError';
  }
}

export class AgentTaskNotRecoverableError extends AgentThreadError {
  constructor(taskId: string, reason: string) {
    super(`Agent task '${taskId}' is not recoverable: ${reason}`, 'AGENT_TASK_NOT_RECOVERABLE', {
      taskId,
      reason,
    });
    this.name = 'AgentTaskNotRecoverableError';
  }
}

export class AgentMaxRetriesExceededError extends AgentThreadError {
  constructor(taskId: string, retryCount: number, maxRetries: number) {
    super(
      `Agent task '${taskId}' has reached the maximum allowed retries (${retryCount}/${maxRetries}).`,
      'AGENT_MAX_RETRIES_EXCEEDED',
      { taskId, retryCount, maxRetries },
    );
    this.name = 'AgentMaxRetriesExceededError';
  }
}

export class AgentTaskConcurrentResumeError extends AgentTaskInvalidStateError {
  constructor(taskId: string) {
    super(
      'RUNNING',
      'RUNNING',
      `Agent task '${taskId}' is actively executing and cannot be concurrently resumed.`,
    );
    this.name = 'AgentTaskConcurrentResumeError';
    (this as any).code = 'AGENT_TASK_CONCURRENT_RESUME';
    (this as any).details = { taskId };
  }
}
