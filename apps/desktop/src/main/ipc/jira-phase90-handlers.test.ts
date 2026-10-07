/**
 * @file apps/desktop/src/main/ipc/jira-phase90-handlers.test.ts
 * Main-process IPC handler tests for Jira Discovery & Project Configuration (V7 Phase 90).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleDiscoverJiraSites,
  handleDiscoverJiraProjects,
  handleDiscoverJiraIssueTypes,
  handleDiscoverJiraPriorities,
  handleDiscoverJiraFields,
  handleDiscoverJiraComponents,
  handleDiscoverJiraAssignees,
  handleGetJiraProjectConfig,
  handleSaveJiraProjectConfig,
  handleRefreshJiraProjectConfig,
  handleTestJiraConnectionHealth,
  setSharedJiraConnectionService,
} from './jira-handlers.js';
import type { JiraConnectionService } from '@ai-quality/core';

describe('Jira IPC Handlers (Phase 90)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any, // nested frame / untrusted
      url: 'https://evil.attacker.com',
    } as any,
  } as IpcMainInvokeEvent;

  let mockService: Partial<JiraConnectionService>;

  beforeEach(() => {
    mockService = {
      async discoverSites() {
        return [{ id: 'site-1', name: 'Mock Site', url: 'https://jira.corp.test' }];
      },
      async discoverProjects() {
        return [{ id: '10000', key: 'TEST', name: 'Test Project' }];
      },
      async discoverIssueTypes() {
        return [{ id: '10001', name: 'Bug', subtask: false }];
      },
      async discoverPriorities() {
        return [{ id: '1', name: 'High' }];
      },
      async discoverFields() {
        return [{ id: 'summary', key: 'summary', name: 'Summary', custom: false }];
      },
      async discoverComponents() {
        return [{ id: '20001', name: 'Core Engine' }];
      },
      async discoverAssignees() {
        return [{ accountId: 'user-1', displayName: 'Jane Engineer' }];
      },
      async getProjectConfig() {
        return {
          id: 'cfg-1',
          projectId: '11111111-1111-1111-1111-111111111111',
          connectionId: 'conn-1',
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '10001',
          selectedIssueTypeName: 'Bug',
          defaultPriorityId: '1',
          defaultPriorityName: 'High',
          defaultComponentId: '20001',
          defaultComponentName: 'Core Engine',
          assigneeStrategy: 'UNASSIGNED',
          defaultAssigneeId: null,
          defaultAssigneeName: null,
          fieldMappings: null,
          configStatus: 'CONFIGURED',
          staleReason: null,
          metadataSnapshot: null,
          lastRefreshedAt: new Date().toISOString(),
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async saveProjectConfig(input: any) {
        return {
          id: 'cfg-1',
          projectId: input.projectId,
          connectionId: input.connectionId,
          jiraProjectId: input.jiraProjectId,
          jiraProjectKey: input.jiraProjectKey,
          jiraProjectName: input.jiraProjectName,
          selectedIssueTypeId: input.selectedIssueTypeId,
          selectedIssueTypeName: input.selectedIssueTypeName,
          defaultPriorityId: input.defaultPriorityId ?? null,
          defaultPriorityName: input.defaultPriorityName ?? null,
          defaultComponentId: input.defaultComponentId ?? null,
          defaultComponentName: input.defaultComponentName ?? null,
          assigneeStrategy: input.assigneeStrategy ?? 'UNASSIGNED',
          defaultAssigneeId: input.defaultAssigneeId ?? null,
          defaultAssigneeName: input.defaultAssigneeName ?? null,
          fieldMappings: input.fieldMappings ?? null,
          configStatus: 'CONFIGURED',
          staleReason: null,
          metadataSnapshot: { test: true },
          lastRefreshedAt: new Date().toISOString(),
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async refreshProjectConfig(input: any) {
        return {
          id: 'cfg-1',
          projectId: input.projectId,
          connectionId: 'conn-1',
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '10001',
          selectedIssueTypeName: 'Bug',
          defaultPriorityId: '1',
          defaultPriorityName: 'High',
          defaultComponentId: '20001',
          defaultComponentName: 'Core Engine',
          assigneeStrategy: 'UNASSIGNED',
          defaultAssigneeId: null,
          defaultAssigneeName: null,
          fieldMappings: null,
          configStatus: 'CONFIGURED',
          staleReason: null,
          metadataSnapshot: { refreshed: true },
          lastRefreshedAt: new Date().toISOString(),
          createdBy: 'USER',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async testConnectionHealth() {
        return {
          status: 'CONNECTED',
          healthy: true,
          checkedAt: new Date().toISOString(),
          durationMs: 45,
          checks: {
            authentication: { passed: true, message: 'OK' },
            reachability: { passed: true, message: 'OK' },
            projectAccess: { passed: true, message: 'OK' },
            issueMetadataAccess: { passed: true, message: 'OK' },
          },
        };
      },
    };

    setSharedJiraConnectionService(mockService as JiraConnectionService);
  });

  describe('Security: Sender Frame Validation', () => {
    it('rejects untrusted sender frames with UNAUTHORIZED_SENDER error', async () => {
      const validPayload = { projectId: '11111111-1111-1111-1111-111111111111' };

      const siteRes = await handleDiscoverJiraSites(fakeUntrustedEvent, validPayload);
      assert.equal(siteRes.ok, false);
      assert.equal((siteRes as any).error.code, 'UNAUTHORIZED_SENDER');

      const projRes = await handleDiscoverJiraProjects(fakeUntrustedEvent, validPayload);
      assert.equal(projRes.ok, false);
      assert.equal((projRes as any).error.code, 'UNAUTHORIZED_SENDER');

      const configRes = await handleGetJiraProjectConfig(fakeUntrustedEvent, validPayload);
      assert.equal(configRes.ok, false);
      assert.equal((configRes as any).error.code, 'UNAUTHORIZED_SENDER');
    });
  });

  describe('Zod Input Validation', () => {
    it('rejects malformed inputs with VALIDATION_ERROR error', async () => {
      const invalidPayload = { projectId: 'not-a-valid-uuid' };

      const res = await handleDiscoverJiraSites(fakeTrustedEvent, invalidPayload);
      assert.equal(res.ok, false);
      assert.equal((res as any).error.code, 'VALIDATION_ERROR');

      const saveRes = await handleSaveJiraProjectConfig(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        // Missing required jiraProjectId, jiraProjectKey, etc.
      });
      assert.equal(saveRes.ok, false);
      assert.equal((saveRes as any).error.code, 'VALIDATION_ERROR');
    });
  });

  describe('Successful IPC Delegations', () => {
    it('handles discoverJiraProjects successfully', async () => {
      const res = await handleDiscoverJiraProjects(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data.length, 1);
      assert.equal((res as any).data[0].key, 'TEST');
    });

    it('handles discoverJiraIssueTypes successfully', async () => {
      const res = await handleDiscoverJiraIssueTypes(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        jiraProjectIdOrKey: '10000',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data[0].name, 'Bug');
    });

    it('handles discoverJiraPriorities successfully', async () => {
      const res = await handleDiscoverJiraPriorities(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data[0].name, 'High');
    });

    it('handles discoverJiraFields successfully', async () => {
      const res = await handleDiscoverJiraFields(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        jiraProjectIdOrKey: '10000',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data[0].name, 'Summary');
    });

    it('handles discoverJiraComponents successfully', async () => {
      const res = await handleDiscoverJiraComponents(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        jiraProjectIdOrKey: '10000',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data[0].name, 'Core Engine');
    });

    it('handles discoverJiraAssignees successfully', async () => {
      const res = await handleDiscoverJiraAssignees(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        jiraProjectKey: 'TEST',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data[0].displayName, 'Jane Engineer');
    });

    it('handles getJiraProjectConfig successfully', async () => {
      const res = await handleGetJiraProjectConfig(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data.jiraProjectKey, 'TEST');
    });

    it('handles saveJiraProjectConfig successfully', async () => {
      const res = await handleSaveJiraProjectConfig(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        connectionId: '22222222-2222-2222-2222-222222222222',
        jiraProjectId: '10000',
        jiraProjectKey: 'TEST',
        jiraProjectName: 'Test Project',
        selectedIssueTypeId: '10001',
        selectedIssueTypeName: 'Bug',
        defaultPriorityId: '1',
        defaultPriorityName: 'High',
        defaultComponentId: '20001',
        defaultComponentName: 'Core Engine',
        assigneeStrategy: 'UNASSIGNED',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data.jiraProjectKey, 'TEST');
      assert.equal((res as any).data.configStatus, 'CONFIGURED');
    });

    it('handles refreshJiraProjectConfig successfully', async () => {
      const res = await handleRefreshJiraProjectConfig(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data.configStatus, 'CONFIGURED');
    });

    it('handles testJiraConnectionHealth successfully', async () => {
      const res = await handleTestJiraConnectionHealth(fakeTrustedEvent, {
        projectId: '11111111-1111-1111-1111-111111111111',
        jiraProjectIdOrKey: 'TEST',
        issueTypeId: '10001',
      });
      assert.equal(res.ok, true);
      assert.equal((res as any).data.healthy, true);
      assert.equal((res as any).data.checks.authentication.passed, true);
    });
  });
});
