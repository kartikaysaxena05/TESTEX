/**
 * @file packages/core/src/execution/locators/index.ts
 * Public entrypoint and factory for the UI Element Resolution & Locator Intelligence layer (V5 Phase 64).
 */

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../../logging/logger-types.js';
import { getBrowserSessionManager } from '../sessions/index.js';
import { LocatorResolutionService } from './locator-resolution-service.js';

export * from './locator-types.js';
export * from './locator-errors.js';
export * from './locator-target-validator.js';
export * from './scope-resolver.js';
export * from './locator-strategy-resolver.js';
export * from './locator-resolution-service.js';

let locatorResolutionServiceInstance: LocatorResolutionService | null = null;

export function getLocatorResolutionService(
  prisma: PrismaClient,
  logger?: ILogger,
): LocatorResolutionService {
  if (!locatorResolutionServiceInstance) {
    const sessionManager = getBrowserSessionManager(prisma, logger);
    locatorResolutionServiceInstance = new LocatorResolutionService({
      prisma,
      sessionManager,
      logger,
    });
  }
  return locatorResolutionServiceInstance;
}

export function resetLocatorResolutionService(): void {
  locatorResolutionServiceInstance = null;
}
