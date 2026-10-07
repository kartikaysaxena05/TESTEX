/**
 * @file packages/core/src/execution/actions/action-handlers/drag-and-drop-action-handler.ts
 * Handler for DRAG_AND_DROP action using resolved source and target Playwright locators.
 */

import type {
  ExecutableActionType,
  ExecutablePlanStepDto,
  ExecutableTargetDescriptorDto,
} from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import type { ActionExecutionContext } from '../action-types.js';
import { InvalidActionError, InvalidActionValueError } from '../action-errors.js';

export class DragAndDropActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'DRAG_AND_DROP';
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
    if (!action.target) {
      throw new InvalidActionError('DRAG_AND_DROP action requires a source target descriptor.');
    }

    const sourceLocator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    const destRaw = (action.value?.value || '').trim();
    if (!destRaw) {
      throw new InvalidActionValueError(
        'DRAG_AND_DROP action requires a destination target or selector in value.',
      );
    }

    let destTarget: ExecutableTargetDescriptorDto;
    try {
      destTarget = JSON.parse(destRaw);
    } catch {
      // Treat as css / text / testId hint
      if (destRaw.startsWith('#') || destRaw.startsWith('.') || destRaw.startsWith('[')) {
        destTarget = { kind: 'ELEMENT', css: destRaw };
      } else {
        destTarget = { kind: 'ELEMENT', testId: destRaw };
      }
    }

    const destLocator = await this.locatorResolver.resolve(context.page, destTarget, {
      strict: true,
    });

    await sourceLocator.dragTo(destLocator, {
      timeout: timeoutMs,
      force: false,
    });

    const sourceSummary = this.locatorResolver.summarizeTarget(action.target);
    const destSummary = this.locatorResolver.summarizeTarget(destTarget);

    return {
      targetSummary: `${sourceSummary} -> ${destSummary}`,
      valueSummary: `dragTo(${destSummary})`,
      metadataJson: {
        sourceTarget: action.target,
        destinationTarget: destTarget,
      },
    };
  }
}
