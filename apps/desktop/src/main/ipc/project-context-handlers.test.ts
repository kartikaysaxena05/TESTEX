/**
 * @file apps/desktop/src/main/ipc/project-context-handlers.test.ts
 * Privileged IPC Handler Security and Validation Tests for Unified Project Context (Phase 123).
 *
 * CRITICAL INVARIANTS:
 * 1. IPC sender frame verification (untrusted frames rejected with UNAUTHORIZED_SENDER).
 * 2. Strict authentication assertion.
 * 3. Runtime Zod payload validation (malformed arguments mapped to VALIDATION_ERROR).
 * 4. Domain error envelope translation (7 specific error codes).
 * 5. Full coverage of all 5 project-context operations.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetProjectContext,
  handleDetectProjectSources,
  handleRefreshProjectContext,
  handleInvalidateProjectContext,
  handleGetProjectContextStatus,
  setProjectContextServiceForTest,
} from './project-context-handlers.js';
import { setAuthServiceForTest, setSecureStorageForTest } from './auth-handlers.js';
import {
  ProjectContextNotFoundError,
  ProjectContextAccessDeniedError,
  ProjectContextStaleError,
  ProjectContextInvalidError,
  ProjectContextSourceUnavailableError,
  ProjectContextDetectionFailedError,
  ProjectContextRefreshFailedError,
  type ProjectContextService,
  type AuthenticationService,
} from '@ai-quality/core';
import type {
  ProjectContextDto,
  DetectedProjectSourcesDto,
  ProjectContextStatusDto,
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

describe('Phase 123 Project Context IPC Handlers & Security Tests', () => {
  const dummyDateStr = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const testUserId = 'user-uuid-1111-2222';

  const mockDetectedTechnology = {
    primaryLanguage: 'TypeScript',
    languages: ['TypeScript', 'JavaScript'],
    frameworks: ['React', 'Next.js'],
    packageManager: 'npm',
    likelyEntryPoints: ['src/index.ts'],
    configurationFiles: ['package.json'],
    testDirectories: ['tests'],
    requirementsFiles: ['README.md'],
  };

  const mockProjectContext: ProjectContextDto = {
    projectId: testProjectId,
    projectName: 'Test Project',
    projectDescription: 'Description for testing',
    projectStatus: 'ACTIVE',
    lifecycleState: 'CONNECTED',
    freshness: {
      isStale: false,
      lastRefreshedAt: dummyDateStr,
      staleReasons: [],
    },
    sources: {
      website: null,
      git: null,
      localFolder: null,
    },
    target: {
      baseUrl: 'http://localhost:3000',
      browser: {
        browserEngine: 'chromium',
        headless: true,
        viewportWidth: 1280,
        viewportHeight: 720,
        ignoreHttpsErrors: false,
      },
      environment: null,
    },
    authentication: {
      status: 'CONFIGURED',
      profiles: [],
    },
    detectedTechnology: mockDetectedTechnology,
    repositorySummary: {
      fileCount: 10,
      totalSizeBytes: 2048,
      structureSummary: 'standard structure',
      isGitRepo: false,
      branch: null,
      commit: null,
    },
    requirementsSummary: {
      totalRequirements: 0,
      totalDocuments: 0,
      statusBreakdown: {},
      lastUpdated: null,
    },
    testSummary: {
      totalTestCases: 0,
      automatedCount: 0,
      manualCount: 0,
      priorityBreakdown: {},
    },
    executionSummary: {
      totalRuns: 0,
      lastRunStatus: null,
      lastRunAt: null,
      passRate: null,
    },
    warnings: [],
    errors: [],
  };

  const mockDetectedSources: DetectedProjectSourcesDto = {
    projectId: testProjectId,
    detectedTechnology: mockDetectedTechnology,
    repositorySummary: mockProjectContext.repositorySummary,
    websiteMetadata: null,
  };

  const mockStatus: ProjectContextStatusDto = {
    projectId: testProjectId,
    lifecycleState: 'CONNECTED',
    isStale: false,
    lastRefreshedAt: dummyDateStr,
    connectedSourcesCount: 1,
    warnings: [],
    errors: [],
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

    const mockContextService = {
      getContext: async () => mockProjectContext,
      detectSources: async () => mockDetectedSources,
      refreshContext: async () => mockProjectContext,
      invalidateContext: async () => ({
        ...mockProjectContext,
        lifecycleState: 'STALE',
        freshness: {
          ...mockProjectContext.freshness,
          isStale: true,
          staleReasons: ['Manual test invalidation'],
        },
      }),
      getStatus: async () => mockStatus,
    } as unknown as ProjectContextService;
    setProjectContextServiceForTest(mockContextService);
  });

  describe('Sender Security Validation', () => {
    it('rejects untrusted sender frame for handleGetProjectContext', async () => {
      const result = await handleGetProjectContext(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects untrusted sender frame for handleDetectProjectSources', async () => {
      const result = await handleDetectProjectSources(untrustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects untrusted sender frame for handleRefreshProjectContext', async () => {
      const result = await handleRefreshProjectContext(untrustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects untrusted sender frame for handleInvalidateProjectContext', async () => {
      const result = await handleInvalidateProjectContext(untrustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });

    it('rejects untrusted sender frame for handleGetProjectContextStatus', async () => {
      const result = await handleGetProjectContextStatus(untrustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'UNAUTHORIZED_SENDER');
      }
    });
  });

  describe('Input Zod Validation', () => {
    it('rejects invalid projectId format with VALIDATION_ERROR', async () => {
      const result = await handleGetProjectContext(trustedEvent, { projectId: 'not-a-uuid' });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });

    it('rejects missing projectId payload', async () => {
      const result = await handleDetectProjectSources(trustedEvent, {});
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'VALIDATION_ERROR');
      }
    });
  });

  describe('Successful Operations', () => {
    it('retrieves project context successfully', async () => {
      const result = await handleGetProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.projectId, testProjectId);
        assert.strictEqual(result.data.lifecycleState, 'CONNECTED');
      }
    });

    it('detects sources successfully', async () => {
      const result = await handleDetectProjectSources(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.projectId, testProjectId);
        assert.strictEqual(result.data.detectedTechnology.primaryLanguage, 'TypeScript');
      }
    });

    it('refreshes context successfully', async () => {
      const result = await handleRefreshProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.lifecycleState, 'CONNECTED');
      }
    });

    it('invalidates context successfully', async () => {
      const result = await handleInvalidateProjectContext(trustedEvent, {
        projectId: testProjectId,
        reason: 'Manual test invalidation',
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.lifecycleState, 'STALE');
        assert.strictEqual(result.data.freshness.isStale, true);
      }
    });

    it('retrieves status successfully', async () => {
      const result = await handleGetProjectContextStatus(trustedEvent, {
        projectId: testProjectId,
      });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.data.lifecycleState, 'CONNECTED');
        assert.strictEqual(result.data.connectedSourcesCount, 1);
      }
    });
  });

  describe('Domain Error Translations', () => {
    it('translates ProjectContextNotFoundError to PROJECT_CONTEXT_NOT_FOUND', async () => {
      const failingService = {
        getContext: async () => {
          throw new ProjectContextNotFoundError('Project context not found');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleGetProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_NOT_FOUND');
      }
    });

    it('translates ProjectContextAccessDeniedError to PROJECT_CONTEXT_ACCESS_DENIED', async () => {
      const failingService = {
        getContext: async () => {
          throw new ProjectContextAccessDeniedError('Access denied');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleGetProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_ACCESS_DENIED');
      }
    });

    it('translates ProjectContextStaleError to PROJECT_CONTEXT_STALE', async () => {
      const failingService = {
        getContext: async () => {
          throw new ProjectContextStaleError('Context is stale');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleGetProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_STALE');
      }
    });

    it('translates ProjectContextInvalidError to PROJECT_CONTEXT_INVALID', async () => {
      const failingService = {
        getContext: async () => {
          throw new ProjectContextInvalidError('Context is invalid');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleGetProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_INVALID');
      }
    });

    it('translates ProjectContextSourceUnavailableError to PROJECT_CONTEXT_SOURCE_UNAVAILABLE', async () => {
      const failingService = {
        detectSources: async () => {
          throw new ProjectContextSourceUnavailableError('Source unavailable');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleDetectProjectSources(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_SOURCE_UNAVAILABLE');
      }
    });

    it('translates ProjectContextDetectionFailedError to PROJECT_CONTEXT_DETECTION_FAILED', async () => {
      const failingService = {
        detectSources: async () => {
          throw new ProjectContextDetectionFailedError('Detection failed');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleDetectProjectSources(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_DETECTION_FAILED');
      }
    });

    it('translates ProjectContextRefreshFailedError to PROJECT_CONTEXT_REFRESH_FAILED', async () => {
      const failingService = {
        refreshContext: async () => {
          throw new ProjectContextRefreshFailedError('Refresh failed');
        },
      } as unknown as ProjectContextService;
      setProjectContextServiceForTest(failingService);

      const result = await handleRefreshProjectContext(trustedEvent, { projectId: testProjectId });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.code, 'PROJECT_CONTEXT_REFRESH_FAILED');
      }
    });
  });
});
