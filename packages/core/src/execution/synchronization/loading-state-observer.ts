/**
 * @file packages/core/src/execution/synchronization/loading-state-observer.ts
 * Observes application loading states (spinners, skeletons, progress bars, aria-busy) and waits for disappearance.
 */

import type { Page } from 'playwright';
import { SYNCHRONIZATION_BOUNDS, type ILoadingStateObserver } from './synchronization-types.js';
import { LoadingStateTimeoutError } from './synchronization-errors.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';

export class LoadingStateObserver implements ILoadingStateObserver {
  /**
   * Checks if any loading indicators are active and waits for them to disappear.
   */
  public async waitForLoadingDisappearance(
    page: Page,
    options: {
      customSelectors?: string[];
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ loadingObserved: boolean; durationMs: number }> {
    if (page.isClosed()) {
      throw new PageNotAvailableError();
    }

    if (options.abortSignal?.aborted) {
      throw new ActionCancelledError('Loading state wait aborted before start');
    }

    const tStart = performance.now();
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
      SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
    );

    const selectors = [
      ...(options.customSelectors ?? []),
      ...SYNCHRONIZATION_BOUNDS.DEFAULT_LOADING_SELECTORS,
    ];

    let loadingObserved = false;

    try {
      for (const selector of selectors) {
        if (options.abortSignal?.aborted) {
          throw new ActionCancelledError('Loading state wait cancelled');
        }

        const remainingMs = Math.max(
          100,
          timeoutMs - Math.max(0, Math.round(performance.now() - tStart)),
        );

        const locator = page.locator(selector);
        let isPresent = false;
        try {
          const count = await locator.count();
          if (count > 0) {
            const first = locator.first();
            isPresent = await first.isVisible();
          }
        } catch {
          // Element might be detached or page navigated
        }

        if (isPresent) {
          loadingObserved = true;
          // Wait for this specific loading indicator to become hidden or detached
          try {
            await locator.first().waitFor({ state: 'hidden', timeout: remainingMs });
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'TimeoutError') {
              throw new LoadingStateTimeoutError(selector, timeoutMs);
            }
            throw err;
          }
        }
      }

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return { loadingObserved, durationMs };
    } catch (err: unknown) {
      if (
        options.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'ActionCancelledError')
      ) {
        throw new ActionCancelledError('Loading state wait cancelled');
      }

      if (page.isClosed()) {
        throw new PageNotAvailableError('Page closed during loading state wait');
      }

      throw err;
    }
  }
}
