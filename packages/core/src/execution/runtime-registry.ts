/**
 * @file packages/core/src/execution/runtime-registry.ts
 * Centralized active runtime execution registry with leak prevention and cleanup idempotency.
 */

import type { IExecutionContext } from './execution-types.js';
import type { ILogger } from '../logging/index.js';

export class ExecutionRuntimeRegistry {
  private readonly activeContexts = new Map<string, IExecutionContext>();
  private readonly logger?: ILogger;
  private isShuttingDown = false;
  private hasInstalledProcessHooks = false;

  constructor(logger?: ILogger) {
    this.logger = logger;
    this.installProcessHooks();
  }

  /**
   * Installs graceful process exit handlers to prevent zombie browser processes.
   */
  private installProcessHooks(): void {
    if (this.hasInstalledProcessHooks) return;
    this.hasInstalledProcessHooks = true;

    const cleanupHandler = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      try {
        await this.cleanupAll();
      } catch {
        // Ignore during process exit
      }
    };

    process.once('beforeExit', () => {
      void cleanupHandler();
    });
  }

  /**
   * Registers an active execution context for lifecycle tracking.
   */
  public register(context: IExecutionContext): void {
    this.activeContexts.set(context.executionId, context);
    this.logger?.debug('runtime_registry.context_registered', {
      executionId: context.executionId,
      activeCount: this.activeContexts.size,
    });
  }

  /**
   * Retrieves an active execution context by ID.
   */
  public get(executionId: string): IExecutionContext | undefined {
    return this.activeContexts.get(executionId);
  }

  /**
   * Lists all currently tracked active execution contexts.
   */
  public list(): readonly IExecutionContext[] {
    return Array.from(this.activeContexts.values());
  }

  /**
   * Returns the count of active executions.
   */
  public getActiveCount(): number {
    return this.activeContexts.size;
  }

  /**
   * Idempotently cleans up an execution context and its underlying browser resources.
   */
  public async cleanup(executionId: string): Promise<void> {
    const context = this.activeContexts.get(executionId);
    if (!context) {
      // Already cleaned or never existed (idempotent)
      return;
    }

    this.activeContexts.delete(executionId);

    try {
      await context.close();
      this.logger?.debug('runtime_registry.context_cleaned', {
        executionId,
        remainingActiveCount: this.activeContexts.size,
      });
    } catch (err) {
      this.logger?.warn('runtime_registry.cleanup_warning', {
        executionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Cleans up all active execution contexts across the entire runtime.
   */
  public async cleanupAll(): Promise<void> {
    const contexts = Array.from(this.activeContexts.values());
    this.activeContexts.clear();

    await Promise.allSettled(
      contexts.map(async ctx => {
        try {
          await ctx.close();
        } catch {
          // Best effort cleanup
        }
      }),
    );

    this.logger?.debug('runtime_registry.cleanup_all_completed', {
      cleanedCount: contexts.length,
    });
  }
}
