/**
 * @file packages/core/src/requirements/versioning/requirement-version-integration.test.ts
 * Integration tests for Requirement Versioning, History, Concurrency, and Diffs with PostgreSQL.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPrismaClient } from '../../database/client.js';
import { ProjectService } from '../../projects/project-service.js';
import { RequirementService } from '../requirement-service.js';
import { RequirementVersionService } from './requirement-version-service.js';
import {
  RequirementVersionConflictError,
  RequirementNotFoundError,
} from '../requirement-errors.js';

describe('RequirementVersionService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  const projectService = new ProjectService();
  const requirementService = new RequirementService();
  const versionService = new RequirementVersionService();

  let projectId: string;
  let otherProjectId: string;
  let requirementId: string;

  before(async () => {
    const projectA = await projectService.createProject({
      name: 'Versioning Integration Project A',
      description: 'Testing requirement versioning',
    });
    projectId = projectA.id;

    const projectB = await projectService.createProject({
      name: 'Versioning Integration Project B',
      description: 'Project isolation checks',
    });
    otherProjectId = projectB.id;

    // Create a base requirement
    const req = await requirementService.createRequirement({
      projectId,
      title: 'User Login System',
      originalText: 'The system shall authenticate users within 5 seconds.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
      status: 'ACTIVE',
    });
    requirementId = req.id;
  });

  after(async () => {
    await prisma.requirementChangeImpact.deleteMany({
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

  it('automatically creates Version 1 on requirement creation', async () => {
    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId,
    });

    assert.equal(history.totalVersions, 1);
    assert.equal(history.currentVersionNumber, 1);
    assert.equal(history.versions[0]?.versionNumber, 1);
    assert.equal(history.versions[0]?.changeKind, 'CREATED');
    assert.equal(history.versions[0]?.title, 'User Login System');
  });

  it('creates Version 2 on text update with optimistic concurrency validation', async () => {
    const updated = await versionService.updateRequirementVersioned({
      projectId,
      requirementId,
      expectedVersionNumber: 1,
      originalText: 'The system shall authenticate users within 2 seconds with MFA.',
      changeReason: 'Stricter latency and security requirement',
    });

    assert.equal(updated.version.versionNumber, 2);
    assert.equal(updated.version.changeKind, 'TEXT_CHANGED');
    assert.equal(updated.version.changeReason, 'Stricter latency and security requirement');
    assert.equal(
      updated.requirement.originalText,
      'The system shall authenticate users within 2 seconds with MFA.',
    );

    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId,
    });
    assert.equal(history.totalVersions, 2);
    assert.equal(history.currentVersionNumber, 2);
  });

  it('rejects update with RequirementVersionConflictError when expectedVersionNumber does not match', async () => {
    await assert.rejects(
      async () => {
        await versionService.updateRequirementVersioned({
          projectId,
          requirementId,
          expectedVersionNumber: 1, // Stale! Current is 2
          originalText: 'Conflicting edit text',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementVersionConflictError);
        assert.equal(err.code, 'REQUIREMENT_VERSION_CONFLICT');
        return true;
      },
    );
  });

  it('performs no-op update when canonical content hash is unchanged', async () => {
    const noOpResult = await versionService.updateRequirementVersioned({
      projectId,
      requirementId,
      expectedVersionNumber: 2,
      originalText: 'The system shall authenticate users within 2 seconds with MFA.', // Same as v2
    });

    assert.equal(noOpResult.version.versionNumber, 2);

    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId,
    });
    assert.equal(history.totalVersions, 2);
  });

  it('computes deterministic diff between Version 1 and Version 2', async () => {
    const diff = await versionService.compareVersions({
      projectId,
      requirementId,
      sourceVersionNumber: 1,
      targetVersionNumber: 2,
    });

    assert.equal(diff.sourceVersionNumber, 1);
    assert.equal(diff.targetVersionNumber, 2);
    assert.equal(diff.isNoOp, false);
    assert.ok(diff.changedFields.includes('originalText'));
    assert.ok(diff.changeKinds.includes('TEXT_CHANGED'));

    // Semantic quantitative constraint change detected
    const quantChange = diff.structuredDiff.find(
      d => d.field === 'semantic:quantitativeConstraint',
    );
    assert.ok(quantChange);
    assert.deepEqual(quantChange?.oldValue, ['5']);
    assert.deepEqual(quantChange?.newValue, ['2']);
  });

  it('restores Version 1 by creating a brand-new Version 3 without mutating history', async () => {
    const restored = await versionService.restoreRequirementVersion({
      projectId,
      requirementId,
      versionNumberToRestore: 1,
      expectedCurrentVersionNumber: 2,
      restoreReason: 'Rollback performance constraint change',
    });

    assert.equal(restored.newVersion.versionNumber, 3);
    assert.equal(restored.newVersion.changeKind, 'RESTORED_VERSION');
    assert.equal(restored.newVersion.changeReason, 'Rollback performance constraint change');
    assert.equal(
      restored.requirement.originalText,
      'The system shall authenticate users within 5 seconds.',
    );

    const history = await versionService.getRequirementHistory({
      projectId,
      requirementId,
    });
    assert.equal(history.totalVersions, 3);
    assert.equal(history.currentVersionNumber, 3);

    // Verify v1 and v2 records are completely untouched
    const v1 = await versionService.getRequirementVersion({
      projectId,
      requirementId,
      versionNumber: 1,
    });
    const v2 = await versionService.getRequirementVersion({
      projectId,
      requirementId,
      versionNumber: 2,
    });
    assert.equal(v1?.versionNumber, 1);
    assert.equal(v2?.versionNumber, 2);
  });

  it('enforces strict project isolation', async () => {
    await assert.rejects(
      async () => {
        await versionService.getRequirementHistory({
          projectId: otherProjectId,
          requirementId,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof RequirementNotFoundError);
        return true;
      },
    );

    const version = await versionService.getRequirementVersion({
      projectId: otherProjectId,
      requirementId,
      versionNumber: 1,
    });
    assert.equal(version, null);
  });
});
