/**
 * @file packages/core/src/patch/patch-proposal-service.test.ts
 * Integration, lifecycle, and isolation tests for PatchProposalService.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { PatchProposalService } from './patch-proposal-service.js';
import { PatchProposalCrossProjectError, PatchProposalValidationError } from './patch-errors.js';
import type { PatchContext, PatchGenerationEngineResult } from './patch-types.js';

describe('PatchProposalService (Lifecycle, Isolation, & Snapshot Pinning)', () => {
  const projectId = '00000000-0000-0000-0000-000000000001';
  const failureCaseId = '00000000-0000-0000-0000-000000000002';
  const proposalId = '00000000-0000-0000-0000-000000000003';

  it('validates mandatory inputs', async () => {
    const service = new PatchProposalService({ prisma: {} as any });
    await assert.rejects(
      async () => service.generateProposal({ projectId: '', failureCaseId: '' }),
      (err: unknown) => err instanceof PatchProposalValidationError,
    );
  });

  it('generates, pins snapshot, and persists new patch proposal', async () => {
    let createdRecord: any = null;
    let supersededCount = 0;

    const mockPrisma = {
      defectPatchProposal: {
        findFirst: async () => null,
        findMany: async () => [],
        create: async ({ data }: any) => {
          createdRecord = {
            id: proposalId,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return createdRecord;
        },
        updateMany: async () => {
          supersededCount++;
        },
      },
      $transaction: async (fn: any) =>
        fn({
          defectPatchProposal: {
            updateMany: async () => {
              supersededCount++;
            },
            create: async ({ data }: any) => {
              createdRecord = {
                id: proposalId,
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              return createdRecord;
            },
          },
        }),
    } as unknown as PrismaClient;

    const mockContext: PatchContext = {
      projectId,
      failureCaseId,
      repositoryId: '00000000-0000-0000-0000-000000000004',
      workspaceRoot: '/mock/workspace',
      repositoryRevision: 'c0ffee1234567890',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: {
        id: '00000000-0000-0000-0000-000000000005',
        eligibility: 'ELIGIBLE',
        safetyPolicy: '1.0.0',
        riskLevel: 'LOW',
        reasons: ['Single line fix'],
        suggestedActions: [],
      },
      defectLocalization: {
        id: '00000000-0000-0000-0000-000000000006',
        candidateFiles: ['src/validator.ts'],
        topCandidateFilePath: 'src/validator.ts',
        rankedCandidates: [],
        repositoryRevision: 'c0ffee1234567890',
        isDrifted: false,
      },
      failureCase: {
        id: failureCaseId,
        title: 'Age validation fails for boundary 18',
        errorMessage: 'Expected true, got false',
        testCaseId: '00000000-0000-0000-0000-000000000007',
      },
      snippets: [
        {
          filePath: 'src/validator.ts',
          content: 'return age > 18;',
          sha256: 'sha256-original-hash',
          totalLines: 10,
          startLine: 1,
          endLine: 10,
        },
      ],
    };

    const mockContextBuilder = {
      buildContext: async () => mockContext,
    };

    const mockEngineResult: PatchGenerationEngineResult = {
      targetFiles: ['src/validator.ts'],
      primaryFilePath: 'src/validator.ts',
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,
      unifiedDiff:
        '--- a/src/validator.ts\n+++ b/src/validator.ts\n@@ -1,1 +1,1 @@\n-return age > 18;\n+return age >= 18;\n',
      structuredEdits: [
        {
          filePath: 'src/validator.ts',
          startLine: 1,
          endLine: 1,
          originalContent: 'return age > 18;',
          replacementContent: 'return age >= 18;',
        },
      ],
      rationale: 'Fix boundary condition for age 18',
      expectedBehaviorChange: 'Accepts 18 as valid age',
      assumptions: ['Age is integer'],
      riskFactors: [],
      uncertainties: [],
      riskLevel: 'LOW',
      evidenceReferences: ['FailureCase ID: 1'],
      testReferences: [
        {
          testCaseId: '00000000-0000-0000-0000-000000000007',
          testTitle: 'Boundary Age Test',
          relevance: 'Verifies fix',
        },
      ],
      modelProvider: 'test-synthesizer',
      modelName: 'patch-v1',
      promptVersion: '1.0.0',
      patchFingerprint: 'fingerprint-123',
      durationMs: 50,
    };

    const mockGenerator = {
      generatePatch: async () => mockEngineResult,
    };

    const service = new PatchProposalService({
      prisma: mockPrisma,
      contextBuilder: mockContextBuilder as any,
      generator: mockGenerator as any,
    });

    const proposal = await service.generateProposal({
      projectId,
      failureCaseId,
    });

    assert.equal(proposal.id, proposalId);
    assert.equal(proposal.status, 'PROPOSED');
    assert.equal(proposal.riskLevel, 'LOW');
    assert.equal(proposal.proposalVersion, 1);
    assert.equal(proposal.repositoryRevision, 'c0ffee1234567890');
    assert.equal(proposal.sourceFileSha256, 'sha256-original-hash');
    assert.equal(proposal.isReadOnlyProposal, true);
    assert.equal(proposal.linesAdded, 1);
    assert.equal(proposal.linesRemoved, 1);
    assert.equal(proposal.totalChangedLines, 2);
    assert.equal(supersededCount, 0);
  });

  it('manages proposal supersession when regenerating', async () => {
    const existingActive = {
      id: 'existing-prop-id',
      projectId,
      failureCaseId,
      proposalVersion: 1,
      isAuthoritative: true,
      status: 'PROPOSED',
    };

    let updatedMany = false;

    const mockPrisma = {
      defectPatchProposal: {
        findFirst: async () => null,
        findMany: async () => [existingActive],
      },
      $transaction: async (fn: any) =>
        fn({
          defectPatchProposal: {
            updateMany: async () => {
              updatedMany = true;
            },
            create: async ({ data }: any) => ({
              id: 'prop-v2',
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
        }),
    } as unknown as PrismaClient;

    const mockContext: any = {
      projectId,
      failureCaseId,
      repositoryId: null,
      repositoryRevision: 'rev-2',
      branchName: 'main',
      isDrifted: false,
      quickFixAssessment: { id: 'qf-1' },
      defectLocalization: { id: 'loc-1' },
      rootCauseAnalysis: null,
      snippets: [],
    };

    const mockEngineResult: any = {
      targetFiles: ['src/validator.ts'],
      primaryFilePath: 'src/validator.ts',
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,
      unifiedDiff: 'diff',
      structuredEdits: [],
      rationale: 'v2',
      expectedBehaviorChange: 'v2',
      assumptions: [],
      riskFactors: [],
      uncertainties: [],
      riskLevel: 'LOW',
      evidenceReferences: [],
      testReferences: [],
      modelProvider: 'test',
      modelName: 'test',
      promptVersion: '1.0.0',
      patchFingerprint: 'fp-2',
      durationMs: 10,
    };

    const service = new PatchProposalService({
      prisma: mockPrisma,
      contextBuilder: { buildContext: async () => mockContext } as any,
      generator: { generatePatch: async () => mockEngineResult } as any,
    });

    const proposal = await service.generateProposal({
      projectId,
      failureCaseId,
      forceRegenerate: true,
    });

    assert.equal(proposal.proposalVersion, 2);
    assert.equal(updatedMany, true);
  });

  it('withdraws a proposal and verifies project isolation', async () => {
    let updatedRecord: any = null;

    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async ({ where }: any) => {
          if (where.id === proposalId) {
            return {
              id: proposalId,
              projectId,
              failureCaseId,
              status: 'PROPOSED',
              isAuthoritative: true,
              repositoryRevision: 'rev-1',
              targetFiles: ['src/a.ts'],
              linesAddedCount: 1,
              linesRemovedCount: 1,
              totalChangedLinesCount: 2,
              unifiedDiff: 'diff',
              rationale: 'test',
              assumptions: [],
              uncertainties: [],
              riskFactors: [],
              modelProvider: 'm',
              modelName: 'm',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return null;
        },
        update: async ({ data }: any) => {
          updatedRecord = {
            id: proposalId,
            projectId,
            failureCaseId,
            status: data.status,
            isAuthoritative: data.isAuthoritative,
            repositoryRevision: 'rev-1',
            targetFiles: ['src/a.ts'],
            linesAddedCount: 1,
            linesRemovedCount: 1,
            totalChangedLinesCount: 2,
            unifiedDiff: 'diff',
            rationale: 'test',
            assumptions: [],
            uncertainties: [],
            riskFactors: [],
            modelProvider: 'm',
            modelName: 'm',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return updatedRecord;
        },
      },
    } as unknown as PrismaClient;

    const service = new PatchProposalService({ prisma: mockPrisma });

    // 1. Cross project withdraw attempt is rejected
    await assert.rejects(
      async () =>
        service.withdrawProposal({
          projectId: 'other-project-id',
          proposalId,
          reason: 'test reason',
        }),
      (err: unknown) => err instanceof PatchProposalCrossProjectError,
    );

    // 2. Authorized withdraw succeeds
    const withdrawn = await service.withdrawProposal({
      projectId,
      proposalId,
      reason: 'No longer needed',
    });

    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.equal(updatedRecord.status, 'WITHDRAWN');
    assert.equal(updatedRecord.isAuthoritative, false);
  });

  it('rejects cross-project retrieval and listing', async () => {
    const mockPrisma = {
      defectPatchProposal: {
        findUnique: async () => ({
          id: proposalId,
          projectId: 'project-A',
        }),
      },
      failureCase: {
        findUnique: async () => ({
          id: failureCaseId,
          projectId: 'project-A',
        }),
      },
    } as unknown as PrismaClient;

    const service = new PatchProposalService({ prisma: mockPrisma });

    // Get proposal with wrong project
    await assert.rejects(
      async () =>
        service.getProposal({
          projectId: 'project-B',
          failureCaseId,
          proposalId,
        }),
      (err: unknown) => err instanceof PatchProposalCrossProjectError,
    );

    // List proposals with wrong project
    await assert.rejects(
      async () =>
        service.listProposals({
          projectId: 'project-B',
          failureCaseId,
        }),
      (err: unknown) => err instanceof PatchProposalCrossProjectError,
    );
  });
});
