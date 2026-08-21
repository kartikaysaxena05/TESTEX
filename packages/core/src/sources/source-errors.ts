/**
 * @file packages/core/src/sources/source-errors.ts
 * Domain-specific error definitions for the source attachment domain.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class SourceDomainError extends Error {
  public abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SourceNotFoundError extends SourceDomainError {
  public readonly code = 'SOURCE_NOT_FOUND';

  constructor(message = 'No source attachment found for this project.') {
    super(message);
  }
}

export class SourceUnavailableError extends SourceDomainError {
  public readonly code = 'SOURCE_UNAVAILABLE';

  constructor(message = 'The attached source directory is currently unavailable or inaccessible.') {
    super(message);
  }
}

export class InvalidDirectoryError extends SourceDomainError {
  public readonly code = 'INVALID_DIRECTORY';

  constructor(message = 'The selected path is not a valid directory.') {
    super(message);
  }
}

export class DirectoryNotFoundError extends SourceDomainError {
  public readonly code = 'DIRECTORY_NOT_FOUND';

  constructor(message = 'The selected directory path does not exist.') {
    super(message);
  }
}
