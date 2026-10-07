/**
 * @file packages/core/src/execution/evidence/collectors/dom-collector.ts
 * Bounded, sanitized DOM and page-state snapshot collector.
 */

import type { Page } from 'playwright';
import {
  type IDomCollector,
  type DomCollectorResult,
  type DomSnapshotData,
  type FailedElementContext,
  COLLECTOR_BOUNDS,
} from './collector-types.js';
import type { ILogger } from '../../../logging/index.js';

export interface DomCollectorOptions {
  readonly maxDomBytes?: number;
  readonly logger?: ILogger;
}

export class DomCollector implements IDomCollector {
  private readonly maxDomBytes: number;
  private readonly logger?: ILogger;

  constructor(options?: DomCollectorOptions) {
    this.maxDomBytes = options?.maxDomBytes ?? COLLECTOR_BOUNDS.DEFAULT_MAX_DOM_BYTES;
    this.logger = options?.logger;
  }

  /**
   * Captures a sanitized DOM snapshot and relevant element metadata from the active page.
   */
  public async captureDomSnapshot(
    page: Page,
    options?: {
      readonly maxDomBytes?: number;
      readonly failedElementContext?: FailedElementContext;
      readonly timeoutMs?: number;
    },
  ): Promise<DomCollectorResult> {
    const capturedAt = new Date().toISOString();
    const maxBytes = options?.maxDomBytes ?? this.maxDomBytes;
    const timeoutMs = options?.timeoutMs ?? COLLECTOR_BOUNDS.DEFAULT_COLLECTOR_TIMEOUT_MS;

    if (!page || page.isClosed()) {
      return {
        success: false,
        byteSize: 0,
        isTruncated: false,
        capturedAt,
        errorMessage: 'Cannot capture DOM snapshot: Playwright page is null or closed.',
      };
    }

    try {
      // Execute DOM extraction inside page with timeout
      const domPromise = page.evaluate(
        ({ maxByteLength }: { maxByteLength: number }) => {
          try {
            const url = window.location.href;
            const title = document.title;

            // Clone document element to avoid mutating live page
            const clone = document.documentElement.cloneNode(true) as HTMLElement;

            // Redact sensitive inputs in clone
            const sensitiveInputs = clone.querySelectorAll(
              'input[type="password"], input[autocomplete*="password"], input[autocomplete*="cc-"], input[name*="password" i], input[name*="token" i], input[name*="secret" i], input[name*="apiKey" i]',
            );
            sensitiveInputs.forEach(el => {
              el.setAttribute('value', '***');
              if (el.innerHTML) el.innerHTML = '';
            });

            // Redact sensitive attributes in clone
            const sensitiveAttrs = [
              'data-token',
              'data-secret',
              'data-auth',
              'data-key',
              'data-apikey',
            ];
            const allElements = clone.querySelectorAll('*');
            allElements.forEach(el => {
              for (const attr of sensitiveAttrs) {
                if (el.hasAttribute(attr)) {
                  el.setAttribute(attr, '***');
                }
              }
            });

            const rawHtml = '<!DOCTYPE html>\n' + clone.outerHTML;
            const originalByteSize = new Blob([rawHtml]).size;
            let finalHtml = rawHtml;
            let isTruncated = false;

            if (originalByteSize > maxByteLength) {
              finalHtml =
                rawHtml.slice(0, maxByteLength) + '\n<!-- [TRUNCATED DUE TO SIZE LIMIT] -->';
              isTruncated = true;
            }

            // Active element metadata
            let activeElementInfo:
              { tagName: string; id?: string; className?: string; name?: string } | undefined;
            if (document.activeElement && document.activeElement !== document.body) {
              const active = document.activeElement as HTMLElement;
              activeElementInfo = {
                tagName: active.tagName.toLowerCase(),
                id: active.id || undefined,
                className: active.className || undefined,
                name: (active as HTMLInputElement).name || undefined,
              };
            }

            return {
              url,
              title,
              html: finalHtml,
              isTruncated,
              originalByteSize,
              activeElement: activeElementInfo,
            };
          } catch (e) {
            return {
              url: window.location.href || '',
              title: document.title || '',
              html: `<!-- Error during DOM capture: ${String(e)} -->`,
              isTruncated: false,
              originalByteSize: 0,
            };
          }
        },
        { maxByteLength: maxBytes },
      );

      // Timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`DOM capture timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      );

      const rawResult = await Promise.race([domPromise, timeoutPromise]);

      let viewport: { width: number; height: number } | undefined;
      try {
        const vp = page.viewportSize();
        if (vp) viewport = { width: vp.width, height: vp.height };
      } catch {
        // Ignored
      }

      const snapshotData: DomSnapshotData = {
        url: rawResult.url,
        title: rawResult.title,
        viewport,
        html: rawResult.html,
        isTruncated: rawResult.isTruncated,
        originalByteSize: rawResult.originalByteSize,
        activeElement: rawResult.activeElement,
        failedElementContext: options?.failedElementContext,
        capturedAt,
      };

      const serializedHtml = snapshotData.html;
      const serializedJson = JSON.stringify(
        {
          url: snapshotData.url,
          title: snapshotData.title,
          viewport: snapshotData.viewport,
          isTruncated: snapshotData.isTruncated,
          originalByteSize: snapshotData.originalByteSize,
          activeElement: snapshotData.activeElement,
          failedElementContext: snapshotData.failedElementContext,
          capturedAt: snapshotData.capturedAt,
        },
        null,
        2,
      );

      const byteSize = Buffer.byteLength(serializedHtml, 'utf8');

      this.logger?.debug('dom_collector.captured', {
        url: snapshotData.url,
        byteSize,
        isTruncated: snapshotData.isTruncated,
      });

      return {
        success: true,
        data: snapshotData,
        serializedHtml,
        serializedJson,
        byteSize,
        isTruncated: snapshotData.isTruncated,
        capturedAt,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger?.warn('dom_collector.capture_failed', { error: errorMessage });

      return {
        success: false,
        byteSize: 0,
        isTruncated: false,
        capturedAt,
        errorMessage: `DOM capture failed: ${errorMessage}`,
      };
    }
  }
}
