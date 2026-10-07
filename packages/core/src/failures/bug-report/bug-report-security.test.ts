/**
 * @file packages/core/src/failures/bug-report/bug-report-security.test.ts
 * Security and secret redaction test suite for Structured Bug Reports (V6 Phase 87).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { StructuredBugReportService } from './structured-bug-report-service.js';
import { BugReportGenerator } from './bug-report-generator.js';
import { BugReportCrossProjectError } from './bug-report-errors.js';
import type { StructuredBugReportFacts } from './bug-report-types.js';

test('Structured Bug Report Security & Redaction Test Suite', async t => {
  const generator = new BugReportGenerator();

  await t.test('redacts passwords, bearer tokens, cookies, and database connection strings', () => {
    const rawFacts: StructuredBugReportFacts = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      failureCase: {
        id: '22222222-2222-2222-2222-222222222222',
        projectId: '11111111-1111-1111-1111-111111111111',
        executionId: '33333333-3333-3333-3333-333333333333',
        title:
          'Connection error to postgres://admin:super_secret_password_123@db.prod.internal:5432/main',
        failureSummary:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super_secret_payload was rejected; cookie: session_id=sess_999888777; API key: api_key=ak_live_abcdef123456',
        metadataJson: {},
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      project: { id: '11111111-1111-1111-1111-111111111111', key: 'SEC', name: 'Security Proj' },
      testExecution: {
        id: '33333333-3333-3333-3333-333333333333',
        testCaseId: 'tc-sec',
        testCaseVersionNumber: 1,
        status: 'FAILED',
        errorMessage:
          'Failed with token: access_token=secret_token_val_999 and password=MySecretPassword!',
        errorStack: null,
        startedAt: new Date(),
        completedAt: new Date(),
        environmentId: null,
        environmentSnapshotJson: {
          databaseUrl: 'postgres://user:db_pass_1234@cluster:5432/app',
          apiKey: 'key_live_99999',
        },
        stepExecutions: [
          {
            id: 'step-1',
            stepIndex: 1,
            actionType: 'FILL',
            targetSummary: 'input[name="password"]',
            actionDataJson: JSON.stringify({ password: 'P@ssword123456!' }),
            expectedSummary: 'Password filled',
            actualSummary: 'Typed P@ssword123456!',
            status: 'FAILED',
            errorMessage: 'Failure with Bearer secret_bearer_token_xyz',
            durationMs: 100,
            screenshotPath: null,
          },
        ],
      },
      evidenceReferences: [
        {
          id: 'ev-sec',
          evidenceType: 'LOG',
          filePath: '/var/log/auth?token=auth_token_value_456',
          sha256: '0000000000000000000000000000000000000000000000000000000000000000',
          byteSize: 1024,
          mimeType: 'text/plain',
          integrityStatus: 'VERIFIED',
          description: 'Log containing password=PlaintextInDescription',
        },
      ],
      preconditions: ['Must have Bearer token_precondition'],
    } as any;

    const report = generator.generate(rawFacts, {
      reportNumber: 'BUG-000010',
      revision: 1,
    });

    const forbiddenStrings = [
      'super_secret_password_123',
      'super_secret_payload',
      'sess_999888777',
      'ak_live_abcdef123456',
      'secret_token_val_999',
      'MySecretPassword!',
      'db_pass_1234',
      'key_live_99999',
      'P@ssword123456!',
      'secret_bearer_token_xyz',
      'auth_token_value_456',
      'PlaintextInDescription',
    ];

    for (const secret of forbiddenStrings) {
      assert.ok(
        !report.reportMarkdown.includes(secret),
        `Markdown report leaked sensitive secret: '${secret}'`,
      );
      assert.ok(!report.title.includes(secret), `Title leaked sensitive secret: '${secret}'`);
      assert.ok(!report.summary.includes(secret), `Summary leaked sensitive secret: '${secret}'`);
    }
  });

  await t.test(
    'enforces cross-project boundary security in StructuredBugReportService',
    async () => {
      const caseId = '22222222-2222-2222-2222-222222222222';
      const ownerProjectId = '11111111-1111-1111-1111-111111111111';
      const attackerProjectId = '99999999-9999-9999-9999-999999999999';

      const mockPrisma = {
        failureCase: {
          findUnique: async () => ({
            id: caseId,
            projectId: ownerProjectId,
          }),
        },
      } as any;

      const service = new StructuredBugReportService(mockPrisma);

      await assert.rejects(
        async () => {
          await service.createBugReport({
            projectId: attackerProjectId,
            failureCaseId: caseId,
          });
        },
        (err: any) => {
          assert.ok(err instanceof BugReportCrossProjectError);
          assert.equal(err.code, 'BUG_REPORT_CROSS_PROJECT');
          return true;
        },
      );
    },
  );

  await t.test('enforces title and summary length bounds', () => {
    const hugeTitle = 'A'.repeat(1000);
    const rawFacts: StructuredBugReportFacts = {
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      failureCase: {
        id: '22222222-2222-2222-2222-222222222222',
        projectId: '11111111-1111-1111-1111-111111111111',
        executionId: 'exec-huge',
        title: hugeTitle,
        failureSummary: 'B'.repeat(10000),
        metadataJson: {},
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      project: { id: '11111111-1111-1111-1111-111111111111', key: 'SEC', name: 'Sec' },
      testExecution: {
        id: 'exec-huge',
        testCaseId: 'tc-huge',
        testCaseVersionNumber: 1,
        status: 'FAILED',
        errorMessage: 'Huge error',
        errorStack: null,
        startedAt: new Date(),
        completedAt: new Date(),
        environmentId: null,
        stepExecutions: [],
      },
      evidenceReferences: [],
    };

    const report = generator.generate(rawFacts, {
      reportNumber: 'BUG-000011',
      revision: 1,
      titleOverride: hugeTitle,
    });

    assert.ok(report.title.length <= 256, `Title length ${report.title.length} exceeds 256`);
    assert.ok(
      report.summary.length <= 5000,
      `Summary length ${report.summary.length} exceeds 5000`,
    );
  });
});
