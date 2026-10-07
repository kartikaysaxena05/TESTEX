/**
 * @file packages/core/src/execution/actions/action-handlers/base-action-handler.ts
 * Base class for all Phase 63 Action Handlers providing safety checks, timing, error mapping, and secret redaction.
 */

import crypto from 'node:crypto';
import type {
  ExecutableActionType,
  ExecutablePlanStepDto,
  ActionRiskLevel,
  ActionResultDto,
} from '@ai-quality/contracts';
import {
  type IActionHandler,
  type ActionExecutionContext,
  ACTION_BOUNDS,
} from '../action-types.js';
import {
  PageNotAvailableError,
  ContextClosedError,
  ActionTimeoutError,
  TargetNotFoundError,
  TargetNotVisibleError,
  TargetDisabledError,
  ActionCancelledError,
  PlaywrightActionError,
  TargetAmbiguousError,
  NavigationRejectedError,
  DestructiveActionProhibitedError,
  InvalidActionError,
  InvalidActionValueError,
} from '../action-errors.js';
import { SecretRedactor } from '../../sessions/secret-redactor.js';
import { LocatorResolver } from '../locator-resolver.js';

export abstract class BaseActionHandler implements IActionHandler {
  public abstract readonly actionType: ExecutableActionType;
  public abstract readonly riskLevel: ActionRiskLevel;

  protected readonly locatorResolver: LocatorResolver;
  protected readonly secretRedactor: SecretRedactor;

  constructor(locatorResolver?: LocatorResolver, secretRedactor?: SecretRedactor) {
    this.locatorResolver = locatorResolver ?? new LocatorResolver();
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
  }

  /**
   * Primary entry point for action execution.
   */
  public async execute(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
  ): Promise<ActionResultDto> {
    const actionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const tStart = performance.now();

    // 1. Check Abort Signal before doing anything
    if (context.abortSignal?.aborted) {
      return {
        actionId,
        stepId: action.id,
        testRunId: context.testRunId,
        projectId: context.projectId,
        actionType: this.actionType,
        status: 'CANCELLED',
        riskLevel: this.riskLevel,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        targetSummary: this.locatorResolver.summarizeTarget(action.target),
        forceUsed: false,
        errorMessage: 'Action cancelled before start.',
        errorCode: 'ACTION_CANCELLED',
      };
    }

    const timeoutMs = this.resolveTimeout(action);

    try {
      // 2. Validate browser page and context availability
      this.validateBrowserState(context);

      // 3. Register secrets with SecretRedactor
      if (context.secrets) {
        this.secretRedactor.registerSecrets(context.secrets);
      }
      const secretRef = action.value?.secretRef;
      if (secretRef && context.secrets?.[secretRef]) {
        this.secretRedactor.registerSecret(context.secrets[secretRef]);
      }

      // 4. Execute subclass-specific action logic
      const specificResult = await this.executeAction(action, context, timeoutMs);

      const tEnd = performance.now();
      const durationMs = Math.max(0, Math.round(tEnd - tStart));

      return {
        actionId,
        stepId: action.id,
        testRunId: context.testRunId,
        projectId: context.projectId,
        actionType: this.actionType,
        status: 'PASSED',
        riskLevel: this.riskLevel,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        targetSummary:
          specificResult.targetSummary ?? this.locatorResolver.summarizeTarget(action.target),
        valueSummary: specificResult.valueSummary,
        forceUsed: specificResult.forceUsed ?? false,
        metadataJson: specificResult.metadataJson ?? {},
      };
    } catch (err: unknown) {
      const tEnd = performance.now();
      const durationMs = Math.max(0, Math.round(tEnd - tStart));
      const mappedError = this.mapPlaywrightError(err, action, timeoutMs);

      const isCancelled =
        mappedError instanceof ActionCancelledError || context.abortSignal?.aborted;
      const status = isCancelled ? 'CANCELLED' : 'FAILED';
      const safeMessage = this.secretRedactor.redactString(mappedError.message);

      return {
        actionId,
        stepId: action.id,
        testRunId: context.testRunId,
        projectId: context.projectId,
        actionType: this.actionType,
        status,
        riskLevel: this.riskLevel,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        targetSummary: this.locatorResolver.summarizeTarget(action.target),
        forceUsed: false,
        errorCode: (mappedError as any).code ?? 'PLAYWRIGHT_ERROR',
        errorMessage: safeMessage,
      };
    }
  }

  /**
   * Subclass-specific action implementation.
   */
  protected abstract executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    forceUsed?: boolean;
    metadataJson?: Record<string, unknown>;
  }>;

  /**
   * Validates that the Page and Context are alive.
   */
  protected validateBrowserState(context: ActionExecutionContext): void {
    if (!context.page || context.page.isClosed()) {
      throw new PageNotAvailableError();
    }
    if (!context.context) {
      throw new ContextClosedError();
    }
  }

  /**
   * Resolves bounded timeout for the action in milliseconds.
   */
  protected resolveTimeout(action: ExecutablePlanStepDto): number {
    const rawTimeout = action.timeoutMs ?? ACTION_BOUNDS.DEFAULT_ACTION_TIMEOUT_MS;
    return Math.max(
      ACTION_BOUNDS.MIN_ACTION_TIMEOUT_MS,
      Math.min(ACTION_BOUNDS.MAX_ACTION_TIMEOUT_MS, rawTimeout),
    );
  }

  /**
   * Resolves raw or variable value reference into actual string value.
   */
  protected resolveValue(action: ExecutablePlanStepDto, context: ActionExecutionContext): string {
    const ref = action.value;
    if (!ref) {
      return '';
    }

    if (ref.kind === 'SECRET_REFERENCE') {
      const secretKey = ref.secretRef || ref.value || '';
      const secretVal = context.secrets?.[secretKey] || secretKey;
      this.secretRedactor.registerSecret(secretVal);
      return secretVal;
    }

    if (ref.kind === 'VARIABLE') {
      const varName = ref.variableName || ref.value || '';
      return context.environment?.variables?.[varName] || varName;
    }

    return ref.value || '';
  }

  /**
   * Maps raw Playwright / Node errors into strongly typed execution domain errors.
   */
  protected mapPlaywrightError(
    err: unknown,
    action: ExecutablePlanStepDto,
    timeoutMs: number,
  ): Error {
    if (
      err instanceof TargetAmbiguousError ||
      err instanceof NavigationRejectedError ||
      err instanceof DestructiveActionProhibitedError ||
      err instanceof InvalidActionError ||
      err instanceof InvalidActionValueError ||
      err instanceof PageNotAvailableError ||
      err instanceof ContextClosedError ||
      err instanceof ActionCancelledError
    ) {
      return err;
    }

    const msg = (err instanceof Error ? err.message : String(err)) || '';
    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    if (msg.includes('Timeout') || msg.includes('timed out') || msg.includes('exceeded')) {
      return new ActionTimeoutError(this.actionType, timeoutMs, msg);
    }

    if (
      msg.includes('Target closed') ||
      msg.includes('Page closed') ||
      msg.includes('has been closed')
    ) {
      return new PageNotAvailableError();
    }

    if (msg.includes('disabled') || msg.includes('cannot receive click because it is disabled')) {
      return new TargetDisabledError(targetSummary);
    }

    if (msg.includes('hidden') || msg.includes('not visible')) {
      return new TargetNotVisibleError(targetSummary);
    }

    if (msg.includes('waiting for') && msg.includes('to be visible')) {
      return new TargetNotFoundError(targetSummary, timeoutMs);
    }

    return new PlaywrightActionError(msg);
  }
}
