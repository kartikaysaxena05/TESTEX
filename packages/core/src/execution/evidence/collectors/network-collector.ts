/**
 * @file packages/core/src/execution/evidence/collectors/network-collector.ts
 * Bounded HTTP request, response, and network failure collector with defensive header and query redaction.
 */

import crypto from 'node:crypto';
import type { BrowserContext, Page, Request, Response } from 'playwright';
import {
  type INetworkCollector,
  type NetworkCollectorResult,
  type NetworkEventRecord,
  COLLECTOR_BOUNDS,
} from './collector-types.js';
import { EvidenceRedactor } from '../evidence-redactor.js';
import type { ILogger } from '../../../logging/index.js';

export interface NetworkCollectorOptions {
  readonly maxEvents?: number;
  readonly maxBodyBytes?: number;
  readonly captureBodies?: boolean;
  readonly redactor?: EvidenceRedactor;
  readonly logger?: ILogger;
}

export class NetworkCollector implements INetworkCollector {
  private readonly maxEvents: number;
  private readonly maxBodyBytes: number;
  private readonly captureBodies: boolean;
  private readonly redactor: EvidenceRedactor;
  private readonly logger?: ILogger;

  private networkEvents: NetworkEventRecord[] = [];
  private readonly requestMap: Map<Request, NetworkEventRecord> = new Map();
  private failedRequestsCount = 0;
  private isTruncated = false;

  private readonly pageListeners: Map<
    Page,
    {
      onRequest: (req: Request) => void;
      onResponse: (res: Response) => void;
      onRequestFailed: (req: Request) => void;
    }
  > = new Map();

  private readonly contextListeners: Map<
    BrowserContext,
    {
      onPage: (page: Page) => void;
    }
  > = new Map();

  constructor(options?: NetworkCollectorOptions) {
    this.maxEvents = options?.maxEvents ?? COLLECTOR_BOUNDS.DEFAULT_MAX_NETWORK_EVENTS;
    this.maxBodyBytes = options?.maxBodyBytes ?? COLLECTOR_BOUNDS.DEFAULT_MAX_BODY_BYTES;
    this.captureBodies = options?.captureBodies ?? false;
    this.redactor = options?.redactor ?? new EvidenceRedactor();
    this.logger = options?.logger;
  }

  /**
   * Attaches network request and response listeners to a Playwright page.
   */
  public attach(page: Page): void {
    if (!page || this.pageListeners.has(page)) {
      return;
    }

    const onRequest = (req: Request): void => {
      try {
        const rawUrl = req.url();
        const urlRedaction = this.redactor.redactUrl(rawUrl);
        const headers = req.headers();
        const redactedHeaders = this.redactor.redactHeaders(headers);

        let pageUrl: string | undefined;
        try {
          if (!page.isClosed()) {
            pageUrl = page.url();
          }
        } catch {
          // Ignored
        }

        let requestBody: string | undefined;
        let isBodyTruncated = false;
        let originalBodyByteSize: number | undefined;

        if (this.captureBodies) {
          const postData = req.postData();
          if (postData) {
            originalBodyByteSize = Buffer.byteLength(postData, 'utf8');
            if (originalBodyByteSize > this.maxBodyBytes) {
              requestBody = postData.slice(0, this.maxBodyBytes);
              isBodyTruncated = true;
            } else {
              requestBody = postData;
            }
            requestBody = this.redactor.redactText(requestBody).data;
          }
        }

        const record: NetworkEventRecord = {
          id: crypto.randomUUID(),
          url: urlRedaction.data,
          method: req.method(),
          resourceType: req.resourceType(),
          requestTimestamp: new Date().toISOString(),
          requestHeaders: redactedHeaders.data,
          requestBody,
          isBodyTruncated: isBodyTruncated ? true : undefined,
          originalBodyByteSize,
          pageUrl: pageUrl ? this.redactor.redactUrl(pageUrl).data : undefined,
          redactionStatus:
            urlRedaction.redactionStatus === 'REDACTED' ||
            redactedHeaders.redactionStatus === 'REDACTED'
              ? 'REDACTED'
              : 'NONE',
        };

        if (this.networkEvents.length >= this.maxEvents) {
          this.networkEvents.shift();
          this.isTruncated = true;
        }

        this.networkEvents.push(record);
        this.requestMap.set(req, record);
      } catch (err) {
        this.logger?.debug('network_collector.request_error', { error: String(err) });
      }
    };

    const onResponse = async (res: Response): Promise<void> => {
      try {
        const req = res.request();
        const record = this.requestMap.get(req);

        const responseHeaders = res.headers();
        const redactedHeaders = this.redactor.redactHeaders(responseHeaders);
        const responseTimestamp = new Date().toISOString();

        let durationMs: number | undefined;
        if (record?.requestTimestamp) {
          const reqTime = new Date(record.requestTimestamp).getTime();
          const resTime = new Date(responseTimestamp).getTime();
          durationMs = Math.max(0, resTime - reqTime);
        }

        let responseBody: string | undefined;
        let isBodyTruncated = false;
        let originalBodyByteSize: number | undefined;

        if (this.captureBodies) {
          const contentType = responseHeaders['content-type'] || '';
          if (
            contentType.includes('application/json') ||
            contentType.includes('text/') ||
            contentType.includes('application/xml')
          ) {
            try {
              const bodyText = await res.text();
              originalBodyByteSize = Buffer.byteLength(bodyText, 'utf8');
              if (originalBodyByteSize > this.maxBodyBytes) {
                responseBody = bodyText.slice(0, this.maxBodyBytes);
                isBodyTruncated = true;
              } else {
                responseBody = bodyText;
              }
              responseBody = this.redactor.redactText(responseBody).data;
            } catch {
              // Body might not be available or already read
            }
          }
        }

        if (record) {
          // Mutate existing event
          Object.assign(record, {
            responseTimestamp,
            durationMs,
            status: res.status(),
            statusText: res.statusText(),
            responseHeaders: redactedHeaders.data,
            responseBody,
            isBodyTruncated: isBodyTruncated || record.isBodyTruncated ? true : undefined,
            originalBodyByteSize: originalBodyByteSize ?? record.originalBodyByteSize,
            redactionStatus:
              record.redactionStatus === 'REDACTED' ||
              redactedHeaders.redactionStatus === 'REDACTED'
                ? 'REDACTED'
                : 'NONE',
          });
        } else {
          // Fallback if request event missed
          const rawUrl = res.url();
          const urlRedaction = this.redactor.redactUrl(rawUrl);

          const fallbackRecord: NetworkEventRecord = {
            id: crypto.randomUUID(),
            url: urlRedaction.data,
            method: req.method(),
            resourceType: req.resourceType(),
            requestTimestamp: responseTimestamp,
            responseTimestamp,
            durationMs: 0,
            status: res.status(),
            statusText: res.statusText(),
            responseHeaders: redactedHeaders.data,
            responseBody,
            isBodyTruncated: isBodyTruncated ? true : undefined,
            originalBodyByteSize,
            redactionStatus:
              urlRedaction.redactionStatus === 'REDACTED' ||
              redactedHeaders.redactionStatus === 'REDACTED'
                ? 'REDACTED'
                : 'NONE',
          };

          if (this.networkEvents.length >= this.maxEvents) {
            this.networkEvents.shift();
            this.isTruncated = true;
          }

          this.networkEvents.push(fallbackRecord);
        }
      } catch (err) {
        this.logger?.debug('network_collector.response_error', { error: String(err) });
      }
    };

    const onRequestFailed = (req: Request): void => {
      try {
        this.failedRequestsCount++;
        const record = this.requestMap.get(req);
        const failureReason = req.failure()?.errorText || 'Request failed';

        if (record) {
          Object.assign(record, {
            failureReason,
            responseTimestamp: new Date().toISOString(),
          });
        } else {
          const rawUrl = req.url();
          const urlRedaction = this.redactor.redactUrl(rawUrl);

          const newRecord: NetworkEventRecord = {
            id: crypto.randomUUID(),
            url: urlRedaction.data,
            method: req.method(),
            resourceType: req.resourceType(),
            requestTimestamp: new Date().toISOString(),
            failureReason,
            redactionStatus: urlRedaction.redactionStatus,
          };

          if (this.networkEvents.length >= this.maxEvents) {
            this.networkEvents.shift();
            this.isTruncated = true;
          }

          this.networkEvents.push(newRecord);
        }
      } catch (err) {
        this.logger?.debug('network_collector.failed_error', { error: String(err) });
      }
    };

    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('requestfailed', onRequestFailed);

    this.pageListeners.set(page, { onRequest, onResponse, onRequestFailed });
  }

  /**
   * Attaches listeners to a BrowserContext, automatically monitoring newly opened pages.
   */
  public attachContext(context: BrowserContext): void {
    if (!context || this.contextListeners.has(context)) {
      return;
    }

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
   * Detaches and cleans up all active network event listeners.
   */
  public detach(): void {
    for (const [page, listeners] of this.pageListeners.entries()) {
      try {
        page.off('request', listeners.onRequest);
        page.off('response', listeners.onResponse);
        page.off('requestfailed', listeners.onRequestFailed);
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
    this.requestMap.clear();
  }

  /**
   * Returns current captured network events.
   */
  public getEvents(): readonly NetworkEventRecord[] {
    return [...this.networkEvents];
  }

  /**
   * Clears in-memory buffers.
   */
  public clear(): void {
    this.networkEvents = [];
    this.requestMap.clear();
    this.failedRequestsCount = 0;
    this.isTruncated = false;
  }

  /**
   * Serializes captured network history into structured JSON.
   */
  public serialize(): NetworkCollectorResult {
    const capturedAt = new Date().toISOString();
    const totalCount = this.networkEvents.length;

    try {
      const data = {
        totalCount,
        failedRequestsCount: this.failedRequestsCount,
        isTruncated: this.isTruncated,
        maxEvents: this.maxEvents,
        networkEvents: this.networkEvents,
        capturedAt,
      };

      const serializedJson = JSON.stringify(data, null, 2);

      return {
        success: true,
        networkEvents: [...this.networkEvents],
        failedRequestsCount: this.failedRequestsCount,
        totalCount,
        isTruncated: this.isTruncated,
        serializedJson,
        capturedAt,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        networkEvents: [],
        failedRequestsCount: this.failedRequestsCount,
        totalCount: 0,
        isTruncated: false,
        serializedJson: '{}',
        capturedAt,
        errorMessage: `Failed to serialize network events: ${errorMessage}`,
      };
    }
  }
}
