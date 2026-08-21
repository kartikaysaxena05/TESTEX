import { getDatabaseManager } from '@ai-quality/core';
import type { DatabaseStatus } from '@ai-quality/contracts';

/**
 * Handle database status check requests from the renderer.
 * Returns a sanitized DatabaseStatus DTO without exposing credentials.
 */
export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const dbManager = getDatabaseManager();
  return dbManager.getStatus();
}
