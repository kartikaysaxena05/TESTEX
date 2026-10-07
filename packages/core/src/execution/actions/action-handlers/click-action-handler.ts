/**
 * @file packages/core/src/execution/actions/action-handlers/click-action-handler.ts
 * Handler for CLICK and DOUBLE_CLICK actions with actionability checks, strict locator resolution, and no silent force.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';

export class ClickActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'CLICK';
  public readonly riskLevel = 'MUTATING' as const;

  constructor(private readonly isDoubleClick = false) {
    super();
  }

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    forceUsed?: boolean;
    metadataJson?: Record<string, unknown>;
  }> {
    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    const isDbl = this.isDoubleClick || action.action === 'DOUBLE_CLICK';

    if (isDbl) {
      await locator.dblclick({
        timeout: timeoutMs,
        force: false,
      });
    } else {
      await locator.click({
        timeout: timeoutMs,
        force: false,
      });
    }

    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    return {
      targetSummary,
      forceUsed: false,
      metadataJson: {
        interactionType: isDbl ? 'DOUBLE_CLICK' : 'CLICK',
      },
    };
  }
}

export class DoubleClickActionHandler extends ClickActionHandler {
  public override readonly actionType: ExecutableActionType = 'DOUBLE_CLICK';

  constructor() {
    super(true);
  }
}
