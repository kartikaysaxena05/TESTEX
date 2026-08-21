/**
 * @file packages/core/src/ai/rag/rag-context-retrieval-service.test.ts
 * End-to-end integration tests for RequirementContextRetrievalService.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/index.js';
import { RequirementContextRetrievalService } from './requirement-context-retrieval-service.js';
import { VectorSearchService } from '../vector-search-service.js';
import { FakeAiProvider } from '../fake-ai-provider.js';
import { AiProviderRegistry } from '../ai-provider-registry.js';
import { AiProviderGateway } from '../ai-provider-gateway.js';

describe('RequirementContextRetrievalService Integration', () => {
  const prisma = getPrismaClient()!;
  let retrievalService: RequirementContextRetrievalService;
  let testProjectId: string;
  let testRequirementId: string;

  before(async () => {
    // Setup AI provider gateway with FakeAiProvider for vector testing
    const registry = new AiProviderRegistry([new FakeAiProvider()]);
    const gateway = new AiProviderGateway({ registry });
    const vectorSearchService = new VectorSearchService({ prisma, gateway });
    retrievalService = new RequirementContextRetrievalService({ prisma, vectorSearchService });

    // Seed test project
    const project = await prisma.project.create({
      data: {
        name: 'RAG Test Project',
        description: 'Test project for Phase 46 RAG Retrieval',
        status: 'ACTIVE',
      },
    });
    testProjectId = project.id;

    // Seed primary requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-RAG-001',
        title: 'User Authentication Flow',
        originalText:
          'The user shall be able to login with email and multi-factor authentication code.',
        type: 'FUNCTIONAL',
        priority: 'HIGH',
        status: 'ACTIVE',
      },
    });
    testRequirementId = req.id;

    // Seed structured representation
    await prisma.requirementRepresentation.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        normalizedText:
          'System shall verify credentials and MFA token before granting access token.',
        actor: 'User',
        action: 'Login',
        object: 'Authentication Gateway',
        sourceRequirementTextSha256: 'dummy-sha',
        normalizationStatus: 'NORMALIZED',
        reviewStatus: 'REVIEWED',
      },
    });

    // Seed classification metadata
    await prisma.requirementMetadata.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        category: 'FUNCTIONAL',
        subCategory: 'SECURITY',
        domain: 'Identity & Access',
        securityRelevant: true,
        sourceRequirementTextSha256: 'dummy-sha',
        reviewStatus: 'REVIEWED',
      },
    });

    // Seed quality analysis
    await prisma.requirementQualityAnalysis.create({
      data: {
        projectId: testProjectId,
        requirementId: testRequirementId,
        testabilityStatus: 'TESTABLE',
        qualityScore: 95,
        sourceRequirementTextSha256: 'dummy-sha',
        findingsCount: 0,
      },
    });

    // Seed a related requirement
    const relatedReq = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: 'REQ-RAG-002',
        title: 'MFA Token Delivery',
        originalText: 'System shall send 6-digit TOTP code via SMS or Authenticator App.',
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      },
    });

    // Seed confirmed relationship
    await prisma.requirementRelationship.create({
      data: {
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        targetRequirementId: relatedReq.id,
        relationshipType: 'DEPENDS_ON',
        status: 'CONFIRMED',
        sourceRequirementTextSha256: 'dummy-sha-1',
        targetRequirementTextSha256: 'dummy-sha-2',
      },
    });
  });

  after(async () => {
    // Cleanup project and cascade all related records
    if (testProjectId) {
      await prisma.project
        .delete({
          where: { id: testProjectId },
        })
        .catch(() => {});
    }
  });

  it('returns default RAG retrieval configuration', () => {
    const config = retrievalService.getConfigDefaults();
    assert.equal(config.defaultStrategy, 'requirement-rag-v1');
    assert.equal(config.defaultLimits.maxEstimatedTokens, 8000);
    assert.equal(config.defaultLimits.maxCharacters, 32000);
    assert.equal(config.defaultLimits.maxItems, 25);
  });

  it('retrieves grounded context pack for requirement', async () => {
    const pack = await retrievalService.retrieveContext({
      projectId: testProjectId,
      requirementId: testRequirementId,
      purpose: 'TEST_DESIGN',
    });

    assert.ok(pack);
    assert.equal(pack.projectId, testProjectId);
    assert.equal(pack.requirementId, testRequirementId);
    assert.equal(pack.requirementKey, 'REQ-RAG-001');
    assert.equal(pack.purpose, 'TEST_DESIGN');
    assert.equal(pack.retrieval.strategy, 'requirement-rag-v1');

    // Verify Primary Requirement
    assert.equal(pack.primaryRequirement.requirementKey, 'REQ-RAG-001');
    assert.equal(pack.primaryRequirement.title, 'User Authentication Flow');

    // Verify items are ranked by authority tier
    assert.ok(pack.items.length >= 4);

    // Tier 1 item should be primary requirement
    const tier1 = pack.items.find(i => i.authorityTier === 1);
    assert.ok(tier1);
    assert.equal(tier1.sourceType, 'REQUIREMENT');

    // Tier 3 items should include structured rep, metadata, quality
    const tier3Items = pack.items.filter(i => i.authorityTier === 3);
    assert.ok(tier3Items.length >= 2);

    // Tier 4 items should include confirmed dependency
    const tier4 = pack.items.find(i => i.authorityTier === 4);
    assert.ok(tier4);
    assert.equal(tier4.sourceType, 'RELATIONSHIP');
    assert.equal(tier4.provenance.relationshipType, 'DEPENDS_ON');

    // Verify Untrusted context flag on all items
    for (const item of pack.items) {
      assert.equal(item.state.isUntrustedContext, true);
    }

    // Verify budget and diagnostics
    assert.equal(pack.budget.includedItems, pack.items.length);
    assert.ok(pack.budget.estimatedTokens > 0);
    assert.equal(pack.budget.truncated, false);
    assert.ok(pack.diagnostics.candidateCount >= pack.items.length);
    assert.ok(pack.diagnostics.durationMs >= 0);
  });
});
