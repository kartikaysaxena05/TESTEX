/**
 * @file packages/core/src/execution/actions/action-handlers/focus-blur-action-handler.ts
 * Handlers for FOCUS and BLUR field interactions.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';

export class FocusActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'FOCUS';
  public readonly riskLevel = 'MUTATING' as const;

  constructor(private readonly isBlur = false) {
    super();
  }

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

    const isBl = this.isBlur || action.action === 'BLUR';

    if (isBl) {
      await locator.evaluate((el: HTMLElement) => el.blur());
    } else {
      await locator.focus({ timeout: timeoutMs });
    }

    return {
      targetSummary: this.locatorResolver.summarizeTarget(action.target),
      metadataJson: {
        interaction: isBl ? 'BLUR' : 'FOCUS',
      },
    };
  }
}

export class BlurActionHandler extends FocusActionHandler {
  public override readonly actionType: ExecutableActionType = 'BLUR';

  constructor() {
    super(true);
  }
}
