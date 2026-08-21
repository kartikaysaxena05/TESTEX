/**
 * @file apps/desktop/src/main/ipc/scenario-handlers.test.ts
 * Tests for Phase 49 Scenario Generation IPC handlers.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGenerateScenarios,
  handleGetCurrentScenarios,
  handleGetScenariosHistory,
  handleRegenerateScenarios,
  setScenarioServiceForTest,
} from './scenario-handlers.js';
import { AiInvalidRequestError } from '@ai-quality/core';
import type {
  RequirementScenarioGenerationDto,
  GenerateScenariosInputDto,
} from '@ai-quality/contracts';

describe('Scenario Generation IPC Handlers', () => {
  const dummyGeneration: RequirementScenarioGenerationDto = {
    id: '4c47864f-4d9d-476c-843e-b851b9e84605',
    projectId: '11111111-1111-1111-1111-111111111111',
    requirementId: '22222222-2222-2222-2222-222222222222',
    requirementKey: 'REQ-IPC-001',
    requirementVersionNumber: 1,
    status: 'GENERATED',
    inputFingerprint: 'dummy-fingerprint',
    providerId: 'FAKE',
    model: 'fake-model',
    promptId: 'requirement.test-scenario-generation',
    promptVersion: 1,
    scenarioCount: 1,
    scenarios: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        scenarioKey: 'SCN-001',
        title: 'Verify valid scenario',
        objective: 'Test valid scenario objective',
        rationale: 'Follows from requirement',
        requirementAspect: 'Core',
        testLevel: 'SYSTEM',
        testIntent: 'FUNCTIONAL',
        applicability: 'APPLICABLE',
        assumptions: [],
        sourceEvidenceRefs: ['REQ-IPC-001'],
      },
    ],
    warnings: [],
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    durationMs: 45,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fakeService = {
    generateScenarios: async (
      _input: GenerateScenariosInputDto,
    ): Promise<RequirementScenarioGenerationDto> => {
      return dummyGeneration;
    },
    getCurrentScenarios: async (): Promise<RequirementScenarioGenerationDto | null> => {
      return dummyGeneration;
    },
    getScenariosHistory: async (): Promise<readonly RequirementScenarioGenerationDto[]> => {
      return [dummyGeneration];
    },
    regenerateScenarios: async (): Promise<RequirementScenarioGenerationDto> => {
      return dummyGeneration;
    },
  } as any;

  beforeEach(() => {
    setScenarioServiceForTest(fakeService);
  });

  it('rejects invalid generateScenarios payloads with AiInvalidRequestError', async () => {
    await assert.rejects(
      async () => {
        await handleGenerateScenarios({
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

  it('delegates valid input to ScenarioGenerationService.generateScenarios', async () => {
    const result = await handleGenerateScenarios({
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    });

    assert.equal(result.id, dummyGeneration.id);
    assert.equal(result.scenarios.length, 1);
    assert.equal(result.scenarios[0]?.title, 'Verify valid scenario');
  });

  it('delegates getCurrentScenarios to ScenarioGenerationService', async () => {
    const result = await handleGetCurrentScenarios({
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    });

    assert.ok(result);
    assert.equal(result.requirementKey, 'REQ-IPC-001');
  });

  it('delegates getScenariosHistory to ScenarioGenerationService', async () => {
    const result = await handleGetScenariosHistory({
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    });

    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
  });

  it('delegates regenerateScenarios to ScenarioGenerationService', async () => {
    const result = await handleRegenerateScenarios({
      projectId: '11111111-1111-1111-1111-111111111111',
      requirementId: '22222222-2222-2222-2222-222222222222',
    });

    assert.equal(result.id, dummyGeneration.id);
  });
});
