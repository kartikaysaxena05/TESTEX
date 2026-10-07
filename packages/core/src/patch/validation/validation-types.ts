/**
 * @file packages/core/src/patch/validation/validation-types.ts
 * Type definitions, boundaries, and interfaces for V7 Phase 103 Patch Validation & Before/After Testing.
 */

import type {
  DefectPatchValidationDto,
  ExecutePatchValidationInputDto,
  GetPatchValidationInputDto,
  ListPatchValidationsInputDto,
  CancelPatchValidationInputDto,
} from '@ai-quality/contracts';

export const VALIDATION_BOUNDS = {
  DEFAULT_TIMEOUT_MS: 60_000,
  MAX_TIMEOUT_MS: 300_000,
  MIN_TIMEOUT_MS: 5_000,
  MAX_REGRESSION_TESTS: 10,
  GATE_TIMEOUT_MS: 30_000,
  MAX_EVIDENCE_SNIPPET_LENGTH: 10_000,
  MAX_LOG_ENTRIES: 100,
  VALIDATOR_VERSION: '1.0.0',
} as const;

export interface SelectedRegressionTestCase {
  readonly testCaseId: string;
  readonly testCaseKey: string;
  readonly testCaseTitle: string;
  readonly priority?: string;
  readonly type?: string;
  readonly matchReason: string;
  readonly score: number;
}

export interface TargetedTestSelection {
  readonly targetTestCaseId: string;
  readonly regressionTestCases: readonly SelectedRegressionTestCase[];
}

export interface ValidationStepExecutionResult {
  readonly status: 'PASS' | 'FAIL' | 'ERROR';
  readonly failedStepIndex?: number | null;
  readonly failedStepAction?: string | null;
  readonly expectedResult?: string | null;
  readonly actualResult?: string | null;
  readonly failureSignature?: string | null;
  readonly screenshotPath?: string | null;
  readonly consoleLogs: readonly string[];
  readonly networkCalls: readonly Record<string, unknown>[];
  readonly domSnapshot?: string | null;
  readonly tracePath?: string | null;
  readonly durationMs: number;
  readonly executedAt: Date;
}

export interface ControlledGateExecutionResult {
  readonly checkType: 'TYPECHECK' | 'LINT' | 'FORMAT' | 'BUILD';
  readonly status: 'PASS' | 'FAIL' | 'SKIPPED' | 'NOT_CONFIGURED';
  readonly passed: boolean;
  readonly outputSnippet?: string | null;
  readonly durationMs: number;
}

export interface PatchScopeAuditResult {
  readonly unexpectedChangesDetected: boolean;
  readonly unexpectedFiles: readonly string[];
  readonly allowedFiles: readonly string[];
}

export interface TestExecutionOptions {
  readonly projectId: string;
  readonly testCaseId: string;
  readonly testCaseKey?: string;
  readonly testCaseTitle?: string;
  readonly testCaseVersionNumber: number;
  readonly sandboxRoot: string;
  readonly isPatched: boolean;
  readonly isTargetTest: boolean;
  readonly abortSignal?: AbortSignal;
}

export interface ITestExecutionEngine {
  executeTest(options: TestExecutionOptions): Promise<ValidationStepExecutionResult>;
}

export interface IPatchValidationService {
  executeValidation(input: ExecutePatchValidationInputDto): Promise<DefectPatchValidationDto>;
  getValidation(input: GetPatchValidationInputDto): Promise<DefectPatchValidationDto | null>;
  listValidations(
    input: ListPatchValidationsInputDto,
  ): Promise<readonly DefectPatchValidationDto[]>;
  cancelValidation(input: CancelPatchValidationInputDto): Promise<DefectPatchValidationDto>;
}
