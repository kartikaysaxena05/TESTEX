/**
 * @file packages/core/src/execution/synchronization/synchronization-types.ts
 * Core types, interfaces, bounds, and constants for Phase 66 Synchronization Engine.
 */

import type { Page, Locator, Response, BrowserContext } from 'playwright';
import type {
  SynchronizationStrategyType,
  ElementReadinessState,
  PageLoadState,
  NetworkRequestMatcherDto,
  CustomConditionDescriptorDto,
  SynchronizationPolicyConfigDto,
  SynchronizationResultDto,
  ExecutableTargetDescriptorDto,
  ExecutablePlanStepDto,
} from '@ai-quality/contracts';

export const SYNCHRONIZATION_BOUNDS = {
  MIN_TIMEOUT_MS: 100,
  MAX_TIMEOUT_MS: 120_000,
  DEFAULT_TIMEOUT_MS: 15_000,
  DEFAULT_NAV_TIMEOUT_MS: 30_000,
  DEFAULT_POPUP_TIMEOUT_MS: 15_000,
  DEFAULT_RESPONSE_TIMEOUT_MS: 20_000,
  DEFAULT_LOADING_TIMEOUT_MS: 15_000,
  DEFAULT_STABILITY_POLL_INTERVAL_MS: 50,
  DEFAULT_LOADING_SELECTORS: [
    '[aria-busy="true"]',
    '.spinner',
    '.loading',
    '.skeleton',
    '.loading-overlay',
    '[data-loading="true"]',
    '[data-testid="loading-spinner"]',
  ],
} as const;

export interface SynchronizationContext {
  projectId: string;
  testRunId: string;
  page: Page;
  browserContext?: BrowserContext;
  step?: ExecutablePlanStepDto;
  policyConfig?: SynchronizationPolicyConfigDto;
  abortSignal?: AbortSignal;
  secrets?: Record<string, string>;
}

export interface SynchronizeOptions {
  strategy?: SynchronizationStrategyType;
  target?: ExecutableTargetDescriptorDto;
  locator?: Locator;
  readinessState?: ElementReadinessState;
  urlPattern?: string;
  loadState?: PageLoadState;
  responseMatcher?: NetworkRequestMatcherDto;
  customCondition?: CustomConditionDescriptorDto;
  timeoutMs?: number;
  loadingSelectors?: string[];
  triggerAction?: () => Promise<unknown>;
}

export interface ITimeoutBudgetTracker {
  getRemainingTimeoutMs(allocatedTimeoutMs?: number): number;
  getElapsedMs(): number;
  isExpired(): boolean;
  assertNotExpired(contextMessage?: string): void;
}

export interface INavigationMonitor {
  waitForNavigation(
    page: Page,
    triggerAction: (() => Promise<unknown>) | undefined,
    options: {
      urlPattern?: string;
      loadState?: PageLoadState;
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ finalUrl: string; durationMs: number }>;
}

export interface IElementReadinessEvaluator {
  evaluateReadiness(
    locator: Locator,
    expectedState: ElementReadinessState,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ state: ElementReadinessState; durationMs: number }>;
}

export interface INetworkObserver {
  waitForMatchingResponse(
    page: Page,
    triggerAction: (() => Promise<unknown>) | undefined,
    matcher: NetworkRequestMatcherDto,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
      secrets?: Record<string, string>;
    },
  ): Promise<{ response: Response; durationMs: number; url: string; status: number }>;
}

export interface ILoadingStateObserver {
  waitForLoadingDisappearance(
    page: Page,
    options: {
      customSelectors?: string[];
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ loadingObserved: boolean; durationMs: number }>;
}

export interface IPopupObserver {
  waitForPopupOrNewPage(
    page: Page,
    browserContext: BrowserContext | undefined,
    triggerAction: () => Promise<unknown>,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ newPage: Page; durationMs: number }>;
}

export interface ISynchronizationCoordinator {
  synchronize(
    context: SynchronizationContext,
    options: SynchronizeOptions,
  ): Promise<SynchronizationResultDto>;

  executeWithPreAndPostSync<T>(
    context: SynchronizationContext,
    action: ExecutablePlanStepDto,
    actionExecutor: () => Promise<T>,
  ): Promise<{ actionResult: T; syncResult: SynchronizationResultDto }>;
}
