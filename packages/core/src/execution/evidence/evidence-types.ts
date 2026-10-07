/**
 * @file packages/core/src/execution/evidence/evidence-types.ts
 * Domain types, bounds, and service interfaces for failure evidence capture and storage.
 */

import type {
  EvidenceBundleStatus,
  EvidenceArtifactType,
  EvidenceRedactionStatus,
  EvidenceRetentionStatus,
  ExecutionEvidenceBundleDto,
  ExecutionEvidenceArtifactDto,
  CreateEvidenceBundleInputDto,
  AddEvidenceArtifactInputDto,
  FinalizeEvidenceBundleInputDto,
  GetEvidenceBundleInputDto,
  ListEvidenceBundlesInputDto,
  ListEvidenceArtifactsInputDto,
  GetEvidenceArtifactMetadataInputDto,
  VerifyEvidenceArtifactIntegrityInputDto,
  PurgeExecutionEvidenceInputDto,
} from '@ai-quality/contracts';

export type {
  EvidenceBundleStatus,
  EvidenceArtifactType,
  EvidenceRedactionStatus,
  EvidenceRetentionStatus,
  ExecutionEvidenceBundleDto,
  ExecutionEvidenceArtifactDto,
  CreateEvidenceBundleInputDto,
  AddEvidenceArtifactInputDto,
  FinalizeEvidenceBundleInputDto,
  GetEvidenceBundleInputDto,
  ListEvidenceBundlesInputDto,
  ListEvidenceArtifactsInputDto,
  GetEvidenceArtifactMetadataInputDto,
  VerifyEvidenceArtifactIntegrityInputDto,
  PurgeExecutionEvidenceInputDto,
};

/**
 * Authoritative bounds and constraints for evidence storage and metadata.
 */
export const EVIDENCE_BOUNDS = {
  MAX_ARTIFACT_BYTE_SIZE: 50 * 1024 * 1024, // 50 MB
  MAX_ARTIFACTS_PER_BUNDLE: 50,
  MAX_BUNDLES_PER_EXECUTION: 10,
  MAX_METADATA_JSON_BYTES: 64 * 1024, // 64 KB
  MAX_ERROR_SUMMARY_CHARS: 4000,
  MAX_LOGICAL_NAME_LENGTH: 255,
  MAX_MIME_TYPE_LENGTH: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * Standard allowed MIME types for evidence artifacts.
 */
export const ALLOWED_EVIDENCE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
  'application/json',
  'text/plain',
  'text/html',
  'text/csv',
  'application/pdf',
  'video/webm',
  'video/mp4',
  'application/octet-stream',
]);

/**
 * Result of staging an evidence file into temporary managed storage.
 */
export interface StagedArtifactResult {
  readonly stagingFilePath: string;
  readonly storageIdentity: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly mimeType: string;
}

/**
 * Input for staging an artifact to temporary storage.
 */
export interface StageArtifactInput {
  readonly projectId: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly content: Buffer | Uint8Array | string;
  readonly mimeType: string;
  readonly originalLogicalName: string;
}

/**
 * Interface for the low-level managed evidence storage system.
 */
export interface IEvidenceStorageService {
  /**
   * Resolves and strictly validates that path components remain within the application-managed storage root.
   */
  resolveManagedPath(
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): string;

  /**
   * Stages incoming content to temporary storage while streaming SHA-256 and byte count.
   */
  stageArtifact(input: StageArtifactInput): Promise<StagedArtifactResult>;

  /**
   * Promotes a staged artifact file to the final managed storage location with read-only permissions (0o444).
   */
  promoteStagedArtifact(
    stagingFilePath: string,
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): Promise<string>;

  /**
   * Cleans up temporary staging file if an operation fails or rolls back.
   */
  cleanupStagingFile(stagingFilePath: string): Promise<void>;

  /**
   * Reads an artifact from managed storage, optionally validating its expected SHA-256 hash.
   */
  readArtifact(input: {
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly storageIdentity: string;
    readonly expectedSha256?: string;
  }): Promise<{ readonly buffer: Buffer; readonly byteSize: number; readonly sha256: string }>;

  /**
   * Verifies the cryptographic SHA-256 integrity of a stored artifact.
   */
  verifyArtifactIntegrity(input: {
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly storageIdentity: string;
    readonly expectedSha256: string;
  }): Promise<{
    readonly isValid: boolean;
    readonly expectedSha256: string;
    readonly actualSha256: string;
    readonly byteSize: number;
  }>;

  /**
   * Deletes an artifact file from managed storage.
   */
  deleteArtifactFile(
    projectId: string,
    testRunId: string,
    executionId: string,
    storageIdentity: string,
  ): Promise<boolean>;

  /**
   * Deletes all artifact files for an execution directory.
   */
  deleteExecutionDirectory(
    projectId: string,
    testRunId: string,
    executionId: string,
  ): Promise<boolean>;
}

/**
 * Interface for the high-level Execution Evidence domain service.
 */
export interface IExecutionEvidenceService {
  createBundle(input: CreateEvidenceBundleInputDto): Promise<ExecutionEvidenceBundleDto>;
  addArtifact(input: AddEvidenceArtifactInputDto): Promise<ExecutionEvidenceArtifactDto>;
  finalizeBundle(input: FinalizeEvidenceBundleInputDto): Promise<ExecutionEvidenceBundleDto>;
  getBundle(input: GetEvidenceBundleInputDto): Promise<ExecutionEvidenceBundleDto>;
  listBundles(input: ListEvidenceBundlesInputDto): Promise<{
    readonly items: readonly ExecutionEvidenceBundleDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>;
  listArtifacts(input: ListEvidenceArtifactsInputDto): Promise<{
    readonly items: readonly ExecutionEvidenceArtifactDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  }>;
  getArtifactMetadata(
    input: GetEvidenceArtifactMetadataInputDto,
  ): Promise<ExecutionEvidenceArtifactDto>;
  readArtifactContent(input: { readonly projectId: string; readonly artifactId: string }): Promise<{
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly byteSize: number;
    readonly sha256: string;
  }>;
  verifyArtifactIntegrity(input: VerifyEvidenceArtifactIntegrityInputDto): Promise<{
    readonly isValid: boolean;
    readonly expectedSha256: string;
    readonly actualSha256: string;
    readonly byteSize: number;
  }>;
  purgeExecutionEvidence(input: PurgeExecutionEvidenceInputDto): Promise<{
    readonly deletedBundlesCount: number;
    readonly deletedArtifactsCount: number;
  }>;
}
