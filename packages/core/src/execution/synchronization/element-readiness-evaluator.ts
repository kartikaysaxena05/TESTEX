/**
 * @file packages/core/src/execution/synchronization/element-readiness-evaluator.ts
 * Evaluates and awaits pre-action element readiness states without artificial sleeps.
 */

import type { Locator } from 'playwright';
import type { ElementReadinessState } from '@ai-quality/contracts';
import {
  SYNCHRONIZATION_BOUNDS,
  type IElementReadinessEvaluator,
} from './synchronization-types.js';
import { ElementReadinessTimeoutError } from './synchronization-errors.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';

export class ElementReadinessEvaluator implements IElementReadinessEvaluator {
  /**
   * Evaluates and awaits the desired element readiness state.
   */
  public async evaluateReadiness(
    locator: Locator,
    expectedState: ElementReadinessState,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ state: ElementReadinessState; durationMs: number }> {
    if (options.abortSignal?.aborted) {
      throw new ActionCancelledError('Element readiness check aborted before start');
    }

    const tStart = performance.now();
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
      SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
    );

    try {
      switch (expectedState) {
        case 'ATTACHED':
          await locator.waitFor({ state: 'attached', timeout: timeoutMs });
          break;

        case 'DETACHED':
          await locator.waitFor({ state: 'detached', timeout: timeoutMs });
          break;

        case 'VISIBLE':
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          break;

        case 'HIDDEN':
          await locator.waitFor({ state: 'hidden', timeout: timeoutMs });
          break;

        case 'ENABLED':
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          await this.pollCondition(
            async () => {
              try {
                return await locator.isEnabled({ timeout: 500 });
              } catch {
                return false;
              }
            },
            timeoutMs - Math.max(0, Math.round(performance.now() - tStart)),
            options.abortSignal,
          );
          break;

        case 'DISABLED':
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          await this.pollCondition(
            async () => {
              try {
                return await locator.isDisabled({ timeout: 500 });
              } catch {
                return false;
              }
            },
            timeoutMs - Math.max(0, Math.round(performance.now() - tStart)),
            options.abortSignal,
          );
          break;

        case 'EDITABLE':
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          await this.pollCondition(
            async () => {
              try {
                return await locator.isEditable({ timeout: 500 });
              } catch {
                return false;
              }
            },
            timeoutMs - Math.max(0, Math.round(performance.now() - tStart)),
            options.abortSignal,
          );
          break;

        case 'STABLE': {
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          // Verify bounding box stability across 2 consecutive samples
          let prevBox: { x: number; y: number; width: number; height: number } | null = null;
          await this.pollCondition(
            async () => {
              try {
                const box = await locator.boundingBox({ timeout: 500 });
                if (!box) return false;
                if (!prevBox) {
                  prevBox = box;
                  return false;
                }
                const isStable =
                  Math.abs(box.x - prevBox.x) < 1 &&
                  Math.abs(box.y - prevBox.y) < 1 &&
                  Math.abs(box.width - prevBox.width) < 1 &&
                  Math.abs(box.height - prevBox.height) < 1;
                prevBox = box;
                return isStable;
              } catch {
                return false;
              }
            },
            timeoutMs - Math.max(0, Math.round(performance.now() - tStart)),
            options.abortSignal,
          );
          break;
        }

        default:
          await locator.waitFor({ state: 'visible', timeout: timeoutMs });
          break;
      }

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return { state: expectedState, durationMs };
    } catch (err: unknown) {
      if (
        options.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'ActionCancelledError')
      ) {
        throw new ActionCancelledError('Element readiness wait cancelled');
      }

      if (
        err instanceof Error &&
        (err.message.includes('Target page, context or browser has been closed') ||
          err.message.includes('Page closed'))
      ) {
        throw new PageNotAvailableError('Page closed during element readiness evaluation');
      }

      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new ElementReadinessTimeoutError('Target Locator', expectedState, timeoutMs);
      }

      throw err;
    }
  }

  /**
   * Bounded state polling without artificial long sleeps.
   */
  private async pollCondition(
    checkFn: () => Promise<boolean>,
    remainingTimeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const deadline = performance.now() + Math.max(100, remainingTimeoutMs);
    const intervalMs = SYNCHRONIZATION_BOUNDS.DEFAULT_STABILITY_POLL_INTERVAL_MS;

    while (performance.now() < deadline) {
      if (abortSignal?.aborted) {
        throw new ActionCancelledError('Condition polling cancelled');
      }

      const satisfied = await checkFn();
      if (satisfied) {
        return;
      }

      // Small bounded interval
      await new Promise(r => setTimeout(r, intervalMs));
    }

    const timeoutError = new Error('Condition polling timeout');
    timeoutError.name = 'TimeoutError';
    throw timeoutError;
  }
}
