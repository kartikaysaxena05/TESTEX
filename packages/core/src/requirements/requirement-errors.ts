/**
 * @file packages/core/src/requirements/requirement-errors.ts
 * Domain-specific errors for the Requirement Intelligence subsystem.
 */

export class RequirementNotFoundError extends Error {
  readonly code = 'REQUIREMENT_NOT_FOUND';
  constructor(message = 'Requirement was not found.') {
    super(message);
    this.name = 'RequirementNotFoundError';
  }
}

export class RequirementSourceNotFoundError extends Error {
  readonly code = 'REQUIREMENT_SOURCE_NOT_FOUND';
  constructor(message = 'Requirement source was not found.') {
    super(message);
    this.name = 'RequirementSourceNotFoundError';
  }
}

export class RequirementKeyConflictError extends Error {
  readonly code = 'REQUIREMENT_KEY_CONFLICT';
  constructor(message = 'A requirement with this key already exists in the project.') {
    super(message);
    this.name = 'RequirementKeyConflictError';
  }
}

export class RequirementValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message = 'Invalid requirement parameter.') {
    super(message);
    this.name = 'RequirementValidationError';
  }
}

export class InvalidRequirementTransitionError extends Error {
  readonly code = 'INVALID_REQUIREMENT_TRANSITION';
  constructor(fromStatus: string, toStatus: string) {
    super(`Cannot transition requirement from status '${fromStatus}' to '${toStatus}'.`);
    this.name = 'InvalidRequirementTransitionError';
  }
}

export class DocumentNotFoundError extends Error {
  readonly code = 'DOCUMENT_NOT_FOUND';
  constructor(message = 'Requirement document was not found.') {
    super(message);
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentDuplicateError extends Error {
  readonly code = 'DOCUMENT_DUPLICATE';
  constructor(
    message = 'An identical requirement document (matching SHA-256) is already attached to this project.',
  ) {
    super(message);
    this.name = 'DocumentDuplicateError';
  }
}

export class DocumentFormatError extends Error {
  readonly code = 'DOCUMENT_INVALID_FORMAT';
  constructor(message = 'Invalid document format or corrupted header signature.') {
    super(message);
    this.name = 'DocumentFormatError';
  }
}

export class DocumentTooLargeError extends Error {
  readonly code = 'DOCUMENT_TOO_LARGE';
  constructor(message = 'Requirement document exceeds maximum allowed size.') {
    super(message);
    this.name = 'DocumentTooLargeError';
  }
}

export class DocumentFileMissingError extends Error {
  readonly code = 'DOCUMENT_FILE_MISSING';
  constructor(message = 'The managed document file is missing from platform storage.') {
    super(message);
    this.name = 'DocumentFileMissingError';
  }
}

export class DocumentIntegrityMismatchError extends Error {
  readonly code = 'DOCUMENT_INTEGRITY_MISMATCH';
  constructor(
    message = 'Document integrity check failed: actual file SHA-256 hash does not match stored hash.',
  ) {
    super(message);
    this.name = 'DocumentIntegrityMismatchError';
  }
}

export class DocumentEncryptedError extends Error {
  readonly code = 'DOCUMENT_ENCRYPTED';
  constructor(
    message = 'The document is encrypted or password-protected and cannot be extracted.',
  ) {
    super(message);
    this.name = 'DocumentEncryptedError';
  }
}

export class DocumentExtractionLimitExceededError extends Error {
  readonly code = 'DOCUMENT_EXTRACTION_LIMIT_EXCEEDED';
  constructor(message = 'Document extraction exceeded configured safety limits.') {
    super(message);
    this.name = 'DocumentExtractionLimitExceededError';
  }
}

export class DocumentExtractionFailedError extends Error {
  readonly code = 'DOCUMENT_EXTRACTION_FAILED';
  constructor(message = 'Document extraction failed.') {
    super(message);
    this.name = 'DocumentExtractionFailedError';
  }
}

export class CandidateNotFoundError extends Error {
  readonly code = 'CANDIDATE_NOT_FOUND';
  constructor(message = 'Requirement candidate not found.') {
    super(message);
    this.name = 'CandidateNotFoundError';
  }
}

export class ExtractionNotFoundError extends Error {
  readonly code = 'EXTRACTION_NOT_FOUND';
  constructor(
    message = 'Document has not been extracted yet. Please extract text and structure first.',
  ) {
    super(message);
    this.name = 'ExtractionNotFoundError';
  }
}

export class NoApprovedCandidatesError extends Error {
  readonly code = 'NO_APPROVED_CANDIDATES';
  constructor(message = 'No approved requirement candidates found to import.') {
    super(message);
    this.name = 'NoApprovedCandidatesError';
  }
}

export class CandidateAlreadyImportedError extends Error {
  readonly code = 'CANDIDATE_ALREADY_IMPORTED';
  constructor(message = 'One or more selected candidates have already been imported.') {
    super(message);
    this.name = 'CandidateAlreadyImportedError';
  }
}

export class ProvenanceNotFoundError extends Error {
  readonly code = 'PROVENANCE_NOT_FOUND';
  constructor(message = 'Requirement provenance was not found.') {
    super(message);
    this.name = 'ProvenanceNotFoundError';
  }
}

export class DocumentInUseError extends Error {
  readonly code = 'DOCUMENT_IN_USE';
  constructor(
    message = 'Cannot delete requirement document because one or more active requirements depend on it for audit provenance.',
  ) {
    super(message);
    this.name = 'DocumentInUseError';
  }
}

export class SourceInUseError extends Error {
  readonly code = 'SOURCE_IN_USE';
  constructor(
    message = 'Cannot delete requirement source because one or more requirements depend on it for audit provenance.',
  ) {
    super(message);
    this.name = 'SourceInUseError';
  }
}

export class RepresentationNotFoundError extends Error {
  readonly code = 'REPRESENTATION_NOT_FOUND';
  constructor(message = 'Structured requirement representation was not found.') {
    super(message);
    this.name = 'RepresentationNotFoundError';
  }
}

export class NormalizationFailedError extends Error {
  readonly code = 'NORMALIZATION_FAILED';
  constructor(message = 'Requirement normalization failed.') {
    super(message);
    this.name = 'NormalizationFailedError';
  }
}

export class MetadataNotFoundError extends Error {
  readonly code = 'METADATA_NOT_FOUND';
  constructor(message = 'Requirement metadata was not found.') {
    super(message);
    this.name = 'MetadataNotFoundError';
  }
}

export class ClassificationFailedError extends Error {
  readonly code = 'CLASSIFICATION_FAILED';
  constructor(message = 'Requirement classification failed.') {
    super(message);
    this.name = 'ClassificationFailedError';
  }
}

export class QualityAnalysisNotFoundError extends Error {
  readonly code = 'QUALITY_ANALYSIS_NOT_FOUND';
  constructor(message = 'Requirement quality analysis was not found.') {
    super(message);
    this.name = 'QualityAnalysisNotFoundError';
  }
}

export class QualityFindingNotFoundError extends Error {
  readonly code = 'QUALITY_FINDING_NOT_FOUND';
  constructor(message = 'Requirement quality finding was not found.') {
    super(message);
    this.name = 'QualityFindingNotFoundError';
  }
}

export class QualityAnalysisFailedError extends Error {
  readonly code = 'QUALITY_ANALYSIS_FAILED';
  constructor(message = 'Requirement quality analysis failed.') {
    super(message);
    this.name = 'QualityAnalysisFailedError';
  }
}

export class RelationshipNotFoundError extends Error {
  readonly code = 'RELATIONSHIP_NOT_FOUND';
  constructor(message = 'Requirement relationship was not found.') {
    super(message);
    this.name = 'RelationshipNotFoundError';
  }
}

export class RelationshipAlreadyExistsError extends Error {
  readonly code = 'RELATIONSHIP_ALREADY_EXISTS';
  constructor(message = 'Requirement relationship already exists.') {
    super(message);
    this.name = 'RelationshipAlreadyExistsError';
  }
}

export class SelfRelationshipError extends Error {
  readonly code = 'SELF_RELATIONSHIP_ERROR';
  constructor(message = 'A requirement cannot have a relationship to itself.') {
    super(message);
    this.name = 'SelfRelationshipError';
  }
}

export class RepositoryEvidenceNotFoundError extends Error {
  readonly code = 'REPOSITORY_EVIDENCE_NOT_FOUND';
  constructor(message = 'Repository evidence was not found.') {
    super(message);
    this.name = 'RepositoryEvidenceNotFoundError';
  }
}

export class RepositoryIndexNotAvailableError extends Error {
  readonly code = 'REPOSITORY_INDEX_NOT_AVAILABLE';
  constructor(
    message = 'Repository index is not available for this project. Please index repository sources first.',
  ) {
    super(message);
    this.name = 'RepositoryIndexNotAvailableError';
  }
}

export class RepositoryEvidenceNotAuthorizedError extends Error {
  readonly code = 'REPOSITORY_EVIDENCE_NOT_AUTHORIZED';
  constructor(
    message = 'Target repository file or symbol is not authorized or does not belong to the project source.',
  ) {
    super(message);
    this.name = 'RepositoryEvidenceNotAuthorizedError';
  }
}

export class RequirementVersionNotFoundError extends Error {
  readonly code = 'REQUIREMENT_VERSION_NOT_FOUND';
  constructor(message = 'Requirement version was not found.') {
    super(message);
    this.name = 'RequirementVersionNotFoundError';
  }
}

export class RequirementVersionConflictError extends Error {
  readonly code = 'REQUIREMENT_VERSION_CONFLICT';
  constructor(
    message = 'This requirement was modified by another operation. Please reload the latest version before saving.',
  ) {
    super(message);
    this.name = 'RequirementVersionConflictError';
  }
}

export class RequirementImpactNotFoundError extends Error {
  readonly code = 'REQUIREMENT_IMPACT_NOT_FOUND';
  constructor(message = 'Requirement change impact candidate was not found.') {
    super(message);
    this.name = 'RequirementImpactNotFoundError';
  }
}

export class InvalidVersionComparisonError extends Error {
  readonly code = 'INVALID_VERSION_COMPARISON';
  constructor(message = 'Cannot compare versions from different requirements or projects.') {
    super(message);
    this.name = 'InvalidVersionComparisonError';
  }
}
