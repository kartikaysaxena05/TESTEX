/**
 * @file apps/desktop/src/main/ipc/analysis-handlers.test.ts
 * Tests for LLM Requirement Analysis IPC handlers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  handleAnalyzeRequirement,
  handleGetCurrentAnalysis,
  handleGetAnalysisHistory,
  handleRegenerateAnalysis,
  setAnalysisServiceForTest,
} from './analysis-handlers.js';
import { type RequirementAnalysisService, AiInvalidRequestError } from '@ai-quality/core';
import type {
  RequirementAiAnalysisDto,
  AnalyzeRequirementInputDto,
  GetRequirementAnalysisInputDto,
  GetRequirementAnalysisHistoryInputDto,
  RegenerateRequirementAnalysisInputDto,
} from '@ai-quality/contracts';

describe('Requirement Analysis IPC Handlers', () => {
  const sampleProjectId = randomUUID();
  const sampleRequirementId = randomUUID();

  const mockAnalysis: RequirementAiAnalysisDto = {
    id: randomUUID(),
    projectId: sampleProjectId,
    requirementId: sampleRequirementId,
    requirementKey: 'REQ-001',
    requirementVersionNumber: 1,
    status: 'CURRENT',
    providerId: 'FAKE',
    model: 'fake-model',
    promptId: 'requirement.reasoning.analysis',
    promptVersion: 1,
    schemaVersion: 1,
    inputSha256: 'sha-input',
    contextSha256: 'sha-context',
    structuredAnalysis: {
      summary: 'Mock summary',
      targetBehavior: 'Mock behavior',
      primaryActor: 'User',
      secondaryActors: [],
      preconditions: [],
      conditions: [],
      constraints: [],
      quantitativeConstraints: [],
      businessRules: [],
      inputs: [],
      outputs: [],
      expectedOutcome: 'Mock outcome',
      exceptionsOrAlternativeBehavior: [],
      dependencies: [],
      dataEntities: [],
      externalSystems: [],
      securityConsiderations: [],
      performanceConsiderations: [],
      complianceConsiderations: [],
      ambiguities: [],
      missingInformation: [],
      unsafeAssumptions: [],
      clarificationNeeds: [],
      hasNegation: false,
      modality: 'shall',
      citations: [],
      confidence: 'HIGH',
    },
    groundingSummary: {
      totalClaims: 0,
      groundedClaims: 0,
      unsupportedClaims: 0,
      validCitations: 0,
      invalidCitations: 0,
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    durationMs: 42,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('rejects invalid analyzeRequirement payloads with AiInvalidRequestError', async () => {
    await assert.rejects(
      handleAnalyzeRequirement({}),
      (err: unknown) => err instanceof AiInvalidRequestError,
    );
    await assert.rejects(
      handleAnalyzeRequirement({ projectId: 'invalid-uuid', requirementId: sampleRequirementId }),
      (err: unknown) => err instanceof AiInvalidRequestError,
    );
  });

  it('delegates valid input to RequirementAnalysisService', async () => {
    let analyzeCalledWith: AnalyzeRequirementInputDto | null = null;
    let getCurrentCalledWith: GetRequirementAnalysisInputDto | null = null;
    let getHistoryCalledWith: GetRequirementAnalysisHistoryInputDto | null = null;
    let regenerateCalledWith: RegenerateRequirementAnalysisInputDto | null = null;

    const mockService = {
      analyzeRequirement: async (input: AnalyzeRequirementInputDto) => {
        analyzeCalledWith = input;
        return mockAnalysis;
      },
      getCurrentAnalysis: async (input: GetRequirementAnalysisInputDto) => {
        getCurrentCalledWith = input;
        return mockAnalysis;
      },
      getAnalysisHistory: async (input: GetRequirementAnalysisHistoryInputDto) => {
        getHistoryCalledWith = input;
        return [mockAnalysis];
      },
      regenerateAnalysis: async (input: RegenerateRequirementAnalysisInputDto) => {
        regenerateCalledWith = input;
        return mockAnalysis;
      },
    } as unknown as RequirementAnalysisService;

    setAnalysisServiceForTest(mockService);

    const analyzeResult = await handleAnalyzeRequirement({
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });
    assert.deepEqual(analyzeResult, mockAnalysis);
    assert.deepEqual(analyzeCalledWith, {
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });

    const currentResult = await handleGetCurrentAnalysis({
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });
    assert.deepEqual(currentResult, mockAnalysis);
    assert.deepEqual(getCurrentCalledWith, {
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });

    const historyResult = await handleGetAnalysisHistory({
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });
    assert.deepEqual(historyResult, [mockAnalysis]);
    assert.deepEqual(getHistoryCalledWith, {
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });

    const regenResult = await handleRegenerateAnalysis({
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });
    assert.deepEqual(regenResult, mockAnalysis);
    assert.deepEqual(regenerateCalledWith, {
      projectId: sampleProjectId,
      requirementId: sampleRequirementId,
    });

    setAnalysisServiceForTest(null);
  });
});
