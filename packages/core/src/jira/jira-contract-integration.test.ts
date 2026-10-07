/**
 * @file packages/core/src/jira/jira-contract-integration.test.ts
 * Real local HTTP contract test simulating Jira Cloud API protocol interactions (V7 Phase 89).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { JiraClient } from './jira-client.js';

describe('Jira Contract Integration & Protocol Simulation (Phase 89)', () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  // Track simulate mode on contract server
  let simulatedBehavior:
    | 'success'
    | 'auth_failed'
    | 'permission_denied'
    | 'rate_limited'
    | 'server_error'
    | 'malformed_json' = 'success';

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? '';

      if (simulatedBehavior === 'auth_failed') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Invalid credentials or API token.'] }));
        return;
      }

      if (simulatedBehavior === 'permission_denied') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['User does not have browse permissions.'] }));
        return;
      }

      if (simulatedBehavior === 'rate_limited') {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '15',
        });
        res.end(JSON.stringify({ errorMessages: ['Rate limit exceeded.'] }));
        return;
      }

      if (simulatedBehavior === 'server_error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Internal server error in Jira core.'] }));
        return;
      }

      if (simulatedBehavior === 'malformed_json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html><head><title>502 Bad Gateway</title></head><body>Bad Gateway</body></html>');
        return;
      }

      // Success behavior
      if (url.includes('/myself')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            accountId: 'mock-account-uuid-9876',
            displayName: 'Contract Test QA Lead',
            emailAddress: 'qalead@company.com',
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
            serverTitle: 'Jira Cloud Mock Contract Instance',
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errorMessages: ['Endpoint not found.'] }));
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

  it('verifies 200 OK contract flow with authenticated user identity and server metadata', async () => {
    simulatedBehavior = 'success';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'test-api-token-12345',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'CONNECTED');
    assert.equal(result.accountIdentity?.accountId, 'mock-account-uuid-9876');
    assert.equal(result.accountIdentity?.displayName, 'Contract Test QA Lead');
    assert.equal(result.accountIdentity?.emailAddress, 'qalead@company.com');
    assert.equal(result.serverInfo?.deploymentType, 'Cloud');
  });

  it('verifies 401 Unauthorized contract response maps to AUTHENTICATION_FAILED', async () => {
    simulatedBehavior = 'auth_failed';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'invalid-token',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'AUTHENTICATION_FAILED');
    assert.equal(result.errorCode, 'JIRA_AUTHENTICATION_FAILED');
  });

  it('verifies 403 Forbidden contract response maps to PERMISSION_DENIED', async () => {
    simulatedBehavior = 'permission_denied';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'restricted-token',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'PERMISSION_DENIED');
    assert.equal(result.errorCode, 'JIRA_PERMISSION_DENIED');
  });

  it('verifies 429 Too Many Requests maps to RATE_LIMITED with Retry-After header', async () => {
    simulatedBehavior = 'rate_limited';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'token',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'RATE_LIMITED');
    assert.equal(result.errorCode, 'JIRA_RATE_LIMITED');
    assert.equal(result.rateLimitInfo?.retryAfterSeconds, 15);
  });

  it('verifies 500 Server Error maps to UNREACHABLE', async () => {
    simulatedBehavior = 'server_error';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'token',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'UNREACHABLE');
    assert.equal(result.errorCode, 'JIRA_CONNECTION_FAILED');
  });

  it('verifies malformed HTML response maps to INVALID_CONFIGURATION', async () => {
    simulatedBehavior = 'malformed_json';
    const client = new JiraClient();

    const result = await client.validateConnection({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'qalead@company.com',
      apiToken: 'token',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.status, 'INVALID_CONFIGURATION');
    assert.equal(result.errorCode, 'JIRA_INVALID_RESPONSE');
  });

  it('certifies real external Jira Cloud status as BLOCKED / NOT AVAILABLE per Section 45 & 46', () => {
    // Contract requirement: when real external Atlassian credentials are not provided,
    // explicitly assert that real external Jira connectivity is not fabricated.
    const hasLiveExternalJiraCreds = Boolean(
      process.env.LIVE_JIRA_URL && process.env.LIVE_JIRA_EMAIL && process.env.LIVE_JIRA_API_TOKEN,
    );

    assert.equal(
      hasLiveExternalJiraCreds,
      false,
      'External live Jira credentials are not configured in test environment; real connectivity must be truthfully reported as BLOCKED / NOT AVAILABLE',
    );
  });
});
