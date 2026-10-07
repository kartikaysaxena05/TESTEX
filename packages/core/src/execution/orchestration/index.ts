/**
 * @file packages/core/src/execution/orchestration/index.ts
 * Module entry point for Test Run Orchestration, Queue, State Machine & Cancellation.
 */

import type { PrismaClient } from '@prisma/client';
import type { ILogger } from '../../logging/index.js';
import { RunQueue } from './run-queue.js';
import { RunOrchestrator } from './run-orchestrator.js';
import { TestRunService } from './test-run-service.js';

export * from './orchestration-types.js';
export * from './orchestration-errors.js';
export * from './run-state-machine.js';
export * from './run-queue.js';
export * from './run-orchestrator.js';
export * from './test-run-service.js';

let defaultTestRunService: TestRunService | null = null;

export function getTestRunService(prisma: PrismaClient, logger?: ILogger): TestRunService {
  if (!defaultTestRunService) {
    const queue = new RunQueue(prisma, undefined, logger);
    const orchestrator = new RunOrchestrator(prisma, undefined, undefined, logger);
    defaultTestRunService = new TestRunService({
      prisma,
      queue,
      orchestrator,
      logger,
    });
  }
  return defaultTestRunService;
}

export function resetTestRunServiceForTest(): void {
  defaultTestRunService = null;
}
