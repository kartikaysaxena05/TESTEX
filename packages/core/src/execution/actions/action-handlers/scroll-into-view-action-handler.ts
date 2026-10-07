/**
 * @file packages/core/src/execution/actions/action-handlers/scroll-into-view-action-handler.ts
 * Handler for explicit SCROLL_INTO_VIEW action.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';
import { InvalidActionError } from '../action-errors.js';

export class ScrollIntoViewActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'SCROLL_INTO_VIEW';
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    if (!action.target) {
      throw new InvalidActionError('SCROLL_INTO_VIEW action requires a target descriptor.');
    }

    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    return {
      targetSummary,
      valueSummary: 'SCROLL_INTO_VIEW',
      metadataJson: {
        strategy: 'SCROLL_INTO_VIEW',
      },
    };
  }
}
