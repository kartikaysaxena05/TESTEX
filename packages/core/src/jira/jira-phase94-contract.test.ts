/**
 * @file packages/core/src/jira/jira-phase94-contract.test.ts
 * HTTP wire contract simulation and contract schema verification for Engineer Assignment & Defect Ownership Workflow (V7 Phase 94).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { JiraClient } from './jira-client.js';
import {
  JiraAuthenticationFailedError,
  JiraPermissionDeniedError,
  JiraConnectionFailedError,
  JiraSecurityError,
} from './jira-errors.js';
import {
  DESKTOP_CHANNELS,
  defectAssignmentSourceSchema,
  jiraAssigneeSyncStatusSchema,
  defectOwnershipActionSchema,
  projectEngineerDtoSchema,
  registerProjectEngineerInputSchema,
  listEligibleEngineersInputSchema,
  defectOwnershipHistoryDtoSchema,
  defectOwnershipDtoSchema,
  getDefectOwnershipInputSchema,
  assignEngineerInputSchema,
  unassignEngineerInputSchema,
  syncOwnershipFromJiraInputSchema,
  retryJiraSyncInputSchema,
} from '@ai-quality/contracts';

describe('Phase 94 Contract Schema & Channel Invariants', () => {
  it('verifies DESKTOP_CHANNELS includes all Phase 94 channels', () => {
    assert.equal(
      DESKTOP_CHANNELS.JIRA_REGISTER_PROJECT_ENGINEER,
      'desktop:jira:register-project-engineer',
    );
    assert.equal(
      DESKTOP_CHANNELS.JIRA_LIST_ELIGIBLE_ENGINEERS,
      'desktop:jira:list-eligible-engineers',
    );
    assert.equal(DESKTOP_CHANNELS.JIRA_GET_DEFECT_OWNERSHIP, 'desktop:jira:get-defect-ownership');
    assert.equal(DESKTOP_CHANNELS.JIRA_ASSIGN_ENGINEER, 'desktop:jira:assign-engineer');
    assert.equal(DESKTOP_CHANNELS.JIRA_UNASSIGN_ENGINEER, 'desktop:jira:unassign-engineer');
    assert.equal(
      DESKTOP_CHANNELS.JIRA_SYNC_OWNERSHIP_FROM_JIRA,
      'desktop:jira:sync-ownership-from-jira',
    );
    assert.equal(DESKTOP_CHANNELS.JIRA_RETRY_JIRA_SYNC, 'desktop:jira:retry-jira-sync');
  });

  it('verifies defectAssignmentSourceSchema enums', () => {
    const valid = ['MANUAL', 'DETERMINISTIC_RULES', 'JIRA_SYNCHRONIZED'];
    for (const v of valid) {
      assert.equal(defectAssignmentSourceSchema.parse(v), v);
    }
    assert.throws(() => defectAssignmentSourceSchema.parse('AI_GUESS'));
  });

  it('verifies jiraAssigneeSyncStatusSchema enums', () => {
    const valid = [
      'NOT_APPLICABLE',
      'PENDING',
      'SYNCHRONIZED',
      'JIRA_SYNC_FAILED',
      'CONFLICT_DETECTED',
    ];
    for (const v of valid) {
      assert.equal(jiraAssigneeSyncStatusSchema.parse(v), v);
    }
    assert.throws(() => jiraAssigneeSyncStatusSchema.parse('UNKNOWN'));
  });

  it('verifies defectOwnershipActionSchema enums', () => {
    const valid = [
      'ASSIGNED',
      'REASSIGNED',
      'UNASSIGNED',
      'JIRA_SYNC_UPDATED',
      'JIRA_SYNC_FAILED',
      'CONFLICT_RESOLVED',
    ];
    for (const v of valid) {
      assert.equal(defectOwnershipActionSchema.parse(v), v);
    }
    assert.throws(() => defectOwnershipActionSchema.parse('DELETED'));
  });

  it('verifies registerProjectEngineerInputSchema validation', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      userId: 'eng-101',
      displayName: 'Jane Doe',
      email: 'jane.doe@example.com',
      jiraAccountId: '5b10ac8d82e05b22cc7d4ef5',
      routingTags: ['payments', 'checkout'],
      isActive: true,
    };
    const parsed = registerProjectEngineerInputSchema.parse(valid);
    assert.equal(parsed.userId, 'eng-101');
    assert.equal(parsed.email, 'jane.doe@example.com');

    // Reject invalid email
    assert.throws(() =>
      registerProjectEngineerInputSchema.parse({
        ...valid,
        email: 'invalid-email',
      }),
    );

    // Reject invalid UUID
    assert.throws(() =>
      registerProjectEngineerInputSchema.parse({
        ...valid,
        projectId: 'not-a-uuid',
      }),
    );
  });

  it('verifies assignEngineerInputSchema and unassignEngineerInputSchema validation', () => {
    const validAssign = {
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
      engineerId: '00000000-0000-0000-0000-000000000003',
      assignmentReason: 'Component SME assignment',
      actorUserId: 'lead-user',
      expectedVersion: 1,
    };
    assert.deepEqual(assignEngineerInputSchema.parse(validAssign), validAssign);

    const validUnassign = {
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
      reason: 'Returned to triage queue',
      expectedVersion: 2,
    };
    assert.deepEqual(unassignEngineerInputSchema.parse(validUnassign), validUnassign);

    const validListEligible = {
      projectId: '00000000-0000-0000-0000-000000000001',
      activeOnly: true,
    };
    assert.deepEqual(listEligibleEngineersInputSchema.parse(validListEligible), validListEligible);

    const validGetOwnership = {
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
    };
    assert.deepEqual(getDefectOwnershipInputSchema.parse(validGetOwnership), validGetOwnership);

    const validSyncFromJira = {
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
    };
    assert.deepEqual(syncOwnershipFromJiraInputSchema.parse(validSyncFromJira), validSyncFromJira);

    const validRetrySync = {
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
    };
    assert.deepEqual(retryJiraSyncInputSchema.parse(validRetrySync), validRetrySync);
  });

  it('verifies defectOwnershipDtoSchema and defectOwnershipHistoryDtoSchema structure', () => {
    const historyItem = {
      id: '00000000-0000-0000-0000-000000000010',
      ownershipId: '00000000-0000-0000-0000-000000000020',
      projectId: '00000000-0000-0000-0000-000000000001',
      bugReportId: '00000000-0000-0000-0000-000000000002',
      action: 'ASSIGNED' as const,
      previousEngineerId: null,
      newEngineerId: '00000000-0000-0000-0000-000000000003',
      assignmentSource: 'MANUAL' as const,
      assignmentReason: 'Initial assignment',
      ruleId: null,
      jiraAssigneeSyncStatus: 'SYNCHRONIZED' as const,
      syncErrorMessage: null,
      ownershipVersion: 1,
      actorUserId: 'admin',
      createdAt: new Date().toISOString(),
    };
    const parsedHistory = defectOwnershipHistoryDtoSchema.parse(historyItem);
    assert.equal(parsedHistory.action, 'ASSIGNED');

    const engineerDto = {
      id: '00000000-0000-0000-0000-000000000003',
      projectId: '00000000-0000-0000-0000-000000000001',
      userId: 'eng-1',
      displayName: 'Alice Smith',
      email: 'alice@example.com',
      jiraAccountId: 'jira-acc-1',
      jiraUsername: null,
      isActive: true,
      routingTags: ['core'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsedEng = projectEngineerDtoSchema.parse(engineerDto);
    assert.equal(parsedEng.displayName, 'Alice Smith');

    const ownershipDto = {
      id: '00000000-0000-0000-0000-000000000020',
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000030',
      bugReportId: '00000000-0000-0000-0000-000000000002',
      jiraIssueLinkId: '00000000-0000-0000-0000-000000000040',
      assignedEngineerId: '00000000-0000-0000-0000-000000000003',
      assignmentSource: 'MANUAL' as const,
      assignmentReason: 'Initial assignment',
      ruleId: null,
      jiraAssigneeSyncStatus: 'SYNCHRONIZED' as const,
      lastJiraSyncError: null,
      lastJiraSyncAt: new Date().toISOString(),
      ownershipVersion: 1,
      assignedByUserId: 'admin',
      assignedAt: new Date().toISOString(),
      assignedEngineer: parsedEng,
      jiraIssueKey: 'ENG-101',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [parsedHistory],
    };
    const parsedOwnership = defectOwnershipDtoSchema.parse(ownershipDto);
    assert.equal(parsedOwnership.ownershipVersion, 1);
    assert.equal(parsedOwnership.assignedEngineer?.displayName, 'Alice Smith');
  });
});

describe('Phase 94 Jira Assignee Wire Contract Simulation', () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  let simulatedMode:
    'normal_204' | 'bad_request' | 'auth_error' | 'forbidden' | 'rate_limited' | 'server_error' =
    'normal_204';

  let lastReceivedMethod = '';
  let lastReceivedPath = '';
  let lastReceivedBody: Record<string, unknown> = {};

  before(async () => {
    server = http.createServer(async (req, res) => {
      lastReceivedMethod = req.method ?? 'GET';
      lastReceivedPath = req.url ?? '';

      let bodyText = '';
      for await (const chunk of req) {
        bodyText += chunk;
      }
      try {
        lastReceivedBody = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        lastReceivedBody = {};
      }

      // Verify Auth
      const authHeader = req.headers['authorization'];
      if (!authHeader || (!authHeader.startsWith('Basic ') && !authHeader.startsWith('Bearer '))) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Unauthorized'] }));
        return;
      }

      if (simulatedMode === 'auth_error') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Invalid credentials'] }));
        return;
      }

      if (simulatedMode === 'forbidden') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Assign issue permission denied'] }));
        return;
      }

      if (simulatedMode === 'bad_request') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ errorMessages: ['Cannot assign issue to user without permission'] }),
        );
        return;
      }

      if (simulatedMode === 'rate_limited') {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
        res.end(JSON.stringify({ errorMessages: ['Rate limit exceeded'] }));
        return;
      }

      if (simulatedMode === 'server_error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Internal Jira error'] }));
        return;
      }

      // Normal Jira assignment response: 204 No Content
      res.writeHead(204);
      res.end();
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        serverPort = addr.port;
        serverBaseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  });

  it('successfully assigns Jira Cloud issue via PUT /rest/api/3/issue/:key/assignee returning 204 No Content', async () => {
    simulatedMode = 'normal_204';
    const client = new JiraClient();

    await client.assignIssue({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'secret-token-123',
      issueIdOrKey: 'ENG-101',
      accountId: 'account-id-456',
      allowLocalhostForTesting: true,
    });

    assert.equal(lastReceivedMethod, 'PUT');
    assert.equal(lastReceivedPath, '/rest/api/3/issue/ENG-101/assignee');
    assert.deepEqual(lastReceivedBody, { accountId: 'account-id-456' });
  });

  it('successfully unassigns Jira Cloud issue via PUT with accountId: null returning 204', async () => {
    simulatedMode = 'normal_204';
    const client = new JiraClient();

    await client.assignIssue({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'secret-token-123',
      issueIdOrKey: 'ENG-101',
      accountId: null,
      allowLocalhostForTesting: true,
    });

    assert.equal(lastReceivedMethod, 'PUT');
    assert.equal(lastReceivedPath, '/rest/api/3/issue/ENG-101/assignee');
    assert.deepEqual(lastReceivedBody, { accountId: null });
  });

  it('successfully assigns Jira Server/DC issue via PUT /rest/api/2/issue/:key/assignee with name payload', async () => {
    simulatedMode = 'normal_204';
    const client = new JiraClient();

    await client.assignIssue({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_DATA_CENTER',
      authenticationType: 'PERSONAL_ACCESS_TOKEN',
      accountIdentifier: 'sysadmin',
      apiToken: 'pat-secret-token',
      issueIdOrKey: 'DC-202',
      username: 'developer_bob',
      allowLocalhostForTesting: true,
    });

    assert.equal(lastReceivedMethod, 'PUT');
    assert.equal(lastReceivedPath, '/rest/api/2/issue/DC-202/assignee');
    assert.deepEqual(lastReceivedBody, { name: 'developer_bob' });
  });

  it('propagates Jira 400 Bad Request error cleanly', async () => {
    simulatedMode = 'bad_request';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        client.assignIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          apiToken: 'secret-token-123',
          issueIdOrKey: 'ENG-101',
          accountId: 'ineligible-user',
          allowLocalhostForTesting: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof JiraConnectionFailedError);
        assert.ok(err.message.includes('Cannot assign issue'));
        return true;
      },
    );
  });

  it('propagates Jira 401 Authentication Failed error cleanly', async () => {
    simulatedMode = 'auth_error';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        client.assignIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          apiToken: 'invalid-token',
          issueIdOrKey: 'ENG-101',
          accountId: 'account-1',
          allowLocalhostForTesting: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof JiraAuthenticationFailedError);
        return true;
      },
    );
  });

  it('propagates Jira 403 Permission Denied error cleanly', async () => {
    simulatedMode = 'forbidden';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        client.assignIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          apiToken: 'secret-token',
          issueIdOrKey: 'ENG-101',
          accountId: 'account-1',
          allowLocalhostForTesting: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof JiraPermissionDeniedError);
        return true;
      },
    );
  });

  it('enforces SSRF protection: rejects loopback/private host unless allowLocalhostForTesting is true', async () => {
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        client.assignIssue({
          baseUrl: serverBaseUrl, // 127.0.0.1
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@example.com',
          apiToken: 'secret-token',
          issueIdOrKey: 'ENG-101',
          accountId: 'account-1',
          allowLocalhostForTesting: false, // Disallow localhost
        }),
      (err: unknown) => {
        assert.ok(err instanceof JiraSecurityError);
        return true;
      },
    );
  });
});
