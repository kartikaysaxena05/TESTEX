import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GitStatusDto } from '@ai-quality/contracts';
import { handleGetGitStatus, handleRefreshGitMetadata } from './git-handlers.js';
import { GitService } from '@ai-quality/core';

describe('Git IPC Handlers Unit Tests', () => {
  const sampleGitDto: GitStatusDto = {
    gitAvailable: true,
    gitVersion: '2.50.1',
    isGitRepository: true,
    repositoryRoot: '/tmp/test-repo',
    sourceRelationToRepository: 'ROOT',
    currentBranch: 'main',
    headCommit: 'e4d909c290d0fb1ca068ffaddf22cbd0e0ffae28',
    isDetachedHead: false,
    lastCheckedAt: new Date().toISOString(),
  };

  const validProjectId = '3a773f11-8e6c-470d-8c6a-76f97be584f0';

  const mockService = {
    getGitStatus: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleGitDto;
      }
      return null;
    },
    refreshGitMetadata: async (projectId: string) => {
      if (projectId === validProjectId) {
        return sampleGitDto;
      }
      throw new Error('Project not found');
    },
  } as unknown as GitService;

  it('should handle getGitStatus for a valid project UUID', async () => {
    const result = await handleGetGitStatus(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleGitDto);
  });

  it('should reject getGitStatus with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleGetGitStatus('bad-uuid', mockService),
      /Project ID must be a valid UUID/,
    );
  });

  it('should handle refreshGitMetadata for a valid project UUID', async () => {
    const result = await handleRefreshGitMetadata(validProjectId, mockService);
    assert.deepStrictEqual(result, sampleGitDto);
  });

  it('should reject refreshGitMetadata with malformed UUID', async () => {
    await assert.rejects(
      async () => await handleRefreshGitMetadata('not-a-valid-uuid-format', mockService),
      /Project ID must be a valid UUID/,
    );
  });
});
