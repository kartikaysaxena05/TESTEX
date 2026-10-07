/**
 * @file packages/core/src/failures/reproduction/environment-reconstructor.test.ts
 * Unit tests for EnvironmentReconstructor (V6 Phase 76).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentReconstructor } from './environment-reconstructor.js';
import type {
  HistoricalEnvironmentProfile,
  TargetEnvironmentProfile,
} from './failure-reproduction-types.js';

describe('EnvironmentReconstructor (Phase 76)', () => {
  const reconstructor = new EnvironmentReconstructor();

  describe('reconstructHistoricalEnvironment', () => {
    it('extracts complete profile from execution snapshot and environment record', () => {
      const profile = reconstructor.reconstructHistoricalEnvironment({
        browserEngine: 'chromium',
        environmentId: 'env-uuid-1',
        environmentSnapshotJson: {
          baseUrl: 'https://staging.app.internal',
          viewport: { width: 1280, height: 720 },
          browserVersion: '124.0.0.0',
          locale: 'en-US',
          timezone: 'America/New_York',
          operatingSystem: 'Linux x86_64',
        },
        testRun: {
          environment: {
            id: 'env-uuid-1',
            name: 'Staging Env',
            baseUrl: 'https://staging.app.internal',
            browserEngine: 'chromium',
          },
        },
      });

      assert.equal(profile.browserEngine, 'chromium');
      assert.equal(profile.baseUrl, 'https://staging.app.internal');
      assert.equal(profile.environmentName, 'Staging Env');
      assert.deepEqual(profile.viewport, { width: 1280, height: 720 });
      assert.equal(profile.locale, 'en-US');
      assert.equal(profile.timezone, 'America/New_York');
      assert.equal(profile.operatingSystem, 'Linux x86_64');
    });

    it('falls back to environment baseUrl when snapshot does not include baseUrl', () => {
      const profile = reconstructor.reconstructHistoricalEnvironment({
        browserEngine: 'firefox',
        environmentSnapshotJson: {},
        testRun: {
          environment: {
            id: 'env-fallback',
            name: 'Prod Fallback',
            baseUrl: 'https://prod.app.internal',
            browserEngine: 'firefox',
          },
        },
      });

      assert.equal(profile.browserEngine, 'firefox');
      assert.equal(profile.baseUrl, 'https://prod.app.internal');
      assert.equal(profile.environmentName, 'Prod Fallback');
    });

    it('provides sensible defaults when execution has empty or missing metadata', () => {
      const profile = reconstructor.reconstructHistoricalEnvironment({
        browserEngine: 'webkit',
      });

      assert.equal(profile.browserEngine, 'webkit');
      assert.equal(profile.baseUrl, null);
      assert.equal(profile.environmentName, null);
    });
  });

  describe('compareEnvironments', () => {
    const baseProfile: HistoricalEnvironmentProfile = {
      environmentId: 'env-1',
      environmentName: 'Staging',
      baseUrl: 'https://app.test',
      browserEngine: 'chromium',
      browserVersion: '124.0.0',
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezone: 'UTC',
      operatingSystem: 'macOS',
    };

    it('detects EXACT equivalence when all properties match', () => {
      const target: TargetEnvironmentProfile = {
        baseUrl: 'https://app.test',
        browserEngine: 'chromium',
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        timezone: 'UTC',
      };
      const comparison = reconstructor.compareEnvironments(baseProfile, target);

      assert.equal(comparison.status, 'EXACT');
      assert.equal(comparison.driftItems.length, 0);
      assert.equal(comparison.originalBaseUrl, 'https://app.test');
      assert.equal(comparison.reproductionBaseUrl, 'https://app.test');
      assert.equal(comparison.originalBrowserEngine, 'chromium');
      assert.equal(comparison.reproductionBrowserEngine, 'chromium');
    });

    it('detects EQUIVALENT when only minor non-functional fields differ', () => {
      const target: TargetEnvironmentProfile = {
        baseUrl: 'https://app.test',
        browserEngine: 'chromium',
        viewport: { width: 1280, height: 720 },
        locale: 'en-GB',
        timezone: 'Europe/London',
      };
      const comparison = reconstructor.compareEnvironments(baseProfile, target);

      assert.equal(comparison.status, 'EQUIVALENT');
    });

    it('detects DRIFTED when baseUrl differs', () => {
      const target: TargetEnvironmentProfile = {
        baseUrl: 'https://app-canary.test',
        browserEngine: 'chromium',
        viewport: { width: 1280, height: 720 },
      };
      const comparison = reconstructor.compareEnvironments(baseProfile, target);

      assert.equal(comparison.status, 'DRIFTED');
      assert.ok(comparison.driftItems.some((item: string) => item.includes('Base URL changed')));
    });

    it('detects DRIFTED when viewport differs', () => {
      const target: TargetEnvironmentProfile = {
        baseUrl: 'https://app.test',
        browserEngine: 'chromium',
        viewport: { width: 1920, height: 1080 },
      };
      const comparison = reconstructor.compareEnvironments(baseProfile, target);

      assert.equal(comparison.status, 'DRIFTED');
      assert.ok(comparison.driftItems.some((item: string) => item.includes('Viewport changed')));
    });

    it('detects INCOMPATIBLE when browser engines differ', () => {
      const target: TargetEnvironmentProfile = {
        baseUrl: 'https://app.test',
        browserEngine: 'firefox',
      };
      const comparison = reconstructor.compareEnvironments(baseProfile, target);

      assert.equal(comparison.status, 'INCOMPATIBLE');
      assert.ok(
        comparison.driftItems.some((item: string) => item.includes('Browser engine mismatch')),
      );
    });
  });
});
