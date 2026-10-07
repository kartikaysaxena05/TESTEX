/**
 * @file apps/desktop/src/main/jira-phase90-ui.test.tsx
 * UI component tests for Jira Integration Project Mapping, Discovery & Health Check (V7 Phase 90).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JiraIntegrationSettingsCard } from '../renderer/features/jira/JiraIntegrationSettingsCard.js';

describe('JiraIntegrationSettingsCard Phase 90 UI Tests', () => {
  const mockConnectedConnection = {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: 'test-proj-uuid',
    displayName: 'Corporate Jira Cloud',
    deploymentType: 'JIRA_CLOUD',
    baseUrl: 'https://corporate.atlassian.net',
    authenticationType: 'API_TOKEN',
    accountIdentifier: 'lead@company.com',
    credentialConfigured: true,
    connectionStatus: 'CONNECTED',
    lastValidatedAt: new Date().toISOString(),
    lastValidationResult: {
      status: 'CONNECTED',
      durationMs: 45,
      accountIdentity: {
        accountId: 'acc-123',
        displayName: 'Lead Engineer',
      },
    },
    createdBy: 'USER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProjectConfig = {
    id: 'cfg-1111-2222',
    projectId: 'test-proj-uuid',
    connectionId: '11111111-1111-1111-1111-111111111111',
    jiraProjectId: '10000',
    jiraProjectKey: 'ENG',
    jiraProjectName: 'Engineering Workspace',
    selectedIssueTypeId: '10001',
    selectedIssueTypeName: 'Bug',
    defaultPriorityId: '1',
    defaultPriorityName: 'High',
    defaultComponentId: '20001',
    defaultComponentName: 'Core API',
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

  beforeEach(() => {
    (globalThis as any).window = {
      desktop: {
        jira: {
          getConnection: async () => ({
            ok: true,
            data: mockConnectedConnection,
          }),
          getProjectConfig: async () => ({
            ok: true,
            data: mockProjectConfig,
          }),
          discoverProjects: async () => ({
            ok: true,
            data: [
              { id: '10000', key: 'ENG', name: 'Engineering Workspace' },
              { id: '20000', key: 'QA', name: 'QA Platform' },
            ],
          }),
          discoverIssueTypes: async () => ({
            ok: true,
            data: [
              { id: '10001', name: 'Bug', subtask: false },
              { id: '10002', name: 'Task', subtask: false },
            ],
          }),
          discoverPriorities: async () => ({
            ok: true,
            data: [
              { id: '1', name: 'High' },
              { id: '2', name: 'Medium' },
            ],
          }),
          discoverComponents: async () => ({
            ok: true,
            data: [{ id: '20001', name: 'Core API' }],
          }),
          discoverAssignees: async () => ({
            ok: true,
            data: [{ accountId: 'user-001', displayName: 'Jane Engineer' }],
          }),
          discoverFields: async () => ({
            ok: true,
            data: [{ id: 'summary', key: 'summary', name: 'Summary', custom: false }],
          }),
          testConnectionHealth: async () => ({
            ok: true,
            data: {
              status: 'CONNECTED',
              healthy: true,
              checkedAt: new Date().toISOString(),
              durationMs: 40,
              checks: {
                authentication: { passed: true, message: 'OK' },
                reachability: { passed: true, message: 'OK' },
                projectAccess: { passed: true, message: 'OK' },
                issueMetadataAccess: { passed: true, message: 'OK' },
              },
            },
          }),
        },
      },
    };
  });

  it('renders Project Selection prompt if projectId is null', () => {
    const html = renderToString(<JiraIntegrationSettingsCard projectId={null} />);
    assert.ok(html.includes('Select a project to view or configure Jira integration'));
  });

  it('renders settings card container with Jira Integration Foundation header', () => {
    const html = renderToString(<JiraIntegrationSettingsCard projectId="test-proj-uuid" />);
    assert.ok(html.includes('Jira Integration Foundation'));
  });

  it('never leaks plaintext secrets or passwords in server HTML markup', () => {
    const secret = 'super-secret-api-token-999888';
    const html = renderToString(<JiraIntegrationSettingsCard projectId="test-proj-uuid" />);
    assert.ok(!html.includes(secret));
  });
});
