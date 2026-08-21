/**
 * @file packages/core/src/database/health.ts
 * Lightweight PostgreSQL health verification via Prisma ORM.
 */

import type { PrismaClient } from '@prisma/client';

export interface DatabaseHealthResult {
  readonly ok: boolean;
  readonly latencyMs?: number;
  readonly serverVersion?: string;
  readonly databaseName?: string;
  readonly error?: string;
}

/**
 * Executes a deterministic health check query against the provided Prisma client.
 * Uses safe parameterized template literal ($queryRaw`SELECT 1 AS ok`) and measures latency.
 */
export async function checkDatabaseHealth(
  prisma: PrismaClient,
  databaseName?: string,
): Promise<DatabaseHealthResult> {
  const startTime = performance.now();

  try {
    // 1. Run safe health check query
    const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    const isOk = Array.isArray(rows) && rows.length > 0 && rows[0]?.ok === 1;

    if (!isOk) {
      return {
        ok: false,
        error: 'Unexpected query response from health check.',
      };
    }

    // 2. Query server version
    let serverVersion: string | undefined;
    try {
      const versionRows = await prisma.$queryRaw<
        Array<{ server_version: string }>
      >`SHOW server_version`;
      serverVersion = versionRows[0]?.server_version;
    } catch {
      // Non-critical; fallback gracefully
    }

    const latencyMs = Math.round(performance.now() - startTime);

    return {
      ok: true,
      latencyMs,
      serverVersion,
      databaseName,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Database connection error';
    return {
      ok: false,
      error: errorMessage,
    };
  }
}
