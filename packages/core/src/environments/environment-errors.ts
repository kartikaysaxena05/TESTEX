/**
 * @file packages/core/src/environments/environment-errors.ts
 * Domain errors for Target Application and Test Environment Configuration.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class EnvironmentDomainError extends Error {
  abstract readonly code: DesktopErrorCode;
  readonly isEnvironmentDomainError = true;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TargetApplicationNotFoundError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'TARGET_APP_NOT_FOUND';
  constructor(projectId: string) {
    super(`Target application for project "${projectId}" was not found.`);
  }
}

export class EnvironmentNotFoundError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'ENVIRONMENT_NOT_FOUND';
  constructor(environmentId?: string) {
    super(
      environmentId
        ? `Environment "${environmentId}" was not found.`
        : 'Environment was not found.',
    );
  }
}

export class EnvironmentProjectMismatchError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'ENVIRONMENT_PROJECT_MISMATCH';
  constructor(environmentId: string, projectId: string) {
    super(
      `Environment "${environmentId}" does not belong to project "${projectId}". Cross-project access rejected.`,
    );
  }
}

export class InvalidBaseUrlError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'INVALID_BASE_URL';
  constructor(reason: string) {
    super(`Invalid target application base URL: ${reason}`);
  }
}

export class UnsupportedProtocolError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'UNSUPPORTED_PROTOCOL';
  constructor(protocol: string) {
    super(
      `Protocol "${protocol}" is not supported as a target application execution URL. Only http: and https: protocols are permitted.`,
    );
  }
}

export class EnvironmentDisabledError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'ENVIRONMENT_DISABLED';
  constructor(environmentName: string) {
    super(
      `Environment "${environmentName}" is currently disabled and cannot be used for execution.`,
    );
  }
}

export class EnvironmentNotReachableError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'ENVIRONMENT_NOT_REACHABLE';
  constructor(url: string, details?: string) {
    super(
      `Target environment URL "${url}" is not reachable.${details ? ` Details: ${details}` : ''}`,
    );
  }
}

export class ConnectionTimeoutError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'CONNECTION_TIMEOUT';
  constructor(url: string, timeoutMs: number) {
    super(`Connection to target environment "${url}" timed out after ${timeoutMs}ms.`);
  }
}

export class TlsSecurityError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'TLS_ERROR';
  constructor(url: string, reason: string) {
    super(`TLS/SSL certificate validation failed for target URL "${url}": ${reason}`);
  }
}

export class SecretReferenceInvalidError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'SECRET_REFERENCE_INVALID';
  constructor(key: string, reason: string) {
    super(`Secret reference for key "${key}" is invalid: ${reason}`);
  }
}

export class ProductionSafetyViolationError extends EnvironmentDomainError {
  readonly code: DesktopErrorCode = 'PRODUCTION_SAFETY_VIOLATION';
  constructor(environmentName: string, reason: string) {
    super(`Production safety policy violation for environment "${environmentName}": ${reason}`);
  }
}
