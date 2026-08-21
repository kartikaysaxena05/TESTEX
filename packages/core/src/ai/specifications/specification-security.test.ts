/**
 * @file packages/core/src/ai/specifications/specification-security.test.ts
 * Security and multi-tenant isolation tests for TestSpecificationEnrichmentService.
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
import { TestSpecificationsProjectMismatchError } from './specification-errors.js';
import { TestSpecificationEnrichmentService } from './test-specification-service.js';

describe('TestSpecificationEnrichmentService Security & Isolation Tests', () => {
  const prisma = getPrismaClient()!;
  let specificationService: TestSpecificationEnrichmentService;
  let projectAId: string;
  let projectBId: string;
  let requirementAId: string;

  before(async () => {
    const fakeProvider = new FakeAiProvider({
      defaultResponse: JSON.stringify({ specifications: [], warnings: [] }),
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

    // Create Project A
    const projA = await prisma.project.create({
      data: { name: 'Project A', status: 'ACTIVE' },
    });
    projectAId = projA.id;

    // Create Project B
    const projB = await prisma.project.create({
      data: { name: 'Project B', status: 'ACTIVE' },
    });
    projectBId = projB.id;

    // Create Requirement in Project A
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        requirementKey: 'REQ-SEC-001',
        title: 'Project A Requirement',
        originalText: 'Sensitive Project A requirement details.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
      },
    });
    requirementAId = reqA.id;

    await prisma.requirementVersion.create({
      data: {
        projectId: projectAId,
        requirementId: requirementAId,
        versionNumber: 1,
        requirementKeySnapshot: 'REQ-SEC-001',
        title: 'Project A Requirement',
        originalText: 'Sensitive Project A requirement details.',
        type: 'FUNCTIONAL',
        status: 'ACTIVE',
        sourceRequirementTextSha256: 'sha256-sec-001',
      },
    });
  });

  after(async () => {
    await prisma.requirementVersion.deleteMany({
      where: { requirement: { projectId: { in: [projectAId, projectBId] } } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [projectAId, projectBId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectAId, projectBId] } },
    });
  });

  it('rejects enrichment when requirement belongs to a different project (cross-tenant protection)', async () => {
    await assert.rejects(
      () =>
        specificationService.enrichTestSpecifications({
          projectId: projectBId, // Attempting to access Project A requirement via Project B
          requirementId: requirementAId,
        }),
      TestSpecificationsProjectMismatchError,
    );
  });
});
