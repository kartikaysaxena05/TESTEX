/**
 * @file packages/core/src/requirements/candidate-detection/detection-types.ts
 * Core types, constants, scoring rules, and interfaces for candidate detection.
 */

import type {
  CandidateDetectionReasonCode,
  CandidateDetectionReasonDto,
  CandidateWarningDto,
  RequirementDocumentExtractionDto,
} from '@ai-quality/contracts';

export const DETECTOR_VERSION = 'requirement-detector-v1';

export const CANDIDATE_DETECTION_LIMITS = {
  MAX_BLOCKS_PROCESSED: 50_000,
  MAX_CANDIDATES: 5_000,
  MAX_CANDIDATE_LENGTH: 5_000,
  MIN_CANDIDATE_LENGTH: 15,
  MAX_REASONS_PER_CANDIDATE: 10,
} as const;

/**
 * Deterministic scoring weights for explainable candidate confidence.
 */
export const DETECTION_SCORE_WEIGHTS: Record<CandidateDetectionReasonCode, number> = {
  EXPLICIT_SOURCE_ID: 5,
  EXPLICIT_SHALL: 4,
  EXPLICIT_MUST: 4,
  PROHIBITION_PATTERN: 3,
  REQUIREMENT_TABLE_ROW: 3,
  NUMBERED_REQUIREMENT: 3,
  REQUIRED_TO_PATTERN: 3,
  USER_STORY_PATTERN: 3,
  EARS_PATTERN: 3,
  SECTION_CONTEXT: 2,
  BULLET_REQUIREMENT: 2,
  WEAK_OBLIGATION_SHOULD: 1,
  OPTIONAL_CAPABILITY_MAY: 1,
};

export interface RawDetectedCandidate {
  readonly sourceBlockId: string | null;
  readonly sourceTableId: string | null;
  readonly sourceRowIndex: number | null;
  readonly sourceText: string;
  readonly externalKey: string | null;
  readonly sectionId: string | null;
  readonly sectionPath: string | null;
  readonly pageNumber: number | null;
  readonly lineStart: number | null;
  readonly lineEnd: number | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  readonly detectionMethod: string;
  readonly detectionReasons: CandidateDetectionReasonDto[];
  readonly detectionScore: number;
  readonly warnings: CandidateWarningDto[];
  readonly orderIndex: number;
}

export interface CandidateDetectionInput {
  readonly extraction: RequirementDocumentExtractionDto;
}

export interface CandidateDetectionResult {
  readonly candidates: RawDetectedCandidate[];
  readonly totalDetected: number;
  readonly detectorVersion: string;
}
