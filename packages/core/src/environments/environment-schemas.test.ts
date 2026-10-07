/**
 * @file packages/core/src/environments/environment-schemas.test.ts
 * Unit tests for Zod validation schemas across Target Application & Environment Configuration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvironmentSchema,
  updateEnvironmentSchema,
  checkEnvironmentReachabilitySchema,
  resolveEnvironmentSnapshotSchema,
  updateTargetApplicationSchema,
} from '@ai-quality/contracts';

describe('Environment Zod Schemas Unit Tests', () => {
  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validEnvId = '22222222-2222-2222-2222-222222222222';

  describe('updateTargetApplicationSchema', () => {
    it('should validate valid update input', () => {
      const parsed = updateTargetApplicationSchema.parse({
        projectId: validProjectId,
        name: 'My Application',
        description: 'Optional details',
      });

      assert.equal(parsed.projectId, validProjectId);
      assert.equal(parsed.name, 'My Application');
    });

    it('should reject invalid project ID', () => {
      assert.throws(() =>
        updateTargetApplicationSchema.parse({
          projectId: 'invalid-id',
          name: 'App',
        }),
      );
    });
  });

  describe('createEnvironmentSchema', () => {
    it('should validate complete valid environment creation payload', () => {
      const parsed = createEnvironmentSchema.parse({
        projectId: validProjectId,
        name: 'Staging Server',
        type: 'STAGING',
        baseUrl: 'https://staging.example.com',
        browserEngine: 'firefox',
        headless: false,
        viewportWidth: 1920,
        viewportHeight: 1080,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'dark',
        ignoreHttpsErrors: true,
        permissions: ['geolocation', 'notifications'],
        isProduction: false,
      });

      assert.equal(parsed.name, 'Staging Server');
      assert.equal(parsed.type, 'STAGING');
      assert.equal(parsed.browserEngine, 'firefox');
      assert.equal(parsed.viewportWidth, 1920);
    });

    it('should enforce viewport bounds (min 320x240, max 3840x2160)', () => {
      assert.throws(() =>
        createEnvironmentSchema.parse({
          projectId: validProjectId,
          name: 'Too small',
          viewportWidth: 100,
        }),
      );

      assert.throws(() =>
        createEnvironmentSchema.parse({
          projectId: validProjectId,
          name: 'Too large',
          viewportWidth: 5000,
        }),
      );
    });

    it('should reject unpermitted browser permissions', () => {
      assert.throws(() =>
        createEnvironmentSchema.parse({
          projectId: validProjectId,
          name: 'Bad permissions',
          permissions: ['unsupported-permission' as any],
        }),
      );
    });
  });

  describe('checkEnvironmentReachabilitySchema', () => {
    it('should validate targetUrl or environmentId', () => {
      const parsedUrl = checkEnvironmentReachabilitySchema.parse({
        projectId: validProjectId,
        targetUrl: 'https://example.com',
      });
      assert.equal(parsedUrl.targetUrl, 'https://example.com');

      const parsedEnv = checkEnvironmentReachabilitySchema.parse({
        projectId: validProjectId,
        environmentId: validEnvId,
      });
      assert.equal(parsedEnv.environmentId, validEnvId);
    });

    it('should reject when neither targetUrl nor environmentId is provided', () => {
      assert.throws(() =>
        checkEnvironmentReachabilitySchema.parse({
          projectId: validProjectId,
        }),
      );
    });

    it('should enforce timeout bounds (1000ms to 30000ms)', () => {
      assert.throws(() =>
        checkEnvironmentReachabilitySchema.parse({
          projectId: validProjectId,
          targetUrl: 'https://example.com',
          timeoutMs: 500,
        }),
      );

      assert.throws(() =>
        checkEnvironmentReachabilitySchema.parse({
          projectId: validProjectId,
          targetUrl: 'https://example.com',
          timeoutMs: 60000,
        }),
      );
    });
  });

  describe('updateEnvironmentSchema', () => {
    it('should validate valid update environment payload', () => {
      const parsed = updateEnvironmentSchema.parse({
        projectId: validProjectId,
        environmentId: validEnvId,
        name: 'Updated Name',
        baseUrl: 'https://updated.example.com',
        isEnabled: false,
      });

      assert.equal(parsed.name, 'Updated Name');
      assert.equal(parsed.isEnabled, false);
    });
  });

  describe('resolveEnvironmentSnapshotSchema', () => {
    it('should validate resolve snapshot input', () => {
      const parsed = resolveEnvironmentSnapshotSchema.parse({
        projectId: validProjectId,
        environmentId: validEnvId,
      });

      assert.equal(parsed.projectId, validProjectId);
      assert.equal(parsed.environmentId, validEnvId);
    });
  });
});
