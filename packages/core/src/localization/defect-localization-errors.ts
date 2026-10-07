/**
 * @file packages/core/src/localization/defect-localization-errors.ts
 * Domain errors for V7 Phase 100 Repository-Aware Defect Localization.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class DefectLocalizationError extends Error {
  constructor(
    message: string,
    public readonly code: DesktopErrorCode,
  ) {
    super(message);
    this.name = 'DefectLocalizationError';
  }
}

export class DefectLocalizationNotFoundError extends DefectLocalizationError {
  constructor(message = 'Repository defect localization record not found.') {
    super(message, 'LOCALIZATION_NOT_FOUND');
    this.name = 'DefectLocalizationNotFoundError';
  }
}

export class DefectLocalizationCrossProjectError extends DefectLocalizationError {
  constructor(
    message = 'Cross-project access forbidden. Localization does not belong to the authorized project.',
  ) {
    super(message, 'LOCALIZATION_CROSS_PROJECT');
    this.name = 'DefectLocalizationCrossProjectError';
  }
}

export class DefectLocalizationRepositoryNotFoundError extends DefectLocalizationError {
  constructor(message = 'Project source repository not found or not connected.') {
    super(message, 'LOCALIZATION_REPOSITORY_NOT_FOUND');
    this.name = 'DefectLocalizationRepositoryNotFoundError';
  }
}

export class DefectLocalizationRevisionUnavailableError extends DefectLocalizationError {
  constructor(
    message = 'Target repository revision is unavailable or repository has unresolvable drift.',
  ) {
    super(message, 'LOCALIZATION_REVISION_UNAVAILABLE');
    this.name = 'DefectLocalizationRevisionUnavailableError';
  }
}

export class DefectLocalizationPathTraversalError extends DefectLocalizationError {
  constructor(message = 'Path traversal attempt detected. Access denied outside repository root.') {
    super(message, 'LOCALIZATION_PATH_TRAVERSAL_DETECTED');
    this.name = 'DefectLocalizationPathTraversalError';
  }
}

export class DefectLocalizationSymlinkEscapeError extends DefectLocalizationError {
  constructor(message = 'Symlink escape attempt detected. Access denied outside repository root.') {
    super(message, 'LOCALIZATION_SYMLINK_ESCAPE_DETECTED');
    this.name = 'DefectLocalizationSymlinkEscapeError';
  }
}

export class DefectLocalizationReadOnlyViolationError extends DefectLocalizationError {
  constructor(
    message = 'Read-only violation: defect localization cannot modify target repository source.',
  ) {
    super(message, 'LOCALIZATION_READ_ONLY_VIOLATION');
    this.name = 'DefectLocalizationReadOnlyViolationError';
  }
}

export class DefectLocalizationFabricatedEntityError extends DefectLocalizationError {
  constructor(
    message = 'Fabricated or hallucinated candidate entity rejected. File or symbol does not exist in repository.',
  ) {
    super(message, 'LOCALIZATION_FABRICATED_ENTITY_REJECTED');
    this.name = 'DefectLocalizationFabricatedEntityError';
  }
}

export class DefectLocalizationConcurrentMutationError extends DefectLocalizationError {
  constructor(
    message = 'Concurrent defect localization is already in progress for this failure case.',
  ) {
    super(message, 'LOCALIZATION_CONCURRENT_MUTATION');
    this.name = 'DefectLocalizationConcurrentMutationError';
  }
}

export class DefectLocalizationValidationError extends DefectLocalizationError {
  constructor(message = 'Invalid localization request input.') {
    super(message, 'INVALID_REQUEST');
    this.name = 'DefectLocalizationValidationError';
  }
}
