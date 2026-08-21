/**
 * @file packages/core/src/requirements/impact/requirement-impact-integration.test.ts
 * Integration tests for Requirement Change Impact candidate generation and review with PostgreSQL.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementVersionService } from '../versioning/requirement-version-service.js';
import { RequirementImpactService } from './requirement-impact-service.js';
import { RequirementRelationshipService } from '../relationships/requirement-relationship-service.js';
import { RequirementNotFoundError } from '../requirement-errors.js';

describe('RequirementImpactService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const requirementService = new RequirementService();
  const versionService = new RequirementVersionService();
  const relationshipService = new RequirementRelationshipService();
  const impactService = new RequirementImpactService();

  let projectId: string;
  let otherProjectId: string;
  let reqAId: string;
  let reqBId: string;
  let reqCId: string;

  before(async () => {
    const projectA = await projectService.createProject({
      name: 'Impact Integration Project A',
      description: 'Testing change impact candidates',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Impact Integration Project B',
      description: 'Project isolation checks',
    });
    otherProjectId = projectB.id;

    // Create 3 requirements
    const reqA = await requirementService.createRequirement({
      projectId,
      title: 'Auth Core',
      originalText: 'System shall generate JWT authentication tokens.',
    });
    reqAId = reqA.id;

    const reqB = await requirementService.createRequirement({
      projectId,
      title: 'Session Management',
      originalText: 'System shall validate JWT tokens on each request.',
    });
    reqBId = reqB.id;

    const reqC = await requirementService.createRequirement({
      projectId,
      title: 'User Profile API',
      originalText: 'System shall return user profile for valid sessions.',
    });
    reqCId = reqC.id;

    // Create dependency relationships:
    // reqB depends on reqA
    await relationshipService.createManualRelationship({
      projectId,
      sourceRequirementId: reqBId,
      targetRequirementId: reqAId,
      relationshipType: 'DEPENDS_ON',
      reviewRationale: 'Session validation depends on Auth Core JWT issuance',
    });

    // reqC depends on reqB
    await relationshipService.createManualRelationship({
      projectId,
      sourceRequirementId: reqCId,
      targetRequirementId: reqBId,
      relationshipType: 'DEPENDS_ON',
      reviewRationale: 'User Profile API depends on session validation',
    });
  });

  after(async () => {
    await prisma.requirementChangeImpact.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementRelationship.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirementVersion.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.requirement.deleteMany({
      where: { projectId: { in: [projectId, otherProjectId] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [projectId, otherProjectId] } },
    });
  });

  it('generates direct and transitive impact candidates when a requirement is updated', async () => {
    // Update reqA -> creates Version 2 and triggers impact candidate generation
    await versionService.updateRequirementVersioned({
      projectId,
      requirementId: reqAId,
      expectedVersionNumber: 1,
      originalText: 'System shall generate RS256 signed JWT tokens with 15-min expiry.',
      changeReason: 'Updated token signing algorithm',
    });

    const impact = await impactService.getChangeImpact({
      projectId,
      requirementId: reqAId,
    });

    assert.equal(impact.versionNumber, 2);
    assert.equal(impact.totalCandidates, 2);
    assert.equal(impact.openCount, 2);

    const bCandidate = impact.candidates.find(c => c.targetRequirementId === reqBId);
    const cCandidate = impact.candidates.find(c => c.targetRequirementId === reqCId);

    assert.ok(bCandidate);
    assert.equal(bCandidate?.impactType, 'DEPENDENT_REQUIREMENT');
    assert.equal(bCandidate?.depth, 1);
    assert.equal(bCandidate?.targetRequirementKey, 'REQ-002');
    assert.equal(bCandidate?.status, 'OPEN');

    assert.ok(cCandidate);
    assert.equal(cCandidate?.impactType, 'DEPENDENT_REQUIREMENT');
    assert.equal(cCandidate?.depth, 2);
    assert.equal(cCandidate?.targetRequirementKey, 'REQ-003');
    assert.equal(cCandidate?.status, 'OPEN');
  });

  it('allows reviewing impact candidate and updates open count', async () => {
    const impactBefore = await impactService.getChangeImpact({
      projectId,
      requirementId: reqAId,
    });

    const bCand = impactBefore.candidates.find(c => c.targetRequirementId === reqBId);
    assert.ok(bCand);

    const reviewed = await impactService.reviewChangeImpact({
      projectId,
      impactId: bCand!.id,
      status: 'REVIEWED',
      reviewRationale: 'RS256 token format verified compatible with session validator',
    });

    assert.equal(reviewed.status, 'REVIEWED');
    assert.equal(
      reviewed.reviewRationale,
      'RS256 token format verified compatible with session validator',
    );
    assert.ok(reviewed.reviewedAt);

    const impactAfter = await impactService.getChangeImpact({
      projectId,
      requirementId: reqAId,
    });

    assert.equal(impactAfter.totalCandidates, 2);
    assert.equal(impactAfter.openCount, 1);
  });

  it('enforces project isolation for impact operations', async () => {
    await assert.rejects(
      async () => {
        await impactService.getChangeImpact({
          projectId: otherProjectId,
          requirementId: reqAId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementNotFoundError);
        return true;
      },
    );
  });
});
