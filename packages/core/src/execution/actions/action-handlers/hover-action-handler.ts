/**
 * @file packages/core/src/execution/actions/action-handlers/hover-action-handler.ts
 * Handler for HOVER interaction.
 */

import type { ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';

export class HoverActionHandler extends BaseActionHandler {
  public readonly actionType = 'HOVER' as const;
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    await locator.hover({
      timeout: timeoutMs,
      force: false,
    });

    return {
      targetSummary: this.locatorResolver.summarizeTarget(action.target),
      metadataJson: {
        interaction: 'HOVER',
      },
    };
  }
}
