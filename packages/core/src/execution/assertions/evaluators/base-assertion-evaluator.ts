/**
 * @file packages/core/src/execution/assertions/evaluators/base-assertion-evaluator.ts
 * Abstract base class providing common evaluation services, variable resolution, and error handling.
 */

import type { Locator } from 'playwright';
import type {
  AssertionType,
  AssertionOperator,
  AssertionOptionsDto,
  AssertionResultDto,
  ExecutableAssertionDto,
  ExecutableTargetDescriptorDto,
} from '@ai-quality/contracts';
import {
  type IAssertionEvaluator,
  type AssertionExecutionContext,
  ASSERTION_BOUNDS,
  ALLOWED_OPERATORS_BY_TYPE,
  getDefaultOperatorForType,
} from '../assertion-types.js';
import {
  AssertionEvaluationError,
  AssertionTargetResolutionError,
  InvalidAssertionOperatorError,
  UnresolvedVariableError,
  AssertionTimeoutError,
} from '../assertion-errors.js';
import { LocatorResolver } from '../../actions/locator-resolver.js';
import { SecretRedactor } from '../../sessions/secret-redactor.js';
import { ActionCancelledError, PageNotAvailableError } from '../../actions/action-errors.js';
import { ExecutionDomainError } from '../../execution-errors.js';

export abstract class BaseAssertionEvaluator implements IAssertionEvaluator {
  public abstract readonly supportedTypes: readonly AssertionType[];
  protected readonly locatorResolver: LocatorResolver;
  protected readonly secretRedactor: SecretRedactor;

  constructor(locatorResolver?: LocatorResolver, secretRedactor?: SecretRedactor) {
    this.locatorResolver = locatorResolver ?? new LocatorResolver();
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
  }

  public async evaluate(
    assertion: ExecutableAssertionDto,
    context: AssertionExecutionContext,
    options?: AssertionOptionsDto,
  ): Promise<AssertionResultDto> {
    const startedAt = new Date().toISOString();
    const tStart = performance.now();
    const isHard = options?.isHard ?? true;

    // 1. Validate AbortSignal Before Starting
    if (context.abortSignal?.aborted) {
      return {
        assertionId: assertion.id,
        stepId: context.stepId,
        testRunId: context.testRunId,
        projectId: context.projectId,
        assertionType: assertion.type,
        operator: getDefaultOperatorForType(assertion.type),
        status: 'CANCELLED',
        isHard,
        durationMs: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        errorMessage: 'Assertion cancelled by user request.',
        errorCode: 'ACTION_CANCELLED',
      };
    }

    // 2. Validate Page Availability
    if (!context.page || (typeof context.page.isClosed === 'function' && context.page.isClosed())) {
      return {
        assertionId: assertion.id,
        stepId: context.stepId,
        testRunId: context.testRunId,
        projectId: context.projectId,
        assertionType: assertion.type,
        operator: getDefaultOperatorForType(assertion.type),
        status: 'ERROR',
        isHard,
        durationMs: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        errorMessage: 'Target browser page is closed or not available.',
        errorCode: 'PAGE_NOT_AVAILABLE',
      };
    }

    // 3. Determine Effective Operator & Validate
    const operator = options?.operator ?? this.determineOperator(assertion);
    try {
      this.validateOperator(assertion.type, operator);
    } catch (err: unknown) {
      if (err instanceof InvalidAssertionOperatorError) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'ERROR',
          isHard,
          durationMs: 0,
          startedAt,
          completedAt: new Date().toISOString(),
          errorMessage: err.message,
          errorCode: err.code,
        };
      }
      throw err;
    }

    // 4. Resolve Expected Value and Target
    let resolvedExpected: unknown;
    try {
      resolvedExpected = this.resolveExpectedValue(assertion, context);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        assertionId: assertion.id,
        stepId: context.stepId,
        testRunId: context.testRunId,
        projectId: context.projectId,
        assertionType: assertion.type,
        operator,
        status: 'ERROR',
        isHard,
        durationMs: Math.max(0, Math.round(performance.now() - tStart)),
        startedAt,
        completedAt: new Date().toISOString(),
        errorMessage: errorMsg,
        errorCode: err instanceof ExecutionDomainError ? err.code : 'UNRESOLVED_VARIABLE',
      };
    }

    const timeoutMs = this.resolveTimeout(options?.timeoutMs);

    try {
      const result = await this.evaluateInternal(
        assertion,
        operator,
        resolvedExpected,
        context,
        timeoutMs,
        options,
      );

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return {
        assertionId: assertion.id,
        stepId: context.stepId,
        testRunId: context.testRunId,
        projectId: context.projectId,
        assertionType: assertion.type,
        operator,
        status: result.status,
        expected: this.secretRedactor.redactObject(result.expected ?? resolvedExpected),
        actual: this.secretRedactor.redactObject(result.actual),
        targetSummary: result.targetSummary ?? this.summarizeTarget(assertion.target),
        message: result.message,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage
          ? this.secretRedactor.redactText(result.errorMessage)
          : undefined,
        isHard,
        durationMs,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      const completedAt = new Date().toISOString();
      const targetSummary = this.summarizeTarget(assertion.target);

      if (err instanceof ActionCancelledError || context.abortSignal?.aborted) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'CANCELLED',
          targetSummary,
          isHard,
          durationMs,
          startedAt,
          completedAt,
          errorMessage: 'Assertion evaluation was cancelled.',
          errorCode: 'ACTION_CANCELLED',
        };
      }

      if (err instanceof PageNotAvailableError) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'ERROR',
          targetSummary,
          isHard,
          durationMs,
          startedAt,
          completedAt,
          errorMessage: 'Target browser page is closed.',
          errorCode: 'PAGE_NOT_AVAILABLE',
        };
      }

      if (err instanceof AssertionEvaluationError) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'FAILED',
          expected: this.secretRedactor.redactObject(err.expected ?? resolvedExpected),
          actual: this.secretRedactor.redactObject(err.actual),
          targetSummary,
          errorMessage: this.secretRedactor.redactText(err.message),
          errorCode: err.code,
          isHard,
          durationMs,
          startedAt,
          completedAt,
        };
      }

      if (err instanceof AssertionTimeoutError) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'FAILED',
          expected: this.secretRedactor.redactObject(resolvedExpected),
          targetSummary,
          errorMessage: this.secretRedactor.redactText(err.message),
          errorCode: 'ASSERTION_TIMEOUT',
          isHard,
          durationMs,
          startedAt,
          completedAt,
        };
      }

      if (err instanceof AssertionTargetResolutionError) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'ERROR',
          targetSummary,
          errorMessage: this.secretRedactor.redactText(err.message),
          errorCode: err.code,
          isHard,
          durationMs,
          startedAt,
          completedAt,
        };
      }

      // Check Playwright locator/timeout errors
      const errString = err instanceof Error ? err.message : String(err);
      if (errString.includes('Timeout') && errString.includes('exceeded')) {
        return {
          assertionId: assertion.id,
          stepId: context.stepId,
          testRunId: context.testRunId,
          projectId: context.projectId,
          assertionType: assertion.type,
          operator,
          status: 'FAILED',
          expected: this.secretRedactor.redactObject(resolvedExpected),
          targetSummary,
          errorMessage: `Assertion timed out after ${timeoutMs}ms: condition was not met in browser.`,
          errorCode: 'ASSERTION_TIMEOUT',
          isHard,
          durationMs,
          startedAt,
          completedAt,
        };
      }

      return {
        assertionId: assertion.id,
        stepId: context.stepId,
        testRunId: context.testRunId,
        projectId: context.projectId,
        assertionType: assertion.type,
        operator,
        status: 'ERROR',
        targetSummary,
        errorMessage: this.secretRedactor.redactText(errString),
        errorCode: err instanceof ExecutionDomainError ? err.code : 'ASSERTION_ERROR',
        isHard,
        durationMs,
        startedAt,
        completedAt,
      };
    }
  }

  protected abstract evaluateInternal(
    assertion: ExecutableAssertionDto,
    operator: AssertionOperator,
    resolvedExpected: unknown,
    context: AssertionExecutionContext,
    timeoutMs: number,
    options?: AssertionOptionsDto,
  ): Promise<{
    status: 'PASSED' | 'FAILED' | 'ERROR' | 'UNSUPPORTED';
    expected?: unknown;
    actual?: unknown;
    targetSummary?: string;
    message?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;

  protected resolveTargetLocator(
    target: ExecutableTargetDescriptorDto | undefined,
    context: AssertionExecutionContext,
    options?: { strict?: boolean },
  ): Promise<Locator> {
    if (!target) {
      throw new AssertionTargetResolutionError(
        'Assertion target descriptor is required but was missing.',
      );
    }
    try {
      return this.locatorResolver.resolve(context.page, target, {
        strict: options?.strict ?? true,
      });
    } catch (err: unknown) {
      if (err instanceof ExecutionDomainError) {
        throw new AssertionTargetResolutionError(err.message, err.code);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new AssertionTargetResolutionError(msg);
    }
  }

  protected resolveExpectedValue(
    assertion: ExecutableAssertionDto,
    context: AssertionExecutionContext,
  ): unknown {
    const ref = assertion.expectedValue;
    if (!ref) {
      return undefined;
    }

    if (ref.kind === 'VARIABLE' && ref.variableName) {
      const varName = ref.variableName;
      const allVars = {
        ...(context.variables ?? {}),
      };

      if (!(varName in allVars)) {
        throw new UnresolvedVariableError(varName);
      }
      return allVars[varName];
    }

    let value = ref.value;
    if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
      const allVars = {
        ...(context.variables ?? {}),
      };

      value = value.replace(/\{\{([^{}]+)\}\}/g, (_, key) => {
        const trimmedKey = key.trim();
        if (!(trimmedKey in allVars)) {
          throw new UnresolvedVariableError(trimmedKey);
        }
        return String(allVars[trimmedKey]);
      });
    }

    return value;
  }

  protected determineOperator(assertion: ExecutableAssertionDto): AssertionOperator {
    if (assertion.isNegated) {
      switch (assertion.type) {
        case 'VISIBLE':
        case 'ELEMENT_VISIBLE':
          return 'HIDDEN';
        case 'HIDDEN':
        case 'ELEMENT_HIDDEN':
          return 'VISIBLE';
        case 'ELEMENT_EXISTS':
          return 'NOT_EXISTS';
        case 'ELEMENT_NOT_EXISTS':
          return 'EXISTS';
        case 'ENABLED':
        case 'ELEMENT_ENABLED':
          return 'DISABLED';
        case 'DISABLED':
        case 'ELEMENT_DISABLED':
          return 'ENABLED';
        case 'CHECKED':
        case 'ELEMENT_CHECKED':
          return 'UNCHECKED';
        case 'UNCHECKED':
        case 'ELEMENT_UNCHECKED':
          return 'CHECKED';
        case 'TEXT_CONTAINS':
        case 'VALUE_CONTAINS':
        case 'URL_CONTAINS':
        case 'PAGE_TITLE_CONTAINS':
        case 'ATTRIBUTE_CONTAINS':
          return 'NOT_CONTAINS';
        default:
          return 'NOT_EQUALS';
      }
    }

    return getDefaultOperatorForType(assertion.type);
  }

  protected validateOperator(type: AssertionType, operator: AssertionOperator): void {
    const allowed = ALLOWED_OPERATORS_BY_TYPE[type];
    if (!allowed || !allowed.includes(operator)) {
      throw new InvalidAssertionOperatorError(type, operator);
    }
  }

  protected resolveTimeout(overrideMs?: number): number {
    if (typeof overrideMs === 'number' && overrideMs >= ASSERTION_BOUNDS.MIN_TIMEOUT_MS) {
      return Math.min(overrideMs, ASSERTION_BOUNDS.MAX_TIMEOUT_MS);
    }
    return ASSERTION_BOUNDS.DEFAULT_TIMEOUT_MS;
  }

  protected summarizeTarget(target?: ExecutableTargetDescriptorDto): string {
    return this.locatorResolver.summarizeTarget(target);
  }
}
