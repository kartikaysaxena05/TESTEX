/**
 * @file packages/core/src/ai/test-design/test-design-security.test.ts
 * Security, multi-tenant isolation, prompt injection defense, and concurrency race tests for Phase 48.
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
import {
  TestDesignProjectMismatchError,
  TestDesignRequirementNotFoundError,
} from './test-design-errors.js';
import { AiInvalidRequestError } from '../ai-errors.js';

describe('Phase 48 Security, Multi-Tenant Isolation & Concurrency Tests', () => {
  const prisma = getPrismaClient()!;
  let testDesignService: TestDesignService;
  let projectAId: string;
  let projectBId: string;
  let archivedProjectId: string;
  let reqAId: string;
  let reqBId: string;
  let archivedReqId: string;
  let fakeProvider: FakeAiProvider;

  const validStructuredOutput = {
    applicability: 'APPLICABLE',
    applicabilityRationale: 'Security requirements with explicit boundaries.',
    automationSuitability: 'HIGH',
    automationRationale: 'Deterministic verification.',
    recommendedLevels: [
      {
        level: 'UNIT',
        priority: 'HIGH',
        rationale: 'Unit tests',
        evidenceRefs: ['REQ-SEC-001'],
      },
    ],
    recommendedDimensions: [
      {
        dimension: 'SECURITY',
        applicable: true,
        priority: 'HIGH',
        rationaleCodes: ['SECURITY_CLASSIFICATION'],
        evidenceRefs: ['REQ-SEC-001'],
        confidence: 'HIGH',
      },
    ],
    recommendedTechniques: [
      {
        technique: 'ROLE_PERMISSION_TESTING',
        priority: 'HIGH',
        rationale: 'Verify role permissions.',
        rationaleCodes: ['ROLE_RESTRICTION_PRESENT'],
        evidenceRefs: ['fake-invalid-evidence-id-999'], // Ungrounded evidence ID
        confidence: 'HIGH',
      },
    ],
    coverageObjectives: [],
    riskFocusAreas: [],
    identifiedConstraints: [],
    designQuestions: [],
    rationale: [],
    sourceContext: [],
  };

  before(async () => {
    // 1. Create Project A
    const pA = await prisma.project.create({
      data: {
        name: 'Project A - Tenant Alpha',
      },
    });
    projectAId = pA.id;

    // 2. Create Project B
    const pB = await prisma.project.create({
      data: {
        name: 'Project B - Tenant Beta',
      },
    });
    projectBId = pB.id;

    // 3. Create Archived Project
    const pArchived = await prisma.project.create({
      data: {
        name: 'Archived Project',
        status: 'ARCHIVED',
      },
    });
    archivedProjectId = pArchived.id;

    // 4. Create Requirements
    const rA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-SEC-001',
        title: 'Project A Security Policy',
        originalText: 'The password shall be at least 12 characters long.',
        type: 'SECURITY',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    reqAId = rA.id;

    const rB = await prisma.requirement.create({
      data: {
        projectId: projectBId,
        requirementKey: 'REQ-SEC-002',
        title: 'Project B Secret Vault',
        originalText: 'Tenant Beta API keys shall never be logged.',
        type: 'SECURITY',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    reqBId = rB.id;

    const rArchived = await prisma.requirement.create({
      data: {
        projectId: archivedProjectId,
        requirementKey: 'REQ-ARCH-001',
        title: 'Archived Requirement',
        originalText: 'Archived functionality.',
        type: 'FUNCTIONAL',
        priority: 'LOW',
        status: 'ACTIVE',
      },
    });
    archivedReqId = rArchived.id;

    // 5. Setup AI Subsystem
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
    // Cleanup
    await prisma.requirementTestDesign.deleteMany({
      where: { projectId: { in: [projectAId, projectBId, archivedProjectId] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [projectAId, projectBId, archivedProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId, archivedProjectId] } },
    });
  });

  it('strictly isolates projects: rejects analyzing Project B requirement under Project A scope', async () => {
    await assert.rejects(
      async () => {
        await testDesignService.analyzeTestDesign({
          projectId: projectAId,
          requirementId: reqBId, // Requirement from Project B
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TestDesignProjectMismatchError);
        return true;
      },
    );
  });

  it('rejects analyzing requirements in ARCHIVED projects', async () => {
    await assert.rejects(
      async () => {
        await testDesignService.analyzeTestDesign({
          projectId: archivedProjectId,
          requirementId: archivedReqId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AiInvalidRequestError);
        return true;
      },
    );
  });

  it('throws RequirementNotFoundError for non-existent requirement ID', async () => {
    await assert.rejects(
      async () => {
        await testDesignService.analyzeTestDesign({
          projectId: projectAId,
          requirementId: '00000000-0000-0000-0000-000000000000',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TestDesignRequirementNotFoundError);
        return true;
      },
    );
  });

  it('sanitizes and strips ungrounded citation IDs from LLM recommendations', async () => {
    const result = await testDesignService.analyzeTestDesign({
      projectId: projectAId,
      requirementId: reqAId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    // The fake response used 'fake-invalid-evidence-id-999' which is not valid
    const tech = result.structuredDesign.recommendedTechniques.find(
      t => t.technique === 'ROLE_PERMISSION_TESTING',
    );
    assert.ok(tech);
    assert.ok(!tech.evidenceRefs.includes('fake-invalid-evidence-id-999'));
  });

  it('handles race conditions: marks test design STALE if requirement is edited concurrently', async () => {
    // Set artificial delay on LLM generation to ensure concurrent edit happens while LLM call is in-flight
    fakeProvider.setOptions({ generateDelayMs: 80 });

    const designPromise = testDesignService.analyzeTestDesign({
      projectId: projectAId,
      requirementId: reqAId,
      forceRegenerate: true,
      configOverride: { providerId: 'FAKE', model: 'fake-model', temperature: 0 },
    });

    // Concurrently modify requirement in database while LLM generation is in flight
    await new Promise(r => setTimeout(r, 30));
    await prisma.requirement.update({
      where: { id: reqAId },
      data: { originalText: 'The password shall be at least 16 characters long.' },
    });

    const result = await designPromise;

    // Reset delay
    fakeProvider.setOptions({ generateDelayMs: 0 });

    // Because requirement was edited concurrently, status is saved as STALE instead of CURRENT
    assert.equal(result.status, 'STALE');
    assert.ok(result.staleAt);
  });
});
