/**
 * @file apps/desktop/src/main/ipc/repository-connection-handlers.test.ts
 * Privileged IPC Handler Security and Validation Tests for Git Repository Connections.
 *
 * CRITICAL INVARIANTS:
 * 1. IPC frame verification (top-level frame check).
 * 2. Strict authentication assertion.
 * 3. Runtime Zod payload validation.
 * 4. Domain error propagation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleCreateRepositoryConnection,
  handleGetRepositoryConnection,
  handleListRepositoryConnections,
  handleUpdateRepositoryConnection,
  handleDeleteRepositoryConnection,
  handleSetActiveRepositoryConnection,
  handleVerifyRepositoryConnection,
  handleImportRepositoryConnection,
  handleCancelRepositoryImport,
  handleResolveRepositorySnapshot,
  handleVerifyGitProviderAuth,
  handleListGitProviderRepos,
  handleListGitProviderBranches,
  setRepositoryConnectionServiceForTest,
} from './repository-connection-handlers.js';
import {
  RepositoryConnectionNotFoundError,
  RepositoryAccessDeniedError,
  RepositoryValidationError,
} from '@ai-quality/core';
import type { RepositoryConnectionService } from '@ai-quality/core';
import type {
  RepositoryConnectionDetails,
  RepositoryConnectionSnapshot,
  RepositoryVerificationResultDto,
  RepositoryImportResultDto,
  GitProviderAccountDto,
  GitProviderRepositoryDto,
  GitBranchDto,
} from '@ai-quality/contracts';
import type { IpcMainInvokeEvent } from 'electron';

describe('Repository Connection IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testConnectionId = '22222222-2222-2222-2222-222222222222';

  const mockConnectionDetails: RepositoryConnectionDetails = {
    id: testConnectionId,
    projectId: testProjectId,
    provider: 'GITHUB',
    repositoryIdentifier: 'octocat/Hello-World',
    repositoryName: 'Hello-World',
    owner: 'octocat',
    repositoryUrl: 'https://github.com/octocat/Hello-World',
    displayName: 'octocat/Hello-World',
    visibility: 'PUBLIC',
    defaultBranch: 'main',
    selectedBranch: 'main',
    selectedRevision: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    importedRevision: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    connectionStatus: 'CONNECTED',
    importStatus: 'IMPORTED',
    isActive: true,
    localPath: '/storage/projects/111/222',
    lastVerifiedAt: dummyDateStr,
    lastImportedAt: dummyDateStr,
    lastFailureReason: null,
    hasCredentials: true,
    fileCount: 42,
    totalSizeBytes: 1048576,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockSnapshot: RepositoryConnectionSnapshot = {
    connectionId: testConnectionId,
    projectId: testProjectId,
    provider: 'GITHUB',
    repositoryIdentifier: 'octocat/Hello-World',
    repositoryName: 'Hello-World',
    owner: 'octocat',
    repositoryUrl: 'https://github.com/octocat/Hello-World',
    branch: 'main',
    revision: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    localPath: '/storage/projects/111/222',
    snapshotTimestamp: dummyDateStr,
  };

  const mockVerificationResult: RepositoryVerificationResultDto = {
    connectionId: testConnectionId,
    accessible: true,
    status: 'ACCESSIBLE',
    resolvedBranch: 'main',
    resolvedRevision: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    verifiedAt: dummyDateStr,
  };

  const mockImportResult: RepositoryImportResultDto = {
    connectionId: testConnectionId,
    status: 'IMPORTED',
    branch: 'main',
    revision: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
    fileCount: 42,
    totalSizeBytes: 1048576,
    durationMs: 350,
    localPath: '/storage/projects/111/222',
  };

  const mockAccount: GitProviderAccountDto = {
    provider: 'GITHUB',
    username: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
    scopes: ['repo', 'read:org'],
  };

  const mockRepos: readonly GitProviderRepositoryDto[] = [
    {
      provider: 'GITHUB',
      repositoryIdentifier: 'octocat/Hello-World',
      name: 'Hello-World',
      owner: 'octocat',
      url: 'https://github.com/octocat/Hello-World',
      visibility: 'PUBLIC',
      defaultBranch: 'main',
    },
  ];

  const mockBranches: readonly GitBranchDto[] = [
    {
      name: 'main',
      commitSha: '7fd1a60b01f91b314f59955a4e4d4e80d8edf11d',
      isDefault: true,
    },
  ];

  const mockService = {
    createConnection: async () => mockConnectionDetails,
    getConnection: async () => mockConnectionDetails,
    listConnections: async () => [mockConnectionDetails],
    updateConnection: async () => mockConnectionDetails,
    deleteConnection: async () => ({ deleted: true as const }),
    setActiveConnection: async () => mockConnectionDetails,
    verifyConnection: async () => mockVerificationResult,
    importRepository: async () => mockImportResult,
    cancelImport: async () => ({ cancelled: true as const }),
    resolveRepositorySnapshot: async () => mockSnapshot,
    verifyProviderAuth: async () => mockAccount,
    listProviderRepositories: async () => mockRepos,
    listProviderBranches: async () => mockBranches,
  } as unknown as RepositoryConnectionService;

  setRepositoryConnectionServiceForTest(mockService);

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://malicious.evil.com/phishing',
    },
  } as unknown as IpcMainInvokeEvent;

  describe('Untrusted Frame Sender Rejection', () => {
    it('rejects IPC requests originating from untrusted child frames', async () => {
      await assert.rejects(
        async () => {
          await handleCreateRepositoryConnection(untrustedEvent, {
            projectId: testProjectId,
            repositoryIdentifier: 'octocat/Hello-World',
          });
        },
        (err: Error) => err.message.includes('untrusted sender frame'),
      );
    });

    it('rejects untrusted sender frame for verify connection', async () => {
      await assert.rejects(
        async () => {
          await handleVerifyRepositoryConnection(untrustedEvent, {
            projectId: testProjectId,
            connectionId: testConnectionId,
          });
        },
        (err: Error) => err.message.includes('untrusted sender frame'),
      );
    });
  });

  describe('Zod Runtime Schema Validation', () => {
    it('rejects invalid projectId format in createConnection', async () => {
      await assert.rejects(
        async () => {
          await handleCreateRepositoryConnection(undefined, {
            projectId: 'invalid-not-uuid',
            repositoryIdentifier: 'octocat/Hello-World',
          });
        },
        (err: Error) => err.name === 'RepositoryValidationError',
      );
    });

    it('rejects empty repositoryIdentifier in createConnection', async () => {
      await assert.rejects(
        async () => {
          await handleCreateRepositoryConnection(undefined, {
            projectId: testProjectId,
            repositoryIdentifier: '',
          });
        },
        (err: Error) => err.name === 'RepositoryValidationError',
      );
    });

    it('rejects missing connectionId in getConnection', async () => {
      await assert.rejects(
        async () => {
          await handleGetRepositoryConnection(undefined, {
            projectId: testProjectId,
            connectionId: '',
          });
        },
        (err: Error) => err.name === 'RepositoryValidationError',
      );
    });
  });

  describe('Successful Operation Handling', () => {
    it('creates repository connection successfully with authorized service', async () => {
      const res = await handleCreateRepositoryConnection(undefined, {
        projectId: testProjectId,
        repositoryIdentifier: 'octocat/Hello-World',
        selectedBranch: 'main',
      });

      assert.strictEqual(res.id, testConnectionId);
      assert.strictEqual(res.repositoryName, 'Hello-World');
    });

    it('handles verify repository access IPC successfully', async () => {
      const res = await handleVerifyRepositoryConnection(undefined, {
        projectId: testProjectId,
        connectionId: testConnectionId,
      });

      assert.strictEqual(res.accessible, true);
      assert.strictEqual(res.resolvedBranch, 'main');
    });

    it('handles import repository IPC successfully', async () => {
      const res = await handleImportRepositoryConnection(undefined, {
        projectId: testProjectId,
        connectionId: testConnectionId,
        branch: 'main',
      });

      assert.strictEqual(res.status, 'IMPORTED');
      assert.strictEqual(res.fileCount, 42);
    });

    it('handles cancel import repository IPC successfully', async () => {
      const res = await handleCancelRepositoryImport(undefined, {
        projectId: testProjectId,
        connectionId: testConnectionId,
      });

      assert.strictEqual(res.cancelled, true);
    });

    it('handles resolve repository snapshot IPC successfully', async () => {
      const res = await handleResolveRepositorySnapshot(undefined, {
        projectId: testProjectId,
        connectionId: testConnectionId,
      });

      assert.strictEqual(res.connectionId, testConnectionId);
      assert.strictEqual(res.branch, 'main');
    });

    it('handles verify Git provider auth IPC successfully', async () => {
      const res = await handleVerifyGitProviderAuth(undefined, {
        provider: 'GITHUB',
        token: 'ghp_mocktoken1234567890',
      });

      assert.strictEqual(res.username, 'octocat');
      assert.strictEqual(res.provider, 'GITHUB');
    });

    it('handles list Git provider repos and branches IPC successfully', async () => {
      const repoRes = await handleListGitProviderRepos(undefined, {
        provider: 'GITHUB',
        token: 'ghp_mocktoken1234567890',
      });
      assert.strictEqual(repoRes.length, 1);
      assert.strictEqual(repoRes[0]?.repositoryIdentifier, 'octocat/Hello-World');

      const branchRes = await handleListGitProviderBranches(undefined, {
        provider: 'GITHUB',
        repositoryIdentifier: 'octocat/Hello-World',
        token: 'ghp_mocktoken1234567890',
      });
      assert.strictEqual(branchRes.length, 1);
      assert.strictEqual(branchRes[0]?.name, 'main');
    });
  });

  describe('Domain Error Propagation', () => {
    it('propagates RepositoryAccessDeniedError from service', async () => {
      const failingService = {
        ...mockService,
        getConnection: async () => {
          throw new RepositoryAccessDeniedError('Project access denied.');
        },
      } as unknown as RepositoryConnectionService;
      setRepositoryConnectionServiceForTest(failingService);

      await assert.rejects(
        async () => {
          await handleGetRepositoryConnection(undefined, {
            projectId: testProjectId,
            connectionId: testConnectionId,
          });
        },
        (err: Error) => err instanceof RepositoryAccessDeniedError,
      );
    });

    it('propagates RepositoryConnectionNotFoundError from service', async () => {
      const failingService = {
        ...mockService,
        getConnection: async () => {
          throw new RepositoryConnectionNotFoundError();
        },
      } as unknown as RepositoryConnectionService;
      setRepositoryConnectionServiceForTest(failingService);

      await assert.rejects(
        async () => {
          await handleGetRepositoryConnection(undefined, {
            projectId: testProjectId,
            connectionId: testConnectionId,
          });
        },
        (err: Error) => err instanceof RepositoryConnectionNotFoundError,
      );
    });
  });
});
