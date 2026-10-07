/**
 * @file apps/desktop/src/main/ipc/defect-localization-handlers.test.ts
 * Main process IPC handler tests for Repository-Aware Defect Localization (V7 Phase 100).
 * Verifies untrusted sender rejection, frame validation, schema parsing, and domain error sanitization.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetDefectLocalization,
  handleInspectCandidateSource,
  handleListDefectLocalizations,
  handleLocalizeDefect,
  setDefectLocalizationService,
} from './defect-localization-handlers.js';
import {
  DefectLocalizationCrossProjectError,
  DefectLocalizationNotFoundError,
  DefectLocalizationPathTraversalError,
} from '@ai-quality/core';
import type { RepositoryDefectLocalizationDto } from '@ai-quality/contracts';

describe('Defect Localization IPC Handlers (Phase 100)', () => {
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
  const validLocalizationId = '33333333-3333-3333-3333-333333333333';

  const mockLocalizationDto: RepositoryDefectLocalizationDto = {
    id: validLocalizationId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    repositoryRevision: 'abcdef1234567890',
    revisionState: 'EXACT_REVISION',
    isDrifted: false,
    topCandidateFilePath: 'src/auth/login-service.ts',
    topCandidateSymbolName: 'authenticateUser',
    topCandidateScore: 0.91,
    topCandidateType: 'SERVICE',
    candidateFiles: ['src/auth/login-service.ts'],
    rankedCandidates: [
      {
        rank: 1,
        filePath: 'src/auth/login-service.ts',
        symbolName: 'authenticateUser',
        candidateType: 'SERVICE',
        score: 0.91,
        confidenceLevel: 'VERY_HIGH',
        priorityStatus: 'HIGH_PRIORITY_CANDIDATE',
        relevanceExplanation: 'Responsible candidate.',
        supportingEvidence: [],
        contradictingEvidence: [],
        traceabilityLinks: {},
      },
    ],
    supportingEvidence: [],
    contradictingEvidence: [],
    traceability: {},
    networkCorrelation: {},
    uiCorrelation: {},
    stackTrace: { hasTrustedStack: false, framesParsed: 0 },
    sourceMap: { sourceMapsAvailable: false, resolvedFilesCount: 0, details: '' },
    symbolGraph: { nodesExplored: 0, maxDepthReached: 0, relatedFiles: [], relatedSymbols: [] },
    isAuthoritative: true,
    localizationVersion: 1,
    durationMs: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    setDefectLocalizationService(null);
  });

  it('rejects untrusted sender in handleLocalizeDefect', async () => {
    const res = await handleLocalizeDefect(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('validates schema inputs and returns VALIDATION_ERROR on malformed input', async () => {
    const res = await handleLocalizeDefect(fakeTrustedEvent, {
      projectId: 'not-a-uuid',
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'VALIDATION_ERROR');
    }
  });

  it('sanitizes domain DefectLocalizationNotFoundError to LOCALIZATION_NOT_FOUND', async () => {
    const mockService: any = {
      localizeDefect: async () => {
        throw new DefectLocalizationNotFoundError();
      },
    };
    setDefectLocalizationService(mockService);

    const res = await handleLocalizeDefect(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'LOCALIZATION_NOT_FOUND');
    }
  });

  it('sanitizes domain DefectLocalizationCrossProjectError to LOCALIZATION_CROSS_PROJECT', async () => {
    const mockService: any = {
      getLocalization: async () => {
        throw new DefectLocalizationCrossProjectError();
      },
    };
    setDefectLocalizationService(mockService);

    const res = await handleGetDefectLocalization(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'LOCALIZATION_CROSS_PROJECT');
    }
  });

  it('executes handleLocalizeDefect successfully for trusted caller', async () => {
    const mockService: any = {
      localizeDefect: async () => mockLocalizationDto,
    };
    setDefectLocalizationService(mockService);

    const res = await handleLocalizeDefect(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.id, validLocalizationId);
      assert.equal(res.data.topCandidateFilePath, 'src/auth/login-service.ts');
    }
  });

  it('executes handleInspectCandidateSource and sanitizes DefectLocalizationPathTraversalError', async () => {
    const mockService: any = {
      inspectCandidateSource: async () => {
        throw new DefectLocalizationPathTraversalError();
      },
    };
    setDefectLocalizationService(mockService);

    const res = await handleInspectCandidateSource(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      filePath: '../../etc/passwd',
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'LOCALIZATION_PATH_TRAVERSAL_DETECTED');
    }
  });
});
