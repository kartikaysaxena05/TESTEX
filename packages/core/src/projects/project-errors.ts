/**
 * @file packages/core/src/projects/project-errors.ts
 * Domain-specific error classes for Project and Environment operations.
 */

export class ProjectError extends Error {
  readonly code: string;

  constructor(message: string, code = 'PROJECT_ERROR') {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProjectNotFoundError extends ProjectError {
  constructor(message = 'Project not found.') {
    super(message, 'PROJECT_NOT_FOUND');
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectArchivedError extends ProjectError {
  constructor(message = 'Archived projects cannot be modified. Restore the project first.') {
    super(message, 'PROJECT_ARCHIVED');
    this.name = 'ProjectArchivedError';
  }
}

export class ProjectValidationError extends ProjectError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ProjectValidationError';
  }
}

export class ProjectConflictError extends ProjectError {
  constructor(message: string) {
    super(message, 'CONFLICT');
    this.name = 'ProjectConflictError';
  }
}

export class EnvironmentNotFoundError extends ProjectError {
  constructor(message = 'Environment not found.') {
    super(message, 'ENVIRONMENT_NOT_FOUND');
    this.name = 'EnvironmentNotFoundError';
  }
}
