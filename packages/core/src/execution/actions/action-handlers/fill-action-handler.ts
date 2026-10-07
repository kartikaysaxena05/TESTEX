/**
 * @file packages/core/src/execution/actions/action-handlers/fill-action-handler.ts
 * Handlers for FILL, TYPE, and CLEAR actions with secret redaction and deterministic field manipulation.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import { ACTION_BOUNDS, type ActionExecutionContext } from '../action-types.js';

export class FillActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'FILL';
  public readonly riskLevel = 'MUTATING' as const;

  constructor(private readonly mode: 'FILL' | 'TYPE' | 'CLEAR' = 'FILL') {
    super();
  }

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    const isClear = this.mode === 'CLEAR' || action.action === 'CLEAR';
    const isType = this.mode === 'TYPE' || action.action === 'TYPE';

    if (isClear) {
      await locator.clear({ timeout: timeoutMs });
      return {
        targetSummary: this.locatorResolver.summarizeTarget(action.target),
        valueSummary: '[CLEARED]',
        metadataJson: { mode: 'CLEAR' },
      };
    }

    const rawValue = this.resolveValue(action, context);
    const isSecret =
      action.value?.kind === 'SECRET_REFERENCE' ||
      (action.target?.name?.toLowerCase().includes('password') ?? false) ||
      (action.target?.placeholder?.toLowerCase().includes('password') ?? false);

    if (isType) {
      // Sequential keyboard typing
      if (typeof (locator as any).pressSequentially === 'function') {
        await (locator as any).pressSequentially(rawValue, {
          delay: ACTION_BOUNDS.DEFAULT_TYPE_DELAY_MS,
          timeout: timeoutMs,
        });
      } else {
        await (locator as any).type(rawValue, {
          delay: ACTION_BOUNDS.DEFAULT_TYPE_DELAY_MS,
          timeout: timeoutMs,
        });
      }
    } else {
      // Deterministic fill
      await locator.fill(rawValue, {
        timeout: timeoutMs,
      });
    }

    const valueSummary = isSecret ? '[REDACTED]' : this.secretRedactor.redactString(rawValue);

    return {
      targetSummary: this.locatorResolver.summarizeTarget(action.target),
      valueSummary,
      metadataJson: {
        mode: isType ? 'TYPE' : 'FILL',
        isSecret,
        valueLength: rawValue.length,
      },
    };
  }
}

export class TypeActionHandler extends FillActionHandler {
  public override readonly actionType: ExecutableActionType = 'TYPE';

  constructor() {
    super('TYPE');
  }
}

export class ClearActionHandler extends FillActionHandler {
  public override readonly actionType: ExecutableActionType = 'CLEAR';

  constructor() {
    super('CLEAR');
  }
}
