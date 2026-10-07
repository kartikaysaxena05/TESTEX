/**
 * @file packages/core/src/execution/actions/action-handlers/check-action-handler.ts
 * Handlers for CHECK and UNCHECK actions on checkboxes and radio buttons.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';

export class CheckActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'CHECK';
  public readonly riskLevel = 'MUTATING' as const;

  constructor(private readonly isUncheck = false) {
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

    const isUn = this.isUncheck || action.action === 'UNCHECK';

    if (isUn) {
      await locator.uncheck({
        timeout: timeoutMs,
        force: false,
      });
    } else {
      await locator.check({
        timeout: timeoutMs,
        force: false,
      });
    }

    const isCheckedNow = await locator.isChecked().catch(() => !isUn);
    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    return {
      targetSummary,
      valueSummary: isUn ? 'UNCHECKED' : 'CHECKED',
      metadataJson: {
        operation: isUn ? 'UNCHECK' : 'CHECK',
        isChecked: isCheckedNow,
      },
    };
  }
}

export class UncheckActionHandler extends CheckActionHandler {
  public override readonly actionType: ExecutableActionType = 'UNCHECK';

  constructor() {
    super(true);
  }
}
