/**
 * @file packages/core/src/ai/vector-validator.test.ts
 * Unit tests for VectorValidator runtime assertions and protections.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VectorValidator } from './vector-validator.js';
import {
  AiEmbeddingValidationFailedError,
  AiEmbeddingDimensionMismatchError,
} from './ai-errors.js';

describe('VectorValidator', () => {
  it('accepts valid finite float vectors of expected dimensions', () => {
    const vector = [0.123, -0.456, 0.0, 0.999];
    const result = VectorValidator.validateVector(vector, 4);
    assert.strictEqual(result.length, 4);
    assert.deepStrictEqual(result, vector);
    assert.strictEqual(Object.isFrozen(result), true);
  });

  it('rejects non-array inputs', () => {
    assert.throws(() => VectorValidator.validateVector(null, 4), AiEmbeddingValidationFailedError);
    assert.throws(
      () => VectorValidator.validateVector('not-a-vector', 4),
      AiEmbeddingValidationFailedError,
    );
    assert.throws(() => VectorValidator.validateVector({}, 4), AiEmbeddingValidationFailedError);
  });

  it('rejects empty vector arrays', () => {
    assert.throws(() => VectorValidator.validateVector([]), AiEmbeddingValidationFailedError);
  });

  it('rejects dimension mismatches', () => {
    const vector = [0.1, 0.2, 0.3];
    assert.throws(
      () => VectorValidator.validateVector(vector, 4),
      AiEmbeddingDimensionMismatchError,
    );
  });

  it('rejects NaN values in vector', () => {
    const vector = [0.1, NaN, 0.3];
    assert.throws(
      () => VectorValidator.validateVector(vector, 3),
      AiEmbeddingValidationFailedError,
    );
  });

  it('rejects Infinity and -Infinity in vector', () => {
    assert.throws(
      () => VectorValidator.validateVector([0.1, Infinity, 0.3], 3),
      AiEmbeddingValidationFailedError,
    );
    assert.throws(
      () => VectorValidator.validateVector([0.1, -Infinity, 0.3], 3),
      AiEmbeddingValidationFailedError,
    );
  });

  it('rejects non-numeric elements in vector', () => {
    const vector = [0.1, '0.2' as any, 0.3];
    assert.throws(
      () => VectorValidator.validateVector(vector, 3),
      AiEmbeddingValidationFailedError,
    );
  });

  it('validates batches correctly', () => {
    const batch = [
      [0.1, 0.2, 0.3],
      [-0.1, -0.2, -0.3],
    ];
    const validated = VectorValidator.validateBatch(batch, 2, 3);
    assert.strictEqual(validated.length, 2);
    assert.deepStrictEqual(validated[0], batch[0]);
    assert.deepStrictEqual(validated[1], batch[1]);
  });

  it('rejects batch when count does not match expected items', () => {
    const batch = [[0.1, 0.2, 0.3]];
    assert.throws(
      () => VectorValidator.validateBatch(batch, 2, 3),
      AiEmbeddingValidationFailedError,
    );
  });
});
