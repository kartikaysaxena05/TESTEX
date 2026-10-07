/**
 * @file packages/core/src/patch/patch-proposal-contract.test.ts
 * Tests for contracts, Zod schemas, and DTO validation (V7 Phase 101).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defectPatchProposalDtoSchema,
  generatePatchProposalInputSchema,
  getPatchProposalInputSchema,
  listPatchProposalsInputSchema,
  patchProposalStatusSchema,
  patchRiskLevelSchema,
  structuredEditOperationSchema,
  withdrawPatchProposalInputSchema,
  DESKTOP_CHANNELS,
} from '@ai-quality/contracts';

describe('Limited AI Patch Generation Contracts & Schemas (Phase 101)', () => {
  it('validates all PatchProposalStatus enum values', () => {
    const validStatuses = ['PROPOSED', 'SUPERSEDED', 'REJECTED', 'WITHDRAWN'];
    for (const s of validStatuses) {
      assert.equal(patchProposalStatusSchema.parse(s), s);
    }
    assert.throws(() => patchProposalStatusSchema.parse('APPLIED'));
    assert.throws(() => patchProposalStatusSchema.parse('MERGED'));
  });

  it('validates all PatchRiskLevel enum values', () => {
    const validLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    for (const l of validLevels) {
      assert.equal(patchRiskLevelSchema.parse(l), l);
    }
    assert.throws(() => patchRiskLevelSchema.parse('UNKNOWN'));
  });

  it('validates structuredEditOperationSchema', () => {
    const validEdit = {
      filePath: 'src/utils/calc.ts',
      startLine: 10,
      endLine: 12,
      originalContent: 'return a > b;',
      replacementContent: 'return a >= b;',
      explanation: 'Fix boundary condition',
    };
    const parsed = structuredEditOperationSchema.parse(validEdit);
    assert.equal(parsed.filePath, 'src/utils/calc.ts');
    assert.equal(parsed.startLine, 10);
    assert.equal(parsed.endLine, 12);

    // Negative line numbers fail
    assert.throws(() =>
      structuredEditOperationSchema.parse({
        ...validEdit,
        startLine: -1,
      }),
    );
  });

  it('validates DefectPatchProposalDto schema', () => {
    const validProposal = {
      id: '00000000-0000-0000-0000-000000000001',
      projectId: '00000000-0000-0000-0000-000000000002',
      failureCaseId: '00000000-0000-0000-0000-000000000003',
      repositoryId: '00000000-0000-0000-0000-000000000004',
      quickFixAssessmentId: '00000000-0000-0000-0000-000000000005',
      defectLocalizationId: '00000000-0000-0000-0000-000000000006',
      rootCauseAnalysisId: null,

      repositoryRevision: 'a1b2c3d4e5f6',
      branchName: 'main',
      sourceFileSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      isDrifted: false,
      driftDetails: null,

      status: 'PROPOSED',
      riskLevel: 'LOW',
      proposalVersion: 1,
      supersededById: null,
      generationModel: 'local/patch-synthesizer-v1',
      generationPromptTokens: null,
      generationCompletionTokens: null,
      generationDurationMs: 45,

      targetFiles: ['src/validator.ts'],
      linesAdded: 1,
      linesRemoved: 1,
      totalChangedLines: 2,

      unifiedDiff: `--- a/src/validator.ts\n+++ b/src/validator.ts\n@@ -1,3 +1,3 @@\n-return a > b;\n+return a >= b;\n`,
      structuredEdits: [
        {
          filePath: 'src/validator.ts',
          startLine: 1,
          endLine: 1,
          originalContent: 'return a > b;',
          replacementContent: 'return a >= b;',
        },
      ],

      rationale: 'Fix boundary condition to include equality.',
      assumptions: ['Arguments are numbers'],
      uncertainties: [],
      riskFactors: [],
      evidenceReferences: ['FailureCase ID: 00000000-0000-0000-0000-000000000003'],
      testReferences: [
        {
          testCaseId: '00000000-0000-0000-0000-000000000007',
          testCaseKey: 'TC-101',
          testTitle: 'Boundary Age Test',
          relevance: 'Verifies age boundary of 18',
          failedAssertion: 'Expected true, got false',
        },
      ],
      traceabilityJson: {},
      isReadOnlyProposal: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = defectPatchProposalDtoSchema.parse(validProposal);
    assert.equal(parsed.id, validProposal.id);
    assert.equal(parsed.isReadOnlyProposal, true);
    assert.equal(parsed.status, 'PROPOSED');
    assert.equal(parsed.targetFiles.length, 1);
  });

  it('validates IPC channel mappings', () => {
    assert.equal(DESKTOP_CHANNELS.PATCH_PROPOSAL_GENERATE, 'desktop:patch-proposals:generate');
    assert.equal(DESKTOP_CHANNELS.PATCH_PROPOSAL_GET, 'desktop:patch-proposals:get');
    assert.equal(DESKTOP_CHANNELS.PATCH_PROPOSAL_LIST, 'desktop:patch-proposals:list');
    assert.equal(DESKTOP_CHANNELS.PATCH_PROPOSAL_WITHDRAW, 'desktop:patch-proposals:withdraw');
  });

  it('validates input schemas', () => {
    const validGenerate = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      userGuidance: 'Fix edge case',
      forceRegenerate: true,
    };
    const parsedGen = generatePatchProposalInputSchema.parse(validGenerate);
    assert.equal(parsedGen.projectId, validGenerate.projectId);
    assert.equal(parsedGen.forceRegenerate, true);

    const validWithdraw = {
      projectId: '00000000-0000-0000-0000-000000000001',
      proposalId: '00000000-0000-0000-0000-000000000002',
      reason: 'Superseded by manual fix',
    };
    const parsedWith = withdrawPatchProposalInputSchema.parse(validWithdraw);
    assert.equal(parsedWith.reason, 'Superseded by manual fix');

    const validGet = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      proposalId: '00000000-0000-0000-0000-000000000003',
    };
    const parsedGet = getPatchProposalInputSchema.parse(validGet);
    assert.equal(parsedGet.proposalId, validGet.proposalId);

    const validList = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
    };
    const parsedList = listPatchProposalsInputSchema.parse(validList);
    assert.equal(parsedList.failureCaseId, validList.failureCaseId);
  });
});
