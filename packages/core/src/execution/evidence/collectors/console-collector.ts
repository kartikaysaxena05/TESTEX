/**
 * @file packages/core/src/execution/evidence/collectors/console-collector.ts
 * Bounded browser console log and page exception collector with secret redaction.
 */

import crypto from 'node:crypto';
import type { BrowserContext, ConsoleMessage, Page } from 'playwright';
import {
  type IConsoleCollector,
  type ConsoleCollectorResult,
  type ConsoleEventRecord,
  type PageErrorRecord,
  COLLECTOR_BOUNDS,
} from './collector-types.js';
import { EvidenceRedactor } from '../evidence-redactor.js';
import type { ILogger } from '../../../logging/index.js';

export interface ConsoleCollectorOptions {
  readonly maxEvents?: number;
  readonly redactor?: EvidenceRedactor;
  readonly logger?: ILogger;
}

export class ConsoleCollector implements IConsoleCollector {
  private readonly maxEvents: number;
  private readonly redactor: EvidenceRedactor;
  private readonly logger?: ILogger;

  private consoleEvents: ConsoleEventRecord[] = [];
  private pageErrors: PageErrorRecord[] = [];
  private isTruncated = false;

  private readonly pageListeners: Map<
    Page,
    {
      onConsole: (msg: ConsoleMessage) => void;
      onPageError: (err: Error) => void;
    }
  > = new Map();

  private readonly contextListeners: Map<
    BrowserContext,
    {
      onPage: (page: Page) => void;
    }
  > = new Map();

  constructor(options?: ConsoleCollectorOptions) {
    this.maxEvents = options?.maxEvents ?? COLLECTOR_BOUNDS.DEFAULT_MAX_CONSOLE_EVENTS;
    this.redactor = options?.redactor ?? new EvidenceRedactor();
    this.logger = options?.logger;
  }

  /**
   * Attaches console listeners to a Playwright page.
   */
  public attach(page: Page): void {
    if (!page || this.pageListeners.has(page)) {
      return;
    }

    const onConsole = (msg: ConsoleMessage): void => {
      try {
        const rawText = msg.text();
        const typeStr = msg.type();
        const location = msg.location();
        let pageUrl: string | undefined;

        try {
          if (!page.isClosed()) {
            pageUrl = page.url();
          }
        } catch {
          // Ignored
        }

        const redaction = this.redactor.redactText(rawText);

        const mappedType: ConsoleEventRecord['type'] =
          typeStr === 'log' ||
          typeStr === 'info' ||
          typeStr === 'error' ||
          typeStr === 'debug' ||
          typeStr === 'trace'
            ? typeStr
            : typeStr === 'warning'
              ? 'warn'
              : 'unknown';

        const record: ConsoleEventRecord = {
          id: crypto.randomUUID(),
          type: mappedType,
          text: redaction.data,
          timestamp: new Date().toISOString(),
          location: {
            url: location.url ? this.redactor.redactUrl(location.url).data : undefined,
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber,
          },
          pageUrl: pageUrl ? this.redactor.redactUrl(pageUrl).data : undefined,
          redactionStatus: redaction.redactionStatus,
        };

        if (this.consoleEvents.length >= this.maxEvents) {
          this.consoleEvents.shift();
          this.isTruncated = true;
        }

        this.consoleEvents.push(record);
      } catch (err) {
        this.logger?.debug('console_collector.event_error', { error: String(err) });
      }
    };

    const onPageError = (err: Error): void => {
      try {
        const rawMessage = err.message || String(err);
        const rawStack = err.stack;
        let pageUrl: string | undefined;

        try {
          if (!page.isClosed()) {
            pageUrl = page.url();
          }
        } catch {
          // Ignored
        }

        const msgRedaction = this.redactor.redactText(rawMessage);
        const stackRedaction = rawStack ? this.redactor.redactText(rawStack) : undefined;

        const record: PageErrorRecord = {
          id: crypto.randomUUID(),
          message: msgRedaction.data,
          name: err.name || 'Error',
          stack: stackRedaction?.data,
          timestamp: new Date().toISOString(),
          pageUrl: pageUrl ? this.redactor.redactUrl(pageUrl).data : undefined,
          redactionStatus:
            msgRedaction.redactionStatus === 'REDACTED' ||
            stackRedaction?.redactionStatus === 'REDACTED'
              ? 'REDACTED'
              : 'NONE',
        };

        if (this.pageErrors.length >= 100) {
          this.pageErrors.shift();
        }

        this.pageErrors.push(record);
      } catch (e) {
        this.logger?.debug('console_collector.pageerror_error', { error: String(e) });
      }
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    this.pageListeners.set(page, { onConsole, onPageError });
  }

  /**
   * Attaches listeners to a BrowserContext, automatically monitoring newly opened pages and popups.
   */
  public attachContext(context: BrowserContext): void {
    if (!context || this.contextListeners.has(context)) {
      return;
    }

    // Attach to existing pages
    const pages = context.pages();
    for (const page of pages) {
      this.attach(page);
    }

    const onPage = (newPage: Page): void => {
      this.attach(newPage);
    };

    context.on('page', onPage);
    this.contextListeners.set(context, { onPage });
  }

  /**
   * Detaches and cleans up all active page and context listeners.
   */
  public detach(): void {
    for (const [page, listeners] of this.pageListeners.entries()) {
      try {
        page.off('console', listeners.onConsole);
        page.off('pageerror', listeners.onPageError);
      } catch {
        // Page may already be closed
      }
    }
    this.pageListeners.clear();

    for (const [context, listeners] of this.contextListeners.entries()) {
      try {
        context.off('page', listeners.onPage);
      } catch {
        // Context may already be closed
      }
    }
    this.contextListeners.clear();
  }

  /**
   * Returns current captured console events.
   */
  public getEvents(): readonly ConsoleEventRecord[] {
    return [...this.consoleEvents];
  }

  /**
   * Returns current captured page errors.
   */
  public getPageErrors(): readonly PageErrorRecord[] {
    return [...this.pageErrors];
  }

  /**
   * Clears in-memory buffers.
   */
  public clear(): void {
    this.consoleEvents = [];
    this.pageErrors = [];
    this.isTruncated = false;
  }

  /**
   * Serializes captured console logs and uncaught page exceptions into structured JSON and text logs.
   */
  public serialize(): ConsoleCollectorResult {
    const capturedAt = new Date().toISOString();
    const totalCount = this.consoleEvents.length + this.pageErrors.length;

    try {
      const data = {
        totalCount,
        isTruncated: this.isTruncated,
        maxEvents: this.maxEvents,
        pageErrorsCount: this.pageErrors.length,
        consoleEventsCount: this.consoleEvents.length,
        pageErrors: this.pageErrors,
        consoleEvents: this.consoleEvents,
        capturedAt,
      };

      const serializedJson = JSON.stringify(data, null, 2);

      // Build human-readable formatted text log
      const lines: string[] = [];
      lines.push(
        `=== BROWSER CONSOLE & ERROR LOG (Total: ${totalCount}, Truncated: ${this.isTruncated}) ===`,
      );

      if (this.pageErrors.length > 0) {
        lines.push('\n--- UNCAUGHT PAGE EXCEPTIONS ---');
        for (const err of this.pageErrors) {
          lines.push(`[${err.timestamp}] [${err.name}] ${err.message}`);
          if (err.pageUrl) lines.push(`  URL: ${err.pageUrl}`);
          if (err.stack) lines.push(`  Stack: ${err.stack}`);
        }
      }

      if (this.consoleEvents.length > 0) {
        lines.push('\n--- CONSOLE MESSAGES ---');
        for (const evt of this.consoleEvents) {
          const loc = evt.location?.url
            ? ` (${evt.location.url}:${evt.location.lineNumber ?? 0}:${evt.location.columnNumber ?? 0})`
            : '';
          lines.push(`[${evt.timestamp}] [${evt.type.toUpperCase()}]${loc} ${evt.text}`);
        }
      }

      return {
        success: true,
        consoleEvents: [...this.consoleEvents],
        pageErrors: [...this.pageErrors],
        totalCount,
        isTruncated: this.isTruncated,
        serializedJson,
        serializedText: lines.join('\n'),
        capturedAt,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        consoleEvents: [],
        pageErrors: [],
        totalCount: 0,
        isTruncated: false,
        serializedJson: '{}',
        serializedText: '',
        capturedAt,
        errorMessage: `Failed to serialize console events: ${errorMessage}`,
      };
    }
  }
}
