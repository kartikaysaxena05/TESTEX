/**
 * @file packages/core/src/ai/specifications/test-specification-service.test.ts
 * Integration tests for TestSpecificationEnrichmentService with PostgreSQL and FakeAiProvider.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getPrismaClient } from '../../database/index.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { PromptRegistry } from '../prompt-registry.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import {
  TestSpecificationsRequirementNotFoundError,
  TestSpecificationsScenarioNotFoundError,
} from './specification-errors.js';
import { TestSpecificationEnrichmentService } from './test-specification-service.js';

describe('TestSpecificationEnrichmentService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let specificationService: TestSpecificationEnrichmentService;
  let testProjectId: string;
  let testRequirementId: string;
  let nonTestableReqId: string;
  let testScenarioId: string;
  let fakeProvider: FakeAiProvider;

  const sampleSpecificationOutput = {
    specifications: [
      {
        scenarioKey: 'SCN-001',
        title: 'Successful Login with Valid Credentials',
        category: 'POSITIVE',
        preconditions: [
          {
            key: 'PREC-001',
            category: 'DATA_STATE',
            description: 'User account exists with confirmed email status.',
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
            reviewRequired: false,
          },
          {
            key: 'PREC-002',
            category: 'APPLICATION_STATE',
            description: 'Authentication service is operational.',
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
            reviewRequired: false,
          },
        ],
        testData: [
          {
            key: 'DATA-001',
            name: 'email',
            dataType: 'STRING',
            origin: 'EXAMPLE',
            value: 'valid.user@example.test',
            generator: 'RANDOM_VALID_EMAIL',
            constraint: 'Must follow standard email format',
            isSensitive: false,
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
          },
          {
            key: 'DATA-002',
            name: 'password',
            dataType: 'CREDENTIAL',
            origin: 'GENERATED',
            value: 'SecretPass#2026',
            isSensitive: true,
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
          },
        ],
        expectedResults: [
          {
            key: 'EXP-001',
            category: 'SUCCESS',
            description: 'Authentication succeeds and active session token is issued.',
            observable: true,
            stateChange: {
              from: 'UNAUTHENTICATED',
              to: 'AUTHENTICATED',
              entity: 'UserSession',
            },
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
          },
        ],
        assumptions: ['Network connectivity is stable.'],
        unknowns: [],
        confidence: 'HIGH',
        reviewRequired: false,
        sourceEvidenceRefs: ['REQ-SPEC-001'],
      },
      {
        scenarioKey: 'SCN-001',
        title: 'Login Rejection with Unknown Lockout Threshold',
        category: 'NEGATIVE',
        preconditions: [
          {
            key: 'PREC-001',
            category: 'AUTHENTICATION',
            description: 'User is unauthenticated.',
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
          },
        ],
        testData: [
          {
            key: 'DATA-001',
            name: 'failedAttemptsThreshold',
            dataType: 'NUMBER',
            origin: 'UNKNOWN',
            value: null,
            unknownReason: 'Maximum failed attempt lockout count is unspecified in requirement.',
            confidence: 'LOW',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
            reviewRequired: true,
          },
        ],
        expectedResults: [
          {
            key: 'EXP-001',
            category: 'REQUEST_REJECTED',
            description: 'Account lock response after threshold exceeded.',
            observable: true,
            confidence: 'MEDIUM',
            sourceEvidenceRefs: ['REQ-SPEC-001'],
            reviewRequired: true,
          },
        ],
        unknowns: [
          {
            name: 'failedAttemptsThreshold',
            reason: 'Threshold count unspecified.',
            reviewRequired: true,
          },
        ],
        confidence: 'MEDIUM',
        reviewRequired: true,
        reviewReasons: ['Lockout threshold unspecified.'],
        sourceEvidenceRefs: ['REQ-SPEC-001'],
      },
    ],
    warnings: [],
  };

  before(async () => {
    fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify(sampleSpecificationOutput),
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

    specificationService = new TestSpecificationEnrichmentService({
      prisma,
      promptExecutionService,
      retrievalService,
    });

    // Create Test Project
    const project = await prisma.project.create({
      data: {
        name: 'Phase 51 Test Project',
        description: 'Testing test specification enrichment',
        status: 'ACTIVE',
      },
    });
    testProjectId = project.id;

    // Create Test Requirement
    const requirement = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-SPEC-001',
        title: 'User Login & Account Security',
        originalText:
          'Users shall log in using email and password. Multiple failed attempts shall lock the account.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    testRequirementId = requirement.id;

    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SPEC-001',
        title: 'User Login & Account Security',
        originalText:
          'Users shall log in using email and password. Multiple failed attempts shall lock the account.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'sha256-spec-001',
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
        title: 'Successful Login Flow',
        objective: 'Verify login with valid credentials.',
        rationale: 'Core functional auth.',
        requirementAspect: 'Authentication',
      },
    });
    testScenarioId = scenarioCandidate.id;

    // Create Non-Testable Requirement
    const nonTestable = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-SPEC-VAGUE',
        title: 'Vague System Performance',
        originalText: 'The application shall be ultra intuitive and delightfully fast.',
        type: 'NON_FUNCTIONAL',
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

    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: nonTestableReqId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SPEC-VAGUE',
        title: 'Vague System Performance',
        originalText: 'The application shall be ultra intuitive and delightfully fast.',
        type: 'NON_FUNCTIONAL',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'sha256-vague-001',
      },
    });
  });

  after(async () => {
    if (testProjectId) {
      await prisma.project.delete({ where: { id: testProjectId } });
    }
  });

  it('generates enriched test specifications with grounded preconditions, data, and expected results', async () => {
    const result = await specificationService.enrichTestSpecifications({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.ok(result.id);
    assert.equal(result.projectId, testProjectId);
    assert.equal(result.requirementId, testRequirementId);
    assert.equal(result.requirementKey, 'REQ-SPEC-001');
    assert.equal(result.specifications.length, 2);

    // Specification 1: Positive login
    const positiveSpec = result.specifications[0];
    assert.ok(positiveSpec);
    assert.equal(positiveSpec.category, 'POSITIVE');
    assert.equal(positiveSpec.preconditions.length, 2);
    assert.equal(positiveSpec.testData.length, 2);
    assert.equal(positiveSpec.expectedResults.length, 1);
    assert.equal(positiveSpec.expectedResults[0]?.stateChange?.to, 'AUTHENTICATED');
    assert.equal(positiveSpec.reviewRequired, false);

    // Specification 2: Negative with unknown threshold
    const negativeSpec = result.specifications[1];
    assert.ok(negativeSpec);
    assert.equal(negativeSpec.category, 'NEGATIVE');
    assert.equal(negativeSpec.testData[0]?.origin, 'UNKNOWN');
    assert.equal(negativeSpec.testData[0]?.value, null);
    assert.equal(negativeSpec.reviewRequired, true);

    // Metrics check
    assert.equal(result.metrics.totalSpecifications, 2);
    assert.equal(result.metrics.totalPreconditions, 3);
    assert.equal(result.metrics.totalTestDataItems, 3);
    assert.equal(result.metrics.totalExpectedResults, 2);
    assert.equal(result.metrics.reviewRequiredCount, 1);
    assert.ok(result.metrics.unknownCount >= 2);
  });

  it('caches results and returns cached result on identical input without regenerating', async () => {
    const callCountBefore = fakeProvider.callCount;

    const cached = await specificationService.enrichTestSpecifications({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    const callCountAfter = fakeProvider.callCount;
    assert.equal(callCountAfter, callCountBefore, 'Should use cache instead of calling provider');
    assert.equal(cached.requirementKey, 'REQ-SPEC-001');
  });

  it('enriches test specifications targeting a specific candidate scenario ID', async () => {
    const result = await specificationService.enrichTestSpecifications({
      projectId: testProjectId,
      requirementId: testRequirementId,
      scenarioId: testScenarioId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
      forceRegenerate: true,
    });

    assert.ok(result);
    assert.equal(result.scenarioId, testScenarioId);
    assert.equal(result.specifications.length, 2);
  });

  it('returns truthful empty/review-required result for NOT_TESTABLE requirement without LLM call', async () => {
    const callCountBefore = fakeProvider.callCount;

    const result = await specificationService.enrichTestSpecifications({
      projectId: testProjectId,
      requirementId: nonTestableReqId,
    });

    const callCountAfter = fakeProvider.callCount;
    assert.equal(callCountAfter, callCountBefore, 'Should not invoke LLM for NOT_TESTABLE req');
    assert.equal(result.specifications.length, 0);
    assert.ok(result.warnings.some(w => w.code === 'REQUIREMENT_NOT_TESTABLE'));
  });

  it('throws TestSpecificationsRequirementNotFoundError when requirement does not exist', async () => {
    await assert.rejects(
      () =>
        specificationService.enrichTestSpecifications({
          projectId: testProjectId,
          requirementId: '00000000-0000-0000-0000-000000000000',
        }),
      TestSpecificationsRequirementNotFoundError,
    );
  });

  it('throws TestSpecificationsScenarioNotFoundError when scenario candidate does not belong to req', async () => {
    await assert.rejects(
      () =>
        specificationService.enrichTestSpecifications({
          projectId: testProjectId,
          requirementId: testRequirementId,
          scenarioId: '00000000-0000-0000-0000-000000000000',
        }),
      TestSpecificationsScenarioNotFoundError,
    );
  });
});
