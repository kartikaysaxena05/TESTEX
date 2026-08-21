/**
 * @file packages/core/src/git/git-errors.ts
 * Domain error classes for privileged Git process execution and validation.
 */

export class GitExecutionError extends Error {
  readonly code = 'INTERNAL_ERROR';

  constructor(
    message: string,
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'GitExecutionError';
  }
}

export class GitTimeoutError extends Error {
  readonly code = 'INTERNAL_ERROR';

  constructor(message: string = 'Git command timed out.') {
    super(message);
    this.name = 'GitTimeoutError';
  }
}
