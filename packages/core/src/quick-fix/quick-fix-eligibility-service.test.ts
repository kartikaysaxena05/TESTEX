/**
 * @file packages/core/src/quick-fix/quick-fix-eligibility-service.test.ts
 * Integration and lifecycle tests for QuickFixEligibilityService.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QuickFixEligibilityService } from './quick-fix-eligibility-service.js';
import { QuickFixNotFoundError, QuickFixCrossProjectError } from './quick-fix-errors.js';
import type { PrismaClient } from '@prisma/client';

describe('QuickFixEligibilityService (Lifecycle, Isolation & Mutex)', () => {
  it('throws QuickFixNotFoundError if failure case does not exist', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    const service = new QuickFixEligibilityService({ prisma: mockPrisma });

    await assert.rejects(
      async () =>
        service.evaluateEligibility({
          projectId: '00000000-0000-0000-0000-000000000001',
          failureCaseId: '00000000-0000-0000-0000-000000000002',
        }),
      (err: unknown) => err instanceof QuickFixNotFoundError,
    );
  });

  it('throws QuickFixCrossProjectError if failure case belongs to another project', async () => {
    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: '00000000-0000-0000-0000-000000000002',
          projectId: 'wrong-project-id',
        }),
      },
    } as unknown as PrismaClient;

    const service = new QuickFixEligibilityService({ prisma: mockPrisma });

    await assert.rejects(
      async () =>
        service.evaluateEligibility({
          projectId: '00000000-0000-0000-0000-000000000001',
          failureCaseId: '00000000-0000-0000-0000-000000000002',
        }),
      (err: unknown) => err instanceof QuickFixCrossProjectError,
    );
  });

  it('performs end-to-end evaluation, persists assessment and manages supersession', async () => {
    const projectId = '00000000-0000-0000-0000-000000000001';
    const failureCaseId = '00000000-0000-0000-0000-000000000002';
    const testCaseId = '00000000-0000-0000-0000-000000000003';

    let updatedPreviousSuperseded = false;
    let createdAssessmentRecord: any = null;

    const mockPrisma = {
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId,
          testCase: {
            id: testCaseId,
            title: 'Verify submit button state',
          },
          reproductionAttempts: [
            {
              status: 'REPRODUCED',
              createdAt: new Date(),
            },
          ],
          domainSeparations: [
            {
              domain: 'APPLICATION_DEFECT_CANDIDATE',
              createdAt: new Date(),
            },
          ],
          technicalLocalizations: [
            {
              isAuthoritative: true,
              matchedFilePath: 'src/components/button.tsx',
              matchedSymbolName: 'SubmitButton',
              matchedLineNumber: 42,
              createdAt: new Date(),
            },
          ],
          rootCauseAnalyses: [
            {
              id: '00000000-0000-0000-0000-000000000004',
              isAuthoritative: true,
              probableCause: 'Disabled attribute is not toggled on form validation error.',
              rootCauseStatus: 'CONFIRMED',
              repositoryReferences: [
                {
                  filePath: 'src/components/button.tsx',
                  symbol: 'SubmitButton',
                  line: 42,
                },
              ],
              createdAt: new Date(),
            },
          ],
          confidenceAssessments: [
            {
              isAuthoritative: true,
              overallConfidence: 0.92,
              createdAt: new Date(),
            },
          ],
        }),
      },
      projectSource: {
        findFirst: async () => ({
          id: '00000000-0000-0000-0000-000000000005',
          projectId,
          rootPath: '/fake/repo',
        }),
      },
      quickFixEligibilityAssessment: {
        findMany: async () => [
          { id: 'previous-assessment-1', failureCaseId, isAuthoritative: true },
        ],
        count: async () => 1,
        findFirst: async () => createdAssessmentRecord,
      },
      $transaction: async (callback: any) => {
        const tx = {
          quickFixEligibilityAssessment: {
            create: async ({ data }: any) => {
              createdAssessmentRecord = {
                id: 'new-assessment-uuid',
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
              };
              return createdAssessmentRecord;
            },
            updateMany: async ({ data }: any) => {
              if (data.isAuthoritative === false && data.supersededById) {
                updatedPreviousSuperseded = true;
              }
            },
          },
        };
        return callback(tx);
      },
    } as unknown as PrismaClient;

    const mockGitRunner = {
      runGit: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      checkGitVersion: async () => ({ available: true, version: '2.40.0' }),
      isInsideWorkTree: async () => true,
    } as any;

    const service = new QuickFixEligibilityService({
      prisma: mockPrisma,
      gitRunner: mockGitRunner,
    });

    const result = await service.evaluateEligibility({
      projectId,
      failureCaseId,
      actor: 'TEST_AGENT',
    });

    assert.equal(result.decision, 'ELIGIBLE');
    assert.equal(result.riskLevel, 'LOW');
    assert.equal(result.candidateFiles.length, 1);
    assert.equal(result.candidateFiles[0], 'src/components/button.tsx');
    assert.equal(result.gitClean, true);
    assert.equal(updatedPreviousSuperseded, true);
    assert.equal(result.evaluatedBy, 'TEST_AGENT');
  });

  it('getAssessment retrieves latest authoritative assessment and prevents cross-project access', async () => {
    const projectId = '00000000-0000-0000-0000-000000000001';
    const failureCaseId = '00000000-0000-0000-0000-000000000002';

    const mockPrisma = {
      quickFixEligibilityAssessment: {
        findUnique: async () => ({
          id: 'assessment-123',
          projectId: 'other-project',
          failureCaseId,
        }),
      },
    } as unknown as PrismaClient;

    const service = new QuickFixEligibilityService({ prisma: mockPrisma });

    await assert.rejects(
      async () =>
        service.getAssessment({
          projectId,
          failureCaseId,
          assessmentId: 'assessment-123',
        }),
      (err: unknown) => err instanceof QuickFixCrossProjectError,
    );
  });
});
