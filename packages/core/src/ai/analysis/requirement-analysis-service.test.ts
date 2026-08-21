/**
 * @file packages/core/src/ai/analysis/requirement-analysis-service.test.ts
 * Integration tests for RequirementAnalysisService with PostgreSQL and FakeAiProvider.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { RequirementAnalysisService } from './requirement-analysis-service.js';
import { RequirementContextRetrievalService } from '../rag/requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import { AiPromptExecutionService } from '../ai-prompt-execution-service.js';
import { PromptRegistry } from '../prompt-registry.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';

describe('RequirementAnalysisService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let analysisService: RequirementAnalysisService;
  let testProjectId: string;
  let testRequirementId: string;
  let fakeProvider: FakeAiProvider;

  const validStructuredOutput = {
    summary:
      'The system shall lock a user account after 5 consecutive failed login attempts within 10 minutes.',
    businessIntent: 'Mitigate brute-force authentication attacks.',
    targetBehavior: 'Lock account upon 5 consecutive failed attempts.',
    primaryActor: 'User',
    secondaryActors: [],
    trigger: '5th consecutive failed login attempt within 10 minutes',
    preconditions: ['User account exists in system'],
    conditions: ['5 failed login attempts occur within 10-minute window'],
    constraints: ['Account must be locked immediately', 'Evaluation window is 10 minutes'],
    quantitativeConstraints: [
      { value: '5', parameter: 'failed attempts' },
      { value: '10', unit: 'minutes', parameter: 'evaluation window' },
    ],
    businessRules: ['5 failed attempts lock the account'],
    inputs: ['email', 'password'],
    outputs: ['account lock status'],
    expectedOutcome: 'User account status set to LOCKED',
    exceptionsOrAlternativeBehavior: ['Successful login resets failed attempt counter'],
    dependencies: [],
    dataEntities: ['UserAccount', 'LoginAttemptLog'],
    externalSystems: [],
    securityConsiderations: ['Authentication rate limiting', 'Audit trail'],
    performanceConsiderations: ['Sub-second lockout response'],
    complianceConsiderations: [],
    ambiguities: [],
    missingInformation: [],
    unsafeAssumptions: [],
    clarificationNeeds: [],
    hasNegation: false,
    modality: 'shall',
    citations: [
      {
        claimKey: 'lockout_rule',
        supportType: 'DIRECT_REQUIREMENT',
        evidenceId: 'REQ-AI-001',
        confidence: 'HIGH',
      },
    ],
    confidence: 'HIGH',
  };

  before(async () => {
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
    const vectorSearchService = new VectorSearchService({ prisma, gateway });
    const retrievalService = new RequirementContextRetrievalService({
      prisma,
      vectorSearchService,
    });

    analysisService = new RequirementAnalysisService({
      prisma,
      retrievalService,
      promptExecutionService,
    });

    // Seed test project
    const project = await prisma.project.create({
      data: {
        name: 'Analysis Test Project',
        description: 'Test project for Phase 47 LLM Requirement Analysis',
        status: 'ACTIVE',
      },
    });
    testProjectId = project.id;

    // Seed primary requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-AI-001',
        title: 'Account Lockout Rule',
        originalText:
          'The system shall lock a user account after 5 consecutive failed login attempts within 10 minutes.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    testRequirementId = req.id;

    // Seed version 1
    await prisma.requirementVersion.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-AI-001',
        title: 'Account Lockout Rule',
        originalText:
          'The system shall lock a user account after 5 consecutive failed login attempts within 10 minutes.',
        sourceRequirementTextSha256: 'sha-001',
        changeKind: 'CREATED',
      },
    });
  });

  after(async () => {
    if (testProjectId) {
      await prisma.project.delete({ where: { id: testProjectId } });
    }
  });

  it('generates, validates, and persists a grounded AI requirement analysis', async () => {
    const result = await analysisService.analyzeRequirement({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.ok(result.id);
    assert.equal(result.projectId, testProjectId);
    assert.equal(result.requirementId, testRequirementId);
    assert.equal(result.requirementKey, 'REQ-AI-001');
    assert.equal(result.requirementVersionNumber, 1);
    assert.equal(result.status, 'CURRENT');
    assert.equal(result.structuredAnalysis.summary, validStructuredOutput.summary);
    assert.equal(result.structuredAnalysis.primaryActor, 'User');
    assert.equal(result.groundingSummary.validCitations, 1);
    assert.equal(result.groundingSummary.invalidCitations, 0);

    // Verify DB persistence
    const inDb = await prisma.requirementAiAnalysis.findUnique({
      where: { id: result.id },
    });
    assert.ok(inDb);
    assert.equal(inDb.status, 'CURRENT');
  });

  it('reuses identical input cache when fingerprint matches', async () => {
    const initialCallCount = fakeProvider.callCount;

    const result = await analysisService.analyzeRequirement({
      projectId: testProjectId,
      requirementId: testRequirementId,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    // Should return cached result without generating again
    assert.equal(fakeProvider.callCount, initialCallCount);
    assert.equal(result.status, 'CURRENT');
  });

  it('forces regeneration when forceRegenerate is true', async () => {
    const initialCallCount = fakeProvider.callCount;

    const result = await analysisService.analyzeRequirement({
      projectId: testProjectId,
      requirementId: testRequirementId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    assert.equal(fakeProvider.callCount, initialCallCount + 1);
    assert.equal(result.status, 'CURRENT');
  });

  it('marks analysis STALE when requirement is edited and markStaleForRequirement is called', async () => {
    const staleCount = await analysisService.markStaleForRequirement(testRequirementId);
    assert.ok(staleCount >= 1);

    const current = await analysisService.getCurrentAnalysis({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });
    assert.equal(current, null); // No CURRENT analysis active

    const history = await analysisService.getAnalysisHistory({
      projectId: testProjectId,
      requirementId: testRequirementId,
    });
    assert.ok(history.length >= 1);
    assert.ok(history.every(h => h.status === 'STALE'));
  });
});
