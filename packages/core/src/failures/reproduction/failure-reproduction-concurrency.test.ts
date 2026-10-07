/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-concurrency.test.ts
 * Concurrency, race condition, and cancellation tests for FailureReproductionService (V6 Phase 76).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FailureReproductionService } from './failure-reproduction-service.js';
import { ReproductionAlreadyInProgressError } from './failure-reproduction-errors.js';

describe('Failure Reproduction Concurrency & Cancellation (Phase 76)', () => {
  it('prevents concurrent reproduction on the same failure case', async () => {
    let releaseHold: () => void;
    const holdPromise = new Promise<void>(resolve => {
      releaseHold = resolve;
    });

    const mockPrisma = {
      failureCase: {
        findFirst: async () => ({
          id: '00000000-0000-0000-0000-000000000001',
          projectId: '00000000-0000-0000-0000-0000000000aa',
          executionId: '00000000-0000-0000-0000-0000000000ee',
          testCaseId: '00000000-0000-0000-0000-0000000000cc',
          testCaseVersionNumber: 1,
        }),
      },
      testCaseExecution: {
        findFirst: async () => {
          // Wait on the holdPromise to simulate a long-running execution
          await holdPromise;
          return {
            id: '00000000-0000-0000-0000-0000000000ee',
            projectId: '00000000-0000-0000-0000-0000000000aa',
            stepExecutions: [],
            assertionExecutionRecords: [],
          };
        },
      },
      testCaseVersion: {
        findFirst: async () => ({
          id: '00000000-0000-0000-0000-0000000000vv',
          versionNumber: 1,
          title: 'Concurrent Test Case',
          testCaseId: '00000000-0000-0000-0000-0000000000cc',
          steps: [{ id: 's1', stepNumber: 1, action: 'navigate to "/hold"' }],
        }),
      },
      failureReproductionAttempt: {
        findFirst: async () => null,
      },
      failureCaseSummary: {
        findMany: async () => [],
      },
    };

    const service = new FailureReproductionService({ prisma: mockPrisma as any });

    // Launch first execution in background
    const run1 = service.executeReproduction({
      projectId: '00000000-0000-0000-0000-0000000000aa',
      failureCaseId: '00000000-0000-0000-0000-000000000001',
    });

    // Give run1 a tick to register in activeRuns
    await new Promise(r => setTimeout(r, 10));

    // Second execution on SAME failureCaseId must reject immediately
    await assert.rejects(
      async () =>
        service.executeReproduction({
          projectId: '00000000-0000-0000-0000-0000000000aa',
          failureCaseId: '00000000-0000-0000-0000-000000000001',
        }),
      (err: any) => {
        assert.ok(err instanceof ReproductionAlreadyInProgressError);
        assert.equal(err.code, 'REPRODUCTION_ALREADY_IN_PROGRESS');
        return true;
      },
    );

    // Cancel / unblock run1
    const cancelRes = await service.cancelReproduction({
      projectId: '00000000-0000-0000-0000-0000000000aa',
      failureCaseId: '00000000-0000-0000-0000-000000000001',
    });
    assert.equal(cancelRes.cancelled, true);

    releaseHold!();
    try {
      await run1;
    } catch {
      // Expected to abort/cancel
    }
  });
});
