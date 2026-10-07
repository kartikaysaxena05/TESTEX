/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-fingerprint.test.ts
 * Unit tests for AI Reasoning SHA-256 fingerprint generation (Phase 82).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAiAssessmentFingerprint,
  type AiAssessmentFingerprintFacts,
} from './ai-reasoning-fingerprint.js';

describe('AiReasoningFingerprint (Phase 82)', () => {
  const baseFacts: AiAssessmentFingerprintFacts = {
    projectId: '9511a2f6-8c46-4dc5-8f69-952ca315c1e9',
    failureCaseId: '04dcbbfe-f0e7-498b-9679-25ea8d3b8417',
    testCaseId: '803a6bc4-177a-4286-905c-cf6e792c3002',
    testCaseVersionNumber: 1,
    deterministicCategory: 'APPLICATION_FAILURE',
    deterministicSubcategory: 'INTERNAL_SERVER_ERROR',
    domainSeparationDomain: 'BACKEND_APPLICATION',
    technicalLocalizationLayer: 'BACKEND_API',
    technicalCause: '/api/v1/auth',
    reproductionRate: 1.0,
    flakinessScore: 0.0,
    evidenceArtifactHashes: ['hash-aaa', 'hash-bbb', 'hash-ccc'],
    promptVersion: '1.0.0',
    schemaVersion: '1.0.0',
    modelProvider: 'fake',
    modelName: 'mock-classifier-v1',
  };

  it('generates a 64-character hex SHA-256 fingerprint deterministically', () => {
    const fp1 = generateAiAssessmentFingerprint(baseFacts);
    const fp2 = generateAiAssessmentFingerprint(baseFacts);

    assert.equal(fp1.length, 64);
    assert.match(fp1, /^[a-f0-9]{64}$/);
    assert.equal(fp1, fp2);
  });

  it('is invariant to evidence artifact hash array ordering', () => {
    const fp1 = generateAiAssessmentFingerprint({
      ...baseFacts,
      evidenceArtifactHashes: ['hash-ccc', 'hash-aaa', 'hash-bbb'],
    });
    const fp2 = generateAiAssessmentFingerprint({
      ...baseFacts,
      evidenceArtifactHashes: ['hash-aaa', 'hash-bbb', 'hash-ccc'],
    });

    assert.equal(fp1, fp2);
  });

  it('changes fingerprint when any input fact changes', () => {
    const original = generateAiAssessmentFingerprint(baseFacts);
    const mutatedCategory = generateAiAssessmentFingerprint({
      ...baseFacts,
      deterministicCategory: 'ENVIRONMENT_FAILURE',
    });
    const mutatedModel = generateAiAssessmentFingerprint({
      ...baseFacts,
      modelName: 'gpt-4o',
    });

    assert.notEqual(original, mutatedCategory);
    assert.notEqual(original, mutatedModel);
  });

  it('redacts secrets from string inputs before computing fingerprint', () => {
    const fpWithToken = generateAiAssessmentFingerprint({
      ...baseFacts,
      technicalCause: 'POST /api/v1/login with Bearer eyJhbGciOiJIUzI1NiJ9.secret1',
    });
    const fpWithAnotherToken = generateAiAssessmentFingerprint({
      ...baseFacts,
      technicalCause: 'POST /api/v1/login with Bearer eyJhbGciOiJIUzI1NiJ9.different_secret2',
    });

    // Both should redact to Bearer [REDACTED] and therefore have identical fingerprints
    assert.equal(fpWithToken, fpWithAnotherToken);
  });
});
