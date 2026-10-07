/**
 * @file packages/core/src/workflow/workflow-transition-validator.ts
 * Deterministic validation engine for internal bug status transitions.
 */

import type { InternalBugStatus, WorkflowTransitionResult } from './workflow-types.js';

export class WorkflowTransitionValidator {
  /**
   * Allowed state transitions map for internal bug lifecycle.
   */
  private static readonly ALLOWED_TRANSITIONS: Record<
    InternalBugStatus,
    readonly InternalBugStatus[]
  > = {
    OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'BLOCKED', 'WONT_FIX', 'DUPLICATE', 'RESOLVED', 'CLOSED'],
    ACKNOWLEDGED: ['IN_PROGRESS', 'OPEN', 'BLOCKED', 'WONT_FIX', 'DUPLICATE', 'RESOLVED', 'CLOSED'],
    IN_PROGRESS: ['RESOLVED', 'BLOCKED', 'OPEN', 'ACKNOWLEDGED', 'WONT_FIX', 'DUPLICATE'],
    BLOCKED: ['IN_PROGRESS', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WONT_FIX'],
    RESOLVED: ['REOPENED', 'CLOSED', 'WONT_FIX'],
    REOPENED: ['IN_PROGRESS', 'ACKNOWLEDGED', 'BLOCKED', 'RESOLVED', 'CLOSED', 'WONT_FIX'],
    CLOSED: ['REOPENED'],
    WONT_FIX: ['REOPENED', 'CLOSED'],
    DUPLICATE: ['REOPENED', 'CLOSED'],
  };

  /**
   * Validates whether a transition from currentStatus to targetStatus is permitted.
   */
  public static validate(
    currentStatus: InternalBugStatus,
    targetStatus: InternalBugStatus,
  ): WorkflowTransitionResult {
    // 1. Identical status is a valid no-op
    if (currentStatus === targetStatus) {
      return {
        valid: true,
        isNoOp: true,
        reason: 'Current status matches target status.',
      };
    }

    const allowed = this.ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      let specificReason = `Transition from '${currentStatus}' to '${targetStatus}' is not permitted in internal lifecycle.`;
      if (currentStatus === 'CLOSED' && targetStatus !== 'REOPENED') {
        specificReason = `Closed defects cannot transition directly to '${targetStatus}'. The defect must first be explicitly reopened.`;
      }
      return {
        valid: false,
        reason: specificReason,
      };
    }

    const isResolution = targetStatus === 'RESOLVED';
    const isReopen = targetStatus === 'REOPENED';
    const isClosure = targetStatus === 'CLOSED';

    return {
      valid: true,
      isNoOp: false,
      isResolution,
      isReopen,
      isClosure,
      reason: `Valid transition from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  /**
   * Returns list of reachable states from currentStatus.
   */
  public static getReachableStates(currentStatus: InternalBugStatus): readonly InternalBugStatus[] {
    return this.ALLOWED_TRANSITIONS[currentStatus] ?? [];
  }
}
