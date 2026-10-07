/**
 * @file packages/core/src/jira/jira-phase90-contract.test.ts
 * HTTP contract simulation test for Jira Cloud REST API v3 discovery routes,
 * error handling, SSRF defense, and connection health checks (V7 Phase 90).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { JiraClient } from './jira-client.js';
import {
  JiraAuthenticationFailedError,
  JiraProjectAccessDeniedError,
  JiraProjectNotFoundError,
  JiraIssueTypeNotFoundError,
  JiraSecurityError,
} from './jira-errors.js';

describe('Jira REST API v3 Contract & Protocol Simulation (Phase 90)', () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  let simulatedMode:
    'normal' | 'auth_error' | 'forbidden' | 'project_not_found' | 'createmeta_not_found' = 'normal';

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';

      // Verify Basic auth header is present
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Unauthorized: missing credentials'] }));
        return;
      }

      if (simulatedMode === 'auth_error') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Invalid API token or credentials'] }));
        return;
      }

      if (simulatedMode === 'forbidden') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Forbidden: Project browse permission denied'] }));
        return;
      }

      if (simulatedMode === 'project_not_found' && url.includes('/project')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Project does not exist'] }));
        return;
      }

      if (simulatedMode === 'createmeta_not_found' && url.includes('/createmeta')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Issue type not found'] }));
        return;
      }

      // Normal mock endpoints
      if (url.includes('/myself')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            accountId: 'mock-account-uuid',
            displayName: 'Jira Contract Test User',
            emailAddress: 'tester@enterprise.corp',
            active: true,
          }),
        );
        return;
      }

      if (url.includes('/serverInfo')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            baseUrl: serverBaseUrl,
            version: '1001.0.0-MOCK',
            deploymentType: 'Cloud',
            serverTitle: 'Jira Cloud Wire Mock',
          }),
        );
        return;
      }

      if (url.includes('/issue/createmeta/10000/issuetypes/10001')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            values: [
              {
                fieldId: 'summary',
                name: 'Summary',
                required: true,
                schema: { type: 'string', system: 'summary' },
              },
              {
                fieldId: 'customfield_10099',
                name: 'Triage Category',
                required: false,
                schema: {
                  type: 'string',
                  custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield',
                  customId: 10099,
                },
              },
            ],
          }),
        );
        return;
      }

      if (url.includes('/issue/createmeta/10000/issuetypes')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            values: [
              { id: '10001', name: 'Bug', subtask: false, description: 'Software defect' },
              { id: '10002', name: 'Story', subtask: false, description: 'User story' },
            ],
          }),
        );
        return;
      }

      if (url.includes('/project/10000/components')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            { id: '30001', name: 'Billing Service', description: 'Core payment processing' },
            {
              id: '30002',
              name: 'Auth Service',
              description: 'Authentication and session handling',
            },
          ]),
        );
        return;
      }

      if (url.includes('/user/assignable/search')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              accountId: 'acc-1',
              displayName: 'Developer Alpha',
              emailAddress: 'alpha@corp.test',
              active: true,
            },
            {
              accountId: 'acc-2',
              displayName: 'Engineer Beta',
              emailAddress: 'beta@corp.test',
              active: true,
            },
          ]),
        );
        return;
      }

      if (url.includes('/priority')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            { id: '1', name: 'Critical', statusColor: '#ff0000' },
            { id: '2', name: 'Normal', statusColor: '#00ff00', isDefault: true },
          ]),
        );
        return;
      }

      if (url.includes('/field')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            { id: 'summary', key: 'summary', name: 'Summary', custom: false },
            { id: 'description', key: 'description', name: 'Description', custom: false },
          ]),
        );
        return;
      }

      if (url.includes('/project/10000')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: '10000',
            key: 'TEST',
            name: 'Contract Test Project',
            issueTypes: [{ id: '10001', name: 'Bug', subtask: false }],
          }),
        );
        return;
      }

      if (url.includes('/project')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            { id: '10000', key: 'TEST', name: 'Contract Test Project' },
            { id: '20000', key: 'DEMO', name: 'Demo Space' },
          ]),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errorMessages: ['Endpoint not found'] }));
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        serverPort = address.port;
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

  it('executes project discovery over HTTP wire', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const projects = await client.discoverProjects({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      allowLocalhostForTesting: true,
    });

    assert.equal(projects.length, 2);
    assert.equal(projects[0]?.key, 'TEST');
    assert.equal(projects[0]?.name, 'Contract Test Project');
    assert.equal(projects[1]?.key, 'DEMO');
  });

  it('executes issue types discovery over HTTP wire createmeta endpoint', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const issueTypes = await client.discoverIssueTypes({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      projectIdOrKey: '10000',
      allowLocalhostForTesting: true,
    });

    assert.equal(issueTypes.length, 2);
    assert.equal(issueTypes[0]?.id, '10001');
    assert.equal(issueTypes[0]?.name, 'Bug');
  });

  it('executes createmeta field discovery over HTTP wire', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const fields = await client.discoverFields({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      projectIdOrKey: '10000',
      issueTypeId: '10001',
      allowLocalhostForTesting: true,
    });

    assert.equal(fields.length, 2);
    assert.equal(fields[0]?.key, 'summary');
    assert.equal(fields[0]?.required, true);
    assert.equal(fields[1]?.custom, true);
    assert.equal(fields[1]?.name, 'Triage Category');
  });

  it('executes components discovery over HTTP wire', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const components = await client.discoverComponents({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      projectIdOrKey: '10000',
      allowLocalhostForTesting: true,
    });

    assert.equal(components.length, 2);
    assert.equal(components[0]?.id, '30001');
    assert.equal(components[0]?.name, 'Billing Service');
  });

  it('executes assignees discovery over HTTP wire', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const assignees = await client.discoverAssignees({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      projectKey: 'TEST',
      allowLocalhostForTesting: true,
    });

    assert.equal(assignees.length, 2);
    assert.equal(assignees[0]?.displayName, 'Developer Alpha');
  });

  it('executes full connection health check diagnostic over HTTP wire', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const health = await client.testConnectionHealth({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      projectIdOrKey: '10000',
      issueTypeId: '10001',
      allowLocalhostForTesting: true,
    });

    assert.equal(health.healthy, true);
    assert.equal(health.status, 'CONNECTED');
    assert.equal(health.checks.authentication.passed, true);
    assert.equal(health.checks.reachability.passed, true);
    assert.equal(health.checks.projectAccess.passed, true);
    assert.equal(health.checks.issueMetadataAccess.passed, true);
  });

  it('translates 401 response into JiraAuthenticationFailedError', async () => {
    simulatedMode = 'auth_error';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.discoverProjects({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'bad-token',
          allowLocalhostForTesting: true,
        }),
      JiraAuthenticationFailedError,
    );
  });

  it('translates 403 response into JiraProjectAccessDeniedError', async () => {
    simulatedMode = 'forbidden';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.discoverIssueTypes({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          projectIdOrKey: '10000',
          allowLocalhostForTesting: true,
        }),
      JiraProjectAccessDeniedError,
    );
  });

  it('translates 404 response on project into JiraProjectNotFoundError', async () => {
    simulatedMode = 'project_not_found';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.discoverComponents({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          projectIdOrKey: 'NON_EXISTENT_PROJECT',
          allowLocalhostForTesting: true,
        }),
      JiraProjectNotFoundError,
    );
  });

  it('translates 404 response on createmeta into JiraIssueTypeNotFoundError', async () => {
    simulatedMode = 'createmeta_not_found';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.discoverFields({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          projectIdOrKey: '10000',
          issueTypeId: 'NON_EXISTENT_TYPE',
          allowLocalhostForTesting: true,
        }),
      JiraIssueTypeNotFoundError,
    );
  });

  it('enforces SSRF protection: blocks private local IP when allowLocalhostForTesting is false', async () => {
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.discoverProjects({
          baseUrl: 'http://127.0.0.1:8080',
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: false,
        }),
      JiraSecurityError,
    );
  });
});
