/**
 * @file apps/desktop/src/main/ipc/auth-handlers.test.ts
 * Unit tests for desktop auth IPC handlers in V8 Phase 113.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetAuthState,
  handleGetCurrentUser,
  handleLogin,
  handleLogout,
  handleRevokeSession,
  handleRevokeAllSessions,
  setAuthServiceForTest,
  setSecureStorageForTest,
  resetAuthStoreForTest,
} from './auth-handlers.js';
import {
  AuthenticationService,
  InvalidAuthInputError,
  SessionNotFoundError,
  SessionExpiredError,
  type AuthenticatedUserContextDto,
  type AuthenticateResult,
} from '@ai-quality/core';
import type { IDesktopSecureStorage } from '../secure-storage/desktop-secure-storage.js';

class MockSecureStorage implements IDesktopSecureStorage {
  public token: string | null = null;
  public clearCallCount = 0;
  public storeCallCount = 0;

  public async storeSessionToken(token: string): Promise<void> {
    this.token = token;
    this.storeCallCount++;
  }

  public async retrieveSessionToken(): Promise<string | null> {
    return this.token;
  }

  public async clearSessionToken(): Promise<void> {
    this.token = null;
    this.clearCallCount++;
  }
}

describe('Desktop Auth IPC Handlers', () => {
  let mockStorage: MockSecureStorage;
  let mockAuthService: any;
  const dummyEvent = {} as IpcMainInvokeEvent;

  const validUser: AuthenticatedUserContextDto = {
    userId: 'user-uuid-113',
    email: 'engineer@example.com',
    displayName: 'Quality Engineer',
    accountStatus: 'ACTIVE',
    emailVerified: true,
    sessionId: 'session-uuid-113',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    resetAuthStoreForTest();
    mockStorage = new MockSecureStorage();
    setSecureStorageForTest(mockStorage);

    mockAuthService = {
      validateSession: async (token: string) => {
        if (token === 'valid-token') {
          return validUser;
        }
        if (token === 'expired-token') {
          throw new SessionExpiredError();
        }
        throw new SessionNotFoundError();
      },
      authenticateWithPassword: async (email: string, _pass: string) => {
        return {
          userContext: validUser,
          sessionToken: 'valid-token',
        } as AuthenticateResult;
      },
      revokeSession: async (_sessionId: string) => {
        return { revoked: true };
      },
      revokeAllUserSessions: async (_userId: string) => {
        return { revokedCount: 2 };
      },
    };
    setAuthServiceForTest(mockAuthService);
  });

  it('handleGetAuthState returns UNAUTHENTICATED when storage is empty', async () => {
    mockStorage.token = null;
    const state = await handleGetAuthState(dummyEvent);
    assert.equal(state.status, 'UNAUTHENTICATED');
    assert.equal(state.user, null);
  });

  it('handleGetAuthState returns AUTHENTICATED and user when token is valid', async () => {
    mockStorage.token = 'valid-token';
    const state = await handleGetAuthState(dummyEvent);
    assert.equal(state.status, 'AUTHENTICATED');
    assert.deepEqual(state.user, validUser);
  });

  it('handleGetAuthState clears storage and returns UNAUTHENTICATED on expired token', async () => {
    mockStorage.token = 'expired-token';
    const state = await handleGetAuthState(dummyEvent);
    assert.equal(state.status, 'UNAUTHENTICATED');
    assert.equal(state.user, null);
    assert.equal(mockStorage.token, null);
    assert.ok(mockStorage.clearCallCount >= 1);
  });

  it('handleGetCurrentUser returns user or null appropriately', async () => {
    mockStorage.token = 'valid-token';
    const user = await handleGetCurrentUser(dummyEvent);
    assert.deepEqual(user, validUser);

    mockStorage.token = null;
    const nullUser = await handleGetCurrentUser(dummyEvent);
    assert.equal(nullUser, null);
  });

  it('handleLogin authenticates, saves token securely, and returns context', async () => {
    const user = await handleLogin(dummyEvent, {
      email: 'engineer@example.com',
      password: 'StrongPassword123!',
    });

    assert.deepEqual(user, validUser);
    assert.equal(mockStorage.token, 'valid-token');
    assert.equal(mockStorage.storeCallCount, 1);
  });

  it('handleLogin rejects invalid inputs and bounds', async () => {
    await assert.rejects(async () => handleLogin(dummyEvent, null as any), InvalidAuthInputError);
    await assert.rejects(
      async () => handleLogin(dummyEvent, { email: '', password: '123' }),
      InvalidAuthInputError,
    );
    await assert.rejects(
      async () => handleLogin(dummyEvent, { email: 'a'.repeat(300), password: '123' }),
      InvalidAuthInputError,
    );
    await assert.rejects(
      async () => handleLogin(dummyEvent, { email: 'a@b.com', password: 'a'.repeat(200) }),
      InvalidAuthInputError,
    );
  });

  it('handleLogin rejects mass assignment attempts', async () => {
    await assert.rejects(
      async () =>
        handleLogin(dummyEvent, {
          email: 'test@example.com',
          password: 'PassWord123!',
          id: 'client-id',
        } as any),
      (err: any) => err.code === 'INVALID_AUTH_INPUT',
    );

    await assert.rejects(
      async () =>
        handleLogin(dummyEvent, {
          email: 'test@example.com',
          password: 'PassWord123!',
          passwordHash: 'injected-hash',
        } as any),
      (err: any) => err.code === 'INVALID_AUTH_INPUT',
    );
  });

  it('handleLogout revokes session and clears storage', async () => {
    mockStorage.token = 'valid-token';
    const res = await handleLogout(dummyEvent);
    assert.equal(res.success, true);
    assert.equal(mockStorage.token, null);
    assert.ok(mockStorage.clearCallCount >= 1);
  });

  it('handleRevokeSession revokes specified session', async () => {
    const res = await handleRevokeSession(dummyEvent, { sessionId: 'sess-1' });
    assert.equal(res.revoked, true);
  });

  it('handleRevokeAllSessions revokes all user sessions', async () => {
    const res = await handleRevokeAllSessions(dummyEvent, { userId: 'user-1' });
    assert.equal(res.revokedCount, 2);
  });
});
