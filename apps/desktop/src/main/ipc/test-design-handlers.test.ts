/**
 * @file apps/desktop/src/main/ipc/test-design-handlers.test.ts
 * Tests for Phase 48 Test Design IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAnalyzeTestDesign,
  handleGetCurrentTestDesign,
  handleGetTestDesignHistory,
  handleRegenerateTestDesign,
  setTestDesignServiceForTest,
} from './test-design-handlers.js';
import { AiInvalidRequestError } from '@ai-quality/core';
import type { TestDesignPlanDto, AnalyzeTestDesignInputDto } from '@ai-quality/contracts';

describe('Test Design IPC Handlers', () => {
  const dummyPlan: TestDesignPlanDto = {
    id: 'test-design-123',
    projectId: '4c47864f-4d9d-476c-843e-b851b9e84605',
    requirementId: '5d34208e-da5c-43f1-bd23-64010b91e921',
    requirementKey: 'REQ-IPC-001',
    requirementVersionNumber: 1,
    status: 'CURRENT',
    applicability: 'APPLICABLE',
    automationSuitability: 'HIGH',
    inputFingerprint: 'dummy-fingerprint',
    engineVersion: 'test-design-rules-v1',
    promptTemplateVersion: 1,
    providerId: 'FAKE',
    model: 'fake-model',
    structuredDesign: {
      applicability: 'APPLICABLE',
      applicabilityRationale: 'Actionable',
      automationSuitability: 'HIGH',
      automationRationale: 'Deterministic',
      recommendedLevels: [],
      recommendedDimensions: [],
      recommendedTechniques: [],
      coverageObjectives: [],
      riskFocusAreas: [],
      identifiedConstraints: [],
      designQuestions: [],
      rationale: [],
      sourceContext: [],
    },
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    durationMs: 45,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fakeService = {
    analyzeTestDesign: async (_input: AnalyzeTestDesignInputDto): Promise<TestDesignPlanDto> => {
      return dummyPlan;
    },
    getTestDesign: async (): Promise<TestDesignPlanDto | null> => {
      return dummyPlan;
    },
    getTestDesignHistory: async (): Promise<readonly TestDesignPlanDto[]> => {
      return [dummyPlan];
    },
    regenerateTestDesign: async (): Promise<TestDesignPlanDto> => {
      return dummyPlan;
    },
  } as any;

  beforeEach(() => {
    setTestDesignServiceForTest(fakeService);
  });

  it('rejects invalid analyzeTestDesign payloads with AiInvalidRequestError', async () => {
    await assert.rejects(
      async () => {
        await handleAnalyzeTestDesign({
          projectId: 'not-a-uuid',
          requirementId: 'not-a-uuid',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AiInvalidRequestError);
        return true;
      },
    );
  });

  it('delegates valid input to TestDesignService', async () => {
    const result = await handleAnalyzeTestDesign({
      projectId: '4c47864f-4d9d-476c-843e-b851b9e84605',
      requirementId: '5d34208e-da5c-43f1-bd23-64010b91e921',
    });

    assert.equal(result.id, 'test-design-123');
    assert.equal(result.requirementKey, 'REQ-IPC-001');
  });

  it('delegates getCurrentTestDesign to TestDesignService', async () => {
    const result = await handleGetCurrentTestDesign({
      projectId: '4c47864f-4d9d-476c-843e-b851b9e84605',
      requirementId: '5d34208e-da5c-43f1-bd23-64010b91e921',
    });

    assert.ok(result);
    assert.equal(result.id, 'test-design-123');
  });

  it('delegates getTestDesignHistory to TestDesignService', async () => {
    const history = await handleGetTestDesignHistory({
      projectId: '4c47864f-4d9d-476c-843e-b851b9e84605',
      requirementId: '5d34208e-da5c-43f1-bd23-64010b91e921',
    });

    assert.equal(history.length, 1);
    assert.equal(history[0]?.id, 'test-design-123');
  });

  it('delegates regenerateTestDesign to TestDesignService', async () => {
    const result = await handleRegenerateTestDesign({
      projectId: '4c47864f-4d9d-476c-843e-b851b9e84605',
      requirementId: '5d34208e-da5c-43f1-bd23-64010b91e921',
    });

    assert.equal(result.id, 'test-design-123');
  });
});
