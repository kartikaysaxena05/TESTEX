/**
 * @file packages/core/src/git-review/git-review-errors.ts
 * Domain errors for V10 Phase 150 Git Diff & Change Review.
 */

export class GitReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitReviewError';
  }
}

export class GitReviewValidationError extends GitReviewError {
  constructor(message: string) {
    super(message);
    this.name = 'GitReviewValidationError';
  }
}

export class GitReviewNotGitRepoError extends GitReviewError {
  constructor(path: string) {
    super(`Directory '${path}' is not a valid Git repository.`);
    this.name = 'GitReviewNotGitRepoError';
  }
}

export class GitReviewPathTraversalError extends GitReviewError {
  constructor(filePath: string, detail?: string) {
    super(`Path traversal violation detected for path '${filePath}'${detail ? `: ${detail}` : ''}`);
    this.name = 'GitReviewPathTraversalError';
  }
}

export class GitReviewOutsideWorktreeError extends GitReviewError {
  constructor(filePath: string, worktreeRoot: string) {
    super(`Path '${filePath}' escapes worktree boundary '${worktreeRoot}'.`);
    this.name = 'GitReviewOutsideWorktreeError';
  }
}

export class GitReviewNotFoundError extends GitReviewError {
  constructor(reviewId: string, projectId: string) {
    super(`Change review '${reviewId}' was not found in project '${projectId}'.`);
    this.name = 'GitReviewNotFoundError';
  }
}

export class GitReviewAlreadyDecidedError extends GitReviewError {
  constructor(reviewId: string, status: string) {
    super(`Change review '${reviewId}' has already been decided with status '${status}'.`);
    this.name = 'GitReviewAlreadyDecidedError';
  }
}

export class GitReviewUnauthorizedApprovalError extends GitReviewError {
  constructor(message: string) {
    super(message);
    this.name = 'GitReviewUnauthorizedApprovalError';
  }
}
