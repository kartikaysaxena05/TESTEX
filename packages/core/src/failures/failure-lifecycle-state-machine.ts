/**
 * @file packages/core/src/failures/failure-lifecycle-state-machine.ts
 * Pure deterministic state machine governing FailureCase and FailureAnalysisRun lifecycle transitions.
 */

import type { FailureCaseStatus, FailureAnalysisRunStatus } from '@ai-quality/contracts';
import { InvalidLifecycleTransitionError } from './failure-errors.js';

/**
 * Permitted status transitions for a FailureCase.
 */
const VALID_CASE_TRANSITIONS: Readonly<Record<FailureCaseStatus, readonly FailureCaseStatus[]>> = {
  PENDING: ['READY', 'ANALYZING', 'STALE', 'CANCELLED'],
  READY: ['ANALYZING', 'STALE', 'CANCELLED'],
  ANALYZING: ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
  COMPLETED: ['STALE', 'READY', 'ANALYZING'],
  FAILED: ['READY', 'ANALYZING', 'STALE'],
  BLOCKED: ['READY', 'ANALYZING', 'STALE'],
  STALE: ['READY', 'ANALYZING'],
  CANCELLED: ['READY'],
};

/**
 * Permitted status transitions for an individual FailureAnalysisRun attempt.
 */
const VALID_RUN_TRANSITIONS: Readonly<
  Record<FailureAnalysisRunStatus, readonly FailureAnalysisRunStatus[]>
> = {
  PENDING: ['RUNNING', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  BLOCKED: [],
  CANCELLED: [],
};

/**
 * Validates whether a FailureCase lifecycle transition is permitted.
 */
export function isValidCaseTransition(
  fromStatus: FailureCaseStatus,
  toStatus: FailureCaseStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  const allowed = VALID_CASE_TRANSITIONS[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

/**
 * Enforces valid FailureCase transition, throwing InvalidLifecycleTransitionError on failure.
 */
export function assertValidCaseTransition(
  fromStatus: FailureCaseStatus,
  toStatus: FailureCaseStatus,
): void {
  if (!isValidCaseTransition(fromStatus, toStatus)) {
    throw new InvalidLifecycleTransitionError(fromStatus, toStatus, 'FailureCase');
  }
}

/**
 * Validates whether a FailureAnalysisRun lifecycle transition is permitted.
 */
export function isValidRunTransition(
  fromStatus: FailureAnalysisRunStatus,
  toStatus: FailureAnalysisRunStatus,
): boolean {
  if (fromStatus === toStatus) {
    return true;
  }
  const allowed = VALID_RUN_TRANSITIONS[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

/**
 * Enforces valid FailureAnalysisRun transition, throwing InvalidLifecycleTransitionError on failure.
 */
export function assertValidRunTransition(
  fromStatus: FailureAnalysisRunStatus,
  toStatus: FailureAnalysisRunStatus,
): void {
  if (!isValidRunTransition(fromStatus, toStatus)) {
    throw new InvalidLifecycleTransitionError(fromStatus, toStatus, 'FailureAnalysisRun');
  }
}

/**
 * Checks if a FailureCase status is terminal.
 */
export function isTerminalCaseStatus(status: FailureCaseStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/**
 * Checks if a FailureAnalysisRun status is terminal.
 */
export function isTerminalRunStatus(status: FailureAnalysisRunStatus): boolean {
  return (
    status === 'COMPLETED' || status === 'FAILED' || status === 'BLOCKED' || status === 'CANCELLED'
  );
}
