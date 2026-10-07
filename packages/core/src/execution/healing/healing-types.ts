/**
 * @file packages/core/src/execution/healing/healing-types.ts
 * Types, bounds, and interfaces for Bounded and Auditable Locator Self-Healing (V5 Phase 72).
 */

import type { Page, Locator } from 'playwright';
import type {
  ExecutableTargetDescriptorDto,
  LocatorHealingAttemptDto,
  LocatorHealingCandidateDto,
  LocatorHealingSuggestionDto,
  HealingResultStatus,
  HealingReviewStatus,
} from '@ai-quality/contracts';
import type { BrowserExecutionSession } from '../sessions/session-types.js';

export const HEALING_BOUNDS = {
  MAX_HEALING_CANDIDATES: 25,
  MAX_DOM_NODES_EXAMINED: 200,
  MAX_HEALING_ATTEMPTS_PER_STEP: 1,
  DEFAULT_HEALING_TIMEOUT_MS: 3000,
  MIN_HEALING_TIMEOUT_MS: 500,
  MAX_HEALING_TIMEOUT_MS: 15000,
  DEFAULT_CONFIDENCE_THRESHOLD: 75,
  DESTRUCTIVE_CONFIDENCE_THRESHOLD: 90,
  AMBIGUITY_MARGIN: 15,
  SCORING_MODEL_VERSION: '1.0.0',
  HEALING_POLICY_VERSION: '1.0.0',
} as const;

/**
 * Extracted semantic characteristics of an element on the live page.
 */
export interface ElementSemanticSignature {
  readonly elementIndex: number;
  readonly tagName: string;
  readonly role?: string | null;
  readonly accessibleName?: string | null;
  readonly label?: string | null;
  readonly placeholder?: string | null;
  readonly testId?: string | null;
  readonly inputType?: string | null;
  readonly href?: string | null;
  readonly formAction?: string | null;
  readonly stableAttributes: Record<string, string>;
  readonly contextText?: string | null;
  readonly isVisible: boolean;
  readonly isEnabled: boolean;
  readonly selectorRecipe: string;
  readonly locator: Locator;
}

/**
 * Detailed candidate score evaluation with component breakdown.
 */
export interface HealingCandidateEvaluation {
  readonly candidate: LocatorHealingCandidateDto;
  readonly locator: Locator;
  readonly isDisqualified: boolean;
  readonly disqualificationReason?: string | null;
}

/**
 * Context passed to the Locator Healing Engine when resolving a failed target.
 */
export interface HealingExecutionContext {
  readonly projectId: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly stepExecutionId?: string | null;
  readonly stepIndex: number;
  readonly attempt: number;
  readonly actionType: string;
  readonly originalTarget: ExecutableTargetDescriptorDto;
  readonly originalSelector: string;
  readonly failureReason: string;
  readonly session: BrowserExecutionSession;
  readonly page: Page;
  readonly abortSignal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly isDestructiveAction?: boolean;
}

/**
 * Outcome of the self-healing recovery attempt.
 */
export interface HealingExecutionResult {
  readonly healingResult: HealingResultStatus;
  readonly selectedLocator?: Locator | null;
  readonly selectedCandidate?: LocatorHealingCandidateDto | null;
  readonly selectedScore?: number | null;
  readonly candidateCount: number;
  readonly candidatesEvaluated: readonly LocatorHealingCandidateDto[];
  readonly confidenceThreshold: number;
  readonly auditRecord?: LocatorHealingAttemptDto | null;
  readonly suggestionCreated?: LocatorHealingSuggestionDto | null;
  readonly durationMs: number;
  readonly reason: string;
}

export interface IElementSignatureExtractor {
  extractSignature(locator: Locator, index: number): Promise<ElementSemanticSignature | null>;
}

export interface IHealingCandidateDiscovery {
  discoverCandidates(
    page: Page,
    target: ExecutableTargetDescriptorDto,
    maxCandidates?: number,
  ): Promise<readonly ElementSemanticSignature[]>;
}

export interface IHealingCandidateScorer {
  scoreCandidate(
    originalTarget: ExecutableTargetDescriptorDto,
    candidate: ElementSemanticSignature,
    isDestructiveAction?: boolean,
  ): HealingCandidateEvaluation;

  rankCandidates(
    originalTarget: ExecutableTargetDescriptorDto,
    candidates: readonly ElementSemanticSignature[],
    isDestructiveAction?: boolean,
  ): readonly HealingCandidateEvaluation[];
}

export interface ILocatorHealingEngine {
  healLocator(context: HealingExecutionContext): Promise<HealingExecutionResult>;
}

export interface IHealingSuggestionService {
  recordSuggestion(params: {
    projectId: string;
    testCaseId: string;
    testCaseVersionNumber: number;
    stepIndex: number;
    originalTarget: ExecutableTargetDescriptorDto;
    suggestedTarget: ExecutableTargetDescriptorDto;
    suggestedSelector: string;
    reason: string;
    score: number;
    discoveredInRunId: string;
  }): Promise<LocatorHealingSuggestionDto>;

  listSuggestions(params: {
    projectId: string;
    testCaseId?: string;
    reviewStatus?: HealingReviewStatus;
  }): Promise<readonly LocatorHealingSuggestionDto[]>;

  reviewSuggestion(params: {
    projectId: string;
    suggestionId: string;
    reviewStatus: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: string;
    reviewerId?: string;
  }): Promise<LocatorHealingSuggestionDto>;
}
