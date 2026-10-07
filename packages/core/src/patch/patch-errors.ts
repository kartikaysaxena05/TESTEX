/**
 * @file packages/core/src/patch/patch-errors.ts
 * Domain error classes for V7 Phase 101 Limited AI Patch Generation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class PatchProposalError extends Error {
  constructor(
    message: string,
    public readonly code: DesktopErrorCode,
  ) {
    super(message);
    this.name = 'PatchProposalError';
  }
}

export class PatchProposalNotFoundError extends PatchProposalError {
  constructor(message = 'Defect patch proposal not found.') {
    super(message, 'PATCH_NOT_FOUND');
    this.name = 'PatchProposalNotFoundError';
  }
}

export class PatchProposalIneligibleError extends PatchProposalError {
  constructor(
    message = 'Defect is ineligible for automated patch generation based on safety policy.',
  ) {
    super(message, 'PATCH_INELIGIBLE');
    this.name = 'PatchProposalIneligibleError';
  }
}

export class PatchProposalLocalizationRequiredError extends PatchProposalError {
  constructor(
    message = 'Authoritative repository defect localization is required before patch generation.',
  ) {
    super(message, 'PATCH_LOCALIZATION_REQUIRED');
    this.name = 'PatchProposalLocalizationRequiredError';
  }
}

export class PatchProposalCrossProjectError extends PatchProposalError {
  constructor(
    message = 'Cross-project access forbidden. Defect or repository does not belong to the authorized project.',
  ) {
    super(message, 'PATCH_CROSS_PROJECT');
    this.name = 'PatchProposalCrossProjectError';
  }
}

export class PatchProposalConcurrentMutationError extends PatchProposalError {
  constructor(
    message = 'Concurrent patch generation is already in progress for this failure case.',
  ) {
    super(message, 'PATCH_CONCURRENT_MUTATION');
    this.name = 'PatchProposalConcurrentMutationError';
  }
}

export class PatchProposalRevisionDriftError extends PatchProposalError {
  constructor(
    message = 'Repository state has drifted from failure/localization revision. Generation blocked.',
  ) {
    super(message, 'PATCH_REVISION_DRIFT');
    this.name = 'PatchProposalRevisionDriftError';
  }
}

export class PatchProposalPathTraversalError extends PatchProposalError {
  constructor(
    message = 'Path traversal attempt detected. Target file must remain inside workspace root.',
  ) {
    super(message, 'PATCH_PATH_TRAVERSAL_DETECTED');
    this.name = 'PatchProposalPathTraversalError';
  }
}

export class PatchProposalUnauthorizedFileError extends PatchProposalError {
  constructor(
    message = 'Target file is not in the Phase 100 authorized candidate files allowlist.',
  ) {
    super(message, 'PATCH_UNAUTHORIZED_FILE');
    this.name = 'PatchProposalUnauthorizedFileError';
  }
}

export class PatchProposalOversizedError extends PatchProposalError {
  constructor(message = 'Proposed patch exceeds limited size bounds for automated generation.') {
    super(message, 'PATCH_OVERSIZED');
    this.name = 'PatchProposalOversizedError';
  }
}

export class PatchProposalHighRiskBlockedError extends PatchProposalError {
  constructor(
    message = 'High-risk or security-critical change detected. Automated patch generation blocked.',
  ) {
    super(message, 'PATCH_HIGH_RISK_BLOCKED');
    this.name = 'PatchProposalHighRiskBlockedError';
  }
}

export class PatchProposalMalformedDiffError extends PatchProposalError {
  constructor(message = 'Generated diff or edit hunk is malformed and fails syntax verification.') {
    super(message, 'PATCH_MALFORMED_DIFF');
    this.name = 'PatchProposalMalformedDiffError';
  }
}

export class PatchProposalHallucinatedEntityError extends PatchProposalError {
  constructor(
    message = 'Patch references a nonexistent file, symbol, or entity not present in repository context.',
  ) {
    super(message, 'PATCH_HALLUCINATED_ENTITY');
    this.name = 'PatchProposalHallucinatedEntityError';
  }
}

export class PatchProposalDirectMutationForbiddenError extends PatchProposalError {
  constructor(
    message = 'Direct repository file modification is strictly forbidden in Phase 101 proposal mode.',
  ) {
    super(message, 'PATCH_DIRECT_MUTATION_FORBIDDEN');
    this.name = 'PatchProposalDirectMutationForbiddenError';
  }
}

export class PatchProposalValidationError extends PatchProposalError {
  constructor(message = 'Invalid patch proposal input parameters.') {
    super(message, 'INVALID_REQUEST');
    this.name = 'PatchProposalValidationError';
  }
}
