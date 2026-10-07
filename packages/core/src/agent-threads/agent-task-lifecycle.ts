/**
 * @file packages/core/src/agent-threads/agent-task-lifecycle.ts
 * Strict state transition engine for V10 Phase 142 & Phase 157 AgentThreadTask.
 *
 * Supported statuses:
 * QUEUED, PLANNING, RUNNING, WAITING_FOR_APPROVAL, COMPLETED, FAILED, CANCELLED, PAUSED, STOPPED
 *
 * Valid transitions:
 * QUEUED -> PLANNING | RUNNING | FAILED | CANCELLED | STOPPED
 * PLANNING -> RUNNING | FAILED | CANCELLED | STOPPED
 * RUNNING -> WAITING_FOR_APPROVAL | PAUSED | STOPPED | COMPLETED | FAILED | CANCELLED
 * PAUSED -> RUNNING | CANCELLED | STOPPED
 * WAITING_FOR_APPROVAL -> RUNNING | CANCELLED | STOPPED
 * COMPLETED -> (terminal, none)
 * FAILED -> QUEUED (via retry)
 * CANCELLED -> QUEUED (via retry)
 * STOPPED -> QUEUED (via retry)
 */

import type { AgentThreadTaskStatus } from '@ai-quality/contracts';
import { AgentTaskInvalidStateError } from './agent-thread-errors.js';

export class AgentTaskLifecycle {
  private static readonly ALLOWED_TRANSITIONS: Record<
    AgentThreadTaskStatus,
    readonly AgentThreadTaskStatus[]
  > = {
    QUEUED: ['PLANNING', 'RUNNING', 'FAILED', 'CANCELLED', 'STOPPED', 'INTERRUPTED'],
    PLANNING: ['RUNNING', 'FAILED', 'CANCELLED', 'STOPPED', 'INTERRUPTED'],
    RUNNING: [
      'WAITING_FOR_APPROVAL',
      'PAUSED',
      'STOPPED',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'INTERRUPTED',
    ],
    PAUSED: ['RUNNING', 'CANCELLED', 'STOPPED'],
    WAITING_FOR_APPROVAL: ['RUNNING', 'CANCELLED', 'STOPPED'],
    INTERRUPTED: ['RUNNING', 'CANCELLED', 'STOPPED', 'QUEUED'],
    COMPLETED: [],
    FAILED: ['QUEUED', 'RUNNING', 'CANCELLED'], // Allow retry, resume, or cancellation if recoverable
    CANCELLED: ['QUEUED'], // Allow retry
    STOPPED: ['QUEUED'], // Allow retry
  };

  public static canTransition(
    currentStatus: AgentThreadTaskStatus,
    targetStatus: AgentThreadTaskStatus,
  ): boolean {
    if (currentStatus === targetStatus) {
      return true;
    }
    const allowed = AgentTaskLifecycle.ALLOWED_TRANSITIONS[currentStatus];
    return allowed ? allowed.includes(targetStatus) : false;
  }

  public static assertValidTransition(
    currentStatus: AgentThreadTaskStatus,
    targetStatus: AgentThreadTaskStatus,
    reason?: string,
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new AgentTaskInvalidStateError(currentStatus, targetStatus, reason);
    }
  }

  public static isTerminal(status: AgentThreadTaskStatus): boolean {
    return (
      status === 'COMPLETED' ||
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'STOPPED'
    );
  }

  public static isPaused(status: AgentThreadTaskStatus): boolean {
    return status === 'PAUSED';
  }

  public static isResumable(status: AgentThreadTaskStatus): boolean {
    return status === 'PAUSED' || status === 'WAITING_FOR_APPROVAL' || status === 'INTERRUPTED';
  }

  public static isRetriable(status: AgentThreadTaskStatus): boolean {
    return (
      status === 'FAILED' ||
      status === 'CANCELLED' ||
      status === 'STOPPED' ||
      status === 'INTERRUPTED'
    );
  }

  public static isRecoverableStatus(status: AgentThreadTaskStatus): boolean {
    return (
      status === 'PAUSED' || status === 'INTERRUPTED' || status === 'FAILED' || status === 'STOPPED'
    );
  }
}
