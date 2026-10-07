/**
 * @file packages/core/src/execution/healing/healing-errors.ts
 * Domain error classes for Locator Self-Healing (V5 Phase 72).
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';
import { ExecutionDomainError } from '../execution-errors.js';

export class HealingDomainError extends ExecutionDomainError {
  public override readonly code: DesktopErrorCode = 'INTERNAL_ERROR';

  constructor(message: string, status = 422, context?: Record<string, unknown>) {
    super(message, status, context);
    this.name = 'HealingDomainError';
  }
}

export class HealingPolicyBlockedError extends HealingDomainError {
  public override readonly code: DesktopErrorCode = 'DESTRUCTIVE_ACTION_PROHIBITED';

  constructor(actionType: string, reason: string) {
    super(`Self-healing for action '${actionType}' was blocked by safety policy: ${reason}`, 422, {
      actionType,
      reason,
    });
    this.name = 'HealingPolicyBlockedError';
  }
}

export class HealingAmbiguousCandidateError extends HealingDomainError {
  public override readonly code: DesktopErrorCode = 'TARGET_AMBIGUOUS';

  constructor(candidateCount: number, topScore: number, runnerUpScore: number) {
    super(
      `Self-healing rejected ambiguous candidates (${candidateCount} candidates found; top score: ${topScore}, second: ${runnerUpScore}).`,
      422,
      { candidateCount, topScore, runnerUpScore },
    );
    this.name = 'HealingAmbiguousCandidateError';
  }
}

export class HealingCandidateNotFoundError extends HealingDomainError {
  public override readonly code: DesktopErrorCode = 'TARGET_NOT_FOUND';

  constructor(targetSummary: string, reason?: string) {
    super(
      `Self-healing failed to find a valid replacement element for target '${targetSummary}'${reason ? `: ${reason}` : '.'}`,
      404,
      { targetSummary, reason },
    );
    this.name = 'HealingCandidateNotFoundError';
  }
}

export class HealingTimeoutError extends HealingDomainError {
  public override readonly code: DesktopErrorCode = 'LOCATOR_TIMEOUT';

  constructor(timeoutMs: number) {
    super(
      `Self-healing timed out after ${timeoutMs}ms while searching and evaluating candidates.`,
      408,
      { timeoutMs },
    );
    this.name = 'HealingTimeoutError';
  }
}

export class HealingAuditPersistenceError extends HealingDomainError {
  public override readonly code: DesktopErrorCode = 'INTERNAL_ERROR';

  constructor(message: string, cause?: unknown) {
    super(`Failed to persist authoritative locator healing audit record: ${message}`, 500, {
      cause: String(cause),
    });
    this.name = 'HealingAuditPersistenceError';
  }
}
