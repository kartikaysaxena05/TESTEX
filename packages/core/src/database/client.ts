/**
 * @file packages/core/src/database/client.ts
 * Managed PrismaClient singleton and lifecycle manager.
 */

import { PrismaClient } from '@prisma/client';
import { loadDatabaseConfig } from './config.js';

let prismaInstance: PrismaClient | null = null;
let isDisconnecting = false;

/**
 * Returns the process-level singleton PrismaClient instance.
 * Returns null if DATABASE_URL is unconfigured.
 */
export function getPrismaClient(): PrismaClient | null {
  if (isDisconnecting) {
    return null;
  }

  if (prismaInstance) {
    return prismaInstance;
  }

  const config = loadDatabaseConfig();
  if (!config.isConfigured || !config.connectionString) {
    return null;
  }

  prismaInstance = new PrismaClient({
    datasourceUrl: config.connectionString,
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

  return prismaInstance;
}

/**
 * Idempotently disconnects the singleton PrismaClient instance during application quit.
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (isDisconnecting || !prismaInstance) {
    return;
  }

  isDisconnecting = true;
  const clientToDisconnect = prismaInstance;
  prismaInstance = null;

  try {
    await clientToDisconnect.$disconnect();
  } catch (err) {
    console.warn('[Database] Error during Prisma disconnect:', err);
  } finally {
    isDisconnecting = false;
  }
}
