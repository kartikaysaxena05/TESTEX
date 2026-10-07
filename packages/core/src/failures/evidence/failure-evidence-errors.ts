/**
 * @file packages/core/src/failures/evidence/failure-evidence-errors.ts
 * Domain errors for Failure Evidence Ingestion & Normalization (V6 Phase 75).
 */

import { FailureDomainError } from '../failure-errors.js';

export class FailureEvidenceIntegrityMismatchError extends FailureDomainError {
  public override readonly code = 'EVIDENCE_INTEGRITY_FAILED';
  constructor(
    public readonly referenceId: string,
    public readonly expectedSha256: string,
    public readonly actualSha256: string,
    message?: string,
  ) {
    super(
      message ??
        `Evidence reference '${referenceId}' integrity hash mismatch. Expected '${expectedSha256}', found '${actualSha256}'.`,
    );
  }
}

export class FailureEvidenceArtifactMissingError extends FailureDomainError {
  public override readonly code = 'EVIDENCE_ARTIFACT_MISSING';
  constructor(
    public readonly referenceId: string,
    public readonly storageIdentity: string,
    message?: string,
  ) {
    super(
      message ??
        `Evidence file '${storageIdentity}' for reference '${referenceId}' is missing from managed storage.`,
    );
  }
}

export class FailureEvidenceCorruptError extends FailureDomainError {
  public override readonly code = 'EVIDENCE_CORRUPT';
  constructor(
    public readonly referenceId: string,
    public readonly reason: string,
    message?: string,
  ) {
    super(message ?? `Evidence artifact '${referenceId}' is corrupt: ${reason}`);
  }
}

export class FailureEvidencePathTraversalError extends FailureDomainError {
  public override readonly code = 'EVIDENCE_PATH_TRAVERSAL_DETECTED';
  constructor(
    public readonly targetPath: string,
    message?: string,
  ) {
    super(message ?? `Illegal path traversal detected in evidence access: '${targetPath}'`);
  }
}

export class FailureEvidenceIngestionFailedError extends FailureDomainError {
  public override readonly code = 'EVIDENCE_INGESTION_FAILED';
  constructor(
    public readonly failureCaseId: string,
    public readonly reason: string,
    message?: string,
  ) {
    super(message ?? `Evidence ingestion failed for failure case '${failureCaseId}': ${reason}`);
  }
}

export class EvidenceReferenceNotFoundError extends FailureDomainError {
  public override readonly code = 'FAILURE_EVIDENCE_NOT_FOUND';
  constructor(
    public readonly referenceId: string,
    message?: string,
  ) {
    super(message ?? `Failure evidence reference '${referenceId}' not found.`);
  }
}
