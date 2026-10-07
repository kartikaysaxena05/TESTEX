/**
 * @file packages/core/src/jira/jira-connection-service.test.ts
 * Integration and security tests for JiraConnectionService against PostgreSQL (V7 Phase 89).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPrismaClient } from '../database/index.js';
import { JiraConnectionService } from './jira-connection-service.js';
import { JiraCredentialVault } from './jira-credential-vault.js';
import { JiraCrossProjectError } from './jira-errors.js';
import { ProjectNotFoundError } from '../projects/project-errors.js';
import type { IJiraClient, JiraValidationResult } from './jira-types.js';
import type { PrismaClient } from '@prisma/client';

describe('JiraConnectionService Integration (Phase 89)', () => {
  let prisma: PrismaClient;
  let service: JiraConnectionService;
  const testProjectIdA = crypto.randomUUID();
  const testProjectIdB = crypto.randomUUID();

  const mockJiraClient: IJiraClient = {
    async validateConnection(): Promise<JiraValidationResult> {
      return {
        status: 'CONNECTED',
        validatedAt: new Date(),
        durationMs: 120,
        accountIdentity: {
          accountId: 'jira-test-user-id',
          displayName: 'Test Automation Engineer',
          emailAddress: 'tester@enterprise.corp',
          active: true,
        },
        serverInfo: {
          baseUrl: 'https://test-jira.atlassian.net',
          version: '1001.0.0',
          deploymentType: 'Cloud',
          serverTitle: 'Jira Cloud Testing Instance',
        },
      };
    },
    async discoverSites() {
      return [{ id: 'test-site', name: 'Test Site', url: 'https://test-jira.atlassian.net' }];
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
      return [{ id: '20001', name: 'Frontend' }];
    },
    async discoverAssignees() {
      return [{ accountId: 'u1', displayName: 'Jane Engineer' }];
    },
    async testConnectionHealth() {
      return {
        status: 'CONNECTED',
        healthy: true,
        checkedAt: new Date().toISOString(),
        durationMs: 50,
        checks: {
          authentication: { passed: true, message: 'OK' },
          reachability: { passed: true, message: 'OK' },
          projectAccess: { passed: true, message: 'OK' },
          issueMetadataAccess: { passed: true, message: 'OK' },
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
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    // Create isolated test projects in PostgreSQL
    await prisma.project.create({
      data: {
        id: testProjectIdA,
        name: `Phase 89 Project A ${Date.now()}`,
      },
    });

    await prisma.project.create({
      data: {
        id: testProjectIdB,
        name: `Phase 89 Project B ${Date.now()}`,
      },
    });
  });

  after(async () => {
    // Clean up test projects
    await prisma.jiraConnectionAudit.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.jiraConnection.deleteMany({
      where: { projectId: { in: [testProjectIdA, testProjectIdB] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectIdA, testProjectIdB] } },
    });
  });

  it('creates Jira connection with encrypted token and records audit log', async () => {
    const rawToken = 'ATATT3xFfGF0secret_token_abc123';
    const connection = await service.createConnection({
      projectId: testProjectIdA,
      displayName: 'Main Jira Connection',
      baseUrl: 'https://test-jira.atlassian.net/',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: rawToken,
      deploymentType: 'JIRA_CLOUD',
    });

    assert.ok(connection.id);
    assert.equal(connection.projectId, testProjectIdA);
    assert.equal(connection.displayName, 'Main Jira Connection');
    assert.equal(connection.baseUrl, 'https://test-jira.atlassian.net'); // Normalized trailing slash
    assert.equal(connection.connectionStatus, 'UNVALIDATED');
    assert.equal(connection.credentialConfigured, true);

    // Verify token was NOT stored in plaintext in the database
    const dbRecord = await prisma.jiraConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });
    assert.notEqual(dbRecord.encryptedCredentials, rawToken);
    assert.ok(dbRecord.encryptedCredentials?.startsWith('v1:'));
    assert.ok(dbRecord.secretReference.startsWith('vault:jira:'));

    // Verify Audit log was created
    const audits = await service.listAuditLog({
      projectId: testProjectIdA,
      connectionId: connection.id,
    });
    assert.ok(audits.length >= 1);
    const createAudit = audits.find(a => a.eventType === 'CONNECTION_CREATED');
    assert.ok(createAudit);
    assert.equal(createAudit.newStatus, 'UNVALIDATED');
  });

  it('enforces multi-tenant project isolation and rejects cross-project access', async () => {
    // Fetch Project A's connection
    const connA = await service.getConnection({ projectId: testProjectIdA });
    assert.ok(connA);

    // Attempting to access connA with Project B must fail with JiraCrossProjectError
    await assert.rejects(
      async () =>
        await service.getConnection({
          projectId: testProjectIdB,
          connectionId: connA.id,
        }),
      JiraCrossProjectError,
    );

    // Attempting to update connA with Project B must fail
    await assert.rejects(
      async () =>
        await service.updateConnection({
          projectId: testProjectIdB,
          connectionId: connA.id,
          displayName: 'Hacked Display Name',
        }),
      JiraCrossProjectError,
    );

    // Attempting to validate connA with Project B must fail
    await assert.rejects(
      async () =>
        await service.validateConnection({
          projectId: testProjectIdB,
          connectionId: connA.id,
        }),
      JiraCrossProjectError,
    );

    // Attempting to delete connA with Project B must fail
    await assert.rejects(
      async () =>
        await service.deleteConnection({
          projectId: testProjectIdB,
          connectionId: connA.id,
        }),
      JiraCrossProjectError,
    );
  });

  it('rejects connection creation for non-existent project', async () => {
    const nonExistent = crypto.randomUUID();
    await assert.rejects(
      async () =>
        await service.createConnection({
          projectId: nonExistent,
          displayName: 'Ghost Connection',
          baseUrl: 'https://example.atlassian.net',
          accountIdentifier: 'ghost@example.com',
          apiToken: 'token-123',
        }),
      ProjectNotFoundError,
    );
  });

  it('performs idempotent reads with zero side-effects or mutations', async () => {
    const beforeCount = await prisma.jiraConnectionAudit.count({
      where: { projectId: testProjectIdA },
    });

    const conn1 = await service.getConnection({ projectId: testProjectIdA });
    const conn2 = await service.getConnection({ projectId: testProjectIdA });
    const conn3 = await service.getConnection({ projectId: testProjectIdA });

    assert.deepEqual(conn1, conn2);
    assert.deepEqual(conn2, conn3);

    const afterCount = await prisma.jiraConnectionAudit.count({
      where: { projectId: testProjectIdA },
    });
    assert.equal(
      beforeCount,
      afterCount,
      'Reads must create zero audit logs or database mutations',
    );
  });

  it('updates configuration and invalidates validation status when URL changes', async () => {
    const connA = await service.getConnection({ projectId: testProjectIdA });
    assert.ok(connA);

    // First validate connection
    const valResult = await service.validateConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });
    assert.equal(valResult.status, 'CONNECTED');

    const validatedConn = await service.getConnection({ projectId: testProjectIdA });
    assert.equal(validatedConn?.connectionStatus, 'CONNECTED');

    // Update URL -> must invalidate status back to UNVALIDATED
    const updated = await service.updateConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
      baseUrl: 'https://new-url.atlassian.net',
    });

    assert.equal(updated.baseUrl, 'https://new-url.atlassian.net');
    assert.equal(updated.connectionStatus, 'UNVALIDATED');
  });

  it('replaces credentials securely and records CREDENTIALS_REPLACED audit log', async () => {
    const connA = await service.getConnection({ projectId: testProjectIdA });
    assert.ok(connA);

    const newSecret = 'new-rotated-token-555666';
    const updated = await service.updateConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
      apiToken: newSecret,
    });

    assert.equal(updated.credentialConfigured, true);

    const audits = await service.listAuditLog({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });
    const replacedAudit = audits.find(a => a.eventType === 'CREDENTIALS_REPLACED');
    assert.ok(replacedAudit);
  });

  it('persists across service re-instantiations (Restart Persistence)', async () => {
    const connA = await service.getConnection({ projectId: testProjectIdA });
    assert.ok(connA);

    // Re-instantiate service (simulating application restart)
    const freshService = new JiraConnectionService({
      prisma,
      vault: new JiraCredentialVault(),
      jiraClient: mockJiraClient,
      allowLocalhostForTesting: true,
    });

    const restored = await freshService.getConnection({ projectId: testProjectIdA });
    assert.ok(restored);
    assert.equal(restored.id, connA.id);
    assert.equal(restored.displayName, connA.displayName);
    assert.equal(restored.credentialConfigured, true);

    // Run validation on restored service to verify credentials can still be decrypted
    const valResult = await freshService.validateConnection({
      projectId: testProjectIdA,
      connectionId: restored.id,
    });
    assert.equal(valResult.status, 'CONNECTED');
    assert.equal(valResult.accountIdentity?.displayName, 'Test Automation Engineer');
  });

  it('deletes connection and records audit log', async () => {
    const connA = await service.getConnection({ projectId: testProjectIdA });
    assert.ok(connA);

    const res = await service.deleteConnection({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });
    assert.equal(res.deleted, true);

    const afterDelete = await service.getConnection({ projectId: testProjectIdA });
    assert.equal(afterDelete, null);

    const audits = await service.listAuditLog({
      projectId: testProjectIdA,
      connectionId: connA.id,
    });
    const deleteAudit = audits.find(a => a.eventType === 'CONNECTION_DELETED');
    assert.ok(deleteAudit);
  });
});
