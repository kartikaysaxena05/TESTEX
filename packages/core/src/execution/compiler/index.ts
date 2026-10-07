/**
 * @file packages/core/src/execution/compiler/index.ts
 * Public exports for the Structured Test-to-Executable Plan Compiler.
 */

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../../logging/index.js';
import { ExecutablePlanService } from './executable-plan-service.js';

export * from './compiler-types.js';
export * from './compiler-errors.js';
export * from './step-action-parser.js';
export * from './assertion-parser.js';
export * from './precondition-classifier.js';
export * from './test-plan-compiler.js';
export * from './executable-plan-service.js';

let sharedExecutablePlanService: ExecutablePlanService | null = null;

/**
 * Returns the shared singleton instance of the ExecutablePlanService.
 */
export function getExecutablePlanService(
  prisma: PrismaClient,
  logger?: ILogger,
): ExecutablePlanService {
  if (!sharedExecutablePlanService) {
    sharedExecutablePlanService = new ExecutablePlanService(prisma, undefined, logger);
  }
  return sharedExecutablePlanService;
}
