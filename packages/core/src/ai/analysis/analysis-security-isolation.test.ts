/**
 * @file packages/core/src/ai/analysis/analysis-security-isolation.test.ts
 * Security, multi-tenant isolation, prompt injection defense, and concurrency race tests for Phase 47.
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
import {
  AiAnalysisProjectMismatchError,
  AiAnalysisRequirementNotFoundError,
  AiAnalysisError,
} from './analysis-errors.js';

describe('Phase 47 Security, Multi-Tenant Isolation & Concurrency Tests', () => {
  const prisma = getPrismaClient()!;
  let analysisService: RequirementAnalysisService;
  let projectAId: string;
  let projectBId: string;
  let archivedProjectId: string;
  let reqAId: string;
  let reqBId: string;

  const validResponsePayload = {
    summary: 'The system shall enforce secure password standards.',
    businessIntent: 'Protect against weak credentials.',
    targetBehavior: 'Enforce password complexity.',
    primaryActor: 'User',
    secondaryActors: [],
    trigger: 'Password creation or update',
    preconditions: [],
    conditions: [],
    constraints: ['Minimum 12 characters'],
    quantitativeConstraints: [{ value: '12', unit: 'characters', parameter: 'password length' }],
    businessRules: [],
    inputs: ['password'],
    outputs: ['validation status'],
    expectedOutcome: 'Password accepted or rejected',
    exceptionsOrAlternativeBehavior: [],
    dependencies: [],
    dataEntities: [],
    externalSystems: [],
    securityConsiderations: ['Credential strength'],
    performanceConsiderations: [],
    complianceConsiderations: [],
    ambiguities: [],
    missingInformation: [],
    unsafeAssumptions: [],
    clarificationNeeds: [],
    hasNegation: false,
    modality: 'shall',
    citations: [
      {
        claimKey: 'min_length',
        supportType: 'DIRECT_REQUIREMENT',
        evidenceId: 'fake-invalid-evidence-id-999',
        confidence: 'HIGH',
      },
    ],
    confidence: 'HIGH',
  };

  let fakeProvider: FakeAiProvider;

  before(async () => {
    fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify(validResponsePayload),
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

    // 1. Create Project A & Requirement A
    const projA = await prisma.project.create({
      data: { name: 'Project Alpha', status: 'ACTIVE' },
    });
    projectAId = projA.id;

    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-SEC-001',
        title: 'Alpha Requirement',
        originalText: 'The password shall be at least 12 characters long.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    reqAId = reqA.id;

    // 2. Create Project B & Requirement B
    const projB = await prisma.project.create({
      data: { name: 'Project Beta', status: 'ACTIVE' },
    });
    projectBId = projB.id;

    const reqB = await prisma.requirement.create({
      data: {
        projectId: projectBId,
        requirementKey: 'REQ-SEC-002',
        title: 'Beta Requirement',
        originalText: 'Beta confidential requirement text.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    reqBId = reqB.id;

    // 3. Create Archived Project
    const projArchived = await prisma.project.create({
      data: { name: 'Archived Project', status: 'ARCHIVED' },
    });
    archivedProjectId = projArchived.id;
  });

  after(async () => {
    if (projectAId) await prisma.project.delete({ where: { id: projectAId } }).catch(() => {});
    if (projectBId) await prisma.project.delete({ where: { id: projectBId } }).catch(() => {});
    if (archivedProjectId)
      await prisma.project.delete({ where: { id: archivedProjectId } }).catch(() => {});
  });

  it('strictly isolates projects: rejects analyzing Project B requirement under Project A scope', async () => {
    await assert.rejects(
      analysisService.analyzeRequirement({
        projectId: projectAId,
        requirementId: reqBId, // Belongs to Project B!
      }),
      (err: unknown) => err instanceof AiAnalysisProjectMismatchError,
    );
  });

  it('rejects analyzing requirements in ARCHIVED projects', async () => {
    await assert.rejects(
      analysisService.analyzeRequirement({
        projectId: archivedProjectId,
        requirementId: reqAId,
      }),
      (err: unknown) => err instanceof AiAnalysisError && err.code === 'PROJECT_ARCHIVED',
    );
  });

  it('throws RequirementNotFoundError for non-existent requirement ID', async () => {
    await assert.rejects(
      analysisService.analyzeRequirement({
        projectId: projectAId,
        requirementId: '00000000-0000-0000-0000-000000000000',
      }),
      (err: unknown) => err instanceof AiAnalysisRequirementNotFoundError,
    );
  });

  it('sanitizes and marks ungrounded citation IDs as UNSUPPORTED', async () => {
    const result = await analysisService.analyzeRequirement({
      projectId: projectAId,
      requirementId: reqAId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    // The fake response used 'fake-invalid-evidence-id-999' which is not valid
    assert.equal(result.groundingSummary.invalidCitations, 1);
    assert.equal(result.groundingSummary.unsupportedClaims, 1);
    assert.equal(result.structuredAnalysis.citations[0]?.supportType, 'UNSUPPORTED');
    assert.equal(result.structuredAnalysis.citations[0]?.evidenceId, null);
  });

  it('handles race conditions: marks analysis STALE if requirement is edited concurrently', async () => {
    // Set artificial delay on LLM generation to ensure concurrent edit happens while LLM call is in-flight
    fakeProvider.setOptions({ generateDelayMs: 80 });

    const analysisPromise = analysisService.analyzeRequirement({
      projectId: projectAId,
      requirementId: reqAId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    // Concurrently modify requirement in database while LLM generation is in flight (after RAG context retrieved)
    await new Promise(r => setTimeout(r, 30));
    await prisma.requirement.update({
      where: { id: reqAId },
      data: { originalText: 'The password shall be at least 16 characters long.' },
    });

    const result = await analysisPromise;

    // Reset delay
    fakeProvider.setOptions({ generateDelayMs: 0 });

    // Because requirement was edited concurrently, status is saved as STALE instead of CURRENT
    assert.equal(result.status, 'STALE');
    assert.ok(result.staleAt);
  });
});
