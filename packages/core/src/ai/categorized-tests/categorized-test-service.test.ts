/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-service.test.ts
 * Integration tests for CategorizedTestService with PostgreSQL and FakeAiProvider.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getPrismaClient } from '../../database/index.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { PromptRegistry } from '../prompt-registry.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import { CategorizedTestService } from './categorized-test-service.js';

describe('CategorizedTestService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let categorizedTestService: CategorizedTestService;
  let testProjectId: string;
  let testRequirementId: string;
  let nonTestableReqId: string;
  let testScenarioId: string;
  let fakeProvider: FakeAiProvider;

  const sampleCategorizedOutput = {
    categoryAssessments: [
      {
        category: 'POSITIVE',
        applicability: 'APPLICABLE',
        rationale: 'Valid login supported with valid credentials.',
      },
      {
        category: 'NEGATIVE',
        applicability: 'APPLICABLE',
        rationale: 'Rejection of invalid password and unauthorized access.',
      },
      {
        category: 'BOUNDARY',
        applicability: 'NOT_APPLICABLE',
        rationale: 'No quantitative boundaries evidenced.',
      },
      {
        category: 'VALIDATION',
        applicability: 'APPLICABLE',
        rationale: 'Email format validation and required password checking.',
      },
    ],
    testDesigns: [
      {
        scenarioKey: 'SCN-001',
        category: 'POSITIVE',
        title: 'Verify successful login with valid email and password',
        objective: 'Ensure registered user with correct credentials receives auth session.',
        rationale: 'Core positive functional path.',
        confidence: 'HIGH',
        sourceEvidenceRefs: ['REQ-CAT-001'],
      },
      {
        scenarioKey: 'SCN-001',
        category: 'NEGATIVE',
        title: 'Verify rejection of login with incorrect password',
        objective: 'Ensure authentication fails when provided password does not match.',
        rationale: 'Validates negative security credential checking.',
        confidence: 'HIGH',
        sourceEvidenceRefs: ['REQ-CAT-001'],
      },
      {
        scenarioKey: 'SCN-001',
        category: 'VALIDATION',
        title: 'Verify rejection of malformed email address',
        objective: 'Ensure request fails validation if email format is invalid.',
        rationale: 'Validates email format constraint.',
        validationIntent: {
          rule: 'Must be a valid email format',
          violation: 'user@@example..com',
          fieldName: 'email',
        },
        confidence: 'HIGH',
        sourceEvidenceRefs: ['REQ-CAT-001'],
      },
    ],
    warnings: [],
  };

  before(async () => {
    // 1. Setup Fake AI Provider & Gateway
    fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify(sampleCategorizedOutput),
    });
    const providerRegistry = new AiProviderRegistry([fakeProvider]);
    const gateway = new AiProviderGateway({ registry: providerRegistry });
    const promptRegistry = PromptRegistry.createDefault();
    const promptExecutionService = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    // 2. Setup Vector Search & RAG Retrieval
    const vectorSearchService = new VectorSearchService({ prisma });
    const retrievalService = new RequirementContextRetrievalService({
      prisma,
      vectorSearchService,
    });

    // 3. Initialize Service Under Test
    categorizedTestService = new CategorizedTestService({
      prisma,
      promptExecutionService,
      retrievalService,
    });

    // 4. Create Test Project
    const project = await prisma.project.create({
      data: {
        name: 'Phase 50 Test Project',
        description: 'Testing categorized test generation',
        status: 'ACTIVE',
      },
    });
    testProjectId = project.id;

    // 5. Create Test Requirement
    const requirement = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-CAT-001',
        title: 'User Login Authentication',
        originalText:
          'Registered users shall be able to log in using a valid email address and password.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    testRequirementId = requirement.id;

    // Create Initial Version snapshot
    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-CAT-001',
        title: requirement.title,
        originalText: requirement.originalText,
        type: requirement.type,
        status: requirement.status,
        sourceRequirementTextSha256: 'sha256-cat-001',
      },
    });

    // Create Scenario Generation & Candidate
    const scenarioGen = await prisma.requirementScenarioGeneration.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        requirementVersionNumber: 1,
        status: 'GENERATED',
        inputFingerprint: 'test-fingerprint',
        providerId: 'fake-ai',
        model: 'fake-model',
        promptId: 'requirement.test-scenario-generation',
        promptVersion: 1,
        scenarioCount: 1,
      },
    });

    const scenarioCandidate = await prisma.requirementScenarioCandidate.create({
      data: {
        generationId: scenarioGen.id,
        projectId: testProjectId,
        requirementId: testRequirementId,
        ordinal: 0,
        scenarioKey: 'SCN-001',
        title: 'User Authentication Scenario',
        objective: 'Verify user logs in with valid credentials.',
        rationale: 'Happy path.',
        requirementAspect: 'Authentication',
      },
    });
    testScenarioId = scenarioCandidate.id;

    // 6. Create Non-testable Requirement
    const nonTestable = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-CAT-VAGUE',
        title: 'Vague performance requirement',
        originalText: 'The UI should be blazing fast.',
        type: 'PERFORMANCE',
        status: 'ACTIVE',
        qualityAnalysis: {
          create: {
            projectId: testProjectId,
            testabilityStatus: 'NOT_TESTABLE',
            qualityScore: 10,
            analysisMethod: 'DETERMINISTIC',
            sourceRequirementTextSha256: 'sha256-vague-001',
          },
        },
      },
    });
    nonTestableReqId = nonTestable.id;
  });

  after(async () => {
    // Cleanup test project and cascaded records
    if (testProjectId) {
      await prisma.project.delete({ where: { id: testProjectId } });
    }
  });

  it('generates categorized test designs for a valid requirement and scenario', async () => {
    const result = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
      scenarioId: testScenarioId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.ok(result.id);
    assert.strictEqual(result.projectId, testProjectId);
    assert.strictEqual(result.requirementId, testRequirementId);
    assert.strictEqual(result.requirementKey, 'REQ-CAT-001');
    assert.strictEqual(result.requirementVersionNumber, 1);
    assert.strictEqual(result.metrics.totalGenerated, 3);
    assert.strictEqual(result.metrics.positiveCount, 1);
    assert.strictEqual(result.metrics.negativeCount, 1);
    assert.strictEqual(result.metrics.validationCount, 1);
    assert.strictEqual(result.metrics.boundaryCount, 0);

    // Verify boundary was marked NOT_APPLICABLE truthfully
    const boundaryAssessment = result.categoryAssessments.find(a => a.category === 'BOUNDARY');
    assert.ok(boundaryAssessment);
    assert.strictEqual(boundaryAssessment?.applicability, 'NOT_APPLICABLE');

    // Verify test designs carry scenarioId and valid evidence refs
    assert.strictEqual(result.testDesigns[0]?.scenarioId, testScenarioId);
    assert.deepStrictEqual(result.testDesigns[0]?.sourceEvidenceRefs, ['REQ-CAT-001']);
  });

  it('serves results from memory cache when input fingerprint is unchanged', async () => {
    const res1 = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    const res2 = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.strictEqual(res1.id, res2.id);
    assert.strictEqual(res1.createdAt, res2.createdAt);
  });

  it('retrieves cached result using getCategorizedTests', async () => {
    const cached = await categorizedTestService.getCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });

    assert.ok(cached);
    assert.strictEqual(cached.requirementId, testRequirementId);
  });

  it('returns truthful NOT_TESTABLE result for unmeasurable requirement without fabricating tests', async () => {
    const result = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: nonTestableReqId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.strictEqual(result.metrics.totalGenerated, 0);
    assert.strictEqual(result.testDesigns.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'REQUIREMENT_NOT_TESTABLE'));
    assert.strictEqual(
      result.categoryAssessments.every(a => a.applicability === 'NOT_APPLICABLE'),
      true,
    );
  });

  it('handles controlled boundary fixture with numeric range 10 to 50 inclusive', async () => {
    const boundaryOutput = {
      categoryAssessments: [
        {
          category: 'POSITIVE',
          applicability: 'APPLICABLE',
          rationale: 'Quantities between 10 and 50.',
        },
        {
          category: 'NEGATIVE',
          applicability: 'APPLICABLE',
          rationale: 'Quantities outside range.',
        },
        {
          category: 'BOUNDARY',
          applicability: 'APPLICABLE',
          rationale: 'At boundaries 10 and 50.',
        },
        {
          category: 'VALIDATION',
          applicability: 'APPLICABLE',
          rationale: 'Non-numeric input rejection.',
        },
      ],
      testDesigns: [
        {
          category: 'BOUNDARY',
          title: 'Accept quantity at minimum bound (10)',
          objective: 'Verify order quantity of exactly 10 is accepted.',
          rationale: 'Inclusive lower boundary testing.',
          boundaryIntent: {
            kind: 'AT_MINIMUM',
            parameter: 'orderQuantity',
            boundaryValue: '10',
            lowerBound: '10',
            upperBound: '50',
            isInclusive: true,
            unit: 'units',
          },
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
        {
          category: 'BOUNDARY',
          title: 'Reject quantity just below minimum bound (9)',
          objective: 'Verify order quantity of 9 is rejected.',
          rationale: 'Below lower boundary testing.',
          boundaryIntent: {
            kind: 'BELOW_MINIMUM',
            parameter: 'orderQuantity',
            boundaryValue: '9',
            lowerBound: '10',
            upperBound: '50',
            isInclusive: true,
            unit: 'units',
          },
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
        {
          category: 'BOUNDARY',
          title: 'Accept quantity at maximum bound (50)',
          objective: 'Verify order quantity of exactly 50 is accepted.',
          rationale: 'Inclusive upper boundary testing.',
          boundaryIntent: {
            kind: 'AT_MAXIMUM',
            parameter: 'orderQuantity',
            boundaryValue: '50',
            lowerBound: '10',
            upperBound: '50',
            isInclusive: true,
            unit: 'units',
          },
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
        {
          category: 'BOUNDARY',
          title: 'Reject quantity just above maximum bound (51)',
          objective: 'Verify order quantity of 51 is rejected.',
          rationale: 'Above upper boundary testing.',
          boundaryIntent: {
            kind: 'ABOVE_MAXIMUM',
            parameter: 'orderQuantity',
            boundaryValue: '51',
            lowerBound: '10',
            upperBound: '50',
            isInclusive: true,
            unit: 'units',
          },
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
      ],
      warnings: [],
    };

    fakeProvider.setOptions({ defaultResponse: JSON.stringify(boundaryOutput) });

    const result = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.strictEqual(result.metrics.boundaryCount, 4);
    assert.strictEqual(result.testDesigns[0]?.boundaryIntent?.kind, 'AT_MINIMUM');
    assert.strictEqual(result.testDesigns[0]?.boundaryIntent?.boundaryValue, '10');
    assert.strictEqual(result.testDesigns[0]?.boundaryIntent?.isInclusive, true);
    assert.strictEqual(result.testDesigns[1]?.boundaryIntent?.kind, 'BELOW_MINIMUM');
    assert.strictEqual(result.testDesigns[1]?.boundaryIntent?.boundaryValue, '9');
    assert.strictEqual(result.testDesigns[2]?.boundaryIntent?.kind, 'AT_MAXIMUM');
    assert.strictEqual(result.testDesigns[2]?.boundaryIntent?.boundaryValue, '50');
    assert.strictEqual(result.testDesigns[3]?.boundaryIntent?.kind, 'ABOVE_MAXIMUM');
    assert.strictEqual(result.testDesigns[3]?.boundaryIntent?.boundaryValue, '51');
  });

  it('handles conditional validation fixture (GST required when country is India)', async () => {
    const conditionalOutput = {
      categoryAssessments: [
        {
          category: 'POSITIVE',
          applicability: 'APPLICABLE',
          rationale: 'India with GST and Non-India without GST.',
        },
        { category: 'NEGATIVE', applicability: 'NOT_APPLICABLE', rationale: 'N/A' },
        { category: 'BOUNDARY', applicability: 'NOT_APPLICABLE', rationale: 'No boundaries.' },
        {
          category: 'VALIDATION',
          applicability: 'APPLICABLE',
          rationale: 'Conditional GST validation.',
        },
      ],
      testDesigns: [
        {
          category: 'VALIDATION',
          title: 'Reject invoice for Indian customer when GST number is missing',
          objective: 'Ensure validation fails when country is India but GST is omitted.',
          rationale: 'Conditional requirement rule.',
          validationIntent: {
            rule: 'GST number is mandatory when country is India',
            violation: 'Country=India, GST=null',
            fieldName: 'gstNumber',
            condition: 'country === "India"',
          },
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
        {
          category: 'POSITIVE',
          title: 'Accept invoice for Indian customer when GST number is provided',
          objective: 'Ensure invoice proceeds when country is India and valid GST is supplied.',
          rationale: 'Valid conditional state.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
        {
          category: 'POSITIVE',
          title: 'Accept invoice for non-Indian customer without GST number',
          objective: 'Ensure non-Indian customer invoice is accepted without GST requirement.',
          rationale: 'Inverse condition verification.',
          confidence: 'HIGH',
          sourceEvidenceRefs: ['REQ-CAT-001'],
        },
      ],
      warnings: [],
    };

    fakeProvider.setOptions({ defaultResponse: JSON.stringify(conditionalOutput) });

    const result = await categorizedTestService.generateCategorizedTests({
      projectId: testProjectId,
      requirementId: testRequirementId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.strictEqual(result.metrics.totalGenerated, 3);
    assert.strictEqual(result.metrics.validationCount, 1);
    assert.strictEqual(result.metrics.positiveCount, 2);
    assert.strictEqual(result.testDesigns[0]?.validationIntent?.condition, 'country === "India"');
  });
});
