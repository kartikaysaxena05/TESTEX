/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-security.test.ts
 * Security and Tenant Isolation Tests for Phase 50 Categorized Test Generation.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getPrismaClient } from '../../database/index.js';
import { AiInvalidRequestError } from '../ai-errors.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { PromptRegistry } from '../prompt-registry.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import {
  CategorizedTestsProjectMismatchError,
  CategorizedTestsRequirementNotFoundError,
  CategorizedTestsScenarioNotFoundError,
} from './categorized-test-errors.js';
import { CategorizedTestService } from './categorized-test-service.js';

describe('CategorizedTestService Security & Tenant Isolation Tests', () => {
  const prisma = getPrismaClient()!;
  let categorizedTestService: CategorizedTestService;
  let projectAId: string;
  let projectBId: string;
  let reqAId: string;
  let reqBId: string;
  let scenarioAId: string;
  let scenarioBId: string;

  before(async () => {
    const fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify({
        categoryAssessments: [],
        testDesigns: [],
        warnings: [],
      }),
    });
    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptExecutionService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });
    const vectorSearchService = new VectorSearchService({ prisma });
    const retrievalService = new RequirementContextRetrievalService({
      prisma,
      vectorSearchService,
    });

    categorizedTestService = new CategorizedTestService({
      prisma,
      promptExecutionService,
      retrievalService,
    });

    // Create Project A
    const projectA = await prisma.project.create({
      data: { name: 'Project A - Isolation', status: 'ACTIVE' },
    });
    projectAId = projectA.id;

    // Create Project B
    const projectB = await prisma.project.create({
      data: { name: 'Project B - Isolation', status: 'ACTIVE' },
    });
    projectBId = projectB.id;

    // Create Req A in Project A
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-SEC-A',
        title: 'Req A',
        originalText: 'Statement A',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    reqAId = reqA.id;

    // Create Req B in Project B
    const reqB = await prisma.requirement.create({
      data: {
        projectId: projectBId,
        requirementKey: 'REQ-SEC-B',
        title: 'Req B',
        originalText: 'Statement B',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    reqBId = reqB.id;

    // Create Scenario Gen A & Candidate A
    const genA = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId: projectAId,
        requirementId: reqAId,
        requirementVersionNumber: 1,
        status: 'GENERATED',
        inputFingerprint: 'fp-a',
        providerId: 'fake-ai',
        model: 'fake-model',
        promptId: 'requirement.test-scenario-generation',
        promptVersion: 1,
      },
    });
    const candA = await prisma.requirementScenarioCandidate.create({
      data: {
        generationId: genA.id,
        projectId: projectAId,
        requirementId: reqAId,
        ordinal: 0,
        scenarioKey: 'SCN-A-1',
        title: 'Scenario A1',
        objective: 'Objective A1',
        rationale: 'Rationale A1',
        requirementAspect: 'Aspect A',
      },
    });
    scenarioAId = candA.id;

    // Create Scenario Gen B & Candidate B
    const genB = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId: projectBId,
        requirementId: reqBId,
        requirementVersionNumber: 1,
        status: 'GENERATED',
        inputFingerprint: 'fp-b',
        providerId: 'fake-ai',
        model: 'fake-model',
        promptId: 'requirement.test-scenario-generation',
        promptVersion: 1,
      },
    });
    const candB = await prisma.requirementScenarioCandidate.create({
      data: {
        generationId: genB.id,
        projectId: projectBId,
        requirementId: reqBId,
        ordinal: 0,
        scenarioKey: 'SCN-B-1',
        title: 'Scenario B1',
        objective: 'Objective B1',
        rationale: 'Rationale B1',
        requirementAspect: 'Aspect B',
      },
    });
    scenarioBId = candB.id;
  });

  after(async () => {
    if (projectAId) {
      await prisma.project.delete({ where: { id: projectAId } });
    }
    if (projectBId) {
      await prisma.project.delete({ where: { id: projectBId } });
    }
  });

  it('rejects cross-project requirement access with CategorizedTestsProjectMismatchError', async () => {
    await assert.rejects(
      async () => {
        await categorizedTestService.generateCategorizedTests({
          projectId: projectAId,
          requirementId: reqBId, // Requirement from Project B requested under Project A
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof CategorizedTestsProjectMismatchError);
        assert.strictEqual(err.code, 'CATEGORIZED_TESTS_PROJECT_MISMATCH');
        return true;
      },
    );
  });

  it('rejects non-existent requirement with CategorizedTestsRequirementNotFoundError', async () => {
    const fakeId = '99999999-9999-9999-9999-999999999999';
    await assert.rejects(
      async () => {
        await categorizedTestService.generateCategorizedTests({
          projectId: projectAId,
          requirementId: fakeId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof CategorizedTestsRequirementNotFoundError);
        assert.strictEqual(err.code, 'CATEGORIZED_TESTS_REQUIREMENT_NOT_FOUND');
        return true;
      },
    );
  });

  it('rejects scenario belonging to another requirement with CategorizedTestsScenarioNotFoundError', async () => {
    await assert.rejects(
      async () => {
        await categorizedTestService.generateCategorizedTests({
          projectId: projectAId,
          requirementId: reqAId,
          scenarioId: scenarioBId, // Scenario from Req B requested under Req A
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof CategorizedTestsScenarioNotFoundError);
        assert.strictEqual(err.code, 'CATEGORIZED_TESTS_SCENARIO_NOT_FOUND');
        return true;
      },
    );
  });

  it('rejects generation in archived project with AiInvalidRequestError', async () => {
    // Archive Project A
    await prisma.project.update({
      where: { id: projectAId },
      data: { status: 'ARCHIVED' },
    });

    await assert.rejects(
      async () => {
        await categorizedTestService.generateCategorizedTests({
          projectId: projectAId,
          requirementId: reqAId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AiInvalidRequestError);
        assert.strictEqual(err.code, 'INVALID_REQUEST');
        return true;
      },
    );

    // Restore Project A
    await prisma.project.update({
      where: { id: projectAId },
      data: { status: 'ACTIVE' },
    });
  });

  it('allows generation when scenario belongs to same requirement', async () => {
    const result = await categorizedTestService.generateCategorizedTests({
      projectId: projectAId,
      requirementId: reqAId,
      scenarioId: scenarioAId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });
    assert.ok(result);
    assert.strictEqual(result.requirementId, reqAId);
  });
});
