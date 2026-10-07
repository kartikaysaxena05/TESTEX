/**
 * @file packages/core/src/execution/actions/action-handlers/scroll-action-handler.ts
 * Handler for bounded semantic SCROLL actions.
 */

import type { ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import { ACTION_BOUNDS, type ActionExecutionContext } from '../action-types.js';

export class ScrollActionHandler extends BaseActionHandler {
  public readonly actionType = 'SCROLL' as const;
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
    if (
      action.target &&
      (action.target.name ||
        action.target.testId ||
        action.target.role ||
        action.target.label ||
        action.target.locatorHints?.length)
    ) {
      const locator = await this.locatorResolver.resolve(context.page, action.target, {
        strict: true,
      });
      await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });

      return {
        targetSummary: this.locatorResolver.summarizeTarget(action.target),
        valueSummary: 'SCROLL_INTO_VIEW',
        metadataJson: {
          strategy: 'SCROLL_INTO_VIEW',
        },
      };
    }

    // Scroll by delta or direction
    const rawVal = (action.value?.value || '').toLowerCase();
    let deltaY = 500;
    if (rawVal.includes('top') || rawVal.includes('up')) {
      deltaY = -500;
    } else if (rawVal.includes('bottom') || rawVal.includes('down')) {
      deltaY = 800;
    }

    // Bound scroll
    deltaY = Math.max(
      -ACTION_BOUNDS.MAX_SCROLL_AMOUNT_PX,
      Math.min(ACTION_BOUNDS.MAX_SCROLL_AMOUNT_PX, deltaY),
    );

    await context.page.mouse.wheel(0, deltaY);

    return {
      targetSummary: 'PAGE_VIEWPORT',
      valueSummary: `deltaY=${deltaY}`,
      metadataJson: {
        strategy: 'MOUSE_WHEEL',
        deltaY,
      },
    };
  }
}
