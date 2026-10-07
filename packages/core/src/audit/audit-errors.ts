/**
 * @file packages/core/src/audit/audit-errors.ts
 * Domain exceptions for V7 Phase 108 Complete Repair & Reverification Audit Trail.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class RepairAuditError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuditSessionNotFoundError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_SESSION_NOT_FOUND';
}

export class AuditEventNotFoundError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_EVENT_NOT_FOUND';
}

export class AuditImmutabilityViolationError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_IMMUTABILITY_VIOLATION';
}

export class AuditProjectMismatchError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_PROJECT_MISMATCH';
}

export class AuditValidationError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_VALIDATION_ERROR';
}

export class AuditConcurrentMutationError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_CONCURRENT_MUTATION';
}

export class AuditExportFailedError extends RepairAuditError {
  public readonly code: DesktopErrorCode = 'AUDIT_EXPORT_FAILED';
}
