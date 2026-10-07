/**
 * @file packages/core/src/execution/evidence/evidence-capture-coordinator.ts
 * Central coordinator orchestrating concrete browser evidence collectors during test execution.
 */

import type { BrowserContext, Page } from 'playwright';
import type {
  EvidenceCollectorConfigDto,
  ExecutionEvidenceBundleDto,
  ExecutionEvidenceArtifactDto,
} from '@ai-quality/contracts';
import {
  type IScreenshotCollector,
  type IConsoleCollector,
  type INetworkCollector,
  type IDomCollector,
  type ITraceCollector,
  type FailedElementContext,
  COLLECTOR_BOUNDS,
} from './collectors/collector-types.js';
import { ScreenshotCollector } from './collectors/screenshot-collector.js';
import { ConsoleCollector } from './collectors/console-collector.js';
import { NetworkCollector } from './collectors/network-collector.js';
import { DomCollector } from './collectors/dom-collector.js';
import { TraceCollector } from './collectors/trace-collector.js';
import { ExecutionEvidenceService } from './execution-evidence-service.js';
import type { ILogger } from '../../logging/index.js';

export interface EvidenceCaptureCoordinatorOptions {
  readonly evidenceService: ExecutionEvidenceService;
  readonly config?: Partial<EvidenceCollectorConfigDto>;
  readonly screenshotCollector?: IScreenshotCollector;
  readonly consoleCollector?: IConsoleCollector;
  readonly networkCollector?: INetworkCollector;
  readonly domCollector?: IDomCollector;
  readonly traceCollector?: ITraceCollector;
  readonly logger?: ILogger;
}

export class EvidenceCaptureCoordinator {
  private readonly evidenceService: ExecutionEvidenceService;
  public readonly config: EvidenceCollectorConfigDto;
  private readonly screenshotCollector: IScreenshotCollector;
  private readonly consoleCollector: IConsoleCollector;
  private readonly networkCollector: INetworkCollector;
  private readonly domCollector: IDomCollector;
  private readonly traceCollector: ITraceCollector;
  private readonly logger?: ILogger;

  private isInitialized = false;

  constructor(options: EvidenceCaptureCoordinatorOptions) {
    this.evidenceService = options.evidenceService;
    this.logger = options.logger;

    this.config = {
      captureFailureScreenshot: options.config?.captureFailureScreenshot ?? true,
      captureStepScreenshot: options.config?.captureStepScreenshot ?? false,
      captureConsole: options.config?.captureConsole ?? true,
      captureNetwork: options.config?.captureNetwork ?? true,
      captureDom: options.config?.captureDom ?? true,
      traceMode: options.config?.traceMode ?? 'FAILURE_ONLY',
      fullPageScreenshot: options.config?.fullPageScreenshot ?? false,
      maxConsoleEvents:
        options.config?.maxConsoleEvents ?? COLLECTOR_BOUNDS.DEFAULT_MAX_CONSOLE_EVENTS,
      maxNetworkEvents:
        options.config?.maxNetworkEvents ?? COLLECTOR_BOUNDS.DEFAULT_MAX_NETWORK_EVENTS,
      maxBodyBytes: options.config?.maxBodyBytes ?? COLLECTOR_BOUNDS.DEFAULT_MAX_BODY_BYTES,
      maxDomBytes: options.config?.maxDomBytes ?? COLLECTOR_BOUNDS.DEFAULT_MAX_DOM_BYTES,
      maskSensitiveFields: options.config?.maskSensitiveFields ?? true,
      maskSelectors: options.config?.maskSelectors ?? [
        'input[type="password"]',
        'input[autocomplete*="password"]',
        'input[autocomplete*="cc-"]',
        'input[name*="password" i]',
        'input[name*="token" i]',
        'input[name*="secret" i]',
        'input[name*="apiKey" i]',
        '[data-sensitive="true"]',
      ],
      collectorTimeoutMs:
        options.config?.collectorTimeoutMs ?? COLLECTOR_BOUNDS.DEFAULT_COLLECTOR_TIMEOUT_MS,
    };

    this.screenshotCollector =
      options.screenshotCollector ??
      new ScreenshotCollector({
        logger: this.logger,
        defaultMaskSelectors: this.config.maskSelectors,
      });

    this.consoleCollector =
      options.consoleCollector ??
      new ConsoleCollector({
        maxEvents: this.config.maxConsoleEvents,
        logger: this.logger,
      });

    this.networkCollector =
      options.networkCollector ??
      new NetworkCollector({
        maxEvents: this.config.maxNetworkEvents,
        maxBodyBytes: this.config.maxBodyBytes,
        logger: this.logger,
      });

    this.domCollector =
      options.domCollector ??
      new DomCollector({
        maxDomBytes: this.config.maxDomBytes,
        logger: this.logger,
      });

    this.traceCollector =
      options.traceCollector ??
      new TraceCollector({
        defaultMode: this.config.traceMode,
        logger: this.logger,
      });
  }

  /**
   * Initializes collectors and attaches listeners to the Playwright browser session.
   */
  public async initializeSession(params: {
    readonly context: BrowserContext;
    readonly page: Page;
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
  }): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    try {
      // 1. Attach Console & Network event monitoring
      this.consoleCollector.attachContext(params.context);
      this.networkCollector.attachContext(params.context);

      // 2. Start Playwright Tracing if configured
      if (this.config.traceMode !== 'OFF') {
        await this.traceCollector.startTracing(params.context, {
          mode: this.config.traceMode,
          screenshots: true,
          snapshots: true,
          sources: false,
        });
      }

      this.logger?.debug('evidence_coordinator.initialized', {
        projectId: params.projectId,
        testRunId: params.testRunId,
        executionId: params.executionId,
        traceMode: this.config.traceMode,
      });
    } catch (err) {
      this.logger?.warn('evidence_coordinator.init_failed', { error: String(err) });
    }
  }

  /**
   * Captures failure evidence across all active collectors and stores into an authoritative evidence bundle.
   * Invariant: Evidence capture failure NEVER modifies or overwrites the execution status.
   */
  public async captureFailureEvidence(params: {
    readonly page: Page;
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly stepExecutionId?: string;
    readonly stepIndex?: number;
    readonly attempt?: number;
    readonly errorSummary?: string;
    readonly failedElementContext?: FailedElementContext;
    readonly failureTimestamp?: string;
  }): Promise<ExecutionEvidenceBundleDto | null> {
    const failureTime = params.failureTimestamp ?? new Date().toISOString();

    let bundle: ExecutionEvidenceBundleDto | null = null;
    let hadCollectorFailure = false;

    try {
      // 1. Create durable Evidence Bundle
      bundle = await this.evidenceService.createBundle({
        projectId: params.projectId,
        testRunId: params.testRunId,
        executionId: params.executionId,
        stepExecutionId: params.stepExecutionId,
        stepIndex: params.stepIndex,
        attempt: params.attempt ?? 1,
        failureTimestamp: failureTime,
        errorSummary: params.errorSummary?.slice(0, 4000),
      });

      // 2. Collect from all collectors in parallel with defensive error handling
      const tasks: Promise<void>[] = [];

      // A. Screenshot Collector
      if (this.config.captureFailureScreenshot && params.page) {
        tasks.push(
          (async () => {
            try {
              const res = await this.screenshotCollector.captureFailureScreenshot(params.page, {
                fullPage: this.config.fullPageScreenshot,
                maskSelectors: this.config.maskSelectors,
                timeoutMs: this.config.collectorTimeoutMs,
              });

              if (res.success && res.buffer && bundle) {
                await this.evidenceService.addArtifact({
                  projectId: params.projectId,
                  bundleId: bundle.id,
                  testRunId: params.testRunId,
                  executionId: params.executionId,
                  stepExecutionId: params.stepExecutionId,
                  artifactType: 'SCREENSHOT',
                  mimeType: res.mimeType,
                  originalLogicalName: 'failure_screenshot.png',
                  content: new Uint8Array(res.buffer),
                  metadataJson: {
                    width: res.width,
                    height: res.height,
                    pageUrl: res.pageUrl,
                    isFullPage: res.isFullPage,
                    isMasked: res.isMasked,
                  },
                  capturedAt: res.capturedAt,
                });
              } else if (!res.success) {
                hadCollectorFailure = true;
                this.logger?.warn('evidence_coordinator.screenshot_failed', {
                  error: res.errorMessage,
                });
              }
            } catch (e) {
              hadCollectorFailure = true;
              this.logger?.warn('evidence_coordinator.screenshot_error', { error: String(e) });
            }
          })(),
        );
      }

      // B. Console Collector
      if (this.config.captureConsole) {
        tasks.push(
          (async () => {
            try {
              const res = this.consoleCollector.serialize();
              if (res.success && res.totalCount > 0 && bundle) {
                await this.evidenceService.addArtifact({
                  projectId: params.projectId,
                  bundleId: bundle.id,
                  testRunId: params.testRunId,
                  executionId: params.executionId,
                  stepExecutionId: params.stepExecutionId,
                  artifactType: 'CONSOLE_LOG',
                  mimeType: 'application/json',
                  originalLogicalName: 'browser_console.json',
                  content: res.serializedJson,
                  metadataJson: {
                    totalCount: res.totalCount,
                    isTruncated: res.isTruncated,
                    pageErrorsCount: res.pageErrors.length,
                    consoleEventsCount: res.consoleEvents.length,
                  },
                  capturedAt: res.capturedAt,
                });
              }
            } catch (e) {
              hadCollectorFailure = true;
              this.logger?.warn('evidence_coordinator.console_error', { error: String(e) });
            }
          })(),
        );
      }

      // C. Network Collector
      if (this.config.captureNetwork) {
        tasks.push(
          (async () => {
            try {
              const res = this.networkCollector.serialize();
              if (res.success && res.totalCount > 0 && bundle) {
                await this.evidenceService.addArtifact({
                  projectId: params.projectId,
                  bundleId: bundle.id,
                  testRunId: params.testRunId,
                  executionId: params.executionId,
                  stepExecutionId: params.stepExecutionId,
                  artifactType: 'NETWORK_LOG',
                  mimeType: 'application/json',
                  originalLogicalName: 'network_events.json',
                  content: res.serializedJson,
                  metadataJson: {
                    totalCount: res.totalCount,
                    failedRequestsCount: res.failedRequestsCount,
                    isTruncated: res.isTruncated,
                  },
                  capturedAt: res.capturedAt,
                });
              }
            } catch (e) {
              hadCollectorFailure = true;
              this.logger?.warn('evidence_coordinator.network_error', { error: String(e) });
            }
          })(),
        );
      }

      // D. DOM Snapshot Collector
      if (this.config.captureDom && params.page) {
        tasks.push(
          (async () => {
            try {
              const res = await this.domCollector.captureDomSnapshot(params.page, {
                maxDomBytes: this.config.maxDomBytes,
                failedElementContext: params.failedElementContext,
                timeoutMs: this.config.collectorTimeoutMs,
              });

              if (res.success && res.serializedHtml && bundle) {
                await this.evidenceService.addArtifact({
                  projectId: params.projectId,
                  bundleId: bundle.id,
                  testRunId: params.testRunId,
                  executionId: params.executionId,
                  stepExecutionId: params.stepExecutionId,
                  artifactType: 'DOM_SNAPSHOT',
                  mimeType: 'text/html',
                  originalLogicalName: 'dom_snapshot.html',
                  content: res.serializedHtml,
                  metadataJson: {
                    title: res.data?.title,
                    url: res.data?.url,
                    viewport: res.data?.viewport,
                    isTruncated: res.isTruncated,
                    originalByteSize: res.data?.originalByteSize,
                    activeElement: res.data?.activeElement,
                    failedElementContext: res.data?.failedElementContext,
                  },
                  capturedAt: res.capturedAt,
                });
              } else if (!res.success) {
                hadCollectorFailure = true;
                this.logger?.warn('evidence_coordinator.dom_failed', { error: res.errorMessage });
              }
            } catch (e) {
              hadCollectorFailure = true;
              this.logger?.warn('evidence_coordinator.dom_error', { error: String(e) });
            }
          })(),
        );
      }

      // E. Playwright Trace Collector
      if (this.config.traceMode !== 'OFF' && params.page) {
        tasks.push(
          (async () => {
            try {
              const res = await this.traceCollector.stopAndPersistTrace(params.page.context(), {
                isFailed: true,
                projectId: params.projectId,
                testRunId: params.testRunId,
                executionId: params.executionId,
                timeoutMs: this.config.collectorTimeoutMs,
              });

              if (res.success && res.isRetained && res.traceBuffer && bundle) {
                await this.evidenceService.addArtifact({
                  projectId: params.projectId,
                  bundleId: bundle.id,
                  testRunId: params.testRunId,
                  executionId: params.executionId,
                  stepExecutionId: params.stepExecutionId,
                  artifactType: 'PLAYWRIGHT_TRACE',
                  mimeType: 'application/zip',
                  originalLogicalName: 'playwright-trace.zip',
                  content: new Uint8Array(res.traceBuffer),
                  metadataJson: {
                    mode: res.mode,
                    byteSize: res.byteSize,
                  },
                  capturedAt: res.capturedAt,
                });
              } else if (!res.success) {
                hadCollectorFailure = true;
                this.logger?.warn('evidence_coordinator.trace_failed', {
                  error: res.errorMessage,
                });
              }
            } catch (e) {
              hadCollectorFailure = true;
              this.logger?.warn('evidence_coordinator.trace_error', { error: String(e) });
            }
          })(),
        );
      }

      // Wait for all collector tasks to settle
      await Promise.allSettled(tasks);

      // 3. Finalize Bundle with COMPLETE or PARTIAL status
      const finalStatus = hadCollectorFailure ? 'PARTIAL' : 'COMPLETE';
      bundle = await this.evidenceService.finalizeBundle({
        projectId: params.projectId,
        bundleId: bundle.id,
        status: finalStatus,
        errorSummary: params.errorSummary,
      });

      return bundle;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger?.error('evidence_coordinator.capture_failed', {
        projectId: params.projectId,
        testRunId: params.testRunId,
        error: errorMessage,
      });

      if (bundle) {
        try {
          bundle = await this.evidenceService.finalizeBundle({
            projectId: params.projectId,
            bundleId: bundle.id,
            status: 'FAILED',
            errorSummary: `Evidence capture encountered error: ${errorMessage.slice(0, 500)}`,
          });
        } catch {
          // Ignored
        }
      }

      return bundle;
    }
  }

  /**
   * Finalizes Playwright tracing at execution conclusion, saving artifact if retained.
   */
  public async finalizeSessionTrace(params: {
    readonly context: BrowserContext;
    readonly projectId: string;
    readonly testRunId: string;
    readonly executionId: string;
    readonly isFailed: boolean;
    readonly bundleId?: string;
  }): Promise<ExecutionEvidenceArtifactDto | null> {
    try {
      const res = await this.traceCollector.stopAndPersistTrace(params.context, {
        isFailed: params.isFailed,
        projectId: params.projectId,
        testRunId: params.testRunId,
        executionId: params.executionId,
        timeoutMs: this.config.collectorTimeoutMs,
      });

      if (!res.success || !res.isRetained || !res.traceBuffer) {
        return null;
      }

      let targetBundleId = params.bundleId;

      if (targetBundleId) {
        try {
          const bundle = await this.evidenceService.getBundle({
            projectId: params.projectId,
            bundleId: targetBundleId,
          });
          if (bundle.status !== 'PENDING' && bundle.status !== 'COLLECTING') {
            targetBundleId = undefined;
          }
        } catch {
          targetBundleId = undefined;
        }
      }

      if (!targetBundleId) {
        const traceBundle = await this.evidenceService.createBundle({
          projectId: params.projectId,
          testRunId: params.testRunId,
          executionId: params.executionId,
          errorSummary: params.isFailed ? 'Playwright execution trace' : undefined,
        });
        targetBundleId = traceBundle.id;
      }

      const artifact = await this.evidenceService.addArtifact({
        projectId: params.projectId,
        bundleId: targetBundleId,
        testRunId: params.testRunId,
        executionId: params.executionId,
        artifactType: 'PLAYWRIGHT_TRACE',
        mimeType: 'application/zip',
        originalLogicalName: 'playwright-trace.zip',
        content: new Uint8Array(res.traceBuffer),
        metadataJson: {
          mode: res.mode,
          byteSize: res.byteSize,
        },
        capturedAt: res.capturedAt,
      });

      if (!params.bundleId || targetBundleId !== params.bundleId) {
        await this.evidenceService.finalizeBundle({
          projectId: params.projectId,
          bundleId: targetBundleId,
          status: 'COMPLETE',
        });
      }

      return artifact;
    } catch (err: unknown) {
      this.logger?.warn('evidence_coordinator.trace_finalize_failed', {
        error: String(err),
      });
      return null;
    }
  }

  /**
   * Detaches listeners and clears in-memory state.
   */
  public dispose(): void {
    this.consoleCollector.detach();
    this.networkCollector.detach();
    this.consoleCollector.clear();
    this.networkCollector.clear();
    this.isInitialized = false;
  }
}
