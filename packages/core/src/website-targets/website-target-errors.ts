/**
 * @file packages/core/src/website-targets/website-target-errors.ts
 * Domain errors for Website Targets, Live Environment Targeting & Production Safety.
 */

export abstract class WebsiteTargetDomainError extends Error {
  public abstract readonly code: string;
  public abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WebsiteTargetNotFoundError extends WebsiteTargetDomainError {
  public readonly code = 'TARGET_NOT_FOUND';
  public readonly statusCode = 404;

  constructor(targetId: string) {
    super(`Website target '${targetId}' was not found.`);
  }
}


export class TargetAccessDeniedError extends WebsiteTargetDomainError {
  public readonly code = 'ACCESS_DENIED';
  public readonly statusCode = 403;

  constructor(message = 'Access to this website target is denied.') {
    super(message);
  }
}

export class TargetValidationError extends WebsiteTargetDomainError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
  }
}

export class TargetNotAuthorizedError extends WebsiteTargetDomainError {
  public readonly code = 'TARGET_NOT_AUTHORIZED';
  public readonly statusCode = 403;

  constructor(
    message = 'Testing this target requires confirmed authorization and ownership acknowledgement.',
  ) {
    super(message);
  }
}

export class ProductionSafeModeViolationError extends WebsiteTargetDomainError {
  public readonly code = 'PRODUCTION_SAFE_MODE_VIOLATION';
  public readonly statusCode = 403;

  constructor(message: string) {
    super(message);
  }
}

export class UnsafeUrlTargetError extends WebsiteTargetDomainError {
  public readonly code = 'UNSAFE_TARGET_URL';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
  }
}

export class TargetAlreadyDeletedError extends WebsiteTargetDomainError {
  public readonly code = 'TARGET_ALREADY_DELETED';
  public readonly statusCode = 409;

  constructor(targetId: string) {
    super(`Website target '${targetId}' has already been deleted.`);
  }
}
