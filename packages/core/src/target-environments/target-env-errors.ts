/**
 * @file packages/core/src/target-environments/target-env-errors.ts
 * Domain error class hierarchy for Target Environment, Browser & Authentication Configuration (Phase 122).
 */

export abstract class TargetEnvError extends Error {
  public abstract readonly code: string;
  public readonly timestamp: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TargetEnvNotFoundError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_NOT_FOUND';
  constructor(public readonly environmentId: string, public readonly projectId?: string) {
    super(`Target environment '${environmentId}' not found${projectId ? ` in project '${projectId}'` : ''}.`);
  }
}

export class TargetEnvAccessDeniedError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_ACCESS_DENIED';
  constructor(message = 'Access denied: You do not have permission to manage this target environment.') {
    super(message);
  }
}

export class TargetEnvValidationError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_VALIDATION_ERROR';
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export class TargetEnvUnreachableError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_UNREACHABLE';
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

export class TargetEnvAuthFailedError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_AUTH_FAILED';
  constructor(message: string, public readonly diagnosticEvidence?: unknown) {
    super(message);
  }
}

export class TargetEnvProductionSafetyError extends TargetEnvError {
  public readonly code = 'TARGET_ENV_PROD_SAFETY_VIOLATION';
  constructor(message: string) {
    super(message);
  }
}
