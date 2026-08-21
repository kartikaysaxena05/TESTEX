/**
 * @file packages/core/src/database/database.ts
 * Unified Database Manager and Lifecycle Orchestrator backed by Prisma ORM.
 */

import type { PrismaClient } from '@prisma/client';
import type { DatabaseStatus } from '@ai-quality/contracts';
import { loadDatabaseConfig, type DatabaseConfig } from './config.js';
import { getPrismaClient, disconnectPrismaClient } from './client.js';
import { checkDatabaseHealth } from './health.js';

export class DatabaseManager {
  private config: DatabaseConfig | null = null;

  /**
   * Returns current configuration, reloading if not yet initialized.
   */
  public getConfig(): DatabaseConfig {
    if (!this.config) {
      this.config = loadDatabaseConfig();
    }
    return this.config;
  }

  /**
   * Resets internal configuration cache.
   */
  public reloadConfig(): void {
    this.config = loadDatabaseConfig();
    void this.close();
  }

  /**
   * Returns the process-level singleton PrismaClient instance.
   */
  public getClient(): PrismaClient | null {
    return getPrismaClient();
  }

  /**
   * Checks database connectivity and returns a sanitized status object for IPC / UI consumption.
   * MUST NEVER leak database password or raw connection string.
   */
  public async getStatus(): Promise<DatabaseStatus> {
    const cfg = this.getConfig();

    if (!cfg.isConfigured) {
      return {
        status: 'not-configured',
      };
    }

    const prisma = this.getClient();
    if (!prisma) {
      return {
        status: 'unavailable',
        databaseName: cfg.databaseName,
      };
    }

    const health = await checkDatabaseHealth(prisma, cfg.databaseName);

    if (!health.ok) {
      return {
        status: 'unavailable',
        databaseName: cfg.databaseName,
      };
    }

    return {
      status: 'connected',
      latencyMs: health.latencyMs,
      serverVersion: health.serverVersion,
      databaseName: health.databaseName,
    };
  }

  /**
   * Idempotently disconnects the Prisma client during application shutdown.
   */
  public async close(): Promise<void> {
    await disconnectPrismaClient();
  }
}

// Global process-level singleton instance
let instance: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!instance) {
    instance = new DatabaseManager();
  }
  return instance;
}

export async function closeDatabaseManager(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
