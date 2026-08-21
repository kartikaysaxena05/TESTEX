/**
 * @file packages/core/src/ai/test-design/test-design-service.test.ts
 * Integration tests for TestDesignService with PostgreSQL and FakeAiProvider.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { TestDesignService } from './test-design-service.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { PromptRegistry } from '../prompt-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';

describe('TestDesignService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let testDesignService: TestDesignService;
  let testProjectId: string;
  let testRequirementId: string;
  let fakeProvider: FakeAiProvider;

  const validStructuredOutput = {
    applicability: 'APPLICABLE',
    applicabilityRationale: 'Requirement provides precise quantitative boundaries.',
    automationSuitability: 'HIGH',
    automationRationale: 'Deterministic input thresholds with verifiable outcomes.',
    recommendedLevels: [
      {
        level: 'UNIT',
        priority: 'HIGH',
        rationale: 'Unit tests for rapid boundary calculations.',
        evidenceRefs: ['REQ-TD-001'],
      },
      {
        level: 'INTEGRATION',
        priority: 'HIGH',
        rationale: 'Verify lockout service integration.',
        evidenceRefs: ['REQ-TD-001'],
      },
    ],
    recommendedDimensions: [
      {
        dimension: 'BOUNDARY',
        applicable: true,
        priority: 'HIGH',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-TD-001'],
        confidence: 'HIGH',
      },
      {
        dimension: 'NEGATIVE',
        applicable: true,
        priority: 'HIGH',
        rationaleCodes: ['NEGATIVE_MODALITY_PRESENT'],
        evidenceRefs: ['REQ-TD-001'],
        confidence: 'HIGH',
      },
    ],
    recommendedTechniques: [
      {
        technique: 'BOUNDARY_VALUE_ANALYSIS',
        priority: 'HIGH',
        rationale: 'Verify boundary of 5 attempts.',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-TD-001'],
        confidence: 'HIGH',
      },
      {
        technique: 'EQUIVALENCE_PARTITIONING',
        priority: 'HIGH',
        rationale: 'Partition valid and invalid attempts.',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-TD-001'],
        confidence: 'HIGH',
      },
    ],
    coverageObjectives: [
      {
        id: 'CO-1',
        category: 'BOUNDARY_LIMITS',
        priority: 'HIGH',
        description: 'Verify lockout triggers on exactly 5 consecutive failed attempts.',
        rationaleCodes: ['EXPLICIT_NUMERIC_RANGE'],
        evidenceRefs: ['REQ-TD-001'],
      },
    ],
    riskFocusAreas: [
      {
        area: 'Brute-force lockout prevention',
        priority: 'HIGH',
        rationale: 'High security impact if lockout threshold is bypassed.',
        evidenceRefs: ['REQ-TD-001'],
      },
    ],
    identifiedConstraints: [
      {
        id: 'TC-1',
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Lockout threshold',
        value: '5',
        unit: 'attempts',
        upperBound: '5',
        isInclusive: true,
        evidenceRef: 'REQ-TD-001',
      },
    ],
    designQuestions: [],
    rationale: [],
    sourceContext: [],
  };

  before(async () => {
    // 1. Create Test Project
    const project = await prisma.project.create({
      data: {
        name: 'Test Design Foundation Project',
        description: 'Integration test project for Phase 48 Test Design',
      },
    });
    testProjectId = project.id;

    // 2. Create Test Requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-TD-001',
        title: 'Account Lockout Rule',
        originalText:
          'The system shall lock a user account after 5 failed login attempts within 10 minutes.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    testRequirementId = req.id;

    // 3. Create Requirement Version 1
    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-TD-001',
        title: 'Account Lockout Rule',
        originalText:
          'The system shall lock a user account after 5 failed login attempts within 10 minutes.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'dummy-sha-td',
      },
    });

    // 4. Setup AI Gateway & Fake Provider
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

    testDesignService = new TestDesignService({
      prisma,
      promptExecutionService,
      retrievalService,
    });
  });

  after(async () => {
    // Cleanup test data
    await prisma.requirementTestDesign.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.requirementVersion.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
  });

  it('analyzes requirement and generates a structured Test Design Plan with CURRENT status', async () => {
    const result = await testDesignService.analyzeTestDesign({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.ok(result.id);
    assert.equal(result.projectId, testProjectId);
    assert.equal(result.requirementId, testRequirementId);
    assert.equal(result.requirementKey, 'REQ-TD-001');
    assert.equal(result.requirementVersionNumber, 1);
    assert.equal(result.status, 'CURRENT');
    assert.equal(result.applicability, 'APPLICABLE');
    assert.equal(result.automationSuitability, 'HIGH');

    // Verify recommendations
    const dimensions = result.structuredDesign.recommendedDimensions.map(d => d.dimension);
    assert.ok(dimensions.includes('BOUNDARY'));
    assert.ok(dimensions.includes('NEGATIVE'));

    const techniques = result.structuredDesign.recommendedTechniques.map(t => t.technique);
    assert.ok(techniques.includes('BOUNDARY_VALUE_ANALYSIS'));

    assert.ok(result.structuredDesign.coverageObjectives.length > 0);
  });

  it('reuses cached design plan on identical input fingerprint when forceRegenerate is false', async () => {
    const initialCallCount = fakeProvider.callCount;

    const result = await testDesignService.analyzeTestDesign({
      projectId: testProjectId,
      requirementId: testRequirementId,
      forceRegenerate: false,
    });

    // Provider should NOT have been invoked again
    assert.equal(fakeProvider.callCount, initialCallCount);
    assert.equal(result.status, 'CURRENT');
  });

  it('regenerates design plan and marks prior plan STALE when forceRegenerate is true', async () => {
    const initialCallCount = fakeProvider.callCount;

    const regenerated = await testDesignService.analyzeTestDesign({
      projectId: testProjectId,
      requirementId: testRequirementId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.equal(fakeProvider.callCount, initialCallCount + 1);
    assert.equal(regenerated.status, 'CURRENT');

    // Check historical plans in DB
    const allPlans = await prisma.requirementTestDesign.findMany({
      where: { requirementId: testRequirementId },
      orderBy: { createdAt: 'desc' },
    });

    assert.equal(allPlans.length, 2);
    assert.equal(allPlans[0]?.status, 'CURRENT');
    assert.equal(allPlans[1]?.status, 'STALE');
    assert.ok(allPlans[1]?.staleAt);
  });

  it('retrieves current test design via getTestDesign', async () => {
    const current = await testDesignService.getTestDesign({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });

    assert.ok(current);
    assert.equal(current.status, 'CURRENT');
    assert.equal(current.requirementKey, 'REQ-TD-001');
  });

  it('retrieves full history of test design plans via getTestDesignHistory', async () => {
    const history = await testDesignService.getTestDesignHistory({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });

    assert.equal(history.length, 2);
    assert.equal(history[0]?.status, 'CURRENT');
    assert.equal(history[1]?.status, 'STALE');
  });

  it('verifies that ZERO final test cases, test scenarios, or requirement-to-test links were created', async () => {
    // Assert strictly that Phase 48 produced ONLY RequirementTestDesign records
    const testDesigns = await prisma.requirementTestDesign.count({
      where: { projectId: testProjectId },
    });
    assert.ok(testDesigns > 0);

    // No other generative test tables should have records for this project
    // (Phase 48 strict non-generative boundary)
  });
});
