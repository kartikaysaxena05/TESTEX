/**
 * @file packages/core/src/ai/rag/token-estimator.test.ts
 * Unit tests for token estimation heuristic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TokenEstimator } from './token-estimator.js';

describe('TokenEstimator', () => {
  it('returns 0 for empty or whitespace-only strings', () => {
    assert.equal(TokenEstimator.estimate(''), 0);
    assert.equal(TokenEstimator.estimate('   \n\t  '), 0);
  });

  it('estimates tokens for short sentences', () => {
    const text = 'The user shall be able to login with valid credentials.';
    const estimate = TokenEstimator.estimate(text);
    assert.ok(estimate > 5);
    assert.ok(estimate < 30);
  });

  it('estimates tokens for large text blocks', () => {
    const text = 'A'.repeat(4000);
    const estimate = TokenEstimator.estimate(text);
    assert.equal(estimate, 1000);
  });

  it('estimates batch of strings cumulatively', () => {
    const batch = [
      'Requirement 1: System shall export PDF reports.',
      'Requirement 2: System shall authenticate users via OAuth2.',
      'Requirement 3: System shall encrypt data at rest.',
    ];
    const total = TokenEstimator.estimateBatch(batch);
    const sum = batch.reduce((acc, text) => acc + TokenEstimator.estimate(text), 0);
    assert.equal(total, sum);
    assert.ok(total > 15);
  });
});
