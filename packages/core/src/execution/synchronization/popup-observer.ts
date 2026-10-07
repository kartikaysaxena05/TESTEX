/**
 * @file packages/core/src/execution/synchronization/popup-observer.ts
 * Captures new pages, tabs, and popups safely without race conditions.
 */

import type { Page, BrowserContext } from 'playwright';
import { SYNCHRONIZATION_BOUNDS, type IPopupObserver } from './synchronization-types.js';
import { PopupTimeoutError } from './synchronization-errors.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';

export class PopupObserver implements IPopupObserver {
  /**
   * Sets up popup/page event listeners before triggering the action, ensures new tab/window
   * is captured reliably, and returns the new authoritative Page.
   */
  public async waitForPopupOrNewPage(
    page: Page,
    browserContext: BrowserContext | undefined,
    triggerAction: () => Promise<unknown>,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ newPage: Page; durationMs: number }> {
    if (page.isClosed()) {
      throw new PageNotAvailableError();
    }

    if (options.abortSignal?.aborted) {
      throw new ActionCancelledError('Popup wait aborted before start');
    }

    const tStart = performance.now();
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
      SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
    );

    // 1. Pre-register listener on both page (for popup) and context (for new page/target)
    const ctx = browserContext ?? page.context();

    const popupPromise = page.waitForEvent('popup', { timeout: timeoutMs }).catch(() => null);
    const contextPagePromise = ctx.waitForEvent('page', { timeout: timeoutMs }).catch(() => null);

    const raceEventPromise = Promise.race([
      popupPromise.then(p => p ?? contextPagePromise),
      contextPagePromise.then(p => p ?? popupPromise),
    ]);

    let abortListener: (() => void) | undefined;
    const cancellationPromise = new Promise<never>((_, reject) => {
      if (options.abortSignal) {
        abortListener = () => reject(new ActionCancelledError('Popup wait cancelled by signal'));
        options.abortSignal.addEventListener('abort', abortListener, { once: true });
      }
    });

    try {
      // 2. Trigger action concurrently with listener
      const [capturedPage] = await Promise.all([
        Promise.race([raceEventPromise, cancellationPromise]),
        triggerAction(),
      ]);

      if (!capturedPage) {
        throw new PopupTimeoutError(timeoutMs);
      }

      await capturedPage
        .waitForLoadState('domcontentloaded', { timeout: timeoutMs })
        .catch(() => {});

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return {
        newPage: capturedPage,
        durationMs,
      };
    } catch (err: unknown) {
      if (
        options.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'ActionCancelledError')
      ) {
        throw new ActionCancelledError('Popup wait cancelled');
      }

      if (page.isClosed()) {
        throw new PageNotAvailableError('Page closed during popup wait');
      }

      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new PopupTimeoutError(timeoutMs);
      }

      throw err;
    } finally {
      if (options.abortSignal && abortListener) {
        options.abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }
}
