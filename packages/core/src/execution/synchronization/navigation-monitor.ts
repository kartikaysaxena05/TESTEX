/**
 * @file packages/core/src/execution/synchronization/navigation-monitor.ts
 * Race-safe navigation, URL, and route transition monitor.
 */

import type { Page } from 'playwright';
import type { PageLoadState } from '@ai-quality/contracts';
import { SYNCHRONIZATION_BOUNDS, type INavigationMonitor } from './synchronization-types.js';
import { NavigationTimeoutError } from './synchronization-errors.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';

export class NavigationMonitor implements INavigationMonitor {
  /**
   * Sets up pre-action navigation / URL listeners, executes the triggering action (if provided),
   * and awaits navigation/URL completion without listener race conditions.
   */
  public async waitForNavigation(
    page: Page,
    triggerAction: (() => Promise<unknown>) | undefined,
    options: {
      urlPattern?: string;
      loadState?: PageLoadState;
      timeoutMs: number;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ finalUrl: string; durationMs: number }> {
    if (page.isClosed()) {
      throw new PageNotAvailableError();
    }

    if (options.abortSignal?.aborted) {
      throw new ActionCancelledError('Navigation wait aborted before start');
    }

    const tStart = performance.now();
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
      SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
    );

    // 1. Prepare URL matcher or navigation expectation
    let navPromise: Promise<unknown>;

    if (options.urlPattern) {
      const pattern = options.urlPattern;
      const regexLiteralMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
      let matcherFn: (urlStr: string) => boolean;

      if (regexLiteralMatch && regexLiteralMatch[1]) {
        try {
          const rx = new RegExp(regexLiteralMatch[1], regexLiteralMatch[2]);
          matcherFn = (urlStr: string) => rx.test(urlStr);
        } catch {
          matcherFn = (urlStr: string) => urlStr.includes(pattern);
        }
      } else if (pattern.includes('*')) {
        const escaped = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*');
        const globRegex = new RegExp('^' + escaped + '$');
        matcherFn = (urlStr: string) => {
          try {
            const u = new URL(urlStr);
            return (
              globRegex.test(urlStr) ||
              globRegex.test(u.pathname + u.search) ||
              globRegex.test(u.pathname)
            );
          } catch {
            return globRegex.test(urlStr);
          }
        };
      } else {
        matcherFn = (urlStr: string) => {
          try {
            const u = new URL(urlStr);
            return (
              urlStr.includes(pattern) ||
              u.pathname.includes(pattern) ||
              (u.pathname + u.search).includes(pattern)
            );
          } catch {
            return urlStr.includes(pattern);
          }
        };
      }

      // Check if already on matching URL before waiting
      if (!triggerAction && matcherFn(page.url())) {
        const durationMs = Math.max(0, Math.round(performance.now() - tStart));
        return {
          finalUrl: page.url(),
          durationMs,
        };
      }

      navPromise = page.waitForURL((url: URL) => matcherFn(url.href), {
        timeout: timeoutMs,
      });
    } else {
      // General navigation wait
      navPromise = page.waitForNavigation({
        timeout: timeoutMs,
        waitUntil: options.loadState ?? 'domcontentloaded',
      });
    }

    // 2. Wrap with abort signal support
    let abortListener: (() => void) | undefined;
    const cancellationPromise = new Promise<never>((_, reject) => {
      if (options.abortSignal) {
        abortListener = () =>
          reject(new ActionCancelledError('Navigation wait cancelled by signal'));
        options.abortSignal.addEventListener('abort', abortListener, { once: true });
      }
    });

    try {
      // 3. Execute triggering action concurrently with active listener
      if (triggerAction) {
        await Promise.all([Promise.race([navPromise, cancellationPromise]), triggerAction()]);
      } else {
        await Promise.race([navPromise, cancellationPromise]);
      }

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      return {
        finalUrl: page.url(),
        durationMs,
      };
    } catch (err: unknown) {
      if (
        options.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'ActionCancelledError')
      ) {
        throw new ActionCancelledError('Navigation wait cancelled');
      }

      if (page.isClosed()) {
        throw new PageNotAvailableError('Page closed during navigation wait');
      }

      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new NavigationTimeoutError(options.urlPattern, timeoutMs, page.url());
      }

      throw err;
    } finally {
      if (options.abortSignal && abortListener) {
        options.abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }
}
