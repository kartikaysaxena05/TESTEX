/**
 * @file packages/core/src/execution/retry/retry-orchestrator-integration.test.ts
 * Integration tests for RunOrchestrator multi-attempt execution, attempt immutability, flakiness classification, and cooperative cancellation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { RunOrchestrator } from '../orchestration/run-orchestrator.js';
import type { PrismaClient } from '@prisma/client';
import type {
  IExecutionWorker,
  ExecutionWorkerResult,
} from '../orchestration/orchestration-types.js';

describe('RunOrchestrator — Retry, Flakiness Detection & Multi-Attempt Immutability', () => {
  let mockPrisma: any;
  let mockPersistence: any;
  let storedExecutions: any[] = [];
  let testRunRecord: any;

  const validProjectId = '00000000-0000-0000-0000-000000000001';
  const validRunId = '00000000-0000-0000-0000-000000000002';
  const validTestCaseId = '00000000-0000-0000-0000-000000000003';
  const validPlanId = '00000000-0000-0000-0000-000000000004';

  beforeEach(() => {
    storedExecutions = [];

    testRunRecord = {
      id: validRunId,
      projectId: validProjectId,
      testCaseId: validTestCaseId,
      testCaseVersionId: null,
      testCaseVersionNumber: 1,
      executableTestPlanId: validPlanId,
      environmentId: null,
      targetApplicationId: null,
      status: 'QUEUED',
      idempotencyKey: 'test-key-1',
      workerId: 'worker-1',
      leaseExpiresAt: null,
      heartbeatAt: null,
      queuedAt: new Date(),
      startedAt: null,
      completedAt: null,
      cancelRequestedAt: null,
      cancelledAt: null,
      terminalReason: null,
      errorMessage: null,
      executionDurationMs: null,
      planFingerprint: 'mock-fp',
      testCaseTitle: 'Search Workflow Test',
      environmentName: 'Staging',
      browserEngine: 'chromium',
      headless: true,
      timeoutMs: 30000,
      totalAttempts: 1,
      passedAfterRetry: false,
      reliabilityStatus: 'NOT_EVALUATED',
      diagnosticsJson: [],
      metadataJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma = {
      testRun: {
        findUnique: async ({ where }: any) => {
          if (where.id === validRunId) return { ...testRunRecord };
          return null;
        },
        findUniqueOrThrow: async ({ where }: any) => {
          if (where.id === validRunId) return { ...testRunRecord };
          throw new Error('Not found');
        },
        update: async ({ where: _where, data }: any) => {
          testRunRecord = { ...testRunRecord, ...data };
          return { ...testRunRecord };
        },
      },
      executableTestPlan: {
        findUnique: async () => ({
          id: validPlanId,
          projectId: validProjectId,
          testCaseId: validTestCaseId,
          isExecutable: true,
          status: 'COMPILED',
          stepsJson: [
            {
              id: 'step-1',
              sequence: 1,
              action: 'NAVIGATE',
              description: 'Open home page',
              isOptional: false,
              assertions: [],
            },
          ],
        }),
      },
      testCaseExecution: {
        findUnique: async ({ where }: any) => {
          if (where.testRunId_attempt) {
            return (
              storedExecutions.find(
                e =>
                  e.testRunId === where.testRunId_attempt.testRunId &&
                  e.attempt === where.testRunId_attempt.attempt,
              ) ?? null
            );
          }
          return null;
        },
        findMany: async () => [...storedExecutions],
      },
    };

    mockPersistence = {
      reconcileOrphanedExecutions: async () => ({ reconciledCount: 0 }),
      createExecution: async (input: any) => {
        const attempt = input.attempt ?? 1;
        const record = {
          id: `exec-id-${attempt}`,
          projectId: input.projectId,
          testRunId: input.testRunId,
          testCaseId: input.testCaseId,
          testCaseVersionId: input.testCaseVersionId ?? null,
          testCaseVersionNumber: input.testCaseVersionNumber ?? 1,
          executableTestPlanId: input.executableTestPlanId,
          environmentId: input.environmentId ?? null,
          attempt,
          status: 'RUNNING',
          passedAfterRetry: false,
          reliabilityStatus: 'NOT_EVALUATED',
          retryReason: null,
          retryEligibilityJson: {},
          startedAt: new Date().toISOString(),
          completedAt: null,
          durationMs: null,
          terminalReason: null,
          errorMessage: null,
          errorCode: null,
          browserEngine: 'chromium',
          environmentSnapshotJson: {},
          metadataJson: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          stepExecutions: [],
          stateTransitions: [],
        };
        storedExecutions.push(record);
        return record;
      },
      completeExecution: async (input: any) => {
        const found = storedExecutions.find(e => e.id === input.executionId);
        if (found) {
          found.status = input.status;
          found.completedAt = new Date().toISOString();
          found.durationMs = input.durationMs;
          found.terminalReason = input.terminalReason ?? null;
          found.errorMessage = input.errorMessage ?? null;
        }
        return found;
      },
      listExecutionAttempts: async () => [...storedExecutions],
    };
  });

  it('orchestrates Attempt 1 FAIL -> Attempt 2 PASS with immutable history and FLAKY_CANDIDATE classification', async () => {
    let attemptCounter = 0;

    const alternatingWorker: IExecutionWorker = {
      workerId: 'worker-1',
      execute: async (_run, _signal): Promise<ExecutionWorkerResult> => {
        attemptCounter++;
        if (attemptCounter === 1) {
          // Attempt 1 fails with transient timeout
          return {
            outcome: 'FAILED',
            errorMessage: 'Timeout 5000ms exceeded waiting for results',
            durationMs: 50,
          };
        }

        // Attempt 2 succeeds
        return {
          outcome: 'PASSED',
          terminalReason: 'Test steps executed successfully.',
          durationMs: 40,
        };
      },
    };

    const orchestrator = new RunOrchestrator(
      mockPrisma as unknown as PrismaClient,
      {
        workerId: 'worker-1',
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          retryDelayMs: 10,
          backoffMultiplier: 1.0,
        },
      },
      alternatingWorker,
      undefined,
      mockPersistence as any,
    );

    const result = await orchestrator.executeClaimedRun(testRunRecord);

    // 1. Final result is PASSED
    assert.equal(result.status, 'PASSED');
    assert.equal(result.totalAttempts, 2);
    assert.equal(result.passedAfterRetry, true);
    assert.equal(result.reliabilityStatus, 'FLAKY_CANDIDATE');

    // 2. Both attempts must be preserved in execution history (immutable attempt trail)
    assert.equal(storedExecutions.length, 2);
    assert.equal(storedExecutions[0].attempt, 1);
    assert.equal(storedExecutions[0].status, 'FAILED');
    assert.ok(storedExecutions[0].errorMessage.includes('Timeout 5000ms exceeded'));

    assert.equal(storedExecutions[1].attempt, 2);
    assert.equal(storedExecutions[1].status, 'PASSED');
  });

  it('orchestrates Attempt 1 BROWSER_CRASH -> Attempt 2 PASS with RECOVERED_RUNTIME classification', async () => {
    let attemptCounter = 0;

    const crashWorker: IExecutionWorker = {
      workerId: 'worker-1',
      execute: async (_run, _signal): Promise<ExecutionWorkerResult> => {
        attemptCounter++;
        if (attemptCounter === 1) {
          return {
            outcome: 'FAILED',
            errorCode: 'BROWSER_CRASH',
            errorMessage: 'Target page, context or browser has been closed',
            durationMs: 20,
          };
        }

        return {
          outcome: 'PASSED',
          terminalReason: 'Execution recovered on fresh session.',
          durationMs: 30,
        };
      },
    };

    const orchestrator = new RunOrchestrator(
      mockPrisma as unknown as PrismaClient,
      {
        workerId: 'worker-1',
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          retryDelayMs: 10,
        },
      },
      crashWorker,
      undefined,
      mockPersistence as any,
    );

    const result = await orchestrator.executeClaimedRun(testRunRecord);

    assert.equal(result.status, 'PASSED');
    assert.equal(result.totalAttempts, 2);
    assert.equal(result.passedAfterRetry, true);
    assert.equal(result.reliabilityStatus, 'RECOVERED_RUNTIME');
  });

  it('exhausts maxAttempts when all attempts fail and records STABLE failure', async () => {
    const alwaysFailWorker: IExecutionWorker = {
      workerId: 'worker-1',
      execute: async (_run, _signal): Promise<ExecutionWorkerResult> => ({
        outcome: 'FAILED',
        errorMessage: 'Network connection reset net::ERR_CONNECTION_RESET',
        durationMs: 20,
      }),
    };

    const orchestrator = new RunOrchestrator(
      mockPrisma as unknown as PrismaClient,
      {
        workerId: 'worker-1',
        retryPolicy: {
          enabled: true,
          maxAttempts: 3,
          retryDelayMs: 10,
          backoffMultiplier: 1.0,
        },
      },
      alwaysFailWorker,
      undefined,
      mockPersistence as any,
    );

    const result = await orchestrator.executeClaimedRun(testRunRecord);

    assert.equal(result.status, 'FAILED');
    assert.equal(result.totalAttempts, 3);
    assert.equal(result.passedAfterRetry, false);
    assert.equal(result.reliabilityStatus, 'STABLE');
    assert.equal(storedExecutions.length, 3);
  });
});
