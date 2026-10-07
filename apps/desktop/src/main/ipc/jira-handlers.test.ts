/**
 * @file apps/desktop/src/main/ipc/jira-handlers.test.ts
 * Main-process IPC handler tests for Jira Integration Foundation (V7 Phase 89).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleCreateJiraConnection,
  handleGetJiraConnection,
  handleUpdateJiraConnection,
  handleDeleteJiraConnection,
  handleValidateJiraConnection,
  handleListJiraAuditLog,
  setSharedJiraConnectionService,
} from './jira-handlers.js';
import type { JiraConnectionService } from '@ai-quality/core';

describe('Jira IPC Handlers (Phase 89)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any, // nested frame
      url: 'https://evil.attacker.com',
    } as any,
  } as IpcMainInvokeEvent;

  let mockService: Partial<JiraConnectionService>;

  beforeEach(() => {
    mockService = {
      async createConnection(input: any) {
        return {
          id: '11111111-1111-1111-1111-111111111111',
          projectId: input.projectId,
          displayName: input.displayName,
          deploymentType: input.deploymentType ?? 'JIRA_CLOUD',
          baseUrl: input.baseUrl,
          authenticationType: input.authenticationType ?? 'API_TOKEN',
          accountIdentifier: input.accountIdentifier,
          credentialConfigured: true,
          connectionStatus: 'UNVALIDATED',
          lastValidatedAt: null,
          lastValidationResult: null,
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async getConnection(input: any) {
        return {
          id: '11111111-1111-1111-1111-111111111111',
          projectId: input.projectId,
          displayName: 'Test Connection',
          deploymentType: 'JIRA_CLOUD',
          baseUrl: 'https://example.atlassian.net',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          credentialConfigured: true,
          connectionStatus: 'CONNECTED',
          lastValidatedAt: new Date().toISOString(),
          lastValidationResult: null,
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async updateConnection(input: any) {
        return {
          id: input.connectionId,
          projectId: input.projectId,
          displayName: input.displayName ?? 'Updated Connection',
          deploymentType: 'JIRA_CLOUD',
          baseUrl: input.baseUrl ?? 'https://example.atlassian.net',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          credentialConfigured: true,
          connectionStatus: 'UNVALIDATED',
          lastValidatedAt: null,
          lastValidationResult: null,
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async deleteConnection() {
        return { deleted: true };
      },
      async validateConnection() {
        return {
          status: 'CONNECTED',
          validatedAt: new Date().toISOString(),
          durationMs: 95,
          accountIdentity: {
            displayName: 'IPC Test User',
          },
        };
      },
      async listAuditLog() {
        return [];
      },
    };

    setSharedJiraConnectionService(mockService as any);
  });

  it('rejects untrusted sender with UNAUTHORIZED_SENDER error', async () => {
    const res = await handleCreateJiraConnection(fakeUntrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
      displayName: 'Attack Conn',
      baseUrl: 'https://example.atlassian.net',
      accountIdentifier: 'user@example.com',
      apiToken: 'token',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'UNAUTHORIZED_SENDER');
    }
  });

  it('handles create connection successfully for trusted sender', async () => {
    const res = await handleCreateJiraConnection(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
      displayName: 'Valid Conn',
      baseUrl: 'https://example.atlassian.net',
      accountIdentifier: 'user@example.com',
      apiToken: 'token',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.displayName, 'Valid Conn');
      assert.equal(res.data.credentialConfigured, true);
    }
  });

  it('handles get connection successfully', async () => {
    const res = await handleGetJiraConnection(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data?.connectionStatus, 'CONNECTED');
    }
  });

  it('handles update connection successfully', async () => {
    const res = await handleUpdateJiraConnection(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
      connectionId: '11111111-1111-1111-1111-111111111111',
      displayName: 'Updated Name',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.displayName, 'Updated Name');
    }
  });

  it('handles delete connection successfully', async () => {
    const res = await handleDeleteJiraConnection(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
      connectionId: '11111111-1111-1111-1111-111111111111',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.deleted, true);
    }
  });

  it('handles validate connection successfully', async () => {
    const res = await handleValidateJiraConnection(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
      connectionId: '11111111-1111-1111-1111-111111111111',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.status, 'CONNECTED');
      assert.equal(res.data.accountIdentity?.displayName, 'IPC Test User');
    }
  });

  it('handles list audit log successfully', async () => {
    const res = await handleListJiraAuditLog(fakeTrustedEvent, {
      projectId: '22222222-2222-2222-2222-222222222222',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.data, []);
    }
  });
});
