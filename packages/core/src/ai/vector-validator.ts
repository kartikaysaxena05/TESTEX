/**
 * @file packages/core/src/ai/vector-validator.ts
 * Rigorous runtime validator for vector embeddings (dimension validation, finite float validation, NaN/Infinity rejection).
 */

import {
  AiEmbeddingValidationFailedError,
  AiEmbeddingDimensionMismatchError,
} from './ai-errors.js';

export interface VectorValidationContext {
  readonly providerId?: string;
  readonly subjectId?: string;
  readonly model?: string;
}

export class VectorValidator {
  /**
   * Validates that a single vector array contains finite numbers matching expected dimensions.
   */
  public static validateVector(
    vector: unknown,
    expectedDimensions?: number,
    context?: VectorValidationContext,
  ): readonly number[] {
    if (!Array.isArray(vector)) {
      throw new AiEmbeddingValidationFailedError(
        'Vector embedding must be a non-null array of numbers.',
        context?.providerId,
      );
    }

    if (vector.length === 0) {
      throw new AiEmbeddingValidationFailedError(
        'Vector embedding array cannot be empty.',
        context?.providerId,
      );
    }

    if (expectedDimensions !== undefined && vector.length !== expectedDimensions) {
      throw new AiEmbeddingDimensionMismatchError(
        expectedDimensions,
        vector.length,
        context?.providerId,
      );
    }

    for (let i = 0; i < vector.length; i++) {
      const val = vector[i];
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
        throw new AiEmbeddingValidationFailedError(
          `Vector contains invalid non-finite value at index ${i}: ${String(val)}`,
          context?.providerId,
        );
      }
    }

    return Object.freeze([...vector]);
  }

  /**
   * Validates a batch of vectors against expected item count and uniform dimensions.
   */
  public static validateBatch(
    embeddings: unknown,
    expectedCount: number,
    expectedDimensions?: number,
    context?: VectorValidationContext,
  ): readonly (readonly number[])[] {
    if (!Array.isArray(embeddings)) {
      throw new AiEmbeddingValidationFailedError(
        'Batch embeddings response must be an array.',
        context?.providerId,
      );
    }

    if (embeddings.length !== expectedCount) {
      throw new AiEmbeddingValidationFailedError(
        `Batch size mismatch: expected ${expectedCount} embeddings from provider, but received ${embeddings.length}.`,
        context?.providerId,
      );
    }

    const validated: (readonly number[])[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      const v = this.validateVector(embeddings[i], expectedDimensions, context);
      validated.push(v);
    }

    return Object.freeze(validated);
  }
}
