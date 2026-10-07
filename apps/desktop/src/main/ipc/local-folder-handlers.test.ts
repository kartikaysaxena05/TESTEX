/**
 * @file apps/desktop/src/main/ipc/local-folder-handlers.test.ts
 * Privileged IPC Handler Security and Validation Tests for Local Project Folder Connection (Phase 121).
 *
 * CRITICAL INVARIANTS:
 * 1. IPC sender frame verification (untrusted frames rejected with UNAUTHORIZED_SENDER).
 * 2. Strict authentication assertion (unauthenticated requests mapped to LOCAL_FOLDER_ACCESS_DENIED).
 * 3. Runtime Zod payload validation (malformed arguments mapped to VALIDATION_ERROR).
 * 4. Domain error envelope translation (10 specific error codes).
 * 5. Full coverage of all 10 local folder operations.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleConnectLocalFolder,
  handleDisconnectLocalFolder,
  handleValidateLocalFolder,
  handleGetLocalFolder,
  handleListProjectDirectory,
  handleReadProjectFile,
  handleSearchProjectFiles,
  handleCheckProjectFileExists,
  handleGetProjectFileMetadata,
  handleDetectProjectGit,
  setLocalFolderServiceForTest,
  setSecureFileAccessServiceForTest,
} from './local-folder-handlers.js';
import {
  setAuthServiceForTest,
  setSecureStorageForTest,
} from './auth-handlers.js';
import {
  LocalFolderNotFoundError,
  LocalFolderAccessDeniedError,
  LocalFolderNotConfiguredError,
  LocalFolderPathTraversalError,
  LocalFolderSymlinkEscapeError,
  LocalFolderPermissionDeniedError,
  LocalFolderFileTooLargeError,
  LocalFolderFileNotFoundError,
  LocalFolderInvalidPathError,
  type LocalFolderService,
  type SecureFileAccessService,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  LocalFolderConnectionDto,
  ProjectDirectoryListingDto,
  ProjectFileContentDto,
  ProjectFileSearchResultDto,
  ProjectFileExistsResultDto,
  ProjectFileMetadataDto,
  ProjectGitDetectionDto,
} from '@ai-quality/contracts';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = 'mock-valid-session-token';
  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
  }
  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }
  public async clearSessionToken(): Promise<void> {
    this.token = null;
  }
}

describe('Phase 121 Local Folder IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';

  const mockFolderConnection: LocalFolderConnectionDto = {
    id: 'source-123',
    projectId: testProjectId,
    displayName: 'my-project',
    rootPath: '/Users/test/projects/my-project',
    availability: 'AVAILABLE',
    status: 'CONNECTED',
    isGitRepository: true,
    currentBranch: 'main',
    headCommit: 'a1b2c3d4e5f67890',
    identityFingerprint: 'fp-12345',
    filesystemCreatedAt: dummyDateStr,
    filesystemModifiedAt: dummyDateStr,
    lastValidatedAt: dummyDateStr,
    createdAt: dummyDateStr,
    updatedAt: dummyDateStr,
  };

  const mockListing: ProjectDirectoryListingDto = {
    relativeDirectoryPath: '',
    entries: [
      {
        name: 'src',
        relativePath: 'src',
        kind: 'directory',
        sizeBytes: 0,
        modifiedAt: dummyDateStr,
        isBinary: false,
        extension: '',
      },
    ],
    truncated: false,
    totalEntries: 1,
    isGitRepository: true,
  };

  const mockFileContent: ProjectFileContentDto = {
    relativePath: 'package.json',
    content: '{"name": "test"}',
    isBinary: false,
    encoding: 'utf-8',
    sizeBytes: 16,
    isTruncated: false,
    lineCount: 1,
    modifiedAt: dummyDateStr,
  };

  const mockSearchResult: ProjectFileSearchResultDto = {
    query: 'test',
    matches: [],
    totalMatches: 0,
    truncated: false,
    durationMs: 12,
  };

  const mockExistsResult: ProjectFileExistsResultDto = {
    exists: true,
    kind: 'file',
    sizeBytes: 1024,
  };

  const mockMetadata: ProjectFileMetadataDto = {
    name: 'index.ts',
    relativePath: 'src/index.ts',
    kind: 'file',
    sizeBytes: 1024,
    createdAt: dummyDateStr,
    modifiedAt: dummyDateStr,
    isBinary: false,
    extension: '.ts',
    isGitRepository: false,
  };

  const mockGitDetection: ProjectGitDetectionDto = {
    isGitRepository: true,
    currentBranch: 'main',
    headCommit: 'a1b2c3d4e5f67890',
    isDetachedHead: false,
    repositoryRoot: '/Users/test/projects/my-project',
  };

  let mockSecureStorage: MockSecureStorage;

  const trustedEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      parent: null,
      url: 'https://attacker.evil.com/exploit',
    },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    mockSecureStorage = new MockSecureStorage();
    setSecureStorageForTest(mockSecureStorage);

    const mockAuthService = {
      validateSession: async () => ({
        user: {
          id: testUserId,
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerified: true,
        },
      }),
    } as unknown as AuthenticationService;
    setAuthServiceForTest(mockAuthService);

    const mockFolderService = {
      connectLocalFolder: async () => mockFolderConnection,
      disconnectLocalFolder: async () => true,
      validateLocalFolder: async () => mockFolderConnection,
      getLocalFolder: async () => mockFolderConnection,
    } as unknown as LocalFolderService;
    setLocalFolderServiceForTest(mockFolderService);

    const mockFileService = {
      listDirectory: async () => mockListing,
      readFile: async () => mockFileContent,
      search: async () => mockSearchResult,
      checkExists: async () => mockExistsResult,
      getMetadata: async () => mockMetadata,
      detectGit: async () => mockGitDetection,
    } as unknown as SecureFileAccessService;
    setSecureFileAccessServiceForTest(mockFileService);
  });

  describe('Untrusted Frame Sender Rejection', () => {
    it('rejects connectLocalFolder when sender is untrusted', async () => {
      const result = await handleConnectLocalFolder(untrustedEvent, {
        projectId: testProjectId,
        directoryPath: '/Users/test/projects/my-project',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects readFile when sender is untrusted', async () => {
      const result = await handleReadProjectFile(untrustedEvent, {
        projectId: testProjectId,
        relativePath: 'package.json',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects search when sender is untrusted', async () => {
      const result = await handleSearchProjectFiles(untrustedEvent, {
        projectId: testProjectId,
        query: 'secret',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });

  describe('Authentication Assertion & Session Validation', () => {
    it('returns LOCAL_FOLDER_ACCESS_DENIED when no session token is present', async () => {
      mockSecureStorage.token = null;
      const result = await handleConnectLocalFolder(trustedEvent, {
        projectId: testProjectId,
        directoryPath: '/Users/test/projects/my-project',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_ACCESS_DENIED');
      }
    });
  });

  describe('Zod Schema Validation', () => {
    it('rejects invalid UUID projectId with VALIDATION_ERROR', async () => {
      const result = await handleConnectLocalFolder(trustedEvent, {
        projectId: 'not-a-uuid',
        directoryPath: '/Users/test/projects/my-project',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('rejects empty query in searchProjectFiles with VALIDATION_ERROR', async () => {
      const result = await handleSearchProjectFiles(trustedEvent, {
        projectId: testProjectId,
        query: '',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('rejects empty relativePath in readProjectFile with VALIDATION_ERROR', async () => {
      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: '',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Domain Error Translation into DesktopResult', () => {
    it('translates LocalFolderPathTraversalError to LOCAL_FOLDER_PATH_TRAVERSAL', async () => {
      setSecureFileAccessServiceForTest({
        readFile: async () => {
          throw new LocalFolderPathTraversalError('Path attempts traversal outside root');
        },
      } as unknown as SecureFileAccessService);

      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: '../../etc/passwd',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_PATH_TRAVERSAL');
      }
    });

    it('translates LocalFolderSymlinkEscapeError to LOCAL_FOLDER_SYMLINK_ESCAPE', async () => {
      setSecureFileAccessServiceForTest({
        readFile: async () => {
          throw new LocalFolderSymlinkEscapeError('Symlink points outside project root');
        },
      } as unknown as SecureFileAccessService);

      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'symlink-to-etc',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_SYMLINK_ESCAPE');
      }
    });

    it('translates LocalFolderPermissionDeniedError to LOCAL_FOLDER_PERMISSION_DENIED', async () => {
      setLocalFolderServiceForTest({
        connectLocalFolder: async () => {
          throw new LocalFolderPermissionDeniedError('Permission denied accessing path');
        },
      } as unknown as LocalFolderService);

      const result = await handleConnectLocalFolder(trustedEvent, {
        projectId: testProjectId,
        directoryPath: '/root/forbidden',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_PERMISSION_DENIED');
      }
    });

    it('translates LocalFolderFileTooLargeError to LOCAL_FOLDER_FILE_TOO_LARGE', async () => {
      setSecureFileAccessServiceForTest({
        readFile: async () => {
          throw new LocalFolderFileTooLargeError('File exceeds 10MB limit');
        },
      } as unknown as SecureFileAccessService);

      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'huge-data.bin',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_FILE_TOO_LARGE');
      }
    });

    it('translates LocalFolderFileNotFoundError to LOCAL_FOLDER_FILE_NOT_FOUND', async () => {
      setSecureFileAccessServiceForTest({
        readFile: async () => {
          throw new LocalFolderFileNotFoundError('File not found');
        },
      } as unknown as SecureFileAccessService);

      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'missing.txt',
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_FILE_NOT_FOUND');
      }
    });

    it('translates LocalFolderNotFoundError to LOCAL_FOLDER_NOT_FOUND', async () => {
      setLocalFolderServiceForTest({
        validateLocalFolder: async () => {
          throw new LocalFolderNotFoundError('Directory does not exist');
        },
      } as unknown as LocalFolderService);

      const result = await handleValidateLocalFolder(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_NOT_FOUND');
      }
    });

    it('translates LocalFolderNotConfiguredError to LOCAL_FOLDER_NOT_CONFIGURED', async () => {
      setSecureFileAccessServiceForTest({
        listDirectory: async () => {
          throw new LocalFolderNotConfiguredError('No local directory configured for project');
        },
      } as unknown as SecureFileAccessService);

      const result = await handleListProjectDirectory(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'LOCAL_FOLDER_NOT_CONFIGURED');
      }
    });
  });

  describe('Successful Service Delegation', () => {
    it('connects local folder and returns DTO', async () => {
      const result = await handleConnectLocalFolder(trustedEvent, {
        projectId: testProjectId,
        directoryPath: '/Users/test/projects/my-project',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.id, 'source-123');
        assert.strictEqual(result.data.status, 'CONNECTED');
        assert.strictEqual(result.data.isGitRepository, true);
      }
    });

    it('disconnects local folder and returns boolean', async () => {
      const result = await handleDisconnectLocalFolder(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data, true);
      }
    });

    it('validates local folder and returns updated status', async () => {
      const result = await handleValidateLocalFolder(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.status, 'CONNECTED');
      }
    });

    it('retrieves local folder connection', async () => {
      const result = await handleGetLocalFolder(trustedEvent, testProjectId);
      assert.strictEqual(result.ok, true);
      if (result.ok && result.data) {
        assert.strictEqual(result.data.rootPath, '/Users/test/projects/my-project');
      }
    });

    it('lists directory securely with entries', async () => {
      const result = await handleListProjectDirectory(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.entries.length, 1);
        assert.strictEqual(result.data.entries[0]?.name, 'src');
      }
    });

    it('reads project file with safe encoding', async () => {
      const result = await handleReadProjectFile(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'package.json',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.relativePath, 'package.json');
        assert.strictEqual(result.data.content, '{"name": "test"}');
      }
    });

    it('searches project files within boundaries', async () => {
      const result = await handleSearchProjectFiles(trustedEvent, {
        projectId: testProjectId,
        query: 'test',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.query, 'test');
      }
    });

    it('checks file existence', async () => {
      const result = await handleCheckProjectFileExists(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'src/index.ts',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.exists, true);
        assert.strictEqual(result.data.kind, 'file');
      }
    });

    it('obtains file metadata', async () => {
      const result = await handleGetProjectFileMetadata(trustedEvent, {
        projectId: testProjectId,
        relativePath: 'src/index.ts',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.sizeBytes, 1024);
        assert.strictEqual(result.data.kind, 'file');
      }
    });

    it('detects Git repository details', async () => {
      const result = await handleDetectProjectGit(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.isGitRepository, true);
        assert.strictEqual(result.data.currentBranch, 'main');
      }
    });
  });
});
