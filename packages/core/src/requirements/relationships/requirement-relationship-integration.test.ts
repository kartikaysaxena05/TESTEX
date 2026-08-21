/**
 * @file packages/core/src/requirements/relationships/requirement-relationship-integration.test.ts
 * Integration tests for RequirementRelationshipService with PostgreSQL and Prisma.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementRelationshipService } from './requirement-relationship-service.js';

describe('RequirementRelationshipService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const requirementService = new RequirementService();
  const relationshipService = new RequirementRelationshipService();

  let projectId: string;
  let otherProjectId: string;
  let req1Id: string;
  let req2Id: string;
  let req3Id: string;
  let otherReqId: string;

  before(async () => {
    const projectA = await projectService.createProject({
      name: 'Relationship Integration Project A',
      description: 'Testing relationship mapping integration',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Relationship Integration Project B',
      description: 'Testing cross-project isolation',
    });
    otherProjectId = projectB.id;

    // Create requirements in Project A
    const r1 = await requirementService.createRequirement({
      projectId,
      title: 'User Login Authentication',
      originalText: 'The system shall allow users to log in securely with credentials.',
      requirementKey: 'REQ-001',
    });
    req1Id = r1.id;

    const r2 = await requirementService.createRequirement({
      projectId,
      title: 'User Password Reset',
      originalText: 'The password reset flow depends on REQ-001 for user verification.',
      requirementKey: 'REQ-002',
    });
    req2Id = r2.id;

    const r3 = await requirementService.createRequirement({
      projectId,
      title: 'Account Lockout Rule',
      originalText: 'Account lockout constrains REQ-001 after 5 consecutive failed attempts.',
      requirementKey: 'REQ-003',
    });
    req3Id = r3.id;

    // Create requirement in Project B
    const otherReq = await requirementService.createRequirement({
      projectId: otherProjectId,
      title: 'Isolated Feature',
      originalText: 'This is in project B.',
      requirementKey: 'REQ-001',
    });
    otherReqId = otherReq.id;
  });

  after(async () => {
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (otherProjectId) {
      await prisma.project.deleteMany({ where: { id: otherProjectId } });
    }
  });

  it('proposes and persists relationships deterministically', async () => {
    const result = await relationshipService.proposeRelationships({
      projectId,
    });

    assert.ok(result.proposedCount >= 2);
    assert.strictEqual(result.cycles.length, 0);

    // Verify relations in DB
    const list = await relationshipService.getRelationships({
      projectId,
      requirementId: req2Id,
    });

    assert.ok(list.length >= 1);
    const dep = list.find(r => r.relationshipType === 'DEPENDS_ON');
    assert.ok(dep);
    assert.strictEqual(dep?.status, 'PROPOSED');
    assert.strictEqual(dep?.sourceRequirementKey, 'REQ-002');
    assert.strictEqual(dep?.targetRequirementKey, 'REQ-001');
  });

  it('reviews relationship to CONFIRMED and REJECTED status', async () => {
    const list = await relationshipService.getRelationships({
      projectId,
      requirementId: req2Id,
    });
    const rel = list[0]!;

    const confirmed = await relationshipService.reviewRelationship({
      projectId,
      relationshipId: rel.id,
      status: 'CONFIRMED',
      reviewRationale: 'Verified dependency by team lead.',
    });

    assert.strictEqual(confirmed.status, 'CONFIRMED');
    assert.strictEqual(confirmed.reviewRationale, 'Verified dependency by team lead.');

    const rejected = await relationshipService.reviewRelationship({
      projectId,
      relationshipId: rel.id,
      status: 'REJECTED',
      reviewRationale: 'Not a true dependency.',
    });

    assert.strictEqual(rejected.status, 'REJECTED');
  });

  it('creates manual relationship with confirmed status', async () => {
    const manual = await relationshipService.createManualRelationship({
      projectId,
      sourceRequirementId: req1Id,
      targetRequirementId: req3Id,
      relationshipType: 'RELATED_TO',
      reviewRationale: 'Manual domain link',
    });

    assert.strictEqual(manual.status, 'CONFIRMED');
    assert.strictEqual(manual.detectionMethod, 'MANUAL');
    assert.strictEqual(manual.relationshipType, 'RELATED_TO');
  });

  it('rejects self-relationships with SelfRelationshipError', async () => {
    await assert.rejects(
      async () => {
        await relationshipService.createManualRelationship({
          projectId,
          sourceRequirementId: req1Id,
          targetRequirementId: req1Id,
          relationshipType: 'DEPENDS_ON',
        });
      },
      { name: 'SelfRelationshipError' },
    );
  });

  it('rejects cross-project relationship creation', async () => {
    await assert.rejects(
      async () => {
        await relationshipService.createManualRelationship({
          projectId,
          sourceRequirementId: req1Id,
          targetRequirementId: otherReqId,
          relationshipType: 'DEPENDS_ON',
        });
      },
      { name: 'RequirementNotFoundError' },
    );
  });

  it('retrieves relationship graph and edge counts', async () => {
    const graph = await relationshipService.getRelationshipGraph({
      projectId,
    });

    assert.strictEqual(graph.projectId, projectId);
    assert.ok(graph.nodes.length >= 3);
    assert.ok(graph.edges.length >= 2);
    assert.strictEqual(typeof graph.confirmedEdgeCount, 'number');
    assert.strictEqual(typeof graph.proposedEdgeCount, 'number');
  });

  it('deletes relationship record cleanly', async () => {
    const manual = await relationshipService.createManualRelationship({
      projectId,
      sourceRequirementId: req2Id,
      targetRequirementId: req3Id,
      relationshipType: 'CONFLICTS_WITH',
    });

    const deleteRes = await relationshipService.deleteRelationship({
      projectId,
      relationshipId: manual.id,
    });

    assert.strictEqual(deleteRes.deleted, true);

    const check = await prisma.requirementRelationship.findUnique({
      where: { id: manual.id },
    });
    assert.strictEqual(check, null);
  });
});
