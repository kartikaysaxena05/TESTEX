/**
 * @file packages/core/src/failures/ai-reasoning/ai-confidence-calibrator.test.ts
 * Unit tests for AI Confidence Calibrator and bounded explainable score calculation (Phase 82).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiConfidenceCalibrator } from './ai-confidence-calibrator.js';
import type { AiReasoningSanitizedContext } from './ai-reasoning-types.js';

describe('AiConfidenceCalibrator (Phase 82)', () => {
  const calibrator = new AiConfidenceCalibrator();

  const mockContext: AiReasoningSanitizedContext = {
    projectId: '9511a2f6-8c46-4dc5-8f69-952ca315c1e9',
    failureCaseId: '04dcbbfe-f0e7-498b-9679-25ea8d3b8417',
    caseTitle: 'Sample Case',
    executionDetails: {
      testName: 'Test A',
      browser: 'chromium',
      os: 'mac',
      status: 'FAILED',
      durationMs: 1200,
      errorMessage: '500 Internal Server Error',
    },
    deterministicClassification: {
      category: 'APPLICATION_FAILURE',
      confidenceScore: 0.9,
    },
    domainSeparation: {
      failureDomain: 'BACKEND_APPLICATION',
    },
    technicalLocalization: {
      primaryLayer: 'BACKEND_API',
      primaryTargetType: 'HTTP_ENDPOINT',
      primaryTargetIdentifier: '/api/v1/data',
    },
    reproductionFacts: {
      isReproducible: true,
      reproductionRate: 1.0,
      totalRuns: 3,
      passedRuns: 0,
      failedRuns: 3,
    },
    sanitizedEvidence: {
      consoleErrors: ['API 500 error'],
      networkFailures: [{ url: '/api/v1/data', method: 'POST', status: 500 }],
      domSnippet: '<div>Error</div>',
      artifactSummaries: [],
    },
  };

  it('maps numerical score to discrete confidence tier correctly', () => {
    assert.equal(calibrator.scoreToLevel(0.15), 'VERY_LOW');
    assert.equal(calibrator.scoreToLevel(0.35), 'LOW');
    assert.equal(calibrator.scoreToLevel(0.55), 'MEDIUM');
    assert.equal(calibrator.scoreToLevel(0.85), 'HIGH');
    assert.equal(calibrator.scoreToLevel(0.95), 'VERY_HIGH');
  });

  it('produces HIGH/VERY_HIGH calibrated confidence when evidence is complete and reproduction is consistent', () => {
    const factors = calibrator.calibrate({
      rawScore: 0.92,
      context: mockContext,
      supportingCount: 3,
      contradictingCount: 0,
    });

    assert.ok(
      factors.calibratedScore >= 0.8,
      `Expected score >= 0.8, got ${factors.calibratedScore}`,
    );
    assert.ok(factors.calibratedLevel === 'HIGH' || factors.calibratedLevel === 'VERY_HIGH');
    assert.equal(factors.contradictorySignalsCount, 0);
    assert.ok(factors.calibrationBasis.length >= 3);
  });

  it('caps confidence at MEDIUM when multiple contradictory signals exist', () => {
    const factors = calibrator.calibrate({
      rawScore: 0.95,
      context: mockContext,
      supportingCount: 1,
      contradictingCount: 3, // 3 contradictory signals
    });

    assert.ok(
      factors.calibratedScore <= 0.65,
      `Expected score <= 0.65, got ${factors.calibratedScore}`,
    );
    assert.ok(factors.calibratedLevel === 'MEDIUM' || factors.calibratedLevel === 'LOW');
    assert.ok(factors.calibrationBasis.some(b => b.includes('contradictory')));
  });

  it('caps confidence at LOW when supporting evidence is 0', () => {
    const factors = calibrator.calibrate({
      rawScore: 0.85,
      context: mockContext,
      supportingCount: 0,
      contradictingCount: 0,
    });

    assert.ok(
      factors.calibratedScore <= 0.35,
      `Expected score <= 0.35, got ${factors.calibratedScore}`,
    );
    assert.ok(factors.calibratedLevel === 'LOW' || factors.calibratedLevel === 'VERY_LOW');
  });

  it('caps confidence at MEDIUM when evidence completeness is low (< 40%)', () => {
    const sparseContext: AiReasoningSanitizedContext = {
      projectId: '9511a2f6-8c46-4dc5-8f69-952ca315c1e9',
      failureCaseId: '04dcbbfe-f0e7-498b-9679-25ea8d3b8417',
      caseTitle: 'Sparse Case',
      executionDetails: {
        testName: 'Test Sparse',
        browser: 'chromium',
        os: 'mac',
        status: 'FAILED',
        durationMs: 100,
      },
      sanitizedEvidence: {
        consoleErrors: [],
        networkFailures: [],
        artifactSummaries: [],
      },
    };

    const factors = calibrator.calibrate({
      rawScore: 0.99,
      context: sparseContext,
      supportingCount: 2,
      contradictingCount: 0,
    });

    assert.ok(
      factors.calibratedScore <= 0.65,
      `Expected score <= 0.65, got ${factors.calibratedScore}`,
    );
    assert.ok(
      factors.calibrationBasis.some(b =>
        b.includes('capped at MEDIUM due to low evidence completeness'),
      ),
    );
  });
});
