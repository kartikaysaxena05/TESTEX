/**
 * @file packages/core/src/ai/specifications/specification-types.ts
 * Type definitions and limit constants for Phase 51 Test Specification Enrichment.
 */

import type {
  ExpectedResultCategory,
  GeneratedTestSpecificationDto,
  PreconditionCategory,
  TestDataDataType,
  TestDataOrigin,
  TestDesignCategory,
  TestSpecificationEnrichmentMetricsDto,
} from '@ai-quality/contracts';

export const TEST_SPECIFICATIONS_PROMPT_ID = 'requirement.test-specification-enrichment';
export const TEST_SPECIFICATIONS_PROMPT_VERSION = 1;

/**
 * Operational limits to prevent unbounded generation and memory consumption.
 */
export const SPECIFICATION_LIMITS = {
  MAX_PRECONDITIONS_PER_SPEC: 10,
  MAX_TEST_DATA_PER_SPEC: 15,
  MAX_EXPECTED_RESULTS_PER_SPEC: 10,
  MAX_ASSUMPTIONS_PER_SPEC: 5,
  MAX_UNKNOWNS_PER_SPEC: 10,
  MAX_TOTAL_SPECS: 25,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_STRING_FIELD_LENGTH: 256,
} as const;

export interface TestSpecificationValidationContext {
  readonly requirementKey: string;
  readonly requirementId: string;
  readonly requirementText: string;
  readonly validEvidenceRefIds: ReadonlySet<string>;
  readonly validScenarioIds: ReadonlySet<string>;
  readonly validTestDesignIds?: ReadonlySet<string>;
  readonly isNotTestable?: boolean;
  readonly qualityFindingCodes?: readonly string[];
}

export interface SpecificationValidationResult {
  readonly sanitizedSpecifications: readonly GeneratedTestSpecificationDto[];
  readonly metrics: TestSpecificationEnrichmentMetricsDto;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly ungroundedEvidenceCount: number;
  readonly duplicateCount: number;
}

export interface RawPreconditionOutput {
  readonly key?: string;
  readonly category: PreconditionCategory;
  readonly description: string;
  readonly confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly sourceEvidenceRefs?: readonly string[];
  readonly reviewRequired?: boolean;
  readonly assumptions?: readonly string[];
}

export interface RawTestDataItemOutput {
  readonly key?: string;
  readonly name: string;
  readonly dataType: TestDataDataType;
  readonly origin: TestDataOrigin;
  readonly value?: string | number | boolean | null;
  readonly generator?: string | null;
  readonly constraint?: string | null;
  readonly isSensitive?: boolean;
  readonly unknownReason?: string | null;
  readonly confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly sourceEvidenceRefs?: readonly string[];
  readonly reviewRequired?: boolean;
}

export interface RawExpectedResultOutput {
  readonly key?: string;
  readonly category: ExpectedResultCategory;
  readonly description: string;
  readonly observable?: boolean;
  readonly stateChange?: {
    readonly from?: string | null;
    readonly to?: string | null;
    readonly entity?: string | null;
  } | null;
  readonly nonChange?: {
    readonly entity?: string | null;
    readonly preservedState?: string | null;
  } | null;
  readonly exactMessageExpected?: string | null;
  readonly httpStatusExpected?: number | null;
  readonly confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly sourceEvidenceRefs?: readonly string[];
  readonly reviewRequired?: boolean;
}

export interface RawTestSpecificationOutput {
  readonly scenarioKey?: string | null;
  readonly testDesignKey?: string | null;
  readonly title: string;
  readonly category: TestDesignCategory;
  readonly preconditions?: readonly RawPreconditionOutput[];
  readonly testData?: readonly RawTestDataItemOutput[];
  readonly expectedResults?: readonly RawExpectedResultOutput[];
  readonly assumptions?: readonly string[];
  readonly unknowns?: readonly {
    readonly name: string;
    readonly reason: string;
    readonly reviewRequired?: boolean;
  }[];
  readonly confidence?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  readonly reviewRequired?: boolean;
  readonly reviewReasons?: readonly string[];
  readonly sourceEvidenceRefs?: readonly string[];
}
