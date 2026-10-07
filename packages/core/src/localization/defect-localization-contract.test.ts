/**
 * @file packages/core/src/localization/defect-localization-contract.test.ts
 * Tests for Phase 100 contracts, enums, Zod schemas, and channel constants.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  candidateEvidenceItemSchema,
  candidateEvidenceSignalSchema,
  candidateSourceContentDtoSchema,
  defectCandidateTypeSchema,
  getDefectLocalizationInputSchema,
  inspectCandidateSourceInputSchema,
  listDefectLocalizationsInputSchema,
  localizeDefectInputSchema,
  rankedDefectCandidateDtoSchema,
  repositoryDefectLocalizationDtoSchema,
  repositoryRevisionStateSchema,
} from '@ai-quality/contracts';

describe('Repository Defect Localization Contracts & Schemas (Phase 100)', () => {
  test('validates all RepositoryRevisionState enum values', () => {
    const states = [
      'EXACT_REVISION',
      'EQUIVALENT_REVISION',
      'DRIFTED_REVISION',
      'HISTORICAL_REVISION_UNAVAILABLE',
      'UNKNOWN',
    ];
    for (const state of states) {
      assert.equal(repositoryRevisionStateSchema.parse(state), state);
    }
  });

  test('validates all DefectCandidateType enum values', () => {
    const types = [
      'FILE',
      'CLASS',
      'FUNCTION',
      'METHOD',
      'COMPONENT',
      'API_HANDLER',
      'ROUTE',
      'CONTROLLER',
      'SERVICE',
      'REPOSITORY',
      'DATABASE_QUERY',
      'VALIDATION_SCHEMA',
      'MIDDLEWARE',
      'CONFIGURATION_FILE',
    ];
    for (const t of types) {
      assert.equal(defectCandidateTypeSchema.parse(t), t);
    }
  });

  test('validates all CandidateEvidenceSignal enum values', () => {
    const signals = [
      'STACK_TRACE',
      'SOURCE_MAP',
      'NETWORK_ENDPOINT',
      'ROUTE_MAPPING',
      'DOM_COMPONENT',
      'UI_ACTION_TARGET',
      'ROOT_CAUSE_PROBABLE_LAYER',
      'ROOT_CAUSE_HYPOTHESIS',
      'REQUIREMENT_TRACEABILITY',
      'SYMBOL_GRAPH_IMPORT',
      'SYMBOL_GRAPH_CALLER',
      'RECENT_COMMIT_TOUCH',
      'KEYWORD_SIMILARITY',
    ];
    for (const s of signals) {
      assert.equal(candidateEvidenceSignalSchema.parse(s), s);
    }
  });

  test('validates candidateEvidenceItemSchema', () => {
    const item = {
      signal: 'STACK_TRACE',
      strength: 'STRONG',
      description: 'Stack frame points to line 42',
      provenance: 'Error: invalid credentials at login-service.ts:42',
      rawReference: 'login-service.ts:42',
    };
    const parsed = candidateEvidenceItemSchema.parse(item);
    assert.equal(parsed.signal, 'STACK_TRACE');
    assert.equal(parsed.strength, 'STRONG');
  });

  test('validates rankedDefectCandidateDtoSchema', () => {
    const candidate = {
      rank: 1,
      filePath: 'src/auth/login-service.ts',
      symbolName: 'authenticateUser',
      symbolKind: 'FUNCTION',
      candidateType: 'SERVICE',
      score: 0.91,
      confidenceLevel: 'VERY_HIGH',
      priorityStatus: 'HIGH_PRIORITY_CANDIDATE',
      startLine: 35,
      endLine: 80,
      relevanceExplanation: 'Candidate responsible for session creation upon invalid password.',
      supportingEvidence: [
        {
          signal: 'NETWORK_ENDPOINT',
          strength: 'STRONG',
          description: 'POST /api/auth/login endpoint',
          provenance: 'Observed network request',
        },
      ],
      contradictingEvidence: [],
      traceabilityLinks: {
        requirementId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        requirementKey: 'REQ-AUTH-001',
        testCaseId: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
        testCaseKey: 'TC-AUTH-001',
        executionId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
        failedStepIndex: 3,
      },
    };
    const parsed = rankedDefectCandidateDtoSchema.parse(candidate);
    assert.equal(parsed.rank, 1);
    assert.equal(parsed.filePath, 'src/auth/login-service.ts');
  });

  test('validates full repositoryDefectLocalizationDtoSchema', () => {
    const full = {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      projectId: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      failureCaseId: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
      repositoryRevision: 'abcdef1234567890abcdef1234567890abcdef12',
      failureTimeRevision: 'abcdef1234567890abcdef1234567890abcdef12',
      branchName: 'main',
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
          symbolKind: 'FUNCTION',
          candidateType: 'SERVICE',
          score: 0.91,
          confidenceLevel: 'VERY_HIGH',
          priorityStatus: 'HIGH_PRIORITY_CANDIDATE',
          startLine: 35,
          endLine: 80,
          relevanceExplanation: 'Candidate explanation',
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
      durationMs: 45,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = repositoryDefectLocalizationDtoSchema.parse(full);
    assert.equal(parsed.id, full.id);
    assert.equal(parsed.revisionState, 'EXACT_REVISION');
  });

  test('validates candidateSourceContentDtoSchema', () => {
    const content = {
      filePath: 'src/auth/login-service.ts',
      content: 'export function authenticateUser() { ... }',
      totalLines: 100,
      startLine: 1,
      endLine: 100,
      highlightStartLine: 35,
      highlightEndLine: 80,
      isTruncated: false,
      isReadOnly: true,
    };
    const parsed = candidateSourceContentDtoSchema.parse(content);
    assert.equal(parsed.isReadOnly, true);
    assert.equal(parsed.filePath, 'src/auth/login-service.ts');
  });

  test('validates input schemas', () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    assert.doesNotThrow(() =>
      localizeDefectInputSchema.parse({
        projectId: validUuid,
        failureCaseId: validUuid,
      }),
    );
    assert.doesNotThrow(() =>
      getDefectLocalizationInputSchema.parse({
        projectId: validUuid,
        failureCaseId: validUuid,
      }),
    );
    assert.doesNotThrow(() =>
      listDefectLocalizationsInputSchema.parse({
        projectId: validUuid,
        failureCaseId: validUuid,
      }),
    );
    assert.doesNotThrow(() =>
      inspectCandidateSourceInputSchema.parse({
        projectId: validUuid,
        failureCaseId: validUuid,
        filePath: 'src/test.ts',
      }),
    );
  });

  test('verifies DESKTOP_CHANNELS constants for Phase 100', () => {
    assert.equal(
      DESKTOP_CHANNELS.DEFECT_LOCALIZATION_LOCALIZE,
      'desktop:defect-localization:localize',
    );
    assert.equal(
      DESKTOP_CHANNELS.DEFECT_LOCALIZATION_GET,
      'desktop:defect-localization:get-localization',
    );
    assert.equal(
      DESKTOP_CHANNELS.DEFECT_LOCALIZATION_LIST,
      'desktop:defect-localization:list-localizations',
    );
    assert.equal(
      DESKTOP_CHANNELS.DEFECT_LOCALIZATION_INSPECT_SOURCE,
      'desktop:defect-localization:inspect-candidate-source',
    );
  });
});
