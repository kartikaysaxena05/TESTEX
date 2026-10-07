/**
 * @file apps/desktop/src/main/ipc/patch-proposal-handlers.test.ts
 * Main process IPC handler tests for Limited AI Patch Generation (V7 Phase 101).
 * Verifies untrusted sender rejection, frame validation, schema parsing, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGeneratePatchProposal,
  handleGetPatchProposal,
  handleListPatchProposals,
  handleWithdrawPatchProposal,
  setPatchProposalService,
} from './patch-proposal-handlers.js';
import {
  PatchProposalCrossProjectError,
  PatchProposalIneligibleError,
  PatchProposalLocalizationRequiredError,
  PatchProposalNotFoundError,
  PatchProposalOversizedError,
} from '@ai-quality/core';
import type { DefectPatchProposalDto } from '@ai-quality/contracts';

describe('Patch Proposal IPC Handlers (Phase 101)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://attacker.site/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validProposalId = '33333333-3333-3333-3333-333333333333';

  const mockProposalDto: DefectPatchProposalDto = {
    id: validProposalId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    repositoryRevision: 'abcdef1234567890',
    isDrifted: false,
    status: 'PROPOSED',
    riskLevel: 'LOW',
    proposalVersion: 1,
    generationModel: 'test-model',
    targetFiles: ['src/validator.ts'],
    linesAdded: 1,
    linesRemoved: 1,
    totalChangedLines: 2,
    unifiedDiff: '--- a/src/validator.ts\n+++ b/src/validator.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n',
    structuredEdits: [
      {
        filePath: 'src/validator.ts',
        startLine: 1,
        endLine: 1,
        originalContent: 'old',
        replacementContent: 'new',
      },
    ],
    rationale: 'Fix test defect',
    assumptions: [],
    uncertainties: [],
    riskFactors: [],
    evidenceReferences: [],
    testReferences: [],
    isReadOnlyProposal: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setPatchProposalService(null);
  });

  it('rejects untrusted sender in handleGeneratePatchProposal', async () => {
    const res = await handleGeneratePatchProposal(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates schema inputs and returns VALIDATION_ERROR on malformed input', async () => {
    const res = await handleGeneratePatchProposal(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: 'also-not-a-uuid',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('executes handleGeneratePatchProposal successfully with trusted sender', async () => {
    const mockService = {
      generateProposal: async () => mockProposalDto,
    };
    setPatchProposalService(mockService as any);

    const res = await handleGeneratePatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validProposalId);
      assert.equal(res.data.status, 'PROPOSED');
      assert.equal(res.data.isReadOnlyProposal, true);
    }
  });

  it('maps PatchProposalIneligibleError to PATCH_INELIGIBLE error code', async () => {
    const mockService = {
      generateProposal: async () => {
        throw new PatchProposalIneligibleError('Defect is ineligible.');
      },
    };
    setPatchProposalService(mockService as any);

    const res = await handleGeneratePatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_INELIGIBLE');
      assert.equal(res.error.message, 'Defect is ineligible.');
    }
  });

  it('maps PatchProposalLocalizationRequiredError to PATCH_LOCALIZATION_REQUIRED', async () => {
    const mockService = {
      generateProposal: async () => {
        throw new PatchProposalLocalizationRequiredError('Localization needed.');
      },
    };
    setPatchProposalService(mockService as any);

    const res = await handleGeneratePatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_LOCALIZATION_REQUIRED');
    }
  });

  it('maps PatchProposalCrossProjectError to PATCH_CROSS_PROJECT', async () => {
    const mockService = {
      getProposal: async () => {
        throw new PatchProposalCrossProjectError('Cross project forbidden.');
      },
    };
    setPatchProposalService(mockService as any);

    const res = await handleGetPatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      proposalId: validProposalId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_CROSS_PROJECT');
    }
  });

  it('maps PatchProposalOversizedError to PATCH_OVERSIZED', async () => {
    const mockService = {
      generateProposal: async () => {
        throw new PatchProposalOversizedError('Exceeds limits.');
      },
    };
    setPatchProposalService(mockService as any);

    const res = await handleGeneratePatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PATCH_OVERSIZED');
    }
  });

  it('handles get, list, and withdraw operations', async () => {
    const mockService = {
      getProposal: async () => mockProposalDto,
      listProposals: async () => [mockProposalDto],
      withdrawProposal: async () => ({
        ...mockProposalDto,
        status: 'WITHDRAWN',
      }),
    };
    setPatchProposalService(mockService as any);

    const getRes = await handleGetPatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(getRes.ok, true);

    const listRes = await handleListPatchProposals(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(listRes.ok, true);
    if (listRes.ok) {
      assert.equal(listRes.data.length, 1);
    }

    const withRes = await handleWithdrawPatchProposal(fakeTrustedEvent, {
      projectId: validProjectId,
      proposalId: validProposalId,
      reason: 'No longer needed',
    });
    assert.equal(withRes.ok, true);
    if (withRes.ok) {
      assert.equal(withRes.data.status, 'WITHDRAWN');
    }
  });
});
