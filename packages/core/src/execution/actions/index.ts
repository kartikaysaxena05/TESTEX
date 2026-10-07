/**
 * @file packages/core/src/execution/actions/index.ts
 * Public exports for the Action Execution Engine (V5 Phase 63).
 */

export * from './action-types.js';
export * from './action-errors.js';
export * from './locator-resolver.js';
export * from './action-handler-registry.js';
export * from './action-execution-service.js';
export * from './action-handlers/base-action-handler.js';
export * from './action-handlers/navigate-action-handler.js';
export * from './action-handlers/click-action-handler.js';
export * from './action-handlers/fill-action-handler.js';
export * from './action-handlers/press-key-action-handler.js';
export * from './action-handlers/select-option-action-handler.js';
export * from './action-handlers/check-action-handler.js';
export * from './action-handlers/hover-action-handler.js';
export * from './action-handlers/focus-blur-action-handler.js';
export * from './action-handlers/scroll-action-handler.js';
export * from './action-handlers/scroll-into-view-action-handler.js';
export * from './action-handlers/wait-action-handler.js';
export * from './action-handlers/upload-action-handler.js';
export * from './action-handlers/drag-and-drop-action-handler.js';
export * from './action-handlers/history-action-handler.js';

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../../logging/index.js';
import type { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import { ActionExecutionService } from './action-execution-service.js';

let defaultActionExecutionService: ActionExecutionService | null = null;

export function getActionExecutionService(
  prisma: PrismaClient,
  sessionManager: BrowserSessionManager,
  logger?: ILogger,
): ActionExecutionService {
  if (!defaultActionExecutionService) {
    defaultActionExecutionService = new ActionExecutionService(
      prisma,
      sessionManager,
      undefined,
      logger,
    );
  }
  return defaultActionExecutionService;
}
