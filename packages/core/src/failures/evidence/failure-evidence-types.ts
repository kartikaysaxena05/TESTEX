/**
 * @file packages/core/src/failures/evidence/failure-evidence-types.ts
 * Domain types, bounds, and service interfaces for Failure Evidence Ingestion & Normalization (V6 Phase 75).
 */

import type {
  EvidenceIntegrityStatus,
  EvidenceCompletenessStatus,
  EvidenceAvailabilityState,
  NormalizedFailedStepDto,
  NormalizedExpectedActualDto,
  NormalizedConsoleMessageDto,
  NormalizedNetworkRecordDto,
  NormalizedDomEvidenceDto,
  NormalizedRetryRecordDto,
  NormalizedHealingRecordDto,
  NormalizedEnvironmentDto,
  FailureEvidencePackageDto,
  FailureEvidenceItemReportDto,
  FailureEvidenceIntegrityReportDto,
  FailureEvidenceArtifactContentDto,
  FailureEvidenceReferenceDto,
  IngestFailureEvidenceInputDto,
  GetFailureEvidencePackageInputDto,
  VerifyEvidenceIntegrityInputDto,
  GetFailureEvidenceArtifactContentInputDto,
} from '@ai-quality/contracts';

export type {
  EvidenceIntegrityStatus,
  EvidenceCompletenessStatus,
  EvidenceAvailabilityState,
  NormalizedFailedStepDto,
  NormalizedExpectedActualDto,
  NormalizedConsoleMessageDto,
  NormalizedNetworkRecordDto,
  NormalizedDomEvidenceDto,
  NormalizedRetryRecordDto,
  NormalizedHealingRecordDto,
  NormalizedEnvironmentDto,
  FailureEvidencePackageDto,
  FailureEvidenceItemReportDto,
  FailureEvidenceIntegrityReportDto,
  FailureEvidenceArtifactContentDto,
  FailureEvidenceReferenceDto,
  IngestFailureEvidenceInputDto,
  GetFailureEvidencePackageInputDto,
  VerifyEvidenceIntegrityInputDto,
  GetFailureEvidenceArtifactContentInputDto,
};

/**
 * Authoritative bounds and bounds for Failure Evidence Ingestion & Normalization.
 */
export const FAILURE_EVIDENCE_BOUNDS = {
  NORMALIZER_VERSION: '1.0.0',
  MAX_CONSOLE_MESSAGES: 1000,
  MAX_NETWORK_RECORDS: 500,
  MAX_DOM_HTML_CHARS: 32 * 1024, // 32 KB
  MAX_SCREENSHOT_REFERENCES: 20,
  MAX_RETRY_RECORDS: 10,
  MAX_HEALING_RECORDS: 20,
  MAX_ERROR_MESSAGE_CHARS: 5000,
  MAX_ARTIFACT_BYTE_SIZE: 50 * 1024 * 1024, // 50 MB
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * Service interface for failure evidence ingestion, normalization, and integrity validation.
 */
export interface IFailureEvidenceIngestionService {
  ingestEvidence(input: IngestFailureEvidenceInputDto): Promise<FailureEvidencePackageDto>;
  getEvidencePackage(input: GetFailureEvidencePackageInputDto): Promise<FailureEvidencePackageDto>;
  verifyEvidenceIntegrity(
    input: VerifyEvidenceIntegrityInputDto,
  ): Promise<FailureEvidenceIntegrityReportDto>;
  getEvidenceArtifactContent(
    input: GetFailureEvidenceArtifactContentInputDto,
  ): Promise<FailureEvidenceArtifactContentDto>;
}
