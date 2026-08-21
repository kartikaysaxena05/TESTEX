import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeService } from './change-service.js';
import type { SnapshotRepository } from '../snapshots/snapshot-repository.js';
import type { SourceRepository } from '../source-repository.js';
import type { ProjectRepository } from '../../projects/project-repository.js';
import type { RepositoryIndexRepository } from '../indexing/repository-index-repository.js';
import type { ArchitectureRepository } from '../architecture/architecture-repository.js';

describe('ChangeService Unit Tests', () => {
  const mockProjectRepo = {
    getProjectById: async (id: string) => {
      if (id === 'proj-active') return { id, name: 'Active', status: 'ACTIVE' };
      return null;
    },
  } as unknown as ProjectRepository;

  it('should return empty change set with warning when no baseline is selected', async () => {
    const mockSourceRepo = {
      getSourceByProjectId: async () => ({
        id: 'src-1',
        projectId: 'proj-active',
        activeBaselineSnapshotId: null,
      }),
    } as unknown as SourceRepository;

    const service = new ChangeService(
      {} as SnapshotRepository,
      mockSourceRepo,
      mockProjectRepo,
      {} as RepositoryIndexRepository,
      {} as ArchitectureRepository,
    );

    const changes = await service.getChanges('proj-active');
    assert.ok(changes);
    assert.strictEqual(changes.totalChanges, 0);
    assert.ok(changes.warnings.some(w => w.includes('No baseline snapshot')));
  });
});
