/**
 * @file packages/core/src/execution/synchronization/network-observer.ts
 * Race-safe network response observer with targeted request correlation and secret redaction.
 */

import type { Page, Response } from 'playwright';
import type { NetworkRequestMatcherDto } from '@ai-quality/contracts';
import { SYNCHRONIZATION_BOUNDS, type INetworkObserver } from './synchronization-types.js';
import { ResponseWaitTimeoutError } from './synchronization-errors.js';
import { ActionCancelledError, PageNotAvailableError } from '../actions/action-errors.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';

export class NetworkObserver implements INetworkObserver {
  private readonly secretRedactor: SecretRedactor;

  constructor(secretRedactor?: SecretRedactor) {
    this.secretRedactor = secretRedactor ?? new SecretRedactor();
  }

  /**
   * Pre-registers a response listener before triggering an action to eliminate race conditions,
   * awaits matching response, and cleans up all listeners reliably.
   */
  public async waitForMatchingResponse(
    page: Page,
    triggerAction: (() => Promise<unknown>) | undefined,
    matcher: NetworkRequestMatcherDto,
    options: {
      timeoutMs: number;
      abortSignal?: AbortSignal;
      secrets?: Record<string, string>;
    },
  ): Promise<{ response: Response; durationMs: number; url: string; status: number }> {
    if (page.isClosed()) {
      throw new PageNotAvailableError();
    }

    if (options.abortSignal?.aborted) {
      throw new ActionCancelledError('Network wait aborted before start');
    }

    if (options.secrets) {
      this.secretRedactor.registerSecrets(options.secrets);
    }

    const tStart = performance.now();
    const timeoutMs = Math.min(
      Math.max(matcher.timeoutMs ?? options.timeoutMs, SYNCHRONIZATION_BOUNDS.MIN_TIMEOUT_MS),
      SYNCHRONIZATION_BOUNDS.MAX_TIMEOUT_MS,
    );

    let capturedResponse: Response | null = null;
    let listenerRef: ((response: Response) => void) | null = null;
    let timerId: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;

    const responsePromise = new Promise<Response>((resolve, reject) => {
      // 1. Setup Timeout
      timerId = setTimeout(() => {
        const sanitizedPattern = matcher.urlPattern
          ? this.secretRedactor.redactText(matcher.urlPattern)
          : undefined;
        reject(new ResponseWaitTimeoutError(sanitizedPattern, matcher.method, timeoutMs));
      }, timeoutMs);

      // 2. Setup Abort Listener
      if (options.abortSignal) {
        abortListener = () => {
          if (timerId) clearTimeout(timerId);
          reject(new ActionCancelledError('Network response wait cancelled'));
        };
        options.abortSignal.addEventListener('abort', abortListener, { once: true });
      }

      // 3. Setup Response Listener
      listenerRef = (response: Response) => {
        try {
          const req = response.request();
          const reqMethod = req.method().toUpperCase();
          const resUrl = response.url();
          const resStatus = response.status();

          // Match Method
          if (matcher.method && reqMethod !== matcher.method.toUpperCase()) {
            return;
          }

          // Match Status
          if (matcher.status !== undefined && resStatus !== matcher.status) {
            return;
          }

          // Match URL Pattern
          if (matcher.urlPattern) {
            const pattern = matcher.urlPattern;
            const regexLiteralMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);

            if (regexLiteralMatch && regexLiteralMatch[1]) {
              try {
                const rx = new RegExp(regexLiteralMatch[1], regexLiteralMatch[2]);
                if (!rx.test(resUrl)) return;
              } catch {
                if (!resUrl.includes(pattern)) return;
              }
            } else if (pattern.includes('*')) {
              const escaped = pattern
                .replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&')
                .replace(/\*/g, '.*');
              const globRegex = new RegExp('^' + escaped + '$');
              try {
                const u = new URL(resUrl);
                const matches =
                  globRegex.test(resUrl) ||
                  globRegex.test(u.pathname + u.search) ||
                  globRegex.test(u.pathname);
                if (!matches) return;
              } catch {
                if (!globRegex.test(resUrl)) return;
              }
            } else {
              try {
                const u = new URL(resUrl);
                const matches =
                  resUrl.includes(pattern) ||
                  u.pathname.includes(pattern) ||
                  (u.pathname + u.search).includes(pattern);
                if (!matches) return;
              } catch {
                if (!resUrl.includes(pattern)) return;
              }
            }
          }

          // All criteria matched!
          capturedResponse = response;
          if (timerId) clearTimeout(timerId);
          resolve(response);
        } catch {
          // Ignore matching error on individual frame response
        }
      };

      page.on('response', listenerRef);
    });

    try {
      // 4. Trigger the action concurrently while listener is active
      if (triggerAction) {
        await Promise.all([responsePromise, triggerAction()]);
      } else {
        await responsePromise;
      }

      const durationMs = Math.max(0, Math.round(performance.now() - tStart));
      const res = capturedResponse!;
      return {
        response: res,
        durationMs,
        url: this.secretRedactor.redactUrl(res.url()),
        status: res.status(),
      };
    } catch (err: unknown) {
      if (
        options.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'ActionCancelledError')
      ) {
        throw new ActionCancelledError('Network response wait cancelled');
      }

      if (page.isClosed()) {
        throw new PageNotAvailableError('Page closed during network response wait');
      }

      throw err;
    } finally {
      // 5. Clean up all resources and event listeners reliably
      if (timerId) clearTimeout(timerId);
      if (listenerRef) page.off('response', listenerRef);
      if (options.abortSignal && abortListener) {
        options.abortSignal.removeEventListener('abort', abortListener);
      }
    }
  }
}
