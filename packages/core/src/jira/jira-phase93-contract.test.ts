/**
 * @file packages/core/src/jira/jira-phase93-contract.test.ts
 * HTTP wire contract simulation and contract schema verification for Jira Duplicate Prevention & Existing-Issue Linking (V7 Phase 93).
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
import {
  DESKTOP_CHANNELS,
  evaluateDuplicateInputSchema,
  linkExistingIssueInputSchema,
  getIssueLinkInputSchema,
  jiraLinkSourceSchema,
  jiraDuplicateDecisionSchema,
  jiraIssueLinkDtoSchema,
  jiraDuplicateEvaluationDtoSchema,
  jiraAuditEventTypeSchema,
} from '@ai-quality/contracts';

describe('Phase 93 Contract Schema & Channel Invariants', () => {
  it('verifies DESKTOP_CHANNELS includes all Phase 93 channels', () => {
    assert.equal(DESKTOP_CHANNELS.JIRA_EVALUATE_DUPLICATE, 'desktop:jira:evaluate-duplicate');
    assert.equal(DESKTOP_CHANNELS.JIRA_LINK_EXISTING_ISSUE, 'desktop:jira:link-existing-issue');
    assert.equal(DESKTOP_CHANNELS.JIRA_GET_ISSUE_LINK, 'desktop:jira:get-issue-link');
  });

  it('verifies jiraLinkSourceSchema valid enums and rejects invalid values', () => {
    const validSources = [
      'EXACT_EXISTING_LINK',
      'SAME_BUG_REPORT',
      'SAME_FAILURE',
      'SAME_DEFECT_CLUSTER',
      'EXTERNAL_EXACT_MATCH',
      'USER_CONFIRMED_LINK',
    ];
    for (const source of validSources) {
      assert.equal(jiraLinkSourceSchema.parse(source), source);
    }
    assert.throws(() => jiraLinkSourceSchema.parse('INVALID_SOURCE'));
  });

  it('verifies jiraDuplicateDecisionSchema valid enums and rejects invalid values', () => {
    const validDecisions = ['CREATE_NEW', 'USE_EXISTING', 'BLOCKED', 'INCONCLUSIVE'];
    for (const decision of validDecisions) {
      assert.equal(jiraDuplicateDecisionSchema.parse(decision), decision);
    }
    assert.throws(() => jiraDuplicateDecisionSchema.parse('MAYBE_DUPLICATE'));
  });

  it('verifies evaluateDuplicateInputSchema validation rules', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      bugReportId: '00000000-0000-0000-0000-000000000003',
    };
    assert.deepEqual(evaluateDuplicateInputSchema.parse(valid), valid);

    // Optional bugReportId
    const withoutReport = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
    };
    assert.deepEqual(evaluateDuplicateInputSchema.parse(withoutReport), withoutReport);

    // Invalid UUID
    assert.throws(() =>
      evaluateDuplicateInputSchema.parse({
        projectId: 'not-a-uuid',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
      }),
    );
  });

  it('verifies linkExistingIssueInputSchema validation rules', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      bugReportId: '00000000-0000-0000-0000-000000000003',
      jiraIssueKey: 'ENG-123',
      linkReason: 'Matched active defect cluster',
      linkSource: 'SAME_DEFECT_CLUSTER' as const,
    };
    assert.deepEqual(linkExistingIssueInputSchema.parse(valid), valid);

    // Empty jiraIssueKey rejected
    assert.throws(() =>
      linkExistingIssueInputSchema.parse({
        ...valid,
        jiraIssueKey: '',
      }),
    );

    // Empty linkReason rejected
    assert.throws(() =>
      linkExistingIssueInputSchema.parse({
        ...valid,
        linkReason: '',
      }),
    );
  });

  it('verifies getIssueLinkInputSchema requires valid UUIDs', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
    };
    assert.deepEqual(getIssueLinkInputSchema.parse(valid), valid);

    assert.throws(() =>
      getIssueLinkInputSchema.parse({
        projectId: 'invalid',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
      }),
    );
  });

  it('verifies jiraAuditEventTypeSchema includes all Phase 93 deduplication events', () => {
    const phase93Events = [
      'DUPLICATE_CHECK_STARTED',
      'DUPLICATE_MATCH_FOUND',
      'EXISTING_ISSUE_LINKED',
      'NEW_ISSUE_ALLOWED',
      'LINK_INVALIDATED',
      'EXTERNAL_ISSUE_MISSING',
      'DEDUPLICATION_CONFLICT',
    ];
    for (const evt of phase93Events) {
      assert.equal(jiraAuditEventTypeSchema.parse(evt), evt);
    }
  });

  it('verifies jiraDuplicateEvaluationDtoSchema and jiraIssueLinkDtoSchema validation', () => {
    const validEval = {
      decision: 'USE_EXISTING' as const,
      ruleId: 'JIRA_RULE_3_DEFECT_CLUSTER',
      reason: 'Matched representative defect cluster member',
      jiraIssueId: '10050',
      jiraIssueKey: 'ENG-50',
      jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-50',
      defectClusterId: '00000000-0000-0000-0000-000000000009',
      defectClusterKey: 'CLUSTER-ENG-01',
      clusterMembershipAuthoritative: true,
      candidateCount: 1,
      evaluatedAt: new Date().toISOString(),
    };
    const parsedEval = jiraDuplicateEvaluationDtoSchema.parse(validEval);
    assert.equal(parsedEval.decision, 'USE_EXISTING');
    assert.equal(parsedEval.ruleId, 'JIRA_RULE_3_DEFECT_CLUSTER');

    const validLink = {
      id: '00000000-0000-0000-0000-000000000010',
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
      bugReportId: null,
      defectClusterId: '00000000-0000-0000-0000-000000000009',
      externalIssueId: null,
      jiraConnectionId: '00000000-0000-0000-0000-000000000011',
      jiraProjectKey: 'ENG',
      jiraIssueId: '10050',
      jiraIssueKey: 'ENG-50',
      jiraIssueUrl: 'https://test-jira.atlassian.net/browse/ENG-50',
      linkReason: 'Linked via defect cluster',
      linkSource: 'SAME_DEFECT_CLUSTER' as const,
      ruleId: 'JIRA_RULE_3_DEFECT_CLUSTER',
      decision: 'USE_EXISTING' as const,
      isActive: true,
      invalidationReason: null,
      supersededById: null,
      metadataSnapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsedLink = jiraIssueLinkDtoSchema.parse(validLink);
    assert.equal(parsedLink.id, validLink.id);
    assert.equal(parsedLink.isActive, true);
  });
});

describe('Jira JQL Search HTTP Wire Contract Simulation (Phase 93)', () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  let simulatedMode:
    | 'normal'
    | 'auth_error'
    | 'forbidden'
    | 'bad_request'
    | 'rate_limited'
    | 'server_error'
    | 'malformed_json'
    | 'empty_results' = 'normal';

  let lastReceivedMethod = '';
  let lastReceivedBody: Record<string, unknown> = {};

  before(async () => {
    server = http.createServer(async (req, res) => {
      lastReceivedMethod = req.method ?? 'GET';

      let bodyText = '';
      for await (const chunk of req) {
        bodyText += chunk;
      }
      try {
        lastReceivedBody = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        lastReceivedBody = {};
      }

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
        res.end(JSON.stringify({ errorMessages: ['Search permission denied'] }));
        return;
      }

      if (simulatedMode === 'bad_request') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Error in the JQL Query'] }));
        return;
      }

      if (simulatedMode === 'rate_limited') {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '1',
        });
        res.end(JSON.stringify({ errorMessages: ['Rate limit exceeded. Please wait.'] }));
        return;
      }

      if (simulatedMode === 'server_error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Internal search index error'] }));
        return;
      }

      if (simulatedMode === 'malformed_json') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>502 Bad Gateway from Proxy</body></html>');
        return;
      }

      if (simulatedMode === 'empty_results') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ issues: [], total: 0 }));
        return;
      }

      // Normal response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          startAt: 0,
          maxResults: 50,
          total: 1,
          issues: [
            {
              id: '10042',
              key: 'ENG-42',
              fields: {
                summary: 'Checkout button failure',
                labels: ['platform-report-BUG001'],
              },
            },
          ],
        }),
      );
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
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  it('executes JQL search via POST /rest/api/3/search and returns mapped issues', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();

    const result = await client.searchIssues({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@corp.test',
      apiToken: 'test-secret-token',
      jql: 'project = "ENG" AND labels = "platform-report-BUG001"',
      maxResults: 10,
      allowLocalhostForTesting: true,
    });

    assert.equal(lastReceivedMethod, 'POST');
    assert.equal(lastReceivedBody.jql, 'project = "ENG" AND labels = "platform-report-BUG001"');
    assert.equal(result.total, 1);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.id, '10042');
    assert.equal(result.issues[0]?.key, 'ENG-42');
  });

  it('returns empty results when no issues match JQL', async () => {
    simulatedMode = 'empty_results';
    const client = new JiraClient();

    const result = await client.searchIssues({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'user@corp.test',
      apiToken: 'test-secret-token',
      jql: 'project = "ENG" AND labels = "nonexistent"',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.total, 0);
    assert.equal(result.issues.length, 0);
  });

  it('normalizes 401 Unauthorized into JiraAuthenticationFailedError', async () => {
    simulatedMode = 'auth_error';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'invalid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: true,
        }),
      JiraAuthenticationFailedError,
    );
  });

  it('normalizes 403 Forbidden into JiraPermissionDeniedError', async () => {
    simulatedMode = 'forbidden';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: true,
        }),
      JiraPermissionDeniedError,
    );
  });

  it('normalizes 400 Bad Request into JiraConnectionFailedError', async () => {
    simulatedMode = 'bad_request';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'syntax error jql',
          allowLocalhostForTesting: true,
        }),
      JiraConnectionFailedError,
    );
  });

  it('normalizes 429 Rate Limited into JiraRateLimitedError with retryAfterSeconds', async () => {
    simulatedMode = 'rate_limited';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof JiraRateLimitedError);
        assert.equal(err.retryAfterSeconds, 1);
        return true;
      },
    );
  });

  it('normalizes 500 Server Error into JiraConnectionFailedError', async () => {
    simulatedMode = 'server_error';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: true,
        }),
      JiraConnectionFailedError,
    );
  });

  it('normalizes malformed HTML response into JiraInvalidResponseError', async () => {
    simulatedMode = 'malformed_json';
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: true,
        }),
      JiraInvalidResponseError,
    );
  });

  it('blocks private IP addresses via SSRF defense when allowLocalhostForTesting is false', async () => {
    const client = new JiraClient();

    await assert.rejects(
      async () =>
        await client.searchIssues({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'user@corp.test',
          apiToken: 'valid-token',
          jql: 'project = "ENG"',
          allowLocalhostForTesting: false,
        }),
      JiraSecurityError,
    );
  });
});
