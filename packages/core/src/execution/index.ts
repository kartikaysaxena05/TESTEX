/**
 * @file packages/core/src/execution/index.ts
 * Public exports for the Autonomous Test Execution Domain & Playwright Runtime Foundation.
 */

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../logging/index.js';
import { TestExecutionService } from './test-execution-service.js';
import { PlaywrightBrowserProvider } from './browser-provider.js';
import { ExecutionRuntimeRegistry } from './runtime-registry.js';
import { ActionExecutionService } from './actions/action-execution-service.js';
import type { BrowserSessionManager } from './sessions/browser-session-manager.js';

export * from './execution-types.js';
export * from './execution-errors.js';
export * from './browser-provider.js';
export * from './runtime-registry.js';
export * from './test-eligibility-validator.js';
export * from './test-execution-service.js';
export * from './compiler/index.js';
export * from './orchestration/index.js';
export * from './sessions/index.js';
export * from './actions/index.js';
export * from './locators/index.js';
export * from './synchronization/index.js';
export * from './assertions/index.js';
export * from './persistence/index.js';
export * from './evidence/index.js';
export * from './retry/index.js';
export * from './healing/index.js';
export * from './parallel/index.js';

let sharedRegistry: ExecutionRuntimeRegistry | null = null;
let sharedBrowserProvider: PlaywrightBrowserProvider | null = null;
let sharedExecutionService: TestExecutionService | null = null;
let sharedActionExecutionService: ActionExecutionService | null = null;

/**
 * Returns the shared singleton runtime registry instance.
 */
export function getExecutionRuntimeRegistry(logger?: ILogger): ExecutionRuntimeRegistry {
  if (!sharedRegistry) {
    sharedRegistry = new ExecutionRuntimeRegistry(logger);
  }
  return sharedRegistry;
}

/**
 * Returns the shared singleton browser runtime provider.
 */
export function getBrowserRuntimeProvider(logger?: ILogger): PlaywrightBrowserProvider {
  if (!sharedBrowserProvider) {
    sharedBrowserProvider = new PlaywrightBrowserProvider(logger);
  }
  return sharedBrowserProvider;
}

/**
 * Returns the shared singleton test execution service.
 */
export function getTestExecutionService(
  prisma: PrismaClient,
  logger?: ILogger,
): TestExecutionService {
  if (!sharedExecutionService) {
    const registry = getExecutionRuntimeRegistry(logger);
    const provider = getBrowserRuntimeProvider(logger);
    sharedExecutionService = new TestExecutionService({
      prisma,
      logger,
      browserProvider: provider,
      runtimeRegistry: registry,
    });
  }
  return sharedExecutionService;
}

/**
 * Returns the shared singleton action execution service.
 */
export function getActionExecutionService(
  prisma: PrismaClient,
  sessionManager: BrowserSessionManager,
  logger?: ILogger,
): ActionExecutionService {
  if (!sharedActionExecutionService) {
    sharedActionExecutionService = new ActionExecutionService(
      prisma,
      sessionManager,
      undefined,
      logger,
    );
  }
  return sharedActionExecutionService;
}
