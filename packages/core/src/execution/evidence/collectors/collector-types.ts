/**
 * @file packages/core/src/execution/evidence/collectors/collector-types.ts
 * Interfaces, bounds, and record types for concrete failure evidence collectors.
 */

import type { BrowserContext, Page } from 'playwright';
import type {
  EvidenceCollectorConfigDto,
  TraceMode,
  EvidenceRedactionStatus,
} from '@ai-quality/contracts';

export type { EvidenceCollectorConfigDto, TraceMode };

/**
 * Authoritative default bounds for evidence collectors.
 */
export const COLLECTOR_BOUNDS = {
  DEFAULT_MAX_CONSOLE_EVENTS: 500,
  DEFAULT_MAX_NETWORK_EVENTS: 500,
  DEFAULT_MAX_BODY_BYTES: 64 * 1024, // 64 KB
  DEFAULT_MAX_DOM_BYTES: 512 * 1024, // 512 KB
  DEFAULT_COLLECTOR_TIMEOUT_MS: 5000,
  MAX_PAGE_TITLE_LENGTH: 500,
  MAX_URL_LENGTH: 2048,
  MAX_SNIPPET_LENGTH: 4000,
} as const;

/**
 * Single captured browser console event record.
 */
export interface ConsoleEventRecord {
  readonly id: string;
  readonly type: 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'unknown';
  readonly text: string;
  readonly timestamp: string;
  readonly location?: {
    readonly url?: string;
    readonly lineNumber?: number;
    readonly columnNumber?: number;
  };
  readonly pageUrl?: string;
  readonly redactionStatus: EvidenceRedactionStatus;
}

/**
 * Single captured uncaught page exception record.
 */
export interface PageErrorRecord {
  readonly id: string;
  readonly message: string;
  readonly name?: string;
  readonly stack?: string;
  readonly timestamp: string;
  readonly pageUrl?: string;
  readonly redactionStatus: EvidenceRedactionStatus;
}

/**
 * Single captured HTTP request/response network event record.
 */
export interface NetworkEventRecord {
  readonly id: string;
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly requestTimestamp: string;
  readonly responseTimestamp?: string;
  readonly durationMs?: number;
  readonly status?: number;
  readonly statusText?: string;
  readonly requestHeaders?: Record<string, string | string[]>;
  readonly responseHeaders?: Record<string, string | string[]>;
  readonly requestBody?: string;
  readonly responseBody?: string;
  readonly isBodyTruncated?: boolean;
  readonly originalBodyByteSize?: number;
  readonly failureReason?: string;
  readonly pageUrl?: string;
  readonly redactionStatus: EvidenceRedactionStatus;
}

/**
 * Single captured network request failure record.
 */
export interface NetworkRequestFailedRecord {
  readonly id: string;
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly failureReason: string;
  readonly timestamp: string;
  readonly pageUrl?: string;
}

/**
 * Context about a failed element/locator during an action or assertion.
 */
export interface FailedElementContext {
  readonly locatorStrategy?: string;
  readonly targetSelector?: string;
  readonly role?: string;
  readonly accessibleName?: string;
  readonly isVisible?: boolean;
  readonly isEnabled?: boolean;
  readonly isEditable?: boolean;
  readonly boundingBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly outerHtmlSnippet?: string;
  readonly activeElementTag?: string;
}

/**
 * Structured DOM snapshot data.
 */
export interface DomSnapshotData {
  readonly url: string;
  readonly title: string;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly html: string;
  readonly isTruncated: boolean;
  readonly originalByteSize: number;
  readonly activeElement?: {
    readonly tagName: string;
    readonly id?: string;
    readonly className?: string;
    readonly name?: string;
  };
  readonly failedElementContext?: FailedElementContext;
  readonly capturedAt: string;
}

/**
 * Result of capturing a screenshot.
 */
export interface ScreenshotCollectorResult {
  readonly success: boolean;
  readonly buffer?: Buffer;
  readonly mimeType: 'image/png';
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly pageUrl?: string;
  readonly isFullPage: boolean;
  readonly isMasked: boolean;
  readonly capturedAt: string;
  readonly errorMessage?: string;
}

/**
 * Result of collecting and serializing console history.
 */
export interface ConsoleCollectorResult {
  readonly success: boolean;
  readonly consoleEvents: readonly ConsoleEventRecord[];
  readonly pageErrors: readonly PageErrorRecord[];
  readonly totalCount: number;
  readonly isTruncated: boolean;
  readonly serializedJson: string;
  readonly serializedText: string;
  readonly capturedAt: string;
  readonly errorMessage?: string;
}

/**
 * Result of collecting and serializing network history.
 */
export interface NetworkCollectorResult {
  readonly success: boolean;
  readonly networkEvents: readonly NetworkEventRecord[];
  readonly failedRequestsCount: number;
  readonly totalCount: number;
  readonly isTruncated: boolean;
  readonly serializedJson: string;
  readonly capturedAt: string;
  readonly errorMessage?: string;
}

/**
 * Result of capturing a DOM snapshot.
 */
export interface DomCollectorResult {
  readonly success: boolean;
  readonly data?: DomSnapshotData;
  readonly serializedHtml?: string;
  readonly serializedJson?: string;
  readonly byteSize: number;
  readonly isTruncated: boolean;
  readonly capturedAt: string;
  readonly errorMessage?: string;
}

/**
 * Result of stopping and persisting a Playwright trace.
 */
export interface TraceCollectorResult {
  readonly success: boolean;
  readonly traceBuffer?: Buffer;
  readonly stagingPath?: string;
  readonly byteSize: number;
  readonly mimeType: 'application/zip';
  readonly originalLogicalName: string;
  readonly isRetained: boolean;
  readonly mode: TraceMode;
  readonly capturedAt: string;
  readonly errorMessage?: string;
}

/**
 * Complete set of evidence collected during an execution or step failure.
 */
export interface CollectedEvidencePayload {
  readonly screenshot?: ScreenshotCollectorResult;
  readonly console?: ConsoleCollectorResult;
  readonly network?: NetworkCollectorResult;
  readonly dom?: DomCollectorResult;
  readonly trace?: TraceCollectorResult;
  readonly failureContext?: {
    readonly stepIndex?: number;
    readonly actionType?: string;
    readonly errorMessage?: string;
    readonly failureTimestamp: string;
  };
}

/**
 * Screenshot collector interface.
 */
export interface IScreenshotCollector {
  captureFailureScreenshot(
    page: Page,
    options?: {
      readonly fullPage?: boolean;
      readonly maskSelectors?: readonly string[];
      readonly timeoutMs?: number;
    },
  ): Promise<ScreenshotCollectorResult>;

  captureStepScreenshot(
    page: Page,
    options?: {
      readonly fullPage?: boolean;
      readonly maskSelectors?: readonly string[];
      readonly timeoutMs?: number;
    },
  ): Promise<ScreenshotCollectorResult>;
}

/**
 * Console collector interface.
 */
export interface IConsoleCollector {
  attach(page: Page): void;
  attachContext(context: BrowserContext): void;
  detach(): void;
  getEvents(): readonly ConsoleEventRecord[];
  getPageErrors(): readonly PageErrorRecord[];
  clear(): void;
  serialize(): ConsoleCollectorResult;
}

/**
 * Network collector interface.
 */
export interface INetworkCollector {
  attach(page: Page): void;
  attachContext(context: BrowserContext): void;
  detach(): void;
  getEvents(): readonly NetworkEventRecord[];
  clear(): void;
  serialize(): NetworkCollectorResult;
}

/**
 * DOM snapshot collector interface.
 */
export interface IDomCollector {
  captureDomSnapshot(
    page: Page,
    options?: {
      readonly maxDomBytes?: number;
      readonly failedElementContext?: FailedElementContext;
      readonly timeoutMs?: number;
    },
  ): Promise<DomCollectorResult>;
}

/**
 * Playwright trace collector interface.
 */
export interface ITraceCollector {
  startTracing(
    context: BrowserContext,
    options?: {
      readonly mode?: TraceMode;
      readonly screenshots?: boolean;
      readonly snapshots?: boolean;
      readonly sources?: boolean;
    },
  ): Promise<void>;

  stopAndPersistTrace(
    context: BrowserContext,
    options: {
      readonly isFailed: boolean;
      readonly projectId: string;
      readonly testRunId: string;
      readonly executionId: string;
      readonly timeoutMs?: number;
    },
  ): Promise<TraceCollectorResult>;

  discardTrace(context: BrowserContext): Promise<void>;
}
