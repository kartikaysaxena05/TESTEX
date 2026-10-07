/**
 * @file packages/core/src/execution/actions/action-handlers/select-option-action-handler.ts
 * Handler for SELECT (SELECT_OPTION) action on HTML select controls.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';
import { InvalidActionValueError } from '../action-errors.js';

export class SelectOptionActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'SELECT';
  public readonly riskLevel = 'MUTATING' as const;

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

    const rawOption = this.resolveValue(action, context).trim();

    if (!rawOption) {
      throw new InvalidActionValueError(
        'SELECT action requires an option value or label to select.',
      );
    }

    // Try selection by value or label
    let selectedValues: string[] = [];
    try {
      selectedValues = await locator.selectOption({ label: rawOption }, { timeout: timeoutMs });
    } catch {
      // If selecting by label failed, try selecting by value
      selectedValues = await locator.selectOption({ value: rawOption }, { timeout: timeoutMs });
    }

    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    return {
      targetSummary,
      valueSummary: rawOption,
      metadataJson: {
        selectedOption: rawOption,
        resultingValues: selectedValues,
      },
    };
  }
}

export class SelectOptionAliasActionHandler extends SelectOptionActionHandler {
  public override readonly actionType = 'SELECT_OPTION' as const;
}
