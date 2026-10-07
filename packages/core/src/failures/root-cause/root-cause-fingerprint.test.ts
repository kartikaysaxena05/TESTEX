/**
 * @file packages/core/src/failures/root-cause/root-cause-fingerprint.test.ts
 * Unit tests for Root-Cause SHA-256 fingerprint generation (Phase 83).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRootCauseFingerprint,
  type RootCauseFingerprintFacts,
} from './root-cause-fingerprint.js';

describe('generateRootCauseFingerprint (Phase 83)', () => {
  const baseFacts: RootCauseFingerprintFacts = {
    projectId: 'b94cb2ad-1f19-4dc3-81b4-2e91129b0577',
    failureCaseId: 'e2850be3-6bfe-4c86-9a25-2ffea1d20cb6',
    testCaseId: '0c3261a8-8e65-4f76-8802-b011494916aa',
    testCaseVersionNumber: 1,
    deterministicCategory: 'APPLICATION_FAILURE',
    deterministicSubcategory: 'INTERNAL_SERVER_ERROR',
    domainSeparationDomain: 'BACKEND_APPLICATION',
    technicalLocalizationLayer: 'BACKEND_API',
    technicalCause: '/api/v1/login',
    aiAssessmentCategory: 'APPLICATION_FAILURE',
    reproductionRate: 1.0,
    flakinessScore: 0.1,
    evidenceArtifactHashes: ['hash-aaa-111', 'hash-bbb-222'],
    repositoryContextAvailable: true,
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
  };

  it('generates a 64-character hex SHA-256 string', () => {
    const fp = generateRootCauseFingerprint(baseFacts);
    assert.equal(typeof fp, 'string');
    assert.equal(fp.length, 64);
    assert.match(fp, /^[0-9a-f]{64}$/);
  });

  it('is deterministic: produces identical fingerprints for identical inputs', () => {
    const fp1 = generateRootCauseFingerprint(baseFacts);
    const fp2 = generateRootCauseFingerprint({ ...baseFacts });
    assert.equal(fp1, fp2);
  });

  it('normalizes case and whitespace for project and failureCase IDs', () => {
    const fp1 = generateRootCauseFingerprint(baseFacts);
    const fp2 = generateRootCauseFingerprint({
      ...baseFacts,
      projectId: '  B94CB2AD-1F19-4DC3-81B4-2E91129B0577  ',
      failureCaseId: ' E2850BE3-6BFE-4C86-9A25-2FFEA1D20CB6 ',
    });
    assert.equal(fp1, fp2);
  });

  it('is order-independent for evidence artifact hashes', () => {
    const fp1 = generateRootCauseFingerprint(baseFacts);
    const fp2 = generateRootCauseFingerprint({
      ...baseFacts,
      evidenceArtifactHashes: ['hash-bbb-222', 'hash-aaa-111'],
    });
    assert.equal(fp1, fp2);
  });

  it('redacts secrets before computing digest', () => {
    const factsWithSecret: RootCauseFingerprintFacts = {
      ...baseFacts,
      technicalCause: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret123',
    };
    const factsWithAnotherSecret: RootCauseFingerprintFacts = {
      ...baseFacts,
      technicalCause: 'Bearer eyJhbGciOiJIUzI1NiJ9.differentSecret456',
    };

    const fp1 = generateRootCauseFingerprint(factsWithSecret);
    const fp2 = generateRootCauseFingerprint(factsWithAnotherSecret);
    assert.equal(
      fp1,
      fp2,
      'Both bearer tokens should be redacted to [REDACTED] and produce same hash',
    );
  });

  it('produces different hashes when repositoryContextAvailable changes', () => {
    const fp1 = generateRootCauseFingerprint(baseFacts);
    const fp2 = generateRootCauseFingerprint({
      ...baseFacts,
      repositoryContextAvailable: false,
    });
    assert.notEqual(fp1, fp2);
  });

  it('produces different hashes when localization or category changes', () => {
    const fp1 = generateRootCauseFingerprint(baseFacts);
    const fp2 = generateRootCauseFingerprint({
      ...baseFacts,
      technicalLocalizationLayer: 'FRONTEND_DOM',
    });
    assert.notEqual(fp1, fp2);
  });
});
