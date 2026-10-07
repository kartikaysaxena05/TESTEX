/**
 * @file packages/core/src/execution/evidence/evidence-errors.ts
 * Domain error taxonomy for failure evidence capture and managed storage.
 */

import { ExecutionDomainError } from '../execution-errors.js';
import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class EvidenceDomainError extends ExecutionDomainError {
  constructor(
    message: string,
    public override readonly code: DesktopErrorCode,
    status = 400,
    context?: Record<string, unknown>,
  ) {
    super(message, status, context);
    this.name = 'EvidenceDomainError';
  }
}

export class EvidenceBundleNotFoundError extends EvidenceDomainError {
  constructor(bundleId: string, projectId?: string) {
    super(
      `Evidence bundle '${bundleId}' was not found${projectId ? ` in project '${projectId}'` : ''}.`,
      'EVIDENCE_BUNDLE_NOT_FOUND',
      404,
      { bundleId, projectId },
    );
    this.name = 'EvidenceBundleNotFoundError';
  }
}

export class EvidenceArtifactNotFoundError extends EvidenceDomainError {
  constructor(artifactId: string, projectId?: string) {
    super(
      `Evidence artifact '${artifactId}' was not found${projectId ? ` in project '${projectId}'` : ''}.`,
      'EVIDENCE_ARTIFACT_NOT_FOUND',
      404,
      { artifactId, projectId },
    );
    this.name = 'EvidenceArtifactNotFoundError';
  }
}

export class EvidenceIntegrityMismatchError extends EvidenceDomainError {
  constructor(artifactId: string, expectedSha256: string, actualSha256: string) {
    super(
      `Evidence artifact '${artifactId}' integrity check failed: SHA-256 mismatch (expected '${expectedSha256}', actual '${actualSha256}').`,
      'EVIDENCE_INTEGRITY_MISMATCH',
      422,
      { artifactId, expectedSha256, actualSha256 },
    );
    this.name = 'EvidenceIntegrityMismatchError';
  }
}

export class EvidencePathTraversalError extends EvidenceDomainError {
  constructor(pathSegment: string) {
    super(
      `Directory traversal attack detected in evidence path segment '${pathSegment}'. Arbitrary filesystem access is strictly forbidden.`,
      'EVIDENCE_PATH_TRAVERSAL',
      400,
      { pathSegment },
    );
    this.name = 'EvidencePathTraversalError';
  }
}

export class EvidenceOwnershipMismatchError extends EvidenceDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVIDENCE_OWNERSHIP_MISMATCH', 403, context);
    this.name = 'EvidenceOwnershipMismatchError';
  }
}

export class EvidenceBundleAlreadyFinalizedError extends EvidenceDomainError {
  constructor(bundleId: string, currentStatus: string) {
    super(
      `Evidence bundle '${bundleId}' is already finalized in status '${currentStatus}' and cannot accept new artifacts.`,
      'EVIDENCE_BUNDLE_ALREADY_FINALIZED',
      409,
      { bundleId, currentStatus },
    );
    this.name = 'EvidenceBundleAlreadyFinalizedError';
  }
}

export class EvidenceStorageError extends EvidenceDomainError {
  constructor(message: string, cause?: unknown) {
    super(
      message,
      'EVIDENCE_STORAGE_ERROR',
      500,
      typeof cause === 'object' && cause !== null ? (cause as Record<string, unknown>) : { cause },
    );
    this.name = 'EvidenceStorageError';
  }
}

export class EvidenceSizeLimitExceededError extends EvidenceDomainError {
  constructor(byteSize: number, maxByteSize: number) {
    super(
      `Evidence artifact byte size (${byteSize} bytes) exceeds the maximum allowed limit of ${maxByteSize} bytes.`,
      'EVIDENCE_SIZE_LIMIT_EXCEEDED',
      413,
      { byteSize, maxByteSize },
    );
    this.name = 'EvidenceSizeLimitExceededError';
  }
}

export class EvidenceInvalidMimeTypeError extends EvidenceDomainError {
  constructor(mimeType: string) {
    super(
      `MIME type '${mimeType}' is not an authorized evidence artifact MIME type.`,
      'EVIDENCE_INVALID_MIME_TYPE',
      400,
      { mimeType },
    );
    this.name = 'EvidenceInvalidMimeTypeError';
  }
}
