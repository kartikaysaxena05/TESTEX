/**
 * @file packages/core/src/execution/persistence/index.ts
 * Public exports and singleton factory for Execution Persistence & Step-Level Audit Trail.
 */

import type { PrismaClient } from '@prisma/client';
import { ExecutionPersistenceService } from './execution-persistence-service.js';
import type { ILogger } from '../../logging/index.js';

export * from './execution-persistence-types.js';
export * from './execution-persistence-errors.js';
export * from './execution-persistence-service.js';

let instance: ExecutionPersistenceService | null = null;

export function getExecutionPersistenceService(
  prisma: PrismaClient,
  logger?: ILogger,
): ExecutionPersistenceService {
  if (!instance) {
    instance = new ExecutionPersistenceService({ prisma, logger });
  }
  return instance;
}

export function resetExecutionPersistenceService(): void {
  instance = null;
}
