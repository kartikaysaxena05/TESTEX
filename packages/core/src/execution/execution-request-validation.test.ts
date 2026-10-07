/**
 * @file packages/core/src/execution/execution-request-validation.test.ts
 * Unit tests for execution request schemas, runtime smoke schemas, and eligibility schemas.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executionRequestSchema,
  runtimeSmokeInputSchema,
  validateTestEligibilityInputSchema,
} from '@ai-quality/contracts';

describe('Execution Request Validation Unit Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validTestCaseId = '22222222-2222-2222-2222-222222222222';
  const validEnvId = '33333333-3333-3333-3333-333333333333';

  describe('executionRequestSchema', () => {
    it('accepts valid execution request with defaults', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.projectId, validProjectId);
        assert.equal(result.data.testCaseId, validTestCaseId);
        assert.equal(result.data.browserEngine, 'chromium');
        assert.equal(result.data.headless, true);
        assert.equal(result.data.timeoutMs, 30000);
      }
    });

    it('accepts fully specified custom execution request', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        testCaseVersionNumber: 3,
        browserEngine: 'firefox',
        headless: false,
        timeoutMs: 45000,
        environmentId: validEnvId,
      });

      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.testCaseVersionNumber, 3);
        assert.equal(result.data.browserEngine, 'firefox');
        assert.equal(result.data.headless, false);
        assert.equal(result.data.timeoutMs, 45000);
        assert.equal(result.data.environmentId, validEnvId);
      }
    });

    it('rejects invalid non-UUID projectId', () => {
      const result = executionRequestSchema.safeParse({
        projectId: 'invalid-id',
        testCaseId: validTestCaseId,
      });

      assert.equal(result.success, false);
    });

    it('rejects invalid non-UUID testCaseId', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: 'not-a-uuid',
      });

      assert.equal(result.success, false);
    });

    it('rejects timeout below minimum boundary (< 1000ms)', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        timeoutMs: 500,
      });

      assert.equal(result.success, false);
    });

    it('rejects timeout above maximum boundary (> 300000ms)', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        timeoutMs: 600000,
      });

      assert.equal(result.success, false);
    });

    it('rejects unsupported browser engine', () => {
      const result = executionRequestSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        browserEngine: 'internet-explorer',
      });

      assert.equal(result.success, false);
    });
  });

  describe('runtimeSmokeInputSchema', () => {
    it('accepts empty input and applies safe defaults', () => {
      const result = runtimeSmokeInputSchema.safeParse({});
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.browserEngine, 'chromium');
        assert.equal(result.data.headless, true);
        assert.equal(result.data.timeoutMs, 30000);
      }
    });

    it('accepts explicit parameters', () => {
      const result = runtimeSmokeInputSchema.safeParse({
        browserEngine: 'chromium',
        headless: true,
        timeoutMs: 15000,
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.timeoutMs, 15000);
      }
    });

    it('rejects smoke timeout exceeding 60000ms', () => {
      const result = runtimeSmokeInputSchema.safeParse({
        timeoutMs: 120000,
      });
      assert.equal(result.success, false);
    });
  });

  describe('validateTestEligibilityInputSchema', () => {
    it('accepts valid input without version', () => {
      const result = validateTestEligibilityInputSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
      });
      assert.equal(result.success, true);
    });

    it('accepts valid input with version', () => {
      const result = validateTestEligibilityInputSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        versionNumber: 2,
      });
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.data.versionNumber, 2);
      }
    });

    it('rejects non-positive version number', () => {
      const result = validateTestEligibilityInputSchema.safeParse({
        projectId: validProjectId,
        testCaseId: validTestCaseId,
        versionNumber: 0,
      });
      assert.equal(result.success, false);
    });
  });
});
