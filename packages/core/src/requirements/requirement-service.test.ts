/**
 * @file packages/core/src/requirements/requirement-service.test.ts
 * Unit tests for RequirementService enforcing identity rules, lifecycle state transitions, and project isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RequirementStatus } from '@ai-quality/contracts';
import { RequirementService } from './requirement-service.js';
import type { RequirementRepository, RequirementWithSource } from './requirement-repository.js';
import type {
  RequirementSourceRepository,
  RequirementSourceWithCount,
} from './requirement-source-repository.js';
import type { ProjectRepository } from '../projects/project-repository.js';
import {
  ProjectNotFoundError,
  ProjectArchivedError,
  ProjectValidationError,
} from '../projects/project-errors.js';
import {
  RequirementNotFoundError,
  RequirementSourceNotFoundError,
  RequirementKeyConflictError,
  InvalidRequirementTransitionError,
} from './requirement-errors.js';

describe('RequirementService Unit Tests', () => {
  const activeProjectId = '11111111-1111-4111-8111-111111111111';
  const archivedProjectId = '22222222-2222-4222-8222-222222222222';
  const otherProjectId = '33333333-3333-4333-8333-333333333333';

  const mockProjectRepo = {
    getProjectById: async (id: string) => {
      if (id === activeProjectId) {
        return { id, name: 'Active Project', status: 'ACTIVE' };
      }
      if (id === archivedProjectId) {
        return { id, name: 'Archived Project', status: 'ARCHIVED' };
      }
      if (id === otherProjectId) {
        return { id, name: 'Other Project', status: 'ACTIVE' };
      }
      return null;
    },
  } as unknown as ProjectRepository;

  const sampleSource: RequirementSourceWithCount = {
    id: 'src-1',
    projectId: activeProjectId,
    name: 'Manual Requirements',
    sourceType: 'MANUAL',
    status: 'ACTIVE',
    description: 'Manually entered',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { requirements: 1 },
  };

  const sampleRequirement: RequirementWithSource = {
    id: 'req-1',
    projectId: activeProjectId,
    requirementSourceId: 'src-1',
    requirementKey: 'REQ-001',
    title: 'User Login',
    originalText: 'The user shall be able to login with email and password.',
    type: 'FUNCTIONAL',
    priority: 'HIGH',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    requirementSource: { id: 'src-1', name: 'Manual Requirements' },
  };

  it('should reject operations with invalid projectId', async () => {
    const service = new RequirementService(
      {} as RequirementRepository,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    await assert.rejects(
      async () => await service.listRequirements({ projectId: '' }),
      ProjectValidationError,
    );
  });

  it('should throw ProjectNotFoundError if project does not exist', async () => {
    const service = new RequirementService(
      {} as RequirementRepository,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    await assert.rejects(
      async () =>
        await service.listRequirements({ projectId: '99999999-9999-4999-8999-999999999999' }),
      ProjectNotFoundError,
    );
  });

  it('should create requirement and auto-associate with manual source if not specified', async () => {
    let createdRecord: Record<string, unknown> | null = null;

    const mockSourceRepo = {
      getOrCreateManualSource: async (projId: string) => {
        assert.strictEqual(projId, activeProjectId);
        return sampleSource;
      },
    } as unknown as RequirementSourceRepository;

    const mockReqRepo = {
      createRequirement: async (input: Record<string, unknown>) => {
        createdRecord = input;
        return {
          ...sampleRequirement,
          ...input,
          requirementSource: { id: 'src-1', name: 'Manual Requirements' },
        };
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(mockReqRepo, mockSourceRepo, mockProjectRepo);

    const result = await service.createRequirement({
      projectId: activeProjectId,
      requirementKey: 'REQ-001',
      title: 'User Login',
      originalText: 'The user shall be able to login with email and password.',
      type: 'FUNCTIONAL',
      priority: 'HIGH',
      status: 'ACTIVE',
    });

    assert.ok(result);
    assert.strictEqual(result.requirementKey, 'REQ-001');
    assert.strictEqual(result.title, 'User Login');
    assert.strictEqual(result.requirementSourceName, 'Manual Requirements');
    assert.ok(createdRecord);
  });

  it('should reject requirement creation in an ARCHIVED project', async () => {
    const service = new RequirementService(
      {} as RequirementRepository,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    await assert.rejects(
      async () =>
        await service.createRequirement({
          projectId: archivedProjectId,
          requirementKey: 'REQ-001',
          title: 'User Login',
          originalText: 'Some requirement text',
        }),
      ProjectArchivedError,
    );
  });

  it('should reject requirement creation if specified requirementSourceId belongs to another project', async () => {
    const mockSourceRepo = {
      getSourceById: async (projId: string, sourceId: string) => {
        if (projId === activeProjectId && sourceId === 'src-1') return sampleSource;
        return null;
      },
    } as unknown as RequirementSourceRepository;

    const service = new RequirementService(
      {} as RequirementRepository,
      mockSourceRepo,
      mockProjectRepo,
    );

    await assert.rejects(
      async () =>
        await service.createRequirement({
          projectId: activeProjectId,
          requirementSourceId: 'foreign-source-id',
          requirementKey: 'REQ-001',
          title: 'User Login',
          originalText: 'Some requirement text',
        }),
      RequirementSourceNotFoundError,
    );
  });

  it('should propagate key conflict error cleanly', async () => {
    const mockSourceRepo = {
      getOrCreateManualSource: async () => sampleSource,
    } as unknown as RequirementSourceRepository;

    const mockReqRepo = {
      createRequirement: async () => {
        throw new RequirementKeyConflictError('Key conflict');
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(mockReqRepo, mockSourceRepo, mockProjectRepo);

    await assert.rejects(
      async () =>
        await service.createRequirement({
          projectId: activeProjectId,
          requirementKey: 'REQ-001',
          title: 'User Login',
          originalText: 'Some requirement text',
        }),
      RequirementKeyConflictError,
    );
  });

  it('should get requirement by key scoped strictly to project', async () => {
    const mockReqRepo = {
      getRequirementByKey: async (projId: string, key: string) => {
        if (projId === activeProjectId && key === 'REQ-001') {
          return sampleRequirement;
        }
        return null;
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(
      mockReqRepo,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    const found = await service.getRequirementByKey({
      projectId: activeProjectId,
      requirementKey: 'REQ-001',
    });
    assert.ok(found);
    assert.strictEqual(found.requirementKey, 'REQ-001');

    // Cross-project query by key must return null
    const notFound = await service.getRequirementByKey({
      projectId: otherProjectId,
      requirementKey: 'REQ-001',
    });
    assert.strictEqual(notFound, null);
  });

  it('should update requirement successfully with mass-assignment protection', async () => {
    let updatePayload: Record<string, unknown> | null = null;

    const mockReqRepo = {
      getRequirementById: async () => sampleRequirement,
      updateRequirement: async (projId: string, reqId: string, data: Record<string, unknown>) => {
        assert.strictEqual(projId, activeProjectId);
        assert.strictEqual(reqId, 'req-1');
        updatePayload = data;
        return {
          ...sampleRequirement,
          ...data,
        };
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(
      mockReqRepo,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    const result = await service.updateRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
      title: 'Updated Login Title',
      priority: 'CRITICAL',
    });

    assert.strictEqual(result.title, 'Updated Login Title');
    assert.strictEqual(result.priority, 'CRITICAL');
    assert.deepStrictEqual(updatePayload, {
      title: 'Updated Login Title',
      originalText: undefined,
      type: undefined,
      priority: 'CRITICAL',
      status: undefined,
    });
  });

  it('should enforce allowed lifecycle state transitions and reject invalid ones', async () => {
    let currentStatus = 'DRAFT' as const;

    const mockReqRepo = {
      getRequirementById: async () => ({
        ...sampleRequirement,
        status: currentStatus,
      }),
      updateStatus: async (_projId: string, _reqId: string, status: RequirementStatus) => {
        currentStatus = status as 'DRAFT';
        return { ...sampleRequirement, status };
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(
      mockReqRepo,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    // DRAFT -> ACTIVE (Allowed)
    const activated = await service.activateRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
    });
    assert.strictEqual(activated.status, 'ACTIVE');

    // ACTIVE -> DEPRECATED (Allowed)
    const deprecated = await service.deprecateRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
    });
    assert.strictEqual(deprecated.status, 'DEPRECATED');

    // DEPRECATED -> ARCHIVED (Allowed)
    const archived = await service.archiveRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
    });
    assert.strictEqual(archived.status, 'ARCHIVED');

    // ARCHIVED -> DEPRECATED (Forbidden!)
    await assert.rejects(
      async () =>
        await service.deprecateRequirement({
          projectId: activeProjectId,
          requirementId: 'req-1',
        }),
      InvalidRequirementTransitionError,
    );

    // ARCHIVED -> ACTIVE (Allowed restore)
    const restored = await service.restoreRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
    });
    assert.strictEqual(restored.status, 'ACTIVE');
  });

  it('should throw RequirementNotFoundError when updating a requirement in another project', async () => {
    const mockReqRepo = {
      getRequirementById: async (projId: string) => {
        if (projId === otherProjectId) return null;
        return sampleRequirement;
      },
      updateRequirement: async (projId: string) => {
        if (projId === otherProjectId) return null;
        return sampleRequirement;
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(
      mockReqRepo,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    await assert.rejects(
      async () =>
        await service.updateRequirement({
          projectId: otherProjectId,
          requirementId: 'req-1',
          title: 'Malicious Cross-Project Edit',
        }),
      RequirementNotFoundError,
    );
  });

  it('should delete requirement and reject cross-project deletion', async () => {
    const mockReqRepo = {
      deleteRequirement: async (projId: string, reqId: string) => {
        if (projId === activeProjectId && reqId === 'req-1') return true;
        return false;
      },
    } as unknown as RequirementRepository;

    const service = new RequirementService(
      mockReqRepo,
      {} as RequirementSourceRepository,
      mockProjectRepo,
    );

    const deleted = await service.deleteRequirement({
      projectId: activeProjectId,
      requirementId: 'req-1',
    });
    assert.strictEqual(deleted.deleted, true);

    await assert.rejects(
      async () =>
        await service.deleteRequirement({
          projectId: otherProjectId,
          requirementId: 'req-1',
        }),
      RequirementNotFoundError,
    );
  });
});
