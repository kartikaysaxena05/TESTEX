/**
 * @file packages/core/src/execution/evidence/collectors/screenshot-collector.ts
 * Playwright screenshot evidence collector with defensive masking and crash-resilient capture.
 */

import type { Page } from 'playwright';
import {
  type IScreenshotCollector,
  type ScreenshotCollectorResult,
  COLLECTOR_BOUNDS,
} from './collector-types.js';
import type { ILogger } from '../../../logging/index.js';

export interface ScreenshotCollectorOptions {
  readonly logger?: ILogger;
  readonly defaultMaskSelectors?: readonly string[];
}

export class ScreenshotCollector implements IScreenshotCollector {
  private readonly logger?: ILogger;
  private readonly defaultMaskSelectors: readonly string[];

  constructor(options?: ScreenshotCollectorOptions) {
    this.logger = options?.logger;
    this.defaultMaskSelectors = options?.defaultMaskSelectors ?? [
      'input[type="password"]',
      'input[autocomplete*="password"]',
      'input[autocomplete*="cc-"]',
      'input[name*="password" i]',
      'input[name*="token" i]',
      'input[name*="secret" i]',
      'input[name*="apiKey" i]',
      '[data-sensitive="true"]',
    ];
  }

  /**
   * Captures a failure screenshot from the active Playwright page.
   */
  public async captureFailureScreenshot(
    page: Page,
    options?: {
      readonly fullPage?: boolean;
      readonly maskSelectors?: readonly string[];
      readonly timeoutMs?: number;
    },
  ): Promise<ScreenshotCollectorResult> {
    return this.captureScreenshotInternal(page, {
      fullPage: options?.fullPage ?? false,
      maskSelectors: options?.maskSelectors ?? this.defaultMaskSelectors,
      timeoutMs: options?.timeoutMs ?? COLLECTOR_BOUNDS.DEFAULT_COLLECTOR_TIMEOUT_MS,
      isFailure: true,
    });
  }

  /**
   * Captures a step execution screenshot from the active Playwright page.
   */
  public async captureStepScreenshot(
    page: Page,
    options?: {
      readonly fullPage?: boolean;
      readonly maskSelectors?: readonly string[];
      readonly timeoutMs?: number;
    },
  ): Promise<ScreenshotCollectorResult> {
    return this.captureScreenshotInternal(page, {
      fullPage: options?.fullPage ?? false,
      maskSelectors: options?.maskSelectors ?? this.defaultMaskSelectors,
      timeoutMs: options?.timeoutMs ?? COLLECTOR_BOUNDS.DEFAULT_COLLECTOR_TIMEOUT_MS,
      isFailure: false,
    });
  }

  private async captureScreenshotInternal(
    page: Page,
    params: {
      readonly fullPage: boolean;
      readonly maskSelectors: readonly string[];
      readonly timeoutMs: number;
      readonly isFailure: boolean;
    },
  ): Promise<ScreenshotCollectorResult> {
    const capturedAt = new Date().toISOString();
    const isMasked = params.maskSelectors.length > 0;

    if (!page || page.isClosed()) {
      return {
        success: false,
        mimeType: 'image/png',
        byteSize: 0,
        isFullPage: params.fullPage,
        isMasked: false,
        capturedAt,
        errorMessage: 'Cannot capture screenshot: Playwright page is null or closed.',
      };
    }

    let maskApplied = false;
    let pageUrl = '';
    let viewportWidth = 1280;
    let viewportHeight = 720;

    try {
      pageUrl = page.url();
      const viewport = page.viewportSize();
      if (viewport) {
        viewportWidth = viewport.width;
        viewportHeight = viewport.height;
      }
    } catch {
      // Ignored if page is in an invalid state
    }

    try {
      // 1. Injected temporary evidence-only CSS masking for sensitive elements
      if (isMasked) {
        try {
          const combinedSelectors = params.maskSelectors.join(', ');
          await page.evaluate(
            ({ selectors }) => {
              try {
                const styleId = '__ai_quality_evidence_mask_style__';
                if (!document.getElementById(styleId)) {
                  const style = document.createElement('style');
                  style.id = styleId;
                  style.innerHTML = `
                    ${selectors} {
                      filter: blur(10px) !important;
                      color: transparent !important;
                      text-shadow: 0 0 10px rgba(0,0,0,0.8) !important;
                      user-select: none !important;
                    }
                  `;
                  document.head?.appendChild(style);
                }
              } catch {
                // Ignore DOM manipulation errors
              }
            },
            { selectors: combinedSelectors },
          );
          maskApplied = true;
        } catch {
          // If page evaluation fails (e.g. navigation in progress), proceed without masking
          maskApplied = false;
        }
      }

      // 2. Capture PNG screenshot with strict timeout
      const buffer = await page.screenshot({
        type: 'png',
        fullPage: params.fullPage,
        timeout: params.timeoutMs,
      });

      this.logger?.debug('screenshot_collector.captured', {
        pageUrl,
        byteSize: buffer.length,
        isFullPage: params.fullPage,
        isMasked: maskApplied,
        isFailure: params.isFailure,
      });

      return {
        success: true,
        buffer,
        mimeType: 'image/png',
        byteSize: buffer.length,
        width: viewportWidth,
        height: viewportHeight,
        pageUrl,
        isFullPage: params.fullPage,
        isMasked: maskApplied,
        capturedAt,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger?.warn('screenshot_collector.capture_failed', {
        pageUrl,
        error: errorMessage,
        isFailure: params.isFailure,
      });

      return {
        success: false,
        mimeType: 'image/png',
        byteSize: 0,
        width: viewportWidth,
        height: viewportHeight,
        pageUrl,
        isFullPage: params.fullPage,
        isMasked: false,
        capturedAt,
        errorMessage: `Screenshot capture failed: ${errorMessage}`,
      };
    } finally {
      // 3. Guaranteed cleanup of temporary evidence masking styles
      if (maskApplied) {
        try {
          if (!page.isClosed()) {
            await page.evaluate(() => {
              try {
                const style = document.getElementById('__ai_quality_evidence_mask_style__');
                style?.remove();
              } catch {
                // Ignore cleanup errors
              }
            });
          }
        } catch {
          // Ignore cleanup errors if page destroyed concurrently
        }
      }
    }
  }
}
