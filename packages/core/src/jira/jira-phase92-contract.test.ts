/**
 * @file packages/core/src/jira/jira-phase92-contract.test.ts
 * HTTP wire contract simulation and contract schema verification for Jira Evidence Attachment (V7 Phase 92).
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
  listAttachableEvidenceInputSchema,
  attachEvidenceInputSchema,
  getAttachmentStatusInputSchema,
  jiraAttachmentStatusSchema,
  jiraEvidenceAttachmentDtoSchema,
  jiraAttachmentBatchResultSchema,
  jiraAuditEventTypeSchema,
} from '@ai-quality/contracts';

describe('Jira Evidence Attachment HTTP Wire Contract Simulation (Phase 92)', () => {
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
    | 'malformed_json'
    | 'empty_array' = 'normal';

  let lastReceivedHeaders: http.IncomingHttpHeaders = {};
  let lastReceivedContentType = '';

  before(async () => {
    server = http.createServer(async (req, res) => {
      const url = req.url ?? '';
      const method = req.method ?? 'GET';
      lastReceivedHeaders = req.headers;
      lastReceivedContentType = req.headers['content-type'] ?? '';

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
        res.end(JSON.stringify({ errorMessages: ['Attachment permission denied'] }));
        return;
      }

      if (simulatedMode === 'bad_request') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errorMessages: ['Cannot attach empty file'] }));
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
        res.end(JSON.stringify({ errorMessages: ['Internal server error during upload'] }));
        return;
      }

      if (simulatedMode === 'malformed_json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('<html><head><title>502 Bad Gateway</title></head></html>');
        return;
      }

      if (simulatedMode === 'empty_array') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }

      // Normal Attachment Upload: POST /rest/api/3/issue/:issueIdOrKey/attachments
      if (method === 'POST' && url.includes('/attachments')) {
        // Read incoming multipart stream to completion
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const fullBody = Buffer.concat(chunks);

        // Verify X-Atlassian-Token header
        const atlassianToken = req.headers['x-atlassian-token'];
        if (atlassianToken !== 'no-check') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ errorMessages: ['Missing X-Atlassian-Token: no-check header'] }),
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            {
              id: '20001',
              self: `${serverBaseUrl}/rest/api/3/attachment/20001`,
              filename: '[TEST-101]_screenshot_evidence.png',
              size: fullBody.length,
              mimeType: 'image/png',
              created: new Date().toISOString(),
            },
          ]),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errorMessages: ['Not found'] }));
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

  it('successfully uploads an attachment with multipart/form-data and X-Atlassian-Token: no-check', async () => {
    simulatedMode = 'normal';
    const client = new JiraClient();

    const sampleContent = Buffer.from('Fake PNG image content binary payload', 'utf8');
    const result = await client.attachEvidence({
      baseUrl: serverBaseUrl,
      deploymentType: 'JIRA_CLOUD',
      authenticationType: 'API_TOKEN',
      accountIdentifier: 'tester@enterprise.corp',
      apiToken: 'secret-api-token-12345',
      issueIdOrKey: 'TEST-101',
      filename: '[TEST-101]_screenshot_evidence.png',
      content: sampleContent,
      mimeType: 'image/png',
      allowLocalhostForTesting: true,
    });

    assert.equal(result.length, 1);
    const firstRes = result[0];
    assert.ok(firstRes);
    assert.equal(firstRes.id, '20001');
    assert.equal(firstRes.filename, '[TEST-101]_screenshot_evidence.png');
    assert.equal(firstRes.mimeType, 'image/png');

    // Verify multipart Content-Type with boundary was generated
    assert.ok(lastReceivedContentType.startsWith('multipart/form-data; boundary='));
    // Verify required CSRF header was passed
    assert.equal(lastReceivedHeaders['x-atlassian-token'], 'no-check');
  });

  it('normalizes 401 Unauthorized to JiraAuthenticationFailedError', async () => {
    simulatedMode = 'auth_error';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'wrong-token',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraAuthenticationFailedError);
        assert.equal(err.code, 'JIRA_AUTHENTICATION_FAILED');
        return true;
      },
    );
  });

  it('normalizes 403 Forbidden to JiraPermissionDeniedError', async () => {
    simulatedMode = 'forbidden';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret-api-token',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraPermissionDeniedError);
        assert.equal(err.code, 'JIRA_PERMISSION_DENIED');
        return true;
      },
    );
  });

  it('normalizes 400 Bad Request to JiraConnectionFailedError', async () => {
    simulatedMode = 'bad_request';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret-api-token',
          issueIdOrKey: 'TEST-101',
          filename: 'empty.png',
          content: Buffer.from(''),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraConnectionFailedError);
        assert.equal(err.code, 'JIRA_CONNECTION_FAILED');
        assert.ok(err.message.includes('Cannot attach empty file'));
        return true;
      },
    );
  });

  it('normalizes 429 Rate Limited to JiraRateLimitedError with retryAfterSeconds', async () => {
    simulatedMode = 'rate_limited';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret-api-token',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraRateLimitedError);
        assert.equal(err.code, 'JIRA_RATE_LIMITED');
        assert.equal(err.retryAfterSeconds, 5);
        return true;
      },
    );
  });

  it('normalizes 500 Server Error to JiraConnectionFailedError', async () => {
    simulatedMode = 'server_error';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret-api-token',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraConnectionFailedError);
        assert.equal(err.code, 'JIRA_CONNECTION_FAILED');
        return true;
      },
    );
  });

  it('normalizes malformed HTML response to JiraInvalidResponseError', async () => {
    simulatedMode = 'malformed_json';
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: serverBaseUrl,
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret-api-token',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: true,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraInvalidResponseError);
        assert.equal(err.code, 'JIRA_INVALID_RESPONSE');
        return true;
      },
    );
  });

  it('blocks private IP addresses via SSRF defense when allowLocalhostForTesting is false', async () => {
    const client = new JiraClient();

    await assert.rejects(
      async () => {
        await client.attachEvidence({
          baseUrl: 'http://169.254.169.254',
          deploymentType: 'JIRA_CLOUD',
          authenticationType: 'API_TOKEN',
          accountIdentifier: 'tester@enterprise.corp',
          apiToken: 'secret',
          issueIdOrKey: 'TEST-101',
          filename: 'test.png',
          content: Buffer.from('test'),
          allowLocalhostForTesting: false,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof JiraSecurityError);
        assert.equal(err.code, 'JIRA_SECURITY_VIOLATION');
        return true;
      },
    );
  });
});

describe('Phase 92 Contract Schema & Channel Invariants', () => {
  it('verifies DESKTOP_CHANNELS includes all Phase 92 channels', () => {
    assert.equal(
      DESKTOP_CHANNELS.JIRA_LIST_ATTACHABLE_EVIDENCE,
      'desktop:jira:list-attachable-evidence',
    );
    assert.equal(DESKTOP_CHANNELS.JIRA_ATTACH_EVIDENCE, 'desktop:jira:attach-evidence');
    assert.equal(DESKTOP_CHANNELS.JIRA_GET_ATTACHMENT_STATUS, 'desktop:jira:get-attachment-status');
  });

  it('verifies listAttachableEvidenceInputSchema validation rules', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      failureCaseId: '00000000-0000-0000-0000-000000000002',
    };
    assert.doesNotThrow(() => listAttachableEvidenceInputSchema.parse(valid));

    assert.throws(() =>
      listAttachableEvidenceInputSchema.parse({
        projectId: 'not-a-uuid',
        failureCaseId: '00000000-0000-0000-0000-000000000002',
      }),
    );
  });

  it('verifies attachEvidenceInputSchema requires at least one evidenceReferenceId', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      externalIssueId: '00000000-0000-0000-0000-000000000002',
      evidenceReferenceIds: ['00000000-0000-0000-0000-000000000003'],
    };
    assert.doesNotThrow(() => attachEvidenceInputSchema.parse(valid));

    assert.throws(() =>
      attachEvidenceInputSchema.parse({
        ...valid,
        evidenceReferenceIds: [], // must have min(1)
      }),
    );
  });

  it('verifies getAttachmentStatusInputSchema requires valid UUIDs', () => {
    const valid = {
      projectId: '00000000-0000-0000-0000-000000000001',
      externalIssueId: '00000000-0000-0000-0000-000000000002',
    };
    assert.doesNotThrow(() => getAttachmentStatusInputSchema.parse(valid));

    assert.throws(() =>
      getAttachmentStatusInputSchema.parse({
        projectId: 'bad',
        externalIssueId: 'bad',
      }),
    );
  });

  it('verifies jiraAttachmentStatusSchema enum values', () => {
    const statuses = ['PENDING', 'ATTACHED', 'BLOCKED', 'FAILED', 'SKIPPED'] as const;
    for (const status of statuses) {
      assert.equal(jiraAttachmentStatusSchema.parse(status), status);
    }
    assert.throws(() => jiraAttachmentStatusSchema.parse('INVALID_STATUS'));
  });

  it('verifies jiraAuditEventTypeSchema includes Phase 92 attachment events', () => {
    assert.equal(
      jiraAuditEventTypeSchema.parse('EVIDENCE_ATTACHMENT_ATTEMPTED'),
      'EVIDENCE_ATTACHMENT_ATTEMPTED',
    );
    assert.equal(jiraAuditEventTypeSchema.parse('EVIDENCE_ATTACHED'), 'EVIDENCE_ATTACHED');
    assert.equal(
      jiraAuditEventTypeSchema.parse('EVIDENCE_ATTACHMENT_FAILED'),
      'EVIDENCE_ATTACHMENT_FAILED',
    );
  });

  it('verifies jiraEvidenceAttachmentDtoSchema and jiraAttachmentBatchResultSchema', () => {
    const sampleAttachment = {
      id: '00000000-0000-0000-0000-000000000001',
      projectId: '00000000-0000-0000-0000-000000000002',
      externalIssueId: '00000000-0000-0000-0000-000000000003',
      bugReportId: '00000000-0000-0000-0000-000000000004',
      evidenceReferenceId: '00000000-0000-0000-0000-000000000005',
      evidenceType: 'SCREENSHOT' as const,
      artifactHash: 'sha256samplehash',
      jiraAttachmentId: '10001',
      jiraFilename: '[ENG-101]_screenshot_test.png',
      contentType: 'image/png',
      sizeBytes: 1024,
      status: 'ATTACHED' as const,
      isDerivedRedacted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.doesNotThrow(() => jiraEvidenceAttachmentDtoSchema.parse(sampleAttachment));

    const sampleBatch = {
      externalIssueId: '00000000-0000-0000-0000-000000000003',
      jiraIssueKey: 'ENG-101',
      totalRequested: 1,
      attachedCount: 1,
      blockedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      attachments: [sampleAttachment],
    };

    assert.doesNotThrow(() => jiraAttachmentBatchResultSchema.parse(sampleBatch));
  });
});
