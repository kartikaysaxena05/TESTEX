/**
 * @file packages/core/src/failures/evidence/failure-evidence-ingestion.test.ts
 * Unit and integration tests for Failure Evidence Ingestion & Normalization (V6 Phase 75).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FailureEvidenceRedactor,
  FailureSignatureGenerator,
  FailureEvidenceNormalizer,
} from './index.js';

describe('Failure Evidence Normalization Subsystems (Phase 75)', () => {
  describe('FailureEvidenceRedactor', () => {
    const redactor = new FailureEvidenceRedactor();

    it('redacts Authorization Bearer and Basic tokens', () => {
      const text =
        'Request sent with header Authorization: Bearer secret-token-12345 and Basic dXNlcjpwYXNz';
      const result = redactor.redactText(text);

      assert.equal(result.isRedacted, true);
      assert.ok(result.redacted.includes('Bearer [REDACTED]'));
      assert.ok(result.redacted.includes('Basic [REDACTED]'));
      assert.ok(!result.redacted.includes('secret-token-12345'));
    });

    it('redacts sensitive query parameters from URLs', () => {
      const url =
        'https://api.example.com/v1/users?token=secret123&apiKey=key999&page=1&search=test';
      const result = redactor.redactUrl(url);

      assert.equal(result.isRedacted, true);
      assert.ok(result.redacted.includes('token=%5BREDACTED%5D'));
      assert.ok(result.redacted.includes('apiKey=%5BREDACTED%5D'));
      assert.ok(result.redacted.includes('page=1'));
      assert.ok(result.redacted.includes('search=test'));
      assert.ok(!result.redacted.includes('secret123'));
    });

    it('redacts sensitive headers in map', () => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-secret',
        'X-API-Key': 'my-api-key',
        Cookie: 'session_id=abcdef123456',
        Accept: '*/*',
      };

      const result = redactor.redactHeaders(headers);
      assert.equal(result.isRedacted, true);
      assert.equal(result.redacted['Authorization'], '[REDACTED]');
      assert.equal(result.redacted['X-API-Key'], '[REDACTED]');
      assert.equal(result.redacted['Cookie'], '[REDACTED]');
      assert.equal(result.redacted['Content-Type'], 'application/json');
    });

    it('redacts database passwords in connection strings', () => {
      const dbStr =
        'Connecting to postgres://admin:SuperSecretPass123@db.prod.internal:5432/main_db';
      const result = redactor.redactText(dbStr);

      assert.equal(result.isRedacted, true);
      assert.ok(
        result.redacted.includes('postgres://admin:[REDACTED]@db.prod.internal:5432/main_db'),
      );
      assert.ok(!result.redacted.includes('SuperSecretPass123'));
    });

    it('recursively redacts sensitive keys in JSON objects', () => {
      const payload = {
        user: 'john_doe',
        password: 'plain_password',
        sessionToken: 'xyz789',
        nested: {
          apiKey: 'key-abc',
          validConfig: 42,
        },
      };

      const result = redactor.redactObject(payload);
      assert.equal(result.isRedacted, true);
      const res = result.redacted as any;
      assert.equal(res.password, '[REDACTED]');
      assert.equal(res.sessionToken, '[REDACTED]');
      assert.equal(res.nested.apiKey, '[REDACTED]');
      assert.equal(res.nested.validConfig, 42);
      assert.equal(res.user, 'john_doe');
    });
  });

  describe('FailureSignatureGenerator', () => {
    const generator = new FailureSignatureGenerator();

    it('generates identical deterministic signature regardless of volatile UUIDs and timestamps', () => {
      const sig1 = generator.generateSignature({
        actionType: 'CLICK',
        targetSummary: 'button#checkout-btn[data-id="a8098c1a-f86e-11da-bd1a-00112444be1e"]',
        errorCode: 'TIMEOUT_ERROR',
        errorMessage: 'Element not interactable after 5000ms at 2026-08-23T14:30:00.000Z',
        assertionType: 'ELEMENT_VISIBLE',
        browserEngine: 'chromium',
      });

      const sig2 = generator.generateSignature({
        actionType: 'CLICK',
        targetSummary: 'button#checkout-btn[data-id="c9b21f30-891a-4d44-9382-aa9812984123"]',
        errorCode: 'TIMEOUT_ERROR',
        errorMessage: 'Element not interactable after 5000ms at 2026-08-23T15:45:12.123Z',
        assertionType: 'ELEMENT_VISIBLE',
        browserEngine: 'chromium',
      });

      assert.equal(sig1, sig2);
      assert.ok(sig1.startsWith('sig_'));
    });

    it('produces distinct signatures for different actions or error codes', () => {
      const sigClick = generator.generateSignature({
        actionType: 'CLICK',
        targetSummary: 'button#submit',
        errorCode: 'ELEMENT_NOT_FOUND',
      });

      const sigFill = generator.generateSignature({
        actionType: 'FILL',
        targetSummary: 'input#username',
        errorCode: 'ELEMENT_NOT_FOUND',
      });

      assert.notEqual(sigClick, sigFill);
    });
  });

  describe('FailureEvidenceNormalizer', () => {
    const normalizer = new FailureEvidenceNormalizer();

    it('accurately distinguishes CAPTURED_EMPTY from NOT_CAPTURED', () => {
      const inputNotCaptured: any = {
        failureCase: {
          id: '11111111-1111-1111-1111-111111111111',
          projectId: '22222222-2222-2222-2222-222222222222',
          executionId: '33333333-3333-3333-3333-333333333333',
          testRunId: '44444444-4444-4444-4444-444444444444',
          testCaseId: '55555555-5555-5555-5555-555555555555',
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          title: 'Test Case Failure',
        },
        execution: {
          id: '33333333-3333-3333-3333-333333333333',
          projectId: '22222222-2222-2222-2222-222222222222',
          testRunId: '44444444-4444-4444-4444-444444444444',
          attempt: 1,
          status: 'FAILED',
          browserEngine: 'chromium',
          stepExecutions: [],
          assertionExecutionRecords: [],
          locatorHealingAttempts: [],
        },
        siblingExecutions: [],
        evidenceReferences: [], // No references
      };

      const resultNotCaptured = normalizer.normalize(inputNotCaptured);
      assert.equal(resultNotCaptured.consoleAvailability, 'NOT_CAPTURED');
      assert.equal(resultNotCaptured.networkAvailability, 'NOT_CAPTURED');
      assert.equal(resultNotCaptured.traceAvailability, 'NOT_CAPTURED');
      assert.equal(resultNotCaptured.domAvailability, 'NOT_CAPTURED');

      const inputCapturedEmpty: any = {
        ...inputNotCaptured,
        evidenceReferences: [
          {
            id: 'ref-1',
            artifactType: 'CONSOLE_LOG',
            logicalName: 'console.log',
            integrityStatus: 'VERIFIED',
            metadataJson: { messages: [] }, // Empty messages
            attachedAt: new Date().toISOString(),
          },
          {
            id: 'ref-2',
            artifactType: 'NETWORK_LOG',
            logicalName: 'network.har',
            integrityStatus: 'VERIFIED',
            metadataJson: { records: [] }, // Empty records
            attachedAt: new Date().toISOString(),
          },
        ],
      };

      const resultCapturedEmpty = normalizer.normalize(inputCapturedEmpty);
      assert.equal(resultCapturedEmpty.consoleAvailability, 'CAPTURED_EMPTY');
      assert.equal(resultCapturedEmpty.networkAvailability, 'CAPTURED_EMPTY');
    });

    it('computes COMPLETE completeness status when all core evidence dimensions exist', () => {
      const input: any = {
        failureCase: {
          id: '11111111-1111-1111-1111-111111111111',
          projectId: '22222222-2222-2222-2222-222222222222',
          executionId: '33333333-3333-3333-3333-333333333333',
          testRunId: '44444444-4444-4444-4444-444444444444',
          testCaseId: '55555555-5555-5555-5555-555555555555',
          testCaseVersionNumber: 1,
          triggeringExecutionStatus: 'FAILED',
          title: 'Test Case Failure',
        },
        execution: {
          id: '33333333-3333-3333-3333-333333333333',
          projectId: '22222222-2222-2222-2222-222222222222',
          testRunId: '44444444-4444-4444-4444-444444444444',
          attempt: 1,
          status: 'FAILED',
          browserEngine: 'chromium',
          testRun: {
            environment: {
              name: 'Staging',
              baseUrl: 'https://staging.app.com',
              browserEngine: 'chromium',
              viewportWidth: 1920,
              viewportHeight: 1080,
            },
          },
          stepExecutions: [
            {
              id: 'step-1',
              stepIndex: 0,
              attempt: 1,
              actionType: 'CLICK',
              status: 'FAILED',
              targetSummary: 'button#pay-now',
              expectedSummary: 'Payment modal opened',
              actualSummary: 'Timed out waiting for modal',
              errorCode: 'TIMEOUT',
              errorMessage: 'Element button#pay-now not found within 10000ms',
            },
          ],
          assertionExecutionRecords: [
            {
              id: 'assert-1',
              stepExecutionId: 'step-1',
              assertionType: 'ELEMENT_VISIBLE',
              operator: 'EQUALS',
              status: 'FAILED',
              isHard: true,
              expectedValueJson: true,
              actualValueJson: false,
              message: 'Modal did not appear',
            },
          ],
          locatorHealingAttempts: [],
        },
        siblingExecutions: [],
        evidenceReferences: [
          {
            id: 'ref-shot',
            artifactType: 'SCREENSHOT',
            logicalName: 'failure.png',
            integrityStatus: 'VERIFIED',
            metadataJson: {},
            attachedAt: new Date().toISOString(),
          },
          {
            id: 'ref-console',
            artifactType: 'CONSOLE_LOG',
            logicalName: 'console.json',
            integrityStatus: 'VERIFIED',
            metadataJson: {
              messages: [{ level: 'error', message: 'Unhandled rejection in script' }],
            },
            attachedAt: new Date().toISOString(),
          },
        ],
      };

      const result = normalizer.normalize(input);
      assert.equal(result.completeness, 'COMPLETE');
      assert.equal(result.failedStep?.actionType, 'CLICK');
      assert.equal(result.expectedVsActual?.expectedValue, true);
      assert.equal(result.expectedVsActual?.actualValue, false);
      assert.equal(result.screenshots.length, 1);
      assert.equal(result.consoleMessages.length, 1);
    });
  });
});
