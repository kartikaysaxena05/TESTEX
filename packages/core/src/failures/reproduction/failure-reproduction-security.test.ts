/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-security.test.ts
 * Security and multi-tenant isolation tests for Failure Reproduction (V6 Phase 76).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FailureReproductionService } from './failure-reproduction-service.js';
import { FailureCaseNotFoundError } from '../failure-errors.js';
import { ReproductionEnvironmentIncompatibleError } from './failure-reproduction-errors.js';

describe('Failure Reproduction Security Isolation (Phase 76)', () => {
  it('prevents cross-project reproduction access when project ID mismatches', async () => {
    const mockPrisma = {
      failureCase: {
        findFirst: async (args: any) => {
          // Failure case belongs to project-A, but query requested project-B
          if (args.where.projectId === '00000000-0000-0000-0000-00000000000b') {
            return null;
          }
          return {
            id: '00000000-0000-0000-0000-000000000001',
            projectId: '00000000-0000-0000-0000-00000000000a',
          };
        },
      },
    };

    const service = new FailureReproductionService({ prisma: mockPrisma as any });

    await assert.rejects(
      async () =>
        service.executeReproduction({
          projectId: '00000000-0000-0000-0000-00000000000b',
          failureCaseId: '00000000-0000-0000-0000-000000000001',
        }),
      (err: any) => {
        assert.ok(err instanceof FailureCaseNotFoundError);
        assert.equal(err.code, 'FAILURE_CASE_NOT_FOUND');
        return true;
      },
    );
  });

  it('rejects target environment that belongs to a different project', async () => {
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
        findFirst: async () => ({
          id: '00000000-0000-0000-0000-0000000000ee',
          projectId: '00000000-0000-0000-0000-0000000000aa',
          stepExecutions: [],
          assertionExecutionRecords: [],
        }),
      },
      projectEnvironment: {
        findFirst: async (args: any) => {
          // Returns null because target environment is in another project
          if (args.where.projectId !== '00000000-0000-0000-0000-0000000000aa') {
            return null;
          }
          return null;
        },
      },
    };

    const service = new FailureReproductionService({ prisma: mockPrisma as any });

    await assert.rejects(
      async () =>
        service.executeReproduction({
          projectId: '00000000-0000-0000-0000-0000000000aa',
          failureCaseId: '00000000-0000-0000-0000-000000000001',
          targetEnvironmentId: '00000000-0000-0000-0000-0000000000bb',
        }),
      (err: any) => {
        assert.ok(err instanceof ReproductionEnvironmentIncompatibleError);
        assert.equal(err.code, 'REPRODUCTION_ENVIRONMENT_INCOMPATIBLE');
        return true;
      },
    );
  });

  it('rejects reproduction attempts when failure case ID does not exist', async () => {
    const mockPrisma = {
      failureCase: {
        findFirst: async () => null,
      },
    };

    const service = new FailureReproductionService({ prisma: mockPrisma as any });

    await assert.rejects(
      async () =>
        service.executeReproduction({
          projectId: '00000000-0000-0000-0000-0000000000aa',
          failureCaseId: '00000000-0000-0000-0000-000000000099',
        }),
      (err: any) => {
        assert.ok(err instanceof FailureCaseNotFoundError);
        return true;
      },
    );
  });
});
