/**
 * @file packages/core/src/execution/actions/action-handlers/wait-action-handler.ts
 * Handlers for WAIT_FOR_STATE, WAIT_FOR_ELEMENT, WAIT_FOR_URL, and WAIT_FOR_LOAD_STATE actions.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';
import { InvalidActionValueError } from '../action-errors.js';

export class WaitForStateActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'WAIT_FOR_STATE';
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
    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    const rawState = (action.value?.value || 'visible').toLowerCase();
    let state: 'visible' | 'hidden' | 'attached' | 'detached' = 'visible';

    if (rawState.includes('hidden') || rawState.includes('invisible')) {
      state = 'hidden';
    } else if (rawState.includes('attached') || rawState.includes('present')) {
      state = 'attached';
    } else if (rawState.includes('detached') || rawState.includes('removed')) {
      state = 'detached';
    }

    await locator.waitFor({
      state,
      timeout: timeoutMs,
    });

    const targetSummary = this.locatorResolver.summarizeTarget(action.target);

    return {
      targetSummary,
      valueSummary: `state=${state}`,
      metadataJson: {
        expectedState: state,
      },
    };
  }
}

export class WaitForElementActionHandler extends WaitForStateActionHandler {
  public override readonly actionType: ExecutableActionType = 'WAIT_FOR_ELEMENT';
}

export class WaitForUrlActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'WAIT_FOR_URL';
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
    const expectedUrl = (
      action.target?.route ||
      action.value?.value ||
      action.target?.name ||
      ''
    ).trim();

    if (!expectedUrl) {
      throw new InvalidActionValueError('WAIT_FOR_URL action requires an expected URL or route.');
    }

    await context.page.waitForURL(
      url => url.toString().includes(expectedUrl) || url.pathname.includes(expectedUrl),
      { timeout: timeoutMs },
    );

    return {
      targetSummary: `url_match="${expectedUrl}"`,
      valueSummary: expectedUrl,
      metadataJson: {
        currentUrl: context.page.url(),
      },
    };
  }
}

export class WaitForLoadStateActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'WAIT_FOR_LOAD_STATE';
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
    const rawState = (action.value?.value || 'load').toLowerCase();
    let state: 'domcontentloaded' | 'load' | 'networkidle' = 'load';

    if (rawState.includes('dom') || rawState.includes('content')) {
      state = 'domcontentloaded';
    } else if (rawState.includes('network') || rawState.includes('idle')) {
      state = 'networkidle';
    }

    await context.page.waitForLoadState(state, {
      timeout: timeoutMs,
    });

    return {
      targetSummary: 'PAGE_LOAD_STATE',
      valueSummary: state,
      metadataJson: {
        loadState: state,
      },
    };
  }
}
