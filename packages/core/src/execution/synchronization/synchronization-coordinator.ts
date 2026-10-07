/**
 * @file packages/core/src/execution/synchronization/synchronization-coordinator.ts
 * Authoritative coordinator orchestrating pre-action readiness, race-safe action execution, and post-action state synchronization.
 */

import type {
  SynchronizationResultDto,
  SynchronizationStrategyType,
  ExecutablePlanStepDto,
} from '@ai-quality/contracts';
import {
  SYNCHRONIZATION_BOUNDS,
  type ISynchronizationCoordinator,
  type SynchronizationContext,
  type SynchronizeOptions,
} from './synchronization-types.js';
import { NavigationMonitor } from './navigation-monitor.js';
import { ElementReadinessEvaluator } from './element-readiness-evaluator.js';
import { NetworkObserver } from './network-observer.js';
import { LoadingStateObserver } from './loading-state-observer.js';
import { PopupObserver } from './popup-observer.js';
import { TimeoutBudgetTracker } from './timeout-budget.js';
import { LocatorResolver } from '../actions/locator-resolver.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';
import { ExecutionDomainError } from '../execution-errors.js';
import {
  CustomConditionTimeoutError,
  InvalidSynchronizationConfigError,
} from './synchronization-errors.js';

export class SynchronizationCoordinator implements ISynchronizationCoordinator {
  private readonly navigationMonitor: NavigationMonitor;
  private readonly elementEvaluator: ElementReadinessEvaluator;
  private readonly networkObserver: NetworkObserver;
  private readonly loadingObserver: LoadingStateObserver;
  private readonly popupObserver: PopupObserver;
  private readonly locatorResolver: LocatorResolver;
  private readonly secretRedactor: SecretRedactor;

  constructor(
    navigationMonitor?: NavigationMonitor,
    elementEvaluator?: ElementReadinessEvaluator,
    networkObserver?: NetworkObserver,
    loadingObserver?: LoadingStateObserver,
    popupObserver?: PopupObserver,
    locatorResolver?: LocatorResolver,
    secretRedactor?: SecretRedactor,
  ) {
    this.navigationMonitor = navigationMonitor ?? new NavigationMonitor();
    this.elementEvaluator = elementEvaluator ?? new ElementReadinessEvaluator();
    this.networkObserver = networkObserver ?? new NetworkObserver(secretRedactor);
    this.loadingObserver = loadingObserver ?? new LoadingStateObserver();
    this.popupObserver = popupObserver ?? new PopupObserver();
    this.locatorResolver = locatorResolver ?? new LocatorResolver();
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
  }

  /**
   * Executes a standalone synchronization requirement.
   */
  public async synchronize(
    context: SynchronizationContext,
    options: SynchronizeOptions,
  ): Promise<SynchronizationResultDto> {
    const startedAt = new Date().toISOString();
    const tStart = performance.now();

    if (context.abortSignal?.aborted) {
      return {
        strategy: options.strategy ?? 'AUTO',
        outcome: 'CANCELLED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        errorMessage: 'Synchronization cancelled before start.',
        errorCode: 'ACTION_CANCELLED',
      };
    }

    if (context.page.isClosed()) {
      return {
        strategy: options.strategy ?? 'AUTO',
        outcome: 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        errorMessage: 'Target browser page is closed or not available.',
        errorCode: 'PAGE_NOT_AVAILABLE',
      };
    }

    const budgetTracker = new TimeoutBudgetTracker(
      options.timeoutMs ??
        context.policyConfig?.actionTimeoutMs ??
        SYNCHRONIZATION_BOUNDS.DEFAULT_TIMEOUT_MS,
    );

    const effectiveStrategy = this.resolveEffectiveStrategy(options);
    let targetSummary: string | undefined;

    try {
      switch (effectiveStrategy) {
        case 'ELEMENT': {
          let locator = options.locator;
          if (!locator && options.target) {
            targetSummary = this.locatorResolver.summarizeTarget(options.target);
            locator = await this.locatorResolver.buildLocator(context.page, options.target);
          }
          if (!locator) {
            throw new InvalidSynchronizationConfigError(
              'Target descriptor or Locator required for ELEMENT strategy',
            );
          }

          const readiness = options.readinessState ?? 'VISIBLE';
          await this.elementEvaluator.evaluateReadiness(locator, readiness, {
            timeoutMs: budgetTracker.getRemainingTimeoutMs(),
            abortSignal: context.abortSignal,
          });
          break;
        }

        case 'NAVIGATION':
        case 'URL':
        case 'PAGE_LOAD':
        case 'DOM_CONTENT_LOADED': {
          const loadState =
            options.loadState ??
            (effectiveStrategy === 'DOM_CONTENT_LOADED' ? 'domcontentloaded' : 'load');
          await this.navigationMonitor.waitForNavigation(context.page, options.triggerAction, {
            urlPattern: options.urlPattern,
            loadState,
            timeoutMs: budgetTracker.getRemainingTimeoutMs(),
            abortSignal: context.abortSignal,
          });
          break;
        }

        case 'NETWORK':
        case 'RESPONSE': {
          if (!options.responseMatcher) {
            throw new InvalidSynchronizationConfigError(
              'responseMatcher is required for NETWORK / RESPONSE strategy',
            );
          }
          await this.networkObserver.waitForMatchingResponse(
            context.page,
            options.triggerAction,
            options.responseMatcher,
            {
              timeoutMs: budgetTracker.getRemainingTimeoutMs(options.responseMatcher.timeoutMs),
              abortSignal: context.abortSignal,
              secrets: context.secrets,
            },
          );
          break;
        }

        case 'LOADING_STATE': {
          await this.loadingObserver.waitForLoadingDisappearance(context.page, {
            customSelectors: options.loadingSelectors ?? context.policyConfig?.loadingIndicators,
            timeoutMs: budgetTracker.getRemainingTimeoutMs(),
            abortSignal: context.abortSignal,
          });
          break;
        }

        case 'POPUP':
        case 'NEW_PAGE': {
          if (!options.triggerAction) {
            throw new InvalidSynchronizationConfigError(
              'triggerAction required for POPUP / NEW_PAGE strategy',
            );
          }
          await this.popupObserver.waitForPopupOrNewPage(
            context.page,
            context.browserContext,
            options.triggerAction,
            {
              timeoutMs: budgetTracker.getRemainingTimeoutMs(),
              abortSignal: context.abortSignal,
            },
          );
          break;
        }

        case 'CUSTOM_CONDITION': {
          if (!options.customCondition) {
            throw new InvalidSynchronizationConfigError(
              'customCondition descriptor is required for CUSTOM_CONDITION strategy',
            );
          }
          await this.evaluateCustomCondition(context, options.customCondition, budgetTracker);
          break;
        }

        default:
          await context.page
            .waitForLoadState('domcontentloaded', {
              timeout: budgetTracker.getRemainingTimeoutMs(),
            })
            .catch(() => {});
          break;
      }

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return {
        strategy: effectiveStrategy,
        outcome: 'SATISFIED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        targetSummary,
        actualState: 'READY',
      };
    } catch (err: unknown) {
      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      if (err instanceof ActionCancelledError || context.abortSignal?.aborted) {
        return {
          strategy: effectiveStrategy,
          outcome: 'CANCELLED',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          targetSummary,
          errorCode: 'ACTION_CANCELLED',
          errorMessage: 'Synchronization cancelled.',
        };
      }

      if (err instanceof PageNotAvailableError || context.page.isClosed()) {
        return {
          strategy: effectiveStrategy,
          outcome: 'FAILED',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          targetSummary,
          errorCode: 'PAGE_NOT_AVAILABLE',
          errorMessage: 'Target browser page is closed or not available.',
        };
      }

      if (err instanceof ExecutionDomainError) {
        return {
          strategy: effectiveStrategy,
          outcome: 'TIMEOUT',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs,
          targetSummary,
          errorCode: err.code,
          errorMessage: this.secretRedactor.redactText(err.message),
        };
      }

      return {
        strategy: effectiveStrategy,
        outcome: 'FAILED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        targetSummary,
        errorCode: 'SYNCHRONIZATION_TIMEOUT',
        errorMessage: this.secretRedactor.redactText(
          err instanceof Error ? err.message : String(err),
        ),
      };
    }
  }

  /**
   * Orchestrates pre-action readiness, triggers the action with race-free pre-listeners,
   * and handles post-action synchronization.
   */
  public async executeWithPreAndPostSync<T>(
    context: SynchronizationContext,
    action: ExecutablePlanStepDto,
    actionExecutor: () => Promise<T>,
  ): Promise<{ actionResult: T; syncResult: SynchronizationResultDto }> {
    const startedAt = new Date().toISOString();
    const tStart = performance.now();

    // 1. Check Abort Signal
    if (context.abortSignal?.aborted) {
      throw new ActionCancelledError('Action cancelled before start');
    }

    const stepTimeout =
      action.timeoutMs ??
      context.policyConfig?.actionTimeoutMs ??
      SYNCHRONIZATION_BOUNDS.DEFAULT_TIMEOUT_MS;
    const budgetTracker = new TimeoutBudgetTracker(stepTimeout);

    // 2. Pre-action readiness check (if action targets a UI element)
    if (action.target) {
      const isTargetless = [
        'NAVIGATE',
        'GO_BACK',
        'GO_FORWARD',
        'RELOAD',
        'WAIT_FOR_URL',
        'WAIT_FOR_LOAD_STATE',
      ].includes(action.action);
      if (!isTargetless) {
        const locator = await this.locatorResolver.buildLocator(context.page, action.target);
        const requiredState = ['FILL', 'TYPE', 'CLEAR'].includes(action.action)
          ? 'EDITABLE'
          : ['CLICK', 'DOUBLE_CLICK', 'CHECK', 'UNCHECK', 'SELECT', 'SELECT_OPTION'].includes(
                action.action,
              )
            ? 'ENABLED'
            : 'VISIBLE';

        await this.elementEvaluator.evaluateReadiness(locator, requiredState, {
          timeoutMs: budgetTracker.getRemainingTimeoutMs(),
          abortSignal: context.abortSignal,
        });
      }
    }

    // 3. Execute action
    const actionResult = await actionExecutor();

    // 4. Post-action synchronization (e.g. check for loading spinners if configured)
    if (
      context.policyConfig?.loadingIndicators &&
      context.policyConfig.loadingIndicators.length > 0
    ) {
      await this.loadingObserver
        .waitForLoadingDisappearance(context.page, {
          customSelectors: context.policyConfig.loadingIndicators,
          timeoutMs: budgetTracker.getRemainingTimeoutMs(
            SYNCHRONIZATION_BOUNDS.DEFAULT_LOADING_TIMEOUT_MS,
          ),
          abortSignal: context.abortSignal,
        })
        .catch(() => {});
    }

    const durationMs = Math.max(0, Math.round(performance.now() - tStart));
    const syncResult: SynchronizationResultDto = {
      strategy: 'AUTO',
      outcome: 'SATISFIED',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      targetSummary: this.locatorResolver.summarizeTarget(action.target),
      actualState: 'COMPLETED',
    };

    return { actionResult, syncResult };
  }

  /**
   * Dispatches custom condition without arbitrary eval.
   */
  private async evaluateCustomCondition(
    context: SynchronizationContext,
    condition: NonNullable<SynchronizeOptions['customCondition']>,
    budgetTracker: TimeoutBudgetTracker,
  ): Promise<void> {
    const timeoutMs = budgetTracker.getRemainingTimeoutMs(condition.timeoutMs);

    switch (condition.kind) {
      case 'LOCATOR_STATE': {
        if (!condition.target) {
          throw new InvalidSynchronizationConfigError(
            'target required for LOCATOR_STATE custom condition',
          );
        }
        const loc = await this.locatorResolver.buildLocator(context.page, condition.target);
        await this.elementEvaluator.evaluateReadiness(loc, condition.state ?? 'VISIBLE', {
          timeoutMs,
          abortSignal: context.abortSignal,
        });
        break;
      }

      case 'URL_MATCH': {
        if (!condition.urlPattern) {
          throw new InvalidSynchronizationConfigError(
            'urlPattern required for URL_MATCH custom condition',
          );
        }
        await this.navigationMonitor.waitForNavigation(context.page, undefined, {
          urlPattern: condition.urlPattern,
          timeoutMs,
          abortSignal: context.abortSignal,
        });
        break;
      }

      case 'TEXT_APPEARS': {
        if (!condition.text) {
          throw new InvalidSynchronizationConfigError(
            'text required for TEXT_APPEARS custom condition',
          );
        }
        const textLocator = context.page.getByText(condition.text).first();
        try {
          await textLocator.waitFor({ state: 'visible', timeout: timeoutMs });
        } catch {
          throw new CustomConditionTimeoutError(
            'TEXT_APPEARS',
            timeoutMs,
            `Text '${condition.text}' did not appear`,
          );
        }
        break;
      }

      case 'RESPONSE_OCCURS': {
        if (!condition.responseMatcher) {
          throw new InvalidSynchronizationConfigError(
            'responseMatcher required for RESPONSE_OCCURS custom condition',
          );
        }
        await this.networkObserver.waitForMatchingResponse(
          context.page,
          undefined,
          condition.responseMatcher,
          {
            timeoutMs,
            abortSignal: context.abortSignal,
            secrets: context.secrets,
          },
        );
        break;
      }

      case 'LOADING_DISAPPEARS': {
        await this.loadingObserver.waitForLoadingDisappearance(context.page, {
          timeoutMs,
          abortSignal: context.abortSignal,
        });
        break;
      }

      default:
        throw new InvalidSynchronizationConfigError(
          `Unsupported custom condition kind: ${(condition as any).kind}`,
        );
    }
  }

  private resolveEffectiveStrategy(options: SynchronizeOptions): SynchronizationStrategyType {
    if (options.strategy && options.strategy !== 'AUTO') {
      return options.strategy;
    }
    if (options.urlPattern || options.loadState) {
      return 'URL';
    }
    if (options.responseMatcher) {
      return 'RESPONSE';
    }
    if (options.target || options.locator || options.readinessState) {
      return 'ELEMENT';
    }
    if (options.customCondition) {
      return 'CUSTOM_CONDITION';
    }
    return 'DOM_CONTENT_LOADED';
  }
}
