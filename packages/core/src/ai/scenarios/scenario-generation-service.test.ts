/**
 * @file packages/core/src/ai/scenarios/scenario-generation-service.test.ts
 * Integration tests for ScenarioGenerationService with PostgreSQL and FakeAiProvider.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { ScenarioGenerationService } from './scenario-generation-service.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { PromptRegistry } from '../prompt-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';

describe('ScenarioGenerationService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let scenarioService: ScenarioGenerationService;
  let testProjectId: string;
  let testRequirementId: string;
  let nonTestableReqId: string;
  let fakeProvider: FakeAiProvider;

  const validStructuredOutput = {
    scenarios: [
      {
        scenarioKey: 'SCN-001',
        title: 'Verify account lockout after 5 consecutive failed login attempts within 10 minutes',
        objective:
          'Ensure the system locks account after precisely 5 failed attempts within the 10-minute window',
        rationale: 'Directly validates the 5-attempt rate-limiting and security boundary rule',
        requirementAspect: 'Account Lockout Security',
        testLevel: 'INTEGRATION',
        testIntent: 'SECURITY',
        applicability: 'APPLICABLE',
        assumptions: [],
        sourceEvidenceRefs: ['REQ-SCN-001'],
      },
      {
        scenarioKey: 'SCN-002',
        title: 'Verify successful login with valid credentials within attempt threshold',
        objective: 'Ensure normal authentication succeeds when attempts are below threshold',
        rationale: 'Validates primary functional path for legitimate users',
        requirementAspect: 'Authentication Success',
        testLevel: 'SYSTEM',
        testIntent: 'FUNCTIONAL',
        applicability: 'APPLICABLE',
        assumptions: [],
        sourceEvidenceRefs: ['REQ-SCN-001'],
      },
    ],
    assumptions: [],
    warnings: [],
  };

  before(async () => {
    // 1. Setup Fake AI Provider & Prompt Execution Service
    fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify(validStructuredOutput),
    });
    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptExecutionService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    const vectorSearchService = new VectorSearchService({
      prisma,
      gateway,
    });

    const retrievalService = new RequirementContextRetrievalService({
      prisma,
      vectorSearchService,
    });

    scenarioService = new ScenarioGenerationService({
      prisma,
      promptExecutionService,
      retrievalService,
    });

    // 2. Seed Test Project
    const project = await prisma.project.create({
      data: {
        name: 'Scenario Generation Test Project',
        description: 'Testing Phase 49 Scenario Generation',
      },
    });
    testProjectId = project.id;

    // 3. Seed Testable Requirement with Version & Quality Analysis
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-SCN-001',
        title: 'Login Rate Limiting',
        originalText:
          'A user may make a maximum of 5 login attempts within 10 minutes before account lockout.',
        type: 'SECURITY',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    testRequirementId = req.id;

    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SCN-001',
        title: 'Login Rate Limiting',
        originalText:
          'A user may make a maximum of 5 login attempts within 10 minutes before account lockout.',
        type: 'SECURITY',
        priority: 'HIGH',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'dummy-sha256-req-1',
      },
    });

    await prisma.requirementQualityAnalysis.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        testabilityStatus: 'TESTABLE',
        qualityScore: 92,
        analysisMethod: 'DETERMINISTIC',
        sourceRequirementTextSha256: 'dummy-sha256-req-1',
      },
    });

    // 4. Seed Non-Testable Requirement
    const nonTestable = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-SCN-002',
        title: 'Fast UI',
        originalText: 'The user interface should be very fast and intuitive.',
        type: 'PERFORMANCE',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      },
    });
    nonTestableReqId = nonTestable.id;

    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: nonTestableReqId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SCN-002',
        title: 'Fast UI',
        originalText: 'The user interface should be very fast and intuitive.',
        type: 'PERFORMANCE',
        priority: 'MEDIUM',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'dummy-sha256-req-2',
      },
    });

    await prisma.requirementQualityAnalysis.create({
      data: {
        projectId: testProjectId,
        requirementId: nonTestableReqId,
        testabilityStatus: 'NOT_TESTABLE',
        qualityScore: 30,
        analysisMethod: 'DETERMINISTIC',
        sourceRequirementTextSha256: 'dummy-sha256-req-2',
      },
    });
  });

  after(async () => {
    if (testProjectId) {
      await prisma.project.delete({
        where: { id: testProjectId },
      });
    }
  });

  it('generates candidate test scenarios for a valid testable requirement', async () => {
    const result = await scenarioService.generateScenarios({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.ok(result);
    assert.equal(result.status, 'GENERATED');
    assert.equal(result.requirementKey, 'REQ-SCN-001');
    assert.equal(result.requirementVersionNumber, 1);
    assert.equal(result.scenarios.length, 2);

    const scn1 = result.scenarios[0]!;
    assert.ok(scn1.title.includes('5 consecutive failed login attempts'));
    assert.ok(scn1.objective.includes('10-minute window'));
    assert.equal(scn1.requirementAspect, 'Account Lockout Security');
    assert.equal(scn1.testLevel, 'INTEGRATION');
    assert.equal(scn1.testIntent, 'SECURITY');
    assert.deepEqual(scn1.sourceEvidenceRefs, ['REQ-SCN-001']);
  });

  it('reuses cached generation result when fingerprint matches', async () => {
    const genCountBefore = await prisma.requirementScenarioGeneration.count({
      where: { requirementId: testRequirementId },
    });

    const cached = await scenarioService.generateScenarios({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    const genCountAfter = await prisma.requirementScenarioGeneration.count({
      where: { requirementId: testRequirementId },
    });

    assert.equal(cached.status, 'GENERATED');
    assert.equal(genCountAfter, genCountBefore); // No new record created
  });

  it('forces regeneration when forceRegenerate is true and marks previous generation STALE', async () => {
    const initial = await scenarioService.getCurrentScenarios({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });
    assert.ok(initial);

    const regenerated = await scenarioService.regenerateScenarios({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.notEqual(regenerated.id, initial.id);
    assert.equal(regenerated.status, 'GENERATED');

    const previousRecord = await prisma.requirementScenarioGeneration.findUnique({
      where: { id: initial.id },
    });
    assert.equal(previousRecord?.status, 'STALE');
    assert.ok(previousRecord?.staleAt !== null);
  });

  it('handles non-testable requirement with INSUFFICIENT_INFORMATION without hallucinating scenarios', async () => {
    const result = await scenarioService.generateScenarios({
      projectId: testProjectId,
      requirementId: nonTestableReqId,
    });

    assert.equal(result.status, 'INSUFFICIENT_INFORMATION');
    assert.equal(result.scenarios.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'REQUIREMENT_NOT_TESTABLE'));
  });

  it('retrieves scenario generation history ordered by creation date', async () => {
    const history = await scenarioService.getScenariosHistory({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });

    assert.ok(history.length >= 2);
    assert.equal(history[0]?.status, 'GENERATED');
    assert.equal(history[1]?.status, 'STALE');
  });

  it('strictly respects Phase-49 boundary: does NOT create TestCase persistence records', async () => {
    // Assert scenario generation does not populate TestCase persistence records
    const testCasesCount = await prisma.testCase.count({
      where: { projectId: testProjectId },
    });
    assert.equal(testCasesCount, 0, 'Scenario generation must not persist TestCase records');
  });
});
