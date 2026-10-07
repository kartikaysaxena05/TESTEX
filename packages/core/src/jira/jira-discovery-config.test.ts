/**
 * @file packages/core/src/jira/jira-discovery-config.test.ts
 * Integration tests for Jira discovery, configuration profile, staleness detection,
 * and connection health diagnostics (V7 Phase 90).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { JiraConnectionService } from './jira-connection-service.js';
import {
  JiraWrongProjectMetadataError,
  JiraConfigNotFoundError,
  JiraCrossProjectError,
  JiraConcurrentMutationError,
} from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import type {
  IJiraClient,
  JiraDiscoveredProjectDto,
  JiraDiscoveredIssueTypeDto,
  JiraDiscoveredComponentDto,
  JiraValidationResult,
  JiraHealthCheckResultDto,
} from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('Jira Discovery & Project Configuration Integration (Phase 90)', () => {
  let prisma: PrismaClient;
  let service: JiraConnectionService;
  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();
  let connIdA: string;
  let connIdB: string;

  // Mutable mock state for testing dynamic staleness transitions
  let availableProjects: JiraDiscoveredProjectDto[] = [
    { id: '10000', key: 'TEST', name: 'Test Project' },
    { id: '10001', key: 'OTHER', name: 'Other Project' },
  ];

  let availableIssueTypes: JiraDiscoveredIssueTypeDto[] = [
    { id: '10001', name: 'Bug', subtask: false, description: 'A problem' },
    { id: '10002', name: 'Task', subtask: false, description: 'Work item' },
  ];

  let availableComponents: JiraDiscoveredComponentDto[] = [
    { id: '20001', name: 'Frontend Engine' },
    { id: '20002', name: 'API Gateway' },
  ];

  let simulateRemoteFailureOnRefresh = false;

  const dynamicJiraClient: IJiraClient = {
    async validateConnection(): Promise<JiraValidationResult> {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 40,
        accountIdentity: {
          accountId: 'jira-mock-user',
          displayName: 'Test Admin',
          emailAddress: 'admin@corp.test',
          active: true,
        },
      };
    },
    async discoverSites() {
      return [{ id: 'mock-site', name: 'Corporate Jira', url: 'https://test-jira.atlassian.net' }];
    },
    async discoverProjects() {
      if (simulateRemoteFailureOnRefresh) {
        throw new Error('Jira Cloud API 503 Service Unavailable');
      }
      return [...availableProjects];
    },
    async discoverIssueTypes(options) {
      if (simulateRemoteFailureOnRefresh) {
        throw new Error('Jira Cloud API 503 Service Unavailable');
      }
      if (options.projectIdOrKey === '10000' || options.projectIdOrKey === 'TEST') {
        return [...availableIssueTypes];
      }
      return [{ id: '10002', name: 'Task', subtask: false }];
    },
    async discoverPriorities() {
      return [
        { id: '1', name: 'Highest', statusColor: '#ff0000' },
        { id: '2', name: 'High', statusColor: '#e06666' },
        { id: '3', name: 'Medium', statusColor: '#f6b26b', isDefault: true },
        { id: '4', name: 'Low', statusColor: '#93c47d' },
      ];
    },
    async discoverFields() {
      return [
        { id: 'summary', key: 'summary', name: 'Summary', custom: false, required: true },
        {
          id: 'description',
          key: 'description',
          name: 'Description',
          custom: false,
          required: false,
        },
        {
          id: 'customfield_10050',
          key: 'customfield_10050',
          name: 'AI Root Cause',
          custom: true,
          required: false,
        },
      ];
    },
    async discoverComponents(options) {
      if (simulateRemoteFailureOnRefresh) {
        throw new Error('Jira Cloud API 503 Service Unavailable');
      }
      if (options.projectIdOrKey === '10000' || options.projectIdOrKey === 'TEST') {
        return [...availableComponents];
      }
      return [];
    },
    async discoverAssignees() {
      return [
        {
          accountId: 'user-001',
          displayName: 'Jane Engineer',
          emailAddress: 'jane@corp.test',
          active: true,
        },
        {
          accountId: 'user-002',
          displayName: 'John SRE',
          emailAddress: 'john@corp.test',
          active: true,
        },
      ];
    },
    async testConnectionHealth(options): Promise<JiraHealthCheckResultDto> {
      return {
        status: 'CONNECTED',
        healthy: true,
        checkedAt: new Date().toISOString(),
        durationMs: 65,
        checks: {
          authentication: { passed: true, message: 'Authenticated as Test Admin' },
          reachability: { passed: true, message: 'Host reachable (15ms)', responseTimeMs: 15 },
          projectAccess: {
            passed: true,
            message: options.projectIdOrKey
              ? `Verified access to project '${options.projectIdOrKey}'`
              : 'Accessible projects found: 2',
            accessibleCount: 2,
          },
          issueMetadataAccess: {
            passed: true,
            message: options.issueTypeId
              ? `Verified createmeta fields for issue type '${options.issueTypeId}'`
              : 'Verified issue types access',
          },
        },
        accountIdentity: {
          accountId: 'jira-mock-user',
          displayName: 'Test Admin',
          emailAddress: 'admin@corp.test',
          active: true,
        },
        serverInfo: {
          baseUrl: options.baseUrl,
          version: '1001.0.0-MOCK',
          deploymentType: 'Cloud',
          serverTitle: 'Jira Mock Cloud',
        },
      };
    },
    async createIssue() {
      return {
        id: '10001',
        key: 'TEST-101',
        self: 'https://test-jira.atlassian.net/rest/api/3/issue/10001',
      };
    },
    async getIssue() {
      return {
        id: '10001',
        key: 'TEST-101',
        self: 'https://test-jira.atlassian.net/rest/api/3/issue/10001',
      };
    },
    async attachEvidence() {
      return [];
    },
  };

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for integration tests.');
    }
    prisma = client;
    service = new JiraConnectionService({
      prisma,
      jiraClient: dynamicJiraClient,
      allowLocalhostForTesting: true,
    });

    // Create test projects in database
    await prisma.project.create({
      data: {
        id: testProjectIdA,
        name: `Phase 90 Config Test A ${Date.now()}`,
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectIdB,
        name: `Phase 90 Config Test B ${Date.now()}`,
      },
    });

    // Create connections for both projects
    const connA = await service.createConnection({
      projectId: testProjectIdA,
      displayName: 'Phase 90 Jira Conn A',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'ATATT3xFfGF0mock_test_token_phase90_a',
    });
    connIdA = connA.id;

    const connB = await service.createConnection({
      projectId: testProjectIdB,
      displayName: 'Phase 90 Jira Conn B',
      baseUrl: 'https://test-jira.atlassian.net',
      accountIdentifier: 'admin@corp.test',
      apiToken: 'ATATT3xFfGF0mock_test_token_phase90_b',
    });
    connIdB = connB.id;
  });

  after(async () => {
    await prisma.jiraConnectionAudit.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraProjectConfig.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnection.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  it('discovers sites, projects, issue types, priorities, fields, components, and assignees', async () => {
    // 1. Discover Sites
    const sites = await service.discoverSites({ projectId: testProjectIdA });
    assert.ok(sites.length >= 1);
    assert.equal(sites[0]?.name, 'Corporate Jira');

    // 2. Discover Projects
    const projects = await service.discoverProjects({ projectId: testProjectIdA });
    assert.equal(projects.length, 2);
    assert.equal(projects[0]?.key, 'TEST');

    // 3. Discover Issue Types
    const issueTypes = await service.discoverIssueTypes({
      projectId: testProjectIdA,
      jiraProjectIdOrKey: '10000',
    });
    assert.equal(issueTypes.length, 2);
    assert.equal(issueTypes[0]?.name, 'Bug');
    assert.equal(issueTypes[0]?.subtask, false);

    // 4. Discover Priorities
    const priorities = await service.discoverPriorities({ projectId: testProjectIdA });
    assert.equal(priorities.length, 4);
    assert.equal(priorities[0]?.name, 'Highest');

    // 5. Discover Fields
    const fields = await service.discoverFields({
      projectId: testProjectIdA,
      jiraProjectIdOrKey: '10000',
      issueTypeId: '10001',
    });
    assert.equal(fields.length, 3);
    const customField = fields.find(f => f.custom);
    assert.ok(customField);
    assert.equal(customField.name, 'AI Root Cause');

    // 6. Discover Components
    const components = await service.discoverComponents({
      projectId: testProjectIdA,
      jiraProjectIdOrKey: '10000',
    });
    assert.equal(components.length, 2);
    assert.equal(components[0]?.name, 'Frontend Engine');

    // 7. Discover Assignees
    const assignees = await service.discoverAssignees({
      projectId: testProjectIdA,
      jiraProjectKey: 'TEST',
    });
    assert.equal(assignees.length, 2);
    assert.equal(assignees[0]?.displayName, 'Jane Engineer');
  });

  it('saves Jira project configuration profile and creates audit record', async () => {
    const config = await service.saveProjectConfig({
      projectId: testProjectIdA,
      connectionId: connIdA,
      jiraProjectId: '10000',
      jiraProjectKey: 'TEST',
      jiraProjectName: 'Test Project',
      selectedIssueTypeId: '10001',
      selectedIssueTypeName: 'Bug',
      defaultPriorityId: '2',
      defaultPriorityName: 'High',
      defaultComponentId: '20001',
      defaultComponentName: 'Frontend Engine',
      assigneeStrategy: 'SPECIFIC_USER',
      defaultAssigneeId: 'user-001',
      defaultAssigneeName: 'Jane Engineer',
      fieldMappings: {
        environment: 'QA Staging',
        customfield_10050: 'Autonomous Failure Analysis',
      },
    });

    assert.ok(config.id);
    assert.equal(config.projectId, testProjectIdA);
    assert.equal(config.connectionId, connIdA);
    assert.equal(config.jiraProjectKey, 'TEST');
    assert.equal(config.selectedIssueTypeName, 'Bug');
    assert.equal(config.configStatus, 'CONFIGURED');
    assert.equal(config.staleReason, null);
    assert.equal(config.assigneeStrategy, 'SPECIFIC_USER');
    assert.equal(config.defaultAssigneeName, 'Jane Engineer');
    assert.ok(config.metadataSnapshot);

    // Verify DB persistence
    const savedInDb = await prisma.jiraProjectConfig.findUnique({
      where: { projectId: testProjectIdA },
    });
    assert.ok(savedInDb);
    assert.equal(savedInDb.selectedIssueTypeId, '10001');

    // Verify audit log entry
    const audits = await service.listAuditLog({
      projectId: testProjectIdA,
      connectionId: connIdA,
    });
    const saveAudit = audits.find(a => a.eventType === 'CONFIGURATION_SAVED');
    assert.ok(saveAudit);
    assert.equal((saveAudit.details as any)?.jiraProjectKey, 'TEST');
  });

  it('retrieves saved project configuration profile via getProjectConfig', async () => {
    const config = await service.getProjectConfig({ projectId: testProjectIdA });
    assert.ok(config);
    assert.equal(config.jiraProjectKey, 'TEST');
    assert.equal(config.selectedIssueTypeId, '10001');

    // Non-configured project returns null
    const emptyConfig = await service.getProjectConfig({ projectId: testProjectIdB });
    assert.equal(emptyConfig, null);
  });

  it('rejects saveProjectConfig when issue type does not belong to target project (Wrong-Project Defense)', async () => {
    await assert.rejects(
      async () =>
        await service.saveProjectConfig({
          projectId: testProjectIdA,
          connectionId: connIdA,
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '99999-INVALID',
          selectedIssueTypeName: 'Non-Existent Issue Type',
        }),
      JiraWrongProjectMetadataError,
    );
  });

  it('rejects saveProjectConfig when component does not belong to target project (Wrong-Project Defense)', async () => {
    await assert.rejects(
      async () =>
        await service.saveProjectConfig({
          projectId: testProjectIdA,
          connectionId: connIdA,
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '10001',
          selectedIssueTypeName: 'Bug',
          defaultComponentId: '99999-INVALID-COMPONENT',
          defaultComponentName: 'Fake Component',
        }),
      JiraWrongProjectMetadataError,
    );
  });

  it('enforces multi-tenant isolation: rejects saving config using connection from another project', async () => {
    await assert.rejects(
      async () =>
        await service.saveProjectConfig({
          projectId: testProjectIdA,
          connectionId: connIdB, // Connection belongs to Project B!
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '10001',
          selectedIssueTypeName: 'Bug',
        }),
      JiraCrossProjectError,
    );
  });

  it('rejects saveProjectConfig for non-existent local project', async () => {
    const fakeProjectId = crypto.randomUUID();
    await assert.rejects(
      async () =>
        await service.saveProjectConfig({
          projectId: fakeProjectId,
          connectionId: crypto.randomUUID(),
          jiraProjectId: '10000',
          jiraProjectKey: 'TEST',
          jiraProjectName: 'Test Project',
          selectedIssueTypeId: '10001',
          selectedIssueTypeName: 'Bug',
        }),
      ProjectNotFoundError,
    );
  });

  describe('Configuration Staleness Engine (refreshProjectConfig)', () => {
    it('refreshes healthy metadata and maintains CONFIGURED status', async () => {
      const refreshed = await service.refreshProjectConfig({
        projectId: testProjectIdA,
      });

      assert.equal(refreshed.configStatus, 'CONFIGURED');
      assert.equal(refreshed.staleReason, null);

      const audits = await service.listAuditLog({
        projectId: testProjectIdA,
        connectionId: connIdA,
      });
      const refreshAudit = audits.find(a => a.eventType === 'METADATA_REFRESHED');
      assert.ok(refreshAudit);
    });

    it('transitions to NEEDS_REVIEW when selected component is deleted from remote Jira project', async () => {
      // Simulate component removal remotely
      const originalComponents = [...availableComponents];
      availableComponents = [{ id: '20002', name: 'API Gateway' }]; // 20001 Frontend Engine removed!

      try {
        const refreshed = await service.refreshProjectConfig({
          projectId: testProjectIdA,
        });

        assert.equal(refreshed.configStatus, 'NEEDS_REVIEW');
        assert.ok(refreshed.staleReason?.includes('Frontend Engine'));

        const audits = await service.listAuditLog({
          projectId: testProjectIdA,
          connectionId: connIdA,
        });
        const staleAudit = audits.find(
          a =>
            a.eventType === 'CONFIGURATION_STALE' &&
            (a.details as any)?.configStatus === 'NEEDS_REVIEW',
        );
        assert.ok(staleAudit);
      } finally {
        // Restore
        availableComponents = originalComponents;
      }
    });

    it('transitions to STALE when selected issue type is deleted from remote Jira project', async () => {
      // Simulate issue type removal remotely
      const originalIssueTypes = [...availableIssueTypes];
      availableIssueTypes = [{ id: '10002', name: 'Task', subtask: false }]; // 10001 Bug removed!

      try {
        const refreshed = await service.refreshProjectConfig({
          projectId: testProjectIdA,
        });

        assert.equal(refreshed.configStatus, 'STALE');
        assert.ok(refreshed.staleReason?.includes('Bug'));

        const audits = await service.listAuditLog({
          projectId: testProjectIdA,
          connectionId: connIdA,
        });
        const staleAudit = audits.find(
          a =>
            a.eventType === 'CONFIGURATION_STALE' && (a.details as any)?.configStatus === 'STALE',
        );
        assert.ok(staleAudit);
      } finally {
        // Restore
        availableIssueTypes = originalIssueTypes;
      }
    });

    it('transitions to INVALID when target project is deleted or inaccessible', async () => {
      // Simulate project removal remotely
      const originalProjects = [...availableProjects];
      availableProjects = [{ id: '10001', key: 'OTHER', name: 'Other Project' }]; // 10000 TEST removed!

      try {
        const refreshed = await service.refreshProjectConfig({
          projectId: testProjectIdA,
        });

        assert.equal(refreshed.configStatus, 'INVALID');
        assert.ok(refreshed.staleReason?.includes('no longer accessible'));

        const audits = await service.listAuditLog({
          projectId: testProjectIdA,
          connectionId: connIdA,
        });
        const staleAudit = audits.find(
          a =>
            a.eventType === 'CONFIGURATION_STALE' && (a.details as any)?.configStatus === 'INVALID',
        );
        assert.ok(staleAudit);
      } finally {
        // Restore
        availableProjects = originalProjects;
      }
    });

    it('transitions to INVALID when remote API call throws an error during refresh', async () => {
      simulateRemoteFailureOnRefresh = true;
      try {
        const refreshed = await service.refreshProjectConfig({
          projectId: testProjectIdA,
        });

        assert.equal(refreshed.configStatus, 'INVALID');
        assert.ok(refreshed.staleReason?.includes('Metadata refresh failed'));
      } finally {
        simulateRemoteFailureOnRefresh = false;
      }
    });

    it('throws JiraConfigNotFoundError if refreshing unconfigured project', async () => {
      await assert.rejects(
        async () =>
          await service.refreshProjectConfig({
            projectId: testProjectIdB,
          }),
        JiraConfigNotFoundError,
      );
    });
  });

  describe('Connection Health Check Diagnostics (testConnectionHealth)', () => {
    it('executes 4-step diagnostics and records HEALTH_CHECKED audit record', async () => {
      const health = await service.testConnectionHealth({
        projectId: testProjectIdA,
        connectionId: connIdA,
        jiraProjectIdOrKey: 'TEST',
        issueTypeId: '10001',
      });

      assert.equal(health.status, 'CONNECTED');
      assert.equal(health.healthy, true);
      assert.ok(health.durationMs >= 0);
      assert.equal(health.checks.authentication.passed, true);
      assert.equal(health.checks.reachability.passed, true);
      assert.equal(health.checks.projectAccess.passed, true);
      assert.equal(health.checks.issueMetadataAccess.passed, true);
      assert.equal(health.accountIdentity?.displayName, 'Test Admin');

      // Verify audit log
      const audits = await service.listAuditLog({
        projectId: testProjectIdA,
        connectionId: connIdA,
      });
      const healthAudit = audits.find(a => a.eventType === 'HEALTH_CHECKED');
      assert.ok(healthAudit);
      assert.equal((healthAudit.details as any)?.healthy, true);
    });
  });

  describe('Concurrency and Mutex Lock Integrity', () => {
    it('serializes concurrent save and refresh operations without data races', async () => {
      // Trigger concurrent refresh operations simultaneously - one will hold the lock, others must reject
      const promises = [
        service.refreshProjectConfig({ projectId: testProjectIdA }),
        service.refreshProjectConfig({ projectId: testProjectIdA }),
        service.refreshProjectConfig({ projectId: testProjectIdA }),
      ];

      const outcomes = await Promise.allSettled(promises);
      const fulfilled = outcomes.filter(o => o.status === 'fulfilled');
      const rejected = outcomes.filter(o => o.status === 'rejected');

      assert.ok(fulfilled.length >= 1, 'At least one operation succeeds');
      assert.ok(rejected.length >= 1, 'Concurrent overlapping mutations are locked out');
      for (const rej of rejected) {
        assert.ok(
          (rej as PromiseRejectedResult).reason instanceof JiraConcurrentMutationError,
          'Lock rejection must be JiraConcurrentMutationError',
        );
      }

      // After operations settle, subsequent sequential operation succeeds normally
      const finalConfig = await service.refreshProjectConfig({ projectId: testProjectIdA });
      assert.equal(finalConfig.configStatus, 'CONFIGURED');
    });
  });
});
