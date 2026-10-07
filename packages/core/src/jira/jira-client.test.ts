/**
 * @file packages/core/src/jira/jira-client.test.ts
 * Unit and resilience tests for JiraClient adapter, retries, rate limits, and error normalization (V7 Phase 89).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JiraClient } from './jira-client.js';

describe('JiraClient Adapter (Phase 89)', () => {
  it('constructs correct Basic auth headers for Jira Cloud and parses identity metadata', async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: Record<string, string> | undefined;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers as Record<string, string>;

      if (capturedUrl.includes('/myself')) {
        return new Response(
          JSON.stringify({
            accountId: 'acc-12345',
            displayName: 'Jane Doe',
            emailAddress: 'jane@example.com',
            active: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (capturedUrl.includes('/serverInfo')) {
        return new Response(
          JSON.stringify({
            baseUrl: 'https://example.atlassian.net',
            version: '1001.0.0-SNAPSHOT',
            deploymentType: 'Cloud',
            serverTitle: 'Jira Cloud',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'jane@example.com',
      apiToken: 'super-secret-token',
    });

    assert.equal(result.status, 'CONNECTED');
    assert.equal(result.accountIdentity?.accountId, 'acc-12345');
    assert.equal(result.accountIdentity?.displayName, 'Jane Doe');
    assert.equal(result.accountIdentity?.emailAddress, 'jane@example.com');
    assert.equal(result.serverInfo?.deploymentType, 'Cloud');

    // Verify Basic Auth format: base64(email:token)
    assert.ok(capturedHeaders?.Authorization?.startsWith('Basic '));
    const authHeader = capturedHeaders?.Authorization ?? '';
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
    assert.equal(decoded, 'jane@example.com:super-secret-token');
  });

  it('constructs Bearer auth header for Personal Access Token (PAT)', async () => {
    let capturedAuth: string | undefined;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization;
      return new Response(
        JSON.stringify({
          accountId: 'dc-user',
          displayName: 'DC Admin',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://jira.enterprise.corp',
      deploymentType: 'JIRA_DATA_CENTER',
      authenticationType: 'PERSONAL_ACCESS_TOKEN',
      accountIdentifier: 'dc-user',
      apiToken: 'my-pat-token',
    });

    assert.equal(result.status, 'CONNECTED');
    assert.equal(capturedAuth, 'Bearer my-pat-token');
  });

  it('normalizes HTTP 401 Unauthorized to AUTHENTICATION_FAILED without retrying', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Unauthorized', { status: 401 });
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'wrong-token',
    });

    assert.equal(result.status, 'AUTHENTICATION_FAILED');
    assert.equal(result.errorCode, 'JIRA_AUTHENTICATION_FAILED');
    assert.equal(callCount, 1, '401 must not trigger retries');
  });

  it('normalizes HTTP 403 Forbidden to PERMISSION_DENIED without retrying', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Forbidden', { status: 403 });
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'valid-token-no-perms',
    });

    assert.equal(result.status, 'PERMISSION_DENIED');
    assert.equal(result.errorCode, 'JIRA_PERMISSION_DENIED');
    assert.equal(callCount, 1, '403 must not trigger retries');
  });

  it('normalizes HTTP 429 Too Many Requests to RATE_LIMITED and extracts Retry-After', async () => {
    let callCount = 0;
    const mockFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Rate Limited', {
        status: 429,
        headers: { 'Retry-After': '30' },
      });
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'test-token',
    });

    assert.equal(result.status, 'RATE_LIMITED');
    assert.equal(result.errorCode, 'JIRA_RATE_LIMITED');
    assert.equal(result.rateLimitInfo?.retryAfterSeconds, 30);
    // Verified it retried up to MAX_RETRIES (1 initial + 2 retries = 3 calls)
    assert.equal(callCount, 3);
  });

  it('handles bounded timeouts and normalizes to TIMEOUT', async () => {
    const mockFetch: typeof fetch = async (_input, init) => {
      // Never resolve until signal aborts
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: 'test-token',
      timeoutMs: 50, // Short timeout
    });

    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.errorCode, 'JIRA_REQUEST_TIMEOUT');
  });

  it('strictly redacts secrets if present in error message', async () => {
    const secretToken = 'secret-token-to-mask-in-err';
    const mockFetch: typeof fetch = async () => {
      throw new Error(`Connection failed while passing token=${secretToken}`);
    };

    const client = new JiraClient({ customFetch: mockFetch });
    const result = await client.validateConnection({
      baseUrl: 'https://example.atlassian.net',
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@example.com',
      apiToken: secretToken,
    });

    assert.ok(result.errorMessage);
    assert.ok(!result.errorMessage.includes(secretToken), 'Token must be masked in error message');
    assert.ok(result.errorMessage.includes('***'));
  });
});
