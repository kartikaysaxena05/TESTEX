/**
 * @file packages/core/src/patch/sandbox/sandbox-errors.ts
 * Domain errors for V7 Phase 102 Secure Patch Sandbox & Change Isolation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

/**
 * Base class for all patch sandbox domain errors.
 */
export abstract class PatchSandboxError extends Error {
  abstract readonly code: DesktopErrorCode;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PatchSandboxNotFoundError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_NOT_FOUND';
}

export class PatchSandboxAlreadyExistsError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_ALREADY_EXISTS';
}

export class PatchSandboxCreationFailedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_CREATION_FAILED';
}

export class PatchSandboxRevisionMismatchError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_REVISION_MISMATCH';
}

export class PatchSandboxPathTraversalError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_PATH_TRAVERSAL_DETECTED';
}

export class PatchSandboxSymlinkEscapeError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_SYMLINK_ESCAPE_DETECTED';
}

export class PatchSandboxUnauthorizedFileError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_UNAUTHORIZED_FILE';
}

export class PatchSandboxSensitiveFileBlockedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_SENSITIVE_FILE_BLOCKED';
}

export class PatchSandboxGitMetadataBlockedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_GIT_METADATA_BLOCKED';
}

export class PatchSandboxConflictError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_CONFLICT';
}

export class PatchSandboxDiffMismatchError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_DIFF_MISMATCH';
}

export class PatchSandboxOversizedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_OVERSIZED';
}

export class PatchSandboxUnsupportedBinaryError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_UNSUPPORTED_BINARY';
}

export class PatchSandboxAlreadyAppliedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_ALREADY_APPLIED';
}

export class PatchSandboxCrossProjectError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_CROSS_PROJECT';
}

export class PatchSandboxConcurrentMutationError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_CONCURRENT_MUTATION';
}

export class PatchSandboxCleanupFailedError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_CLEANUP_FAILED';
}

export class PatchSandboxImmutabilityViolationError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'PATCH_SANDBOX_IMMUTABILITY_VIOLATION';
}

export class PatchSandboxValidationError extends PatchSandboxError {
  readonly code: DesktopErrorCode = 'VALIDATION_ERROR';
}
