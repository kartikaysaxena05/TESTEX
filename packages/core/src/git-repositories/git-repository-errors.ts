/**
 * @file packages/core/src/git-repositories/git-repository-errors.ts
 * Domain errors for Git repository connections, authorization, and import operations.
 */

export class RepositoryConnectionNotFoundError extends Error {
  readonly code = 'REPOSITORY_NOT_FOUND';
  readonly statusCode = 404;

  constructor(message = 'Repository connection not found.') {
    super(message);
    this.name = 'RepositoryConnectionNotFoundError';
  }
}

export class RepositoryAccessDeniedError extends Error {
  readonly code = 'REPOSITORY_ACCESS_DENIED';
  readonly statusCode = 403;

  constructor(message = 'Access to this repository connection is denied.') {
    super(message);
    this.name = 'RepositoryAccessDeniedError';
  }
}

export class RepositoryValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryValidationError';
  }
}

export class GitProviderAuthError extends Error {
  readonly code = 'GIT_PROVIDER_AUTH_FAILED';
  readonly statusCode = 401;

  constructor(message = 'Failed to authenticate with Git provider.') {
    super(message);
    this.name = 'GitProviderAuthError';
  }
}

export class RepositoryImportError extends Error {
  readonly code = 'REPOSITORY_IMPORT_FAILED';
  readonly statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryImportError';
  }
}

export class RepositoryImportTimeoutError extends Error {
  readonly code = 'REPOSITORY_IMPORT_TIMEOUT';
  readonly statusCode = 408;

  constructor(message = 'Repository import timed out.') {
    super(message);
    this.name = 'RepositoryImportTimeoutError';
  }
}

export class RepositoryImportCancelledError extends Error {
  readonly code = 'REPOSITORY_IMPORT_CANCELLED';
  readonly statusCode = 499;

  constructor(message = 'Repository import was cancelled by user.') {
    super(message);
    this.name = 'RepositoryImportCancelledError';
  }
}

export class RepositoryPathTraversalError extends Error {
  readonly code = 'REPOSITORY_PATH_TRAVERSAL';
  readonly statusCode = 400;

  constructor(message = 'Path traversal attempt detected in repository archive.') {
    super(message);
    this.name = 'RepositoryPathTraversalError';
  }
}

export class RepositoryOversizedError extends Error {
  readonly code = 'REPOSITORY_OVERSIZED';
  readonly statusCode = 413;

  constructor(message = 'Repository or file exceeds allowable import size limits.') {
    super(message);
    this.name = 'RepositoryOversizedError';
  }
}

export class DuplicateRepositoryConnectionError extends Error {
  readonly code = 'REPOSITORY_ALREADY_CONNECTED';
  readonly statusCode = 409;

  constructor(message = 'This repository is already connected to this project.') {
    super(message);
    this.name = 'DuplicateRepositoryConnectionError';
  }
}

export class RepositoryAlreadyDeletedError extends Error {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;

  constructor(message = 'Repository connection has already been deleted.') {
    super(message);
    this.name = 'RepositoryAlreadyDeletedError';
  }
}
