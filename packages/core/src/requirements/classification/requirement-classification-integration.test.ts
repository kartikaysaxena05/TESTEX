/**
 * @file packages/core/src/requirements/classification/requirement-classification-integration.test.ts
 * Integration tests for RequirementClassificationService with PostgreSQL and Prisma.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementNormalizationService } from '../normalization/requirement-normalization-service.js';
import { RequirementClassificationService } from './requirement-classification-service.js';
import { RequirementProvenanceRepository } from '../provenance/requirement-provenance-repository.js';
import { RequirementSourceRepository } from '../requirement-source-repository.js';

describe('RequirementClassificationService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const requirementService = new RequirementService();
  const normalizationService = new RequirementNormalizationService();
  const classificationService = new RequirementClassificationService();
  const provenanceRepo = new RequirementProvenanceRepository();
  const sourceRepo = new RequirementSourceRepository();

  let projectId: string;
  let otherProjectId: string;

  before(async () => {
    const projectA = await projectService.createProject({
      name: 'Classification Test Project A',
      description: 'Testing classification integration',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Classification Test Project B',
      description: 'Testing project isolation',
    });
    otherProjectId = projectB.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
  });

  it('should classify a manual requirement and verify all invariants', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Password Encryption Policy',
      originalText: 'The system shall encrypt all stored passwords using AES-256.',
      type: 'SECURITY',
      priority: 'HIGH',
    });

    const meta = await classificationService.classifyRequirement(projectId, req.id);

    // Verify metadata properties
    assert.equal(meta.category, 'NON_FUNCTIONAL');
    assert.equal(meta.subCategory, 'SECURITY');
    assert.equal(meta.securityRelevant, true);
    assert.equal(meta.priority, 'HIGH');
    assert.equal(meta.isStale, false);
    assert.equal(meta.reviewStatus, 'GENERATED');
    assert.equal(meta.classificationMethod, 'DETERMINISTIC');

    // Verify Invariants: originalText, key, status are completely unchanged
    const afterReq = await requirementService.getRequirement({
      projectId,
      requirementId: req.id,
    });
    assert.equal(afterReq?.originalText, req.originalText);
    assert.equal(afterReq?.requirementKey, req.requirementKey);
    assert.equal(afterReq?.status, req.status);
  });

  it('should classify a requirement with provenance and normalized representation', async () => {
    const source = await sourceRepo.createSource({
      projectId,
      sourceType: 'PASTED_TEXT',
      name: 'Auth Spec Paste',
    });

    const req = await requirementService.createRequirement({
      projectId,
      requirementSourceId: source.id,
      title: 'Account Lockout',
      originalText: 'Users shall be locked out after 5 consecutive failed login attempts.',
    });

    // Normalize
    await normalizationService.normalizeRequirement({
      projectId,
      requirementId: req.id,
    });

    // Classify
    const meta = await classificationService.classifyRequirement(projectId, req.id);

    assert.equal(meta.category, 'NON_FUNCTIONAL');
    assert.equal(meta.subCategory, 'SECURITY');
    assert.equal(meta.securityRelevant, true);
    assert.equal(meta.domain, 'Authentication');
    assert.ok(meta.tags.includes('account-lockout'));

    // Provenance check
    const prov = await provenanceRepo.findByRequirementId(projectId, req.id);
    assert.ok(prov !== null);
    assert.equal(prov.sourceText, req.originalText);
  });

  it('should support human review and manual override', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Payment Invoice Rule',
      originalText: 'An invoice must not be approved when its total is zero.',
    });

    await classificationService.classifyRequirement(projectId, req.id);

    const updated = await classificationService.updateMetadata({
      projectId,
      requirementId: req.id,
      category: 'BUSINESS_RULE',
      subCategory: 'BUSINESS_LOGIC',
      domain: 'Billing & Payments',
      module: 'Accounts Payable',
      tags: ['invoice', 'approval', 'billing'],
    });

    assert.equal(updated.category, 'BUSINESS_RULE');
    assert.equal(updated.subCategory, 'BUSINESS_LOGIC');
    assert.equal(updated.reviewStatus, 'REVIEWED');
    assert.equal(updated.classificationMethod, 'DETERMINISTIC_REVIEWED');
    assert.equal(updated.domain, 'Billing & Payments');
    assert.equal(updated.module, 'Accounts Payable');
  });

  it('should protect reviewed metadata from silent overwrite unless forced', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Reviewed Requirement',
      originalText: 'The application shall support keyboard navigation.',
    });

    await classificationService.classifyRequirement(projectId, req.id);
    await classificationService.updateMetadata({
      projectId,
      requirementId: req.id,
      category: 'NON_FUNCTIONAL',
      subCategory: 'USABILITY',
    });

    // Rerun classify without force - should return reviewed
    const unforced = await classificationService.classifyRequirement(projectId, req.id);
    assert.equal(unforced.reviewStatus, 'REVIEWED');
    assert.equal(unforced.subCategory, 'USABILITY');

    // Force regenerate
    const forced = await classificationService.regenerateMetadata(projectId, req.id);
    assert.equal(forced.reviewStatus, 'GENERATED');
    assert.equal(forced.classificationMethod, 'DETERMINISTIC');
  });

  it('should detect staleness when requirement original text is modified', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'Staleness Test Requirement',
      originalText: 'The dashboard shall load within 2 seconds.',
    });

    const initial = await classificationService.classifyRequirement(projectId, req.id);
    assert.equal(initial.isStale, false);

    // Edit original requirement text
    await requirementService.updateRequirement({
      projectId,
      requirementId: req.id,
      title: 'Staleness Test Requirement',
      originalText: 'The dashboard shall load within 500 milliseconds.',
    });

    const staleMeta = await classificationService.getMetadata(projectId, req.id);
    assert.ok(staleMeta !== null);
    assert.equal(staleMeta.isStale, true);

    // Regenerate to clear staleness
    const refreshed = await classificationService.regenerateMetadata(projectId, req.id);
    assert.equal(refreshed.isStale, false);
  });

  it('should batch classify requirements with per-item isolation', async () => {
    const req1 = await requirementService.createRequirement({
      projectId,
      title: 'Batch Req 1',
      originalText: 'The API shall respond within 100 ms.',
    });

    const req2 = await requirementService.createRequirement({
      projectId,
      title: 'Batch Req 2',
      originalText: 'The database must run on PostgreSQL.',
    });

    const batchRes = await classificationService.batchClassifyRequirements(projectId, [
      req1.id,
      req2.id,
      '00000000-0000-0000-0000-000000000000', // Non-existent ID
    ]);

    assert.equal(batchRes.classifiedCount, 2);
    assert.equal(batchRes.failedCount, 1);
    assert.equal(batchRes.results.length, 3);
    assert.equal(batchRes.results[0]?.success, true);
    assert.equal(batchRes.results[1]?.success, true);
    assert.equal(batchRes.results[2]?.success, false);
  });

  it('should enforce strict project isolation on classification and query', async () => {
    const reqA = await requirementService.createRequirement({
      projectId,
      title: 'Project A Requirement',
      originalText: 'The system shall authenticate users.',
    });

    await classificationService.classifyRequirement(projectId, reqA.id);

    // Attempt cross-project get
    await assert.rejects(
      async () => {
        await classificationService.getMetadata(otherProjectId, reqA.id);
      },
      { name: 'RequirementNotFoundError' },
    );

    // Attempt cross-project classify
    await assert.rejects(
      async () => {
        await classificationService.classifyRequirement(otherProjectId, reqA.id);
      },
      { name: 'RequirementNotFoundError' },
    );
  });

  it('should cascade delete metadata when requirement is deleted', async () => {
    const req = await requirementService.createRequirement({
      projectId,
      title: 'To Be Deleted',
      originalText: 'The system shall delete temporary files.',
    });

    await classificationService.classifyRequirement(projectId, req.id);

    // Delete requirement
    await requirementService.deleteRequirement({
      projectId,
      requirementId: req.id,
    });

    // Metadata record must be gone
    const meta = await prisma.requirementMetadata.findUnique({
      where: { requirementId: req.id },
    });
    assert.equal(meta, null);
  });
});
