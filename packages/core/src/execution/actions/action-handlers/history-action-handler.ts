/**
 * @file packages/core/src/execution/actions/action-handlers/history-action-handler.ts
 * Handlers for targetless browser history operations: GO_BACK, GO_FORWARD, and RELOAD.
 */

import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';

export class GoBackActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'GO_BACK';
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    _action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const urlBefore = context.page.url();
    await context.page.goBack({ timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    const urlAfter = context.page.url();

    return {
      targetSummary: 'BROWSER_HISTORY',
      valueSummary: 'GO_BACK',
      metadataJson: {
        operation: 'GO_BACK',
        urlBefore,
        urlAfter,
      },
    };
  }
}

export class GoForwardActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'GO_FORWARD';
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    _action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const urlBefore = context.page.url();
    await context.page.goForward({ timeout: timeoutMs, waitUntil: 'domcontentloaded' });
    const urlAfter = context.page.url();

    return {
      targetSummary: 'BROWSER_HISTORY',
      valueSummary: 'GO_FORWARD',
      metadataJson: {
        operation: 'GO_FORWARD',
        urlBefore,
        urlAfter,
      },
    };
  }
}

export class ReloadActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'RELOAD';
  public readonly riskLevel = 'READ_ONLY' as const;

  protected async executeAction(
    _action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const currentUrl = context.page.url();
    await context.page.reload({ timeout: timeoutMs, waitUntil: 'domcontentloaded' });

    return {
      targetSummary: 'BROWSER_PAGE',
      valueSummary: 'RELOAD',
      metadataJson: {
        operation: 'RELOAD',
        url: currentUrl,
      },
    };
  }
}
