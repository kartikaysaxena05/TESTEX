/**
 * @file packages/core/src/ai/structured-output.test.ts
 * Comprehensive adversarial unit tests for StructuredOutputParser and runtime schema validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { StructuredOutputParser } from './structured-output.js';
import { AiStructuredOutputParseError, AiStructuredOutputSchemaError } from './ai-errors.js';

describe('StructuredOutputParser', () => {
  const testSchema = z
    .object({
      status: z.enum(['OK', 'ERROR']),
      score: z.number().int().min(0).max(100),
      tags: z.array(z.string()),
      metadata: z.object({
        processedBy: z.string(),
        count: z.number(),
      }),
    })
    .strict();

  describe('Valid Payload Parsing', () => {
    it('parses and validates clean raw JSON payload', () => {
      const json = JSON.stringify({
        status: 'OK',
        score: 95,
        tags: ['fast', 'stable'],
        metadata: {
          processedBy: 'engine-v1',
          count: 2,
        },
      });

      const parsed = StructuredOutputParser.parseAndValidate(json, testSchema);
      assert.equal(parsed.status, 'OK');
      assert.equal(parsed.score, 95);
      assert.deepEqual(parsed.tags, ['fast', 'stable']);
      assert.equal(parsed.metadata.processedBy, 'engine-v1');
    });

    it('extracts and parses markdown-fenced JSON (```json ... ```)', () => {
      const text = `\`\`\`json
{
  "status": "ERROR",
  "score": 10,
  "tags": ["critical"],
  "metadata": {
    "processedBy": "engine-v2",
    "count": 1
  }
}
\`\`\``;

      const parsed = StructuredOutputParser.parseAndValidate(text, testSchema);
      assert.equal(parsed.status, 'ERROR');
      assert.equal(parsed.score, 10);
    });

    it('extracts and parses generic fenced block (``` ... ```)', () => {
      const text = `\`\`\`
{
  "status": "OK",
  "score": 80,
  "tags": [],
  "metadata": {
    "processedBy": "engine",
    "count": 0
  }
}
\`\`\``;

      const parsed = StructuredOutputParser.parseAndValidate(text, testSchema);
      assert.equal(parsed.status, 'OK');
      assert.equal(parsed.score, 80);
    });
  });

  describe('Adversarial Extraction & Parse Failures', () => {
    it('fails on empty string response', () => {
      assert.throws(
        () => StructuredOutputParser.parseAndValidate('', testSchema),
        (err: unknown) =>
          err instanceof AiStructuredOutputParseError &&
          err.code === 'STRUCTURED_OUTPUT_PARSE_FAILED',
      );
    });

    it('fails on non-JSON natural language prose', () => {
      const prose = 'Here is your evaluation: Everything looks good and tests passed successfully.';
      assert.throws(
        () => StructuredOutputParser.parseAndValidate(prose, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );
    });

    it('fails on truncated / broken JSON syntax', () => {
      const broken = '{"status": "OK", "score": 90, "tags": ["incomp';
      assert.throws(
        () => StructuredOutputParser.parseAndValidate(broken, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );
    });

    it('fails on JSON primitive (e.g. number or boolean or null string) instead of structured object', () => {
      assert.throws(
        () => StructuredOutputParser.parseAndValidate('null', testSchema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );

      assert.throws(
        () => StructuredOutputParser.parseAndValidate('true', testSchema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );
    });
  });

  describe('Adversarial Schema Validation Failures', () => {
    it('fails on empty JSON object `{}` when required fields are missing', () => {
      assert.throws(
        () => StructuredOutputParser.parseAndValidate('{}', testSchema),
        (err: unknown) =>
          err instanceof AiStructuredOutputSchemaError &&
          err.code === 'STRUCTURED_OUTPUT_SCHEMA_FAILED',
      );
    });

    it('fails when an enum value is invalid', () => {
      const payload = JSON.stringify({
        status: 'UNKNOWN_STATUS',
        score: 50,
        tags: [],
        metadata: { processedBy: 'test', count: 1 },
      });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });

    it('fails when primitive types are incorrect (e.g. string score instead of number)', () => {
      const payload = JSON.stringify({
        status: 'OK',
        score: '95', // Invalid string
        tags: [],
        metadata: { processedBy: 'test', count: 1 },
      });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });

    it('fails when nested required object is missing', () => {
      const payload = JSON.stringify({
        status: 'OK',
        score: 50,
        tags: [],
      });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });

    it('fails when required property is null instead of non-null', () => {
      const payload = JSON.stringify({
        status: null,
        score: 50,
        tags: [],
        metadata: { processedBy: 'test', count: 1 },
      });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });

    it('fails when hallucinated extra keys are present under strict schema policy', () => {
      const payload = JSON.stringify({
        status: 'OK',
        score: 50,
        tags: [],
        metadata: { processedBy: 'test', count: 1 },
        hallucinatedField: 'should_fail_under_strict_policy',
      });

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputSchemaError,
      );
    });
  });

  describe('Prototype Pollution Protection', () => {
    it('detects and rejects __proto__ injection in parsed JSON payload', () => {
      const payload =
        '{"status": "OK", "score": 10, "tags": [], "metadata": {"processedBy": "x", "count": 1}, "__proto__": {"admin": true}}';

      assert.throws(
        () => StructuredOutputParser.parseAndValidate(payload, testSchema),
        (err: unknown) => err instanceof AiStructuredOutputParseError,
      );
    });
  });
});
