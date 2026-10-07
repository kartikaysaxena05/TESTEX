/**
 * @file packages/core/src/project-context/project-context-errors.ts
 * Typed error hierarchy for V8 Phase 123 Unified Project Context & Source Detection.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class ProjectContextError extends Error {
  public readonly code: DesktopErrorCode;
  public readonly projectId?: string;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR', projectId?: string) {
    super(message);
    this.name = 'ProjectContextError';
    this.code = code;
    this.projectId = projectId;
  }
}

export class ProjectContextNotFoundError extends ProjectContextError {
  constructor(projectId?: string, message?: string) {
    super(
      message ?? `Project context was not found${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_NOT_FOUND',
      projectId,
    );
    this.name = 'ProjectContextNotFoundError';
  }
}

export class ProjectContextAccessDeniedError extends ProjectContextError {
  constructor(projectId?: string, message?: string) {
    super(
      message ??
        `Access denied to project context${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_ACCESS_DENIED',
      projectId,
    );
    this.name = 'ProjectContextAccessDeniedError';
  }
}

export class ProjectContextStaleError extends ProjectContextError {
  constructor(projectId?: string, message?: string) {
    super(
      message ??
        `Project context is stale and requires refresh${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_STALE',
      projectId,
    );
    this.name = 'ProjectContextStaleError';
  }
}

export class ProjectContextInvalidError extends ProjectContextError {
  constructor(projectId?: string, message?: string) {
    super(
      message ??
        `Project context is invalid or incomplete${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_INVALID',
      projectId,
    );
    this.name = 'ProjectContextInvalidError';
  }
}

export class ProjectContextSourceUnavailableError extends ProjectContextError {
  public readonly sourceKind: string;

  constructor(sourceKind: string, projectId?: string, message?: string) {
    super(
      message ?? `Project source '${sourceKind}' is currently unavailable or unreachable.`,
      'PROJECT_CONTEXT_SOURCE_UNAVAILABLE',
      projectId,
    );
    this.name = 'ProjectContextSourceUnavailableError';
    this.sourceKind = sourceKind;
  }
}

export class ProjectContextDetectionFailedError extends ProjectContextError {
  constructor(projectId?: string, message?: string, cause?: unknown) {
    super(
      message ?? `Source detection failed${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_DETECTION_FAILED',
      projectId,
    );
    this.name = 'ProjectContextDetectionFailedError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export class ProjectContextRefreshFailedError extends ProjectContextError {
  constructor(projectId?: string, message?: string, cause?: unknown) {
    super(
      message ??
        `Failed to refresh project context${projectId ? ` for project '${projectId}'` : ''}.`,
      'PROJECT_CONTEXT_REFRESH_FAILED',
      projectId,
    );
    this.name = 'ProjectContextRefreshFailedError';
    if (cause) {
      this.cause = cause;
    }
  }
}
