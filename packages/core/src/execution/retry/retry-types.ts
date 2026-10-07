/**
 * @file packages/core/src/execution/retry/retry-types.ts
 * Type definitions, interfaces, and bounds for V5 Phase 71 Retry, Flakiness Detection & Execution Recovery.
 */

import type {
  RetryCategory,
  SideEffectSafetyLevel,
  RetryPolicyConfigDto,
  RetryDecisionDto,
  ExecutionReliabilityReportDto,
  ExecutablePlanStepDto,
  TestRunDto,
  TestCaseExecutionDto,
} from '@ai-quality/contracts';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

export const RETRY_BOUNDS = {
  MIN_ATTEMPTS: 1,
  MAX_ATTEMPTS: 5,
  DEFAULT_MAX_ATTEMPTS: 3,
  MIN_DELAY_MS: 0,
  MAX_DELAY_MS: 30000,
  DEFAULT_DELAY_MS: 1000,
  MIN_BACKOFF_MULTIPLIER: 1.0,
  MAX_BACKOFF_MULTIPLIER: 5.0,
  DEFAULT_BACKOFF_MULTIPLIER: 1.5,
} as const;

export const DEFAULT_EXECUTION_RETRY_POLICY: Readonly<RetryPolicyConfigDto> = {
  enabled: true,
  maxAttempts: RETRY_BOUNDS.DEFAULT_MAX_ATTEMPTS,
  retryDelayMs: RETRY_BOUNDS.DEFAULT_DELAY_MS,
  backoffMultiplier: RETRY_BOUNDS.DEFAULT_BACKOFF_MULTIPLIER,
  retryOnAssertionFailure: false,
  retryableCategories: [
    'TIMEOUT',
    'NETWORK_ERROR',
    'BROWSER_CRASH',
    'CONTEXT_CLOSED',
    'TRANSIENT_DOM_ERROR',
    'AUTOMATION_ERROR',
  ],
  freshContextOnRetry: 'ALWAYS',
  sideEffectSafetyPolicy: 'SAFE_ONLY',
};

export interface RetryEvaluationContext {
  readonly projectId: string;
  readonly testRunId: string;
  readonly currentAttemptNumber: number;
  readonly failureCategory: RetryCategory;
  readonly errorMessage?: string | null;
  readonly failedStepIndex?: number | null;
  readonly planSteps?: readonly ExecutablePlanStepDto[];
  readonly abortSignal?: AbortSignal;
}

export interface IRetryPolicyEngine {
  readonly config: RetryPolicyConfigDto;
  evaluateDecision(context: RetryEvaluationContext): Promise<RetryDecisionDto>;
  classifyFailureCategory(error: unknown, errorCode?: string | null): RetryCategory;
}

export interface PlanSafetyAnalysisResult {
  readonly safetyLevel: SideEffectSafetyLevel;
  readonly isSafe: boolean;
  readonly reason: string;
  readonly mutatingStepIndices: readonly number[];
  readonly failedStepIndex?: number | null;
}

export interface ISideEffectSafetyAnalyzer {
  analyzePlan(
    steps: readonly ExecutablePlanStepDto[],
    failedStepIndex?: number | null,
  ): PlanSafetyAnalysisResult;
}

export interface RecoverySessionOptions {
  readonly projectId: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly attemptNumber: number;
  readonly previousSession?: BrowserExecutionSession | null;
  readonly environmentId?: string | null;
  readonly browserEngine?: 'chromium' | 'firefox' | 'webkit';
  readonly headless?: boolean;
  readonly timeoutMs?: number;
}

export interface RecoverySessionResult {
  readonly success: boolean;
  readonly session: BrowserExecutionSession | null;
  readonly errorMessage?: string;
  readonly durationMs: number;
}

export interface IExecutionRecoveryCoordinator {
  recoverSession(options: RecoverySessionOptions): Promise<RecoverySessionResult>;
  disposeSession(session: BrowserExecutionSession): Promise<void>;
}

export interface ReliabilityEvaluationParams {
  readonly projectId: string;
  readonly testRunId: string;
  readonly testRun: TestRunDto;
  readonly attempts: readonly TestCaseExecutionDto[];
  readonly planSteps?: readonly ExecutablePlanStepDto[];
}

export interface IFlakinessDetector {
  evaluateReliability(params: ReliabilityEvaluationParams): ExecutionReliabilityReportDto;
}
