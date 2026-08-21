/**
 * @file packages/core/src/requirements/provenance/provenance-types.ts
 * Types and constants for requirement source provenance and auditability.
 */

import type {
  ProvenanceSourceKind,
  ProvenanceLocationKind,
  ProvenanceCompleteness,
  CandidateDetectionReasonDto,
} from '@ai-quality/contracts';

export const PROVENANCE_LIMITS = {
  MAX_SOURCE_TEXT_LENGTH: 50_000,
  MAX_REVIEWED_TEXT_LENGTH: 50_000,
  MAX_SURROUNDING_CONTEXT_BLOCKS: 2,
  MAX_CONTEXT_SNIPPET_LENGTH: 5_000,
} as const;

export interface RawRequirementProvenanceInput {
  projectId: string;
  requirementId: string;
  requirementSourceId: string;
  sourceKind: ProvenanceSourceKind;
  locationKind?: ProvenanceLocationKind;
  candidateId?: string | null;
  documentId?: string | null;
  extractionId?: string | null;
  sourceBlockId?: string | null;
  sourceTableId?: string | null;
  sourceRowIndex?: number | null;
  sectionId?: string | null;
  sectionPath?: string | null;
  pageNumber?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  sourceText?: string | null;
  reviewedText?: string | null;
  externalRequirementKey?: string | null;
  sourceSha256?: string | null;
  extractorVersion?: string | null;
  detectorVersion?: string | null;
  detectionReasons?: CandidateDetectionReasonDto[];
  detectionScore?: number | null;
  completeness?: ProvenanceCompleteness;
}

export interface ProvenanceValidationResult {
  isValid: boolean;
  completeness: ProvenanceCompleteness;
  errors: string[];
}
