/**
 * @file packages/core/src/execution/evidence/collectors/trace-collector.ts
 * Playwright trace lifecycle manager with selective retention and crash resilience.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import type { BrowserContext } from 'playwright';
import {
  type ITraceCollector,
  type TraceCollectorResult,
  type TraceMode,
  COLLECTOR_BOUNDS,
} from './collector-types.js';
import type { ILogger } from '../../../logging/index.js';

export interface TraceCollectorOptions {
  readonly stagingDir?: string;
  readonly defaultMode?: TraceMode;
  readonly logger?: ILogger;
}

interface ContextTraceState {
  readonly mode: TraceMode;
  readonly stagingPath: string;
  isTracing: boolean;
}

export class TraceCollector implements ITraceCollector {
  private readonly stagingDir: string;
  private readonly defaultMode: TraceMode;
  private readonly logger?: ILogger;

  private readonly contextStates: Map<BrowserContext, ContextTraceState> = new Map();

  constructor(options?: TraceCollectorOptions) {
    this.stagingDir = options?.stagingDir ?? path.join(os.tmpdir(), 'ai-quality-traces', 'staging');
    this.defaultMode = options?.defaultMode ?? 'FAILURE_ONLY';
    this.logger = options?.logger;
  }

  /**
   * Starts Playwright tracing on a BrowserContext according to the specified trace mode.
   */
  public async startTracing(
    context: BrowserContext,
    options?: {
      readonly mode?: TraceMode;
      readonly screenshots?: boolean;
      readonly snapshots?: boolean;
      readonly sources?: boolean;
    },
  ): Promise<void> {
    const mode = options?.mode ?? this.defaultMode;

    if (!context || mode === 'OFF') {
      this.contextStates.set(context, {
        mode: 'OFF',
        stagingPath: '',
        isTracing: false,
      });
      return;
    }

    try {
      await fs.mkdir(this.stagingDir, { recursive: true });
      const traceToken = crypto.randomUUID();
      const stagingPath = path.join(this.stagingDir, `trace_${traceToken}.zip`);

      await context.tracing.start({
        screenshots: options?.screenshots ?? true,
        snapshots: options?.snapshots ?? true,
        sources: options?.sources ?? false,
      });

      this.contextStates.set(context, {
        mode,
        stagingPath,
        isTracing: true,
      });

      this.logger?.debug('trace_collector.started', { mode, stagingPath });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger?.warn('trace_collector.start_failed', { error: errorMessage });
      this.contextStates.set(context, {
        mode,
        stagingPath: '',
        isTracing: false,
      });
    }
  }

  /**
   * Stops tracing and persists trace artifact based on the configured mode and execution outcome.
   */
  public async stopAndPersistTrace(
    context: BrowserContext,
    options: {
      readonly isFailed: boolean;
      readonly projectId: string;
      readonly testRunId: string;
      readonly executionId: string;
      readonly timeoutMs?: number;
    },
  ): Promise<TraceCollectorResult> {
    const capturedAt = new Date().toISOString();
    const state = this.contextStates.get(context);

    if (!state || !state.isTracing || state.mode === 'OFF') {
      return {
        success: true,
        byteSize: 0,
        mimeType: 'application/zip',
        originalLogicalName: 'playwright-trace.zip',
        isRetained: false,
        mode: state?.mode ?? 'OFF',
        capturedAt,
      };
    }

    state.isTracing = false;
    const shouldRetain =
      state.mode === 'ALWAYS' || (state.mode === 'FAILURE_ONLY' && options.isFailed);

    if (!shouldRetain) {
      // Discard trace cleanly
      try {
        await context.tracing.stop();
      } catch {
        // Ignored
      }
      return {
        success: true,
        byteSize: 0,
        mimeType: 'application/zip',
        originalLogicalName: 'playwright-trace.zip',
        isRetained: false,
        mode: state.mode,
        capturedAt,
      };
    }

    // Retain trace and flush to staging path
    const stagingPath = state.stagingPath;
    try {
      const timeoutMs = options.timeoutMs ?? COLLECTOR_BOUNDS.DEFAULT_COLLECTOR_TIMEOUT_MS;

      const stopPromise = context.tracing.stop({ path: stagingPath });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Trace stop timed out after ${timeoutMs}ms`)), timeoutMs),
      );

      await Promise.race([stopPromise, timeoutPromise]);

      const stat = await fs.stat(stagingPath);
      const traceBuffer = await fs.readFile(stagingPath);

      this.logger?.debug('trace_collector.retained', {
        stagingPath,
        byteSize: stat.size,
        mode: state.mode,
      });

      return {
        success: true,
        traceBuffer,
        stagingPath,
        byteSize: stat.size,
        mimeType: 'application/zip',
        originalLogicalName: 'playwright-trace.zip',
        isRetained: true,
        mode: state.mode,
        capturedAt,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger?.warn('trace_collector.stop_failed', { error: errorMessage });

      return {
        success: false,
        byteSize: 0,
        mimeType: 'application/zip',
        originalLogicalName: 'playwright-trace.zip',
        isRetained: false,
        mode: state.mode,
        capturedAt,
        errorMessage: `Playwright trace collection failed: ${errorMessage}`,
      };
    } finally {
      // Clean up temporary staging file from disk if it was read
      if (stagingPath) {
        try {
          await fs.unlink(stagingPath);
        } catch {
          // Ignored
        }
      }
      this.contextStates.delete(context);
    }
  }

  /**
   * Discards active tracing without saving artifacts.
   */
  public async discardTrace(context: BrowserContext): Promise<void> {
    const state = this.contextStates.get(context);
    if (!state || !state.isTracing) {
      return;
    }

    state.isTracing = false;
    try {
      await context.tracing.stop();
    } catch {
      // Ignored
    }

    if (state.stagingPath) {
      try {
        await fs.unlink(state.stagingPath);
      } catch {
        // Ignored
      }
    }

    this.contextStates.delete(context);
  }
}
