/**
 * @file packages/core/src/execution/retry/execution-recovery-coordinator.test.ts
 * Unit tests for ExecutionRecoveryCoordinator recovering fresh browser sessions and restoring auth profiles.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionRecoveryCoordinator } from './execution-recovery-coordinator.js';
import type { PrismaClient } from '@prisma/client';
import type { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import type { AuthProfileService } from '../sessions/auth-profile-service.js';

describe('ExecutionRecoveryCoordinator', () => {
  let mockPrisma: any;
  let mockSessionManager: any;
  let mockAuthService: any;
  let coordinator: ExecutionRecoveryCoordinator;
  let closedSessionIds: string[] = [];
  let createdSessionOptions: any[] = [];

  beforeEach(() => {
    closedSessionIds = [];
    createdSessionOptions = [];

    mockPrisma = {
      projectEnvironment: {
        findUnique: async () => null,
      },
    };

    mockSessionManager = {
      closeSession: async (id: string) => {
        closedSessionIds.push(id);
      },
      createSession: async (options: any) => {
        createdSessionOptions.push(options);
        return {
          sessionId: 'session-new-456',
          projectId: options.projectId,
          testRunId: options.testRunId,
          browserEngine: options.browserEngine ?? 'chromium',
          isFresh: true,
          storageStateRestored: false,
          createdAt: new Date(),
          status: 'READY',
          browser: {},
          context: {},
          page: {},
          close: async () => {},
        };
      },
    };

    mockAuthService = {
      listProfiles: async () => [
        {
          id: 'auth-prof-1',
          name: 'Reusable Admin',
          status: 'VALID',
          isReusable: true,
        },
      ],
    };

    coordinator = new ExecutionRecoveryCoordinator({
      prisma: mockPrisma as unknown as PrismaClient,
      sessionManager: mockSessionManager as unknown as BrowserSessionManager,
      authProfileService: mockAuthService as unknown as AuthProfileService,
    });
  });

  it('closes previous corrupt session before creating fresh session for retry', async () => {
    const previousSession = {
      sessionId: 'session-old-123',
    } as any;

    const result = await coordinator.recoverSession({
      projectId: 'project-1',
      testRunId: 'run-1',
      executionId: 'exec-1',
      attemptNumber: 2,
      previousSession,
      environmentId: 'env-1',
    });

    assert.equal(result.success, true);
    assert.deepEqual(closedSessionIds, ['session-old-123']);
    assert.equal(createdSessionOptions.length, 1);
    assert.equal(createdSessionOptions[0].projectId, 'project-1');
    assert.equal(createdSessionOptions[0].testRunId, 'run-1');
    assert.equal(createdSessionOptions[0].executionId, 'exec-1');
    assert.equal(createdSessionOptions[0].authProfileId, 'auth-prof-1');
  });

  it('handles recovery creation errors gracefully without unhandled exceptions', async () => {
    mockSessionManager.createSession = async () => {
      throw new Error('Failed to launch Playwright browser engine');
    };

    const result = await coordinator.recoverSession({
      projectId: 'project-1',
      testRunId: 'run-1',
      executionId: 'exec-1',
      attemptNumber: 2,
    });

    assert.equal(result.success, false);
    assert.equal(result.session, null);
    assert.ok(result.errorMessage?.includes('Failed to launch Playwright browser engine'));
  });

  it('disposes sessions cleanly via disposeSession', async () => {
    const session = { sessionId: 'session-to-dispose' } as any;
    await coordinator.disposeSession(session);
    assert.deepEqual(closedSessionIds, ['session-to-dispose']);
  });
});
