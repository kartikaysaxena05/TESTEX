/**
 * @file packages/core/src/requirements/requirement-integration.test.ts
 * Integration tests verifying PostgreSQL persistence, durable key sequence allocation, lifecycle state transitions, and identity immutability.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectService } from '../projects/project-service.js';
import { RequirementService } from './requirement-service.js';
import { InvalidRequirementTransitionError } from './requirement-errors.js';
import { getPrismaClient } from '../database/client.js';

describe('Requirement Intelligence PostgreSQL Integration Tests', () => {
  const projectService = new ProjectService();
  const reqService = new RequirementService();

  let projectAId: string;
  let projectBId: string;

  before(async () => {
    const projA = await projectService.createProject({
      name: 'Requirement Test Project Alpha',
      description: 'Project for testing requirement intelligence foundation',
    });
    projectAId = projA.id;

    const projB = await projectService.createProject({
      name: 'Requirement Test Project Beta',
      description: 'Second project for testing strict project isolation',
    });
    projectBId = projB.id;
  });

  after(async () => {
    // Clean up test projects (cascades requirement records)
    try {
      if (projectAId) {
        await projectService.archiveProject(projectAId);
        await projectService.deleteProject(projectAId);
      }
    } catch {
      // Ignore
    }
    try {
      if (projectBId) {
        await projectService.archiveProject(projectBId);
        await projectService.deleteProject(projectBId);
      }
    } catch {
      // Ignore
    }
  });

  it('should auto-allocate sequential requirement keys REQ-001, REQ-002, REQ-003', async () => {
    const req1 = await reqService.createRequirement({
      projectId: projectAId,
      title: 'First Requirement',
      originalText: 'The user shall be able to login.',
      type: 'SECURITY',
      priority: 'CRITICAL',
    });
    assert.strictEqual(req1.requirementKey, 'REQ-001');

    const req2 = await reqService.createRequirement({
      projectId: projectAId,
      title: 'Second Requirement',
      originalText: 'The user shall be able to reset password.',
      type: 'SECURITY',
      priority: 'HIGH',
    });
    assert.strictEqual(req2.requirementKey, 'REQ-002');

    const req3 = await reqService.createRequirement({
      projectId: projectAId,
      title: 'Third Requirement',
      originalText: 'The user shall receive email verification.',
      type: 'FUNCTIONAL',
      priority: 'MEDIUM',
    });
    assert.strictEqual(req3.requirementKey, 'REQ-003');
  });

  it('should not reuse deleted requirement keys (gap policy)', async () => {
    // Look up and delete REQ-003
    const req3 = await reqService.getRequirementByKey({
      projectId: projectAId,
      requirementKey: 'REQ-003',
    });
    assert.ok(req3);

    await reqService.deleteRequirement({
      projectId: projectAId,
      requirementId: req3.id,
    });

    // Create a new requirement - next key must be REQ-004, NOT REQ-003!
    const req4 = await reqService.createRequirement({
      projectId: projectAId,
      title: 'Fourth Requirement',
      originalText: 'The system shall enforce session timeout.',
    });
    assert.strictEqual(
      req4.requirementKey,
      'REQ-004',
      'Must allocate REQ-004 without reusing REQ-003',
    );
  });

  it('should preserve requirement keys independently per project', async () => {
    // Project B sequence must start at REQ-001
    const reqB1 = await reqService.createRequirement({
      projectId: projectBId,
      title: 'Project B First Requirement',
      originalText: 'Project B specific specification.',
    });
    assert.strictEqual(reqB1.requirementKey, 'REQ-001');
    assert.strictEqual(reqB1.projectId, projectBId);
  });

  it('should preserve database ID and requirementKey immutability across edits and status changes', async () => {
    const req1 = await reqService.getRequirementByKey({
      projectId: projectAId,
      requirementKey: 'REQ-001',
    });
    assert.ok(req1);

    const originalId = req1.id;
    const originalCreatedAt = req1.createdAt;
    const originalKey = req1.requirementKey;

    // Edit title and priority
    const edited = await reqService.updateRequirement({
      projectId: projectAId,
      requirementId: req1.id,
      title: 'Updated Login Specification',
      priority: 'HIGH',
    });

    assert.strictEqual(edited.id, originalId);
    assert.strictEqual(edited.requirementKey, originalKey);
    assert.strictEqual(edited.createdAt, originalCreatedAt);

    // Transition status to ACTIVE
    const activated = await reqService.activateRequirement({
      projectId: projectAId,
      requirementId: req1.id,
    });
    assert.strictEqual(activated.id, originalId);
    assert.strictEqual(activated.requirementKey, originalKey);
    assert.strictEqual(activated.status, 'ACTIVE');

    // Archive and restore
    const archived = await reqService.archiveRequirement({
      projectId: projectAId,
      requirementId: req1.id,
    });
    assert.strictEqual(archived.id, originalId);
    assert.strictEqual(archived.status, 'ARCHIVED');

    const restored = await reqService.restoreRequirement({
      projectId: projectAId,
      requirementId: req1.id,
    });
    assert.strictEqual(restored.id, originalId);
    assert.strictEqual(restored.status, 'ACTIVE');
  });

  it('should reject invalid lifecycle status transitions', async () => {
    const req1 = await reqService.getRequirementByKey({
      projectId: projectAId,
      requirementKey: 'REQ-001',
    });
    assert.ok(req1);

    // Archive req1
    await reqService.archiveRequirement({
      projectId: projectAId,
      requirementId: req1.id,
    });

    // ARCHIVED -> DEPRECATED is forbidden
    await assert.rejects(
      async () =>
        await reqService.deprecateRequirement({
          projectId: projectAId,
          requirementId: req1.id,
        }),
      InvalidRequirementTransitionError,
    );

    // Restore back to ACTIVE
    await reqService.restoreRequirement({
      projectId: projectAId,
      requirementId: req1.id,
    });
  });

  it('should safely handle concurrent requirement creations without duplicate keys', async () => {
    const results = await Promise.all([
      reqService.createRequirement({
        projectId: projectAId,
        title: 'Concurrent Req A',
        originalText: 'Concurrent creation test A',
      }),
      reqService.createRequirement({
        projectId: projectAId,
        title: 'Concurrent Req B',
        originalText: 'Concurrent creation test B',
      }),
      reqService.createRequirement({
        projectId: projectAId,
        title: 'Concurrent Req C',
        originalText: 'Concurrent creation test C',
      }),
    ]);

    const keys = results.map(r => r.requirementKey);
    const uniqueKeys = new Set(keys);
    assert.strictEqual(
      keys.length,
      uniqueKeys.size,
      'All concurrently generated keys must be distinct',
    );
  });

  it('should enforce strict project isolation on list and get operations', async () => {
    const listA = await reqService.listRequirements({ projectId: projectAId });
    const listB = await reqService.listRequirements({ projectId: projectBId });

    assert.ok(listA.total >= 4);
    assert.strictEqual(listB.total, 1);

    const reqA1 = listA.items.find(r => r.requirementKey === 'REQ-001');
    assert.ok(reqA1);

    // Cross-project get by ID: Look up Project A requirement using Project B ID
    const crossProjectLookup = await reqService.getRequirement({
      projectId: projectBId,
      requirementId: reqA1.id,
    });
    assert.strictEqual(
      crossProjectLookup,
      null,
      'Must not return requirement from another project',
    );

    // Cross-project get by key: Project B REQ-001 must return Project B's requirement only
    const keyLookupB = await reqService.getRequirementByKey({
      projectId: projectBId,
      requirementKey: 'REQ-001',
    });
    assert.ok(keyLookupB);
    assert.strictEqual(keyLookupB.projectId, projectBId);
    assert.strictEqual(keyLookupB.title, 'Project B First Requirement');
  });

  it('should cascade delete requirement records when project is deleted', async () => {
    // Create temporary project
    const tempProj = await projectService.createProject({
      name: 'Temp Cascade Project Phase 31',
    });

    const tempReq = await reqService.createRequirement({
      projectId: tempProj.id,
      title: 'Temporary Requirement',
      originalText: 'This will be cascade deleted with the project.',
    });

    assert.ok(tempReq.id);

    // Delete project (archive first)
    await projectService.archiveProject(tempProj.id);
    await projectService.deleteProject(tempProj.id);

    // Verify requirement row is gone from DB
    const prisma = getPrismaClient();
    const remaining = await prisma?.requirement.findFirst({
      where: { id: tempReq.id },
    });
    assert.strictEqual(remaining, null);
  });

  it('should atomically import a batch of requirements linked to a PASTED_TEXT source with sequential keys', async () => {
    const parseResult = await reqService.parseBulkRequirements({
      rawText: `1. The user shall be able to upload profile avatars.
2. The user shall be able to crop profile avatars.
3. The system shall convert avatars to WebP format.`,
    });

    assert.equal(parseResult.candidates.length, 3);

    const importResult = await reqService.importBulkRequirements({
      projectId: projectAId,
      sourceName: 'Avatar Upload Specs',
      candidates: parseResult.candidates.map(c => ({
        originalText: c.originalText,
        title: c.title,
        type: 'FUNCTIONAL',
        priority: 'MEDIUM',
        status: 'ACTIVE',
      })),
    });

    assert.equal(importResult.importedCount, 3);
    assert.equal(importResult.requirements.length, 3);
    assert.equal(importResult.requirementSourceName, 'Avatar Upload Specs');

    for (const r of importResult.requirements) {
      assert.equal(r.projectId, projectAId);
      assert.equal(r.requirementSourceId, importResult.requirementSourceId);
      assert.ok(r.requirementKey.startsWith('REQ-'));
    }
  });

  it('should maintain key sequence uniqueness across concurrent bulk imports and single creations', async () => {
    const concurrentPromises = [
      reqService.importBulkRequirements({
        projectId: projectBId,
        candidates: [
          { originalText: 'Concurrent Bulk 1 - Item A', title: 'CB1-A' },
          { originalText: 'Concurrent Bulk 1 - Item B', title: 'CB1-B' },
        ],
      }),
      reqService.importBulkRequirements({
        projectId: projectBId,
        candidates: [
          { originalText: 'Concurrent Bulk 2 - Item A', title: 'CB2-A' },
          { originalText: 'Concurrent Bulk 2 - Item B', title: 'CB2-B' },
        ],
      }),
      reqService.createRequirement({
        projectId: projectBId,
        title: 'Concurrent Single Item',
        originalText: 'Concurrent single requirement text',
      }),
    ];

    const results = await Promise.all(concurrentPromises);
    const keys = new Set<string>();

    for (const res of results) {
      if ('requirements' in res) {
        for (const req of res.requirements) {
          assert.equal(
            keys.has(req.requirementKey),
            false,
            `Duplicate key detected: ${req.requirementKey}`,
          );
          keys.add(req.requirementKey);
        }
      } else {
        assert.equal(
          keys.has(res.requirementKey),
          false,
          `Duplicate key detected: ${res.requirementKey}`,
        );
        keys.add(res.requirementKey);
      }
    }

    assert.equal(keys.size, 5);
  });
});
