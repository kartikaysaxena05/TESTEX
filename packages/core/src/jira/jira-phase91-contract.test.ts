/**
 * @file packages/core/src/jira/jira-phase91-contract.test.ts
 * HTTP wire contract simulation for Jira issue creation and retrieval (V7 Phase 91).
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
  JiraRateLimitedError,
  JiraInvalidResponseError,
  JiraSecurityError,
} from './jira-errors.js';

describe('Jira Issue Creation HTTP Contract Simulation (Phase 91)', () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  let simulatedMode:
    | 'normal'
    | 'auth_error'
    | 'forbidden'
    | 'bad_request'
    | 'not_found'
    | 'rate_limited'
    | 'server_error'
    | 'malformed_json' = 'normal';

  before(async () => {
    server = http.createServer(async (req, res) => {
      const url = req.url ?? '';
      const method = req.method ?? 'GET';

      // Verify Basic auth header
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Unauthorized: missing credentials'] }));
        return;
      }

      if (simulatedMode === 'auth_error') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Invalid API token'] }));
        return;
      }

      if (simulatedMode === 'forbidden') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Project create issue permission denied'] }));
        return;
      }

      if (simulatedMode === 'bad_request') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            errorMessages: ['Issue type is invalid or missing'],
            errors: { summary: 'Field is required' },
          }),
        );
        return;
      }

      if (simulatedMode === 'not_found') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Issue Does Not Exist'] }));
        return;
      }

      if (simulatedMode === 'rate_limited') {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '5',
        });
        res.end(JSON.stringify({ errorMessages: ['Rate limit exceeded'] }));
        return;
      }

      if (simulatedMode === 'server_error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Internal server error'] }));
        return;
      }

      if (simulatedMode === 'malformed_json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html><head><title>502 Bad Gateway</title></head></html>');
        return;
      }

      // Normal Issue Creation
      if (method === 'POST' && url.includes('/issue')) {
        let bodyText = '';
        req.on('data', chunk => {
          bodyText += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(bodyText);
            if (!parsed.fields || !parsed.fields.project || !parsed.fields.summary) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ errorMessages: ['Missing required fields'] }));
              return;
            }

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: '10001',
                key: 'TEST-101',
                self: `http://localhost:${serverPort}/rest/api/3/issue/10001`,
              }),
            );
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ errorMessages: ['Invalid JSON in request'] }));
          }
        });
        return;
      }

      // Normal Issue Retrieval
      if (method === 'GET' && url.includes('/issue/TEST-101')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: '10001',
            key: 'TEST-101',
            self: `http://localhost:${serverPort}/rest/api/3/issue/10001`,
            fields: {
              summary: 'Checkout defect test issue',
              status: { name: 'Open' },
            },
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errorMessages: ['Endpoint Not Found'] }));
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

  it('creates Jira issue over HTTP wire returning 201 Created', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const result = await client.createIssue({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      allowLocalhostForTesting: true,
      payload: {
        fields: {
          project: { id: '10000' },
          issuetype: { id: '10001' },
          summary: 'Critical defect in checkout',
          description: { type: 'doc', version: 1, content: [] },
        },
      },
    });

    assert.equal(result.id, '10001');
    assert.equal(result.key, 'TEST-101');
    assert.ok(result.self);
    assert.ok(result.self.includes('TEST-101') || result.self.includes('10001'));
  });

  it('retrieves Jira issue over HTTP wire returning 200 OK', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();
    const result = await client.getIssue({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'mock-token',
      issueIdOrKey: 'TEST-101',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.id, '10001');
    assert.equal(result.key, 'TEST-101');
    assert.ok(result.fields);
    assert.equal(result.fields.summary, 'Checkout defect test issue');
  });

  it('translates 400 Bad Request into JiraConnectionFailedError with detailed error text', async () => {
    simulatedMode = 'bad_request';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: true,
          payload: {
            fields: {
              project: { id: '10000' },
              issuetype: { id: '10001' },
              summary: '',
            },
          },
        }),
      (err: any) => {
        assert.ok(err instanceof JiraConnectionFailedError);
        assert.ok(
          err.message.includes('Issue type is invalid') ||
            err.message.includes('Field is required') ||
            err.message.includes('HTTP 400'),
        );
        return true;
      },
    );
  });

  it('translates 401 Unauthorized into JiraAuthenticationFailedError', async () => {
    simulatedMode = 'auth_error';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'bad-token',
          allowLocalhostForTesting: true,
          payload: {
            fields: { project: { id: '10000' }, issuetype: { id: '10001' }, summary: 'Test' },
          },
        }),
      JiraAuthenticationFailedError,
    );
  });

  it('translates 403 Forbidden into JiraPermissionDeniedError', async () => {
    simulatedMode = 'forbidden';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: true,
          payload: {
            fields: { project: { id: '10000' }, issuetype: { id: '10001' }, summary: 'Test' },
          },
        }),
      JiraPermissionDeniedError,
    );
  });

  it('translates 429 Rate Limited into JiraRateLimitedError with retryAfterSeconds', async () => {
    simulatedMode = 'rate_limited';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: true,
          payload: {
            fields: { project: { id: '10000' }, issuetype: { id: '10001' }, summary: 'Test' },
          },
        }),
      (err: any) => {
        assert.ok(err instanceof JiraRateLimitedError);
        assert.equal(err.retryAfterSeconds, 5);
        return true;
      },
    );
  });

  it('translates malformed non-JSON response into JiraInvalidResponseError', async () => {
    simulatedMode = 'malformed_json';
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: true,
          payload: {
            fields: { project: { id: '10000' }, issuetype: { id: '10001' }, summary: 'Test' },
          },
        }),
      JiraInvalidResponseError,
    );
  });

  it('enforces SSRF protection: blocks private local IP when allowLocalhostForTesting is false', async () => {
    const client = new JiraClient();
    await assert.rejects(
      async () =>
        await client.createIssue({
          baseUrl: 'http://127.0.0.1:8080',
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'mock-token',
          allowLocalhostForTesting: false,
          payload: {
            fields: { project: { id: '10000' }, issuetype: { id: '10001' }, summary: 'Test' },
          },
        }),
      JiraSecurityError,
    );
  });
});
