import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetRunConfigurationProfile,
  handleDetectRunConfiguration,
  handleSelectRunConfiguration,
  handleUpdateTargetUrl,
} from './run-config-handlers.js';
import type { RunConfigService } from '@ai-quality/core';

describe('Run Config Handlers Unit Tests', () => {
  const dummyProfile = {
    sourceId: 'src-1',
    selectedConfiguration: null,
    candidates: [],
    runtimes: [],
    targetUrl: null,
    targetUrlSource: 'UNKNOWN' as const,
    analyzedAt: new Date().toISOString(),
    warnings: [],
  };

  const mockService = {
    getRunConfigurationProfile: async () => dummyProfile,
    detectRunConfiguration: async () => dummyProfile,
    selectCandidate: async () => ({ id: 'cfg-1', isSelected: true }),
    updateTargetUrl: async () => ({ id: 'cfg-1', targetUrl: 'http://localhost:3000' }),
  } as unknown as RunConfigService;

  const validUuid = '11111111-1111-4111-8111-111111111111';

  it('should get run configuration profile with valid projectId', async () => {
    const res = await handleGetRunConfigurationProfile(validUuid, mockService);
    assert.deepStrictEqual(res, dummyProfile);
  });

  it('should detect run configuration with valid projectId', async () => {
    const res = await handleDetectRunConfiguration(validUuid, mockService);
    assert.deepStrictEqual(res, dummyProfile);
  });

  it('should select candidate with valid input', async () => {
    const res = await handleSelectRunConfiguration(
      { projectId: validUuid, candidateId: 'cand-1' },
      mockService,
    );
    assert.ok(res);
    assert.strictEqual(res.isSelected, true);
  });

  it('should update target URL with valid input', async () => {
    const res = await handleUpdateTargetUrl(
      { projectId: validUuid, targetUrl: 'http://localhost:3000' },
      mockService,
    );
    assert.ok(res);
    assert.strictEqual(res?.targetUrl, 'http://localhost:3000');
  });

  it('should reject invalid UUIDs or invalid URLs', async () => {
    await assert.rejects(async () => {
      await handleGetRunConfigurationProfile('not-uuid', mockService);
    });

    await assert.rejects(async () => {
      await handleUpdateTargetUrl(
        { projectId: validUuid, targetUrl: 'ftp://bad-scheme' },
        mockService,
      );
    });
  });
});
