/**
 * @file packages/core/src/execution/sessions/index.ts
 * Module entry point and factories for Browser Sessions and Authentication Management.
 */

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../../logging/index.js';
import { StorageStateManager } from './storage-state-manager.js';
import { AuthLoginHandler } from './auth-login-handler.js';
import { BrowserSessionManager } from './browser-session-manager.js';
import { AuthProfileService } from './auth-profile-service.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';

export * from './session-types.js';
export * from './session-errors.js';
export * from './secret-redactor.js';
export * from './storage-state-manager.js';
export * from './auth-login-handler.js';
export * from './browser-session-manager.js';
export * from './auth-profile-service.js';

let cachedAuthProfileService: AuthProfileService | null = null;
let cachedBrowserSessionManager: BrowserSessionManager | null = null;

export function getBrowserSessionManager(
  prisma: PrismaClient,
  logger?: ILogger,
): BrowserSessionManager {
  if (!cachedBrowserSessionManager) {
    const browserProvider = new PlaywrightBrowserProvider(logger);
    const storageManager = new StorageStateManager(undefined, logger);
    const authHandler = new AuthLoginHandler(undefined, logger);
    cachedBrowserSessionManager = new BrowserSessionManager(
      prisma,
      browserProvider,
      authHandler,
      storageManager,
      logger,
    );
  }
  return cachedBrowserSessionManager;
}

export function getAuthProfileService(prisma: PrismaClient, logger?: ILogger): AuthProfileService {
  if (!cachedAuthProfileService) {
    const storageManager = new StorageStateManager(undefined, logger);
    const sessionManager = getBrowserSessionManager(prisma, logger);
    cachedAuthProfileService = new AuthProfileService(
      prisma,
      storageManager,
      sessionManager,
      logger,
    );
  }
  return cachedAuthProfileService;
}
