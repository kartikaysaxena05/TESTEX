/**
 * @file packages/core/src/test-validation/test-validation-types.ts
 * Types, bounds, and constants for AI Test Generation Validation & Hallucination Controls.
 */

import type { TestValidationFindingCode, TestValidationSeverity } from '@ai-quality/contracts';

export const VALIDATOR_VERSION = 'test-validation-v1';

export const VALIDATION_LIMITS = {
  MAX_FINDINGS_PER_VALIDATION: 200,
  MAX_BATCH_VALIDATION_SIZE: 50,
  MAX_STEP_ACTION_LENGTH: 2000,
  MAX_EXPECTED_RESULT_LENGTH: 2000,
  MAX_PRECONDITION_DESCRIPTION_LENGTH: 2000,
  MAX_TEST_DATA_NAME_LENGTH: 256,
  MAX_TEST_DATA_VALUE_LENGTH: 4000,
  MAX_CONTEXT_EVIDENCE_SNIPPET_LENGTH: 1000,
} as const;

export interface RawValidationFinding {
  readonly code: TestValidationFindingCode;
  readonly severity: TestValidationSeverity;
  readonly fieldPath?: string | null;
  readonly message: string;
  readonly evidence?: string | null;
  readonly source?: string | null;
  readonly suggestedAction?: string | null;
}

export interface ValidationContext {
  readonly projectId: string;
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly requirementTitle: string;
  readonly requirementText: string;
  readonly requirementVersionNumber: number;
  readonly requirementQualityFindings?: readonly {
    readonly code: string;
    readonly message: string;
    readonly severity: string;
  }[];
  readonly retrievedContextTexts?: readonly string[];
  readonly repositoryEvidenceRefs?: readonly string[];
  readonly knownRoles?: readonly string[];
  readonly knownEndpoints?: readonly string[];
  readonly knownSelectors?: readonly string[];
  readonly knownEntities?: readonly string[];
}

export interface TestSubjectToValidate {
  readonly title: string;
  readonly objective?: string;
  readonly description?: string | null;
  readonly type: string;
  readonly category?: string;
  readonly preconditions: readonly {
    readonly sequenceOrder?: number;
    readonly category?: string;
    readonly description: string;
    readonly isEnforced?: boolean;
    readonly confidence?: string;
    readonly sourceEvidenceRefs?: readonly string[];
    readonly reviewRequired?: boolean;
  }[];
  readonly steps: readonly {
    readonly stepNumber?: number;
    readonly action: string;
    readonly expectedResult?: string | null;
    readonly testDataSummary?: string | null;
    readonly stateChangeFrom?: string | null;
    readonly stateChangeTo?: string | null;
    readonly stateEntity?: string | null;
    readonly isOptional?: boolean;
  }[];
  readonly testData: readonly {
    readonly sequenceOrder?: number;
    readonly name: string;
    readonly dataType?: string;
    readonly origin?: string;
    readonly value?: unknown;
    readonly constraint?: string | null;
    readonly isSensitive?: boolean;
  }[];
  readonly overallExpectedResult?: string | null;
  readonly assumptions?: readonly string[];
  readonly unknowns?: readonly unknown[];
  readonly sourceEvidenceRefs?: readonly string[];
}
