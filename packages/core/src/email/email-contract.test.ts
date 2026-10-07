/**
 * @file packages/core/src/email/email-contract.test.ts
 * Phase 95 Contract & SMTP Wire Protocol Simulation Test Suite.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_CHANNELS,
  emailProviderTypeSchema,
  notificationEventTypeSchema,
  notificationDeliveryStatusSchema,
  notificationDeliveryModeSchema,
  notificationAuditActionSchema,
  projectEmailConfigDtoSchema,
  saveProjectEmailConfigInputSchema,
  testEmailConnectionInputSchema,
  notificationDeliveryAttemptDtoSchema,
  emailNotificationDtoSchema,
  listEmailNotificationsInputSchema,
  retryEmailNotificationInputSchema,
  sendWorkflowNotificationInputSchema,
} from '@ai-quality/contracts';
import { SmtpClient } from './smtp-client.js';
import { TestSmtpServer } from './test-smtp-server.js';
import { EmailProviderUnavailableError, EmailDeliveryFailedError } from './email-errors.js';

describe('Phase 95 Contract & Schema Invariants', () => {
  test('verifies DESKTOP_CHANNELS includes all Phase 95 channels', () => {
    assert.equal(DESKTOP_CHANNELS.EMAIL_GET_CONFIG, 'desktop:email:get-config');
    assert.equal(DESKTOP_CHANNELS.EMAIL_SAVE_CONFIG, 'desktop:email:save-config');
    assert.equal(DESKTOP_CHANNELS.EMAIL_TEST_CONNECTION, 'desktop:email:test-connection');
    assert.equal(DESKTOP_CHANNELS.EMAIL_LIST_NOTIFICATIONS, 'desktop:email:list-notifications');
    assert.equal(DESKTOP_CHANNELS.EMAIL_GET_NOTIFICATION, 'desktop:email:get-notification');
    assert.equal(DESKTOP_CHANNELS.EMAIL_RETRY_NOTIFICATION, 'desktop:email:retry-notification');
    assert.equal(
      DESKTOP_CHANNELS.EMAIL_SEND_WORKFLOW_NOTIFICATION,
      'desktop:email:send-workflow-notification',
    );
  });

  test('validates notification event type enums', () => {
    const validEvents = [
      'BUG_CREATED',
      'BUG_ASSIGNED',
      'BUG_REASSIGNED',
      'HIGH_SEVERITY_BUG_CREATED',
      'CRITICAL_SEVERITY_BUG_CREATED',
      'JIRA_ISSUE_CREATED',
      'JIRA_ISSUE_LINKED',
      'JIRA_ISSUE_CREATION_FAILED',
      'TEST_REVERIFICATION_REQUIRED',
    ];

    for (const evt of validEvents) {
      assert.equal(notificationEventTypeSchema.parse(evt), evt);
    }

    assert.throws(() => notificationEventTypeSchema.parse('INVALID_EVENT'));
  });

  test('validates delivery status and mode enums', () => {
    assert.equal(notificationDeliveryStatusSchema.parse('SENT'), 'SENT');
    assert.equal(notificationDeliveryStatusSchema.parse('FAILED'), 'FAILED');
    assert.equal(notificationDeliveryStatusSchema.parse('PENDING'), 'PENDING');
    assert.equal(notificationDeliveryStatusSchema.parse('SUPPRESSED'), 'SUPPRESSED');
    assert.throws(() => notificationDeliveryStatusSchema.parse('DELIVERED'));

    assert.equal(notificationDeliveryModeSchema.parse('REAL'), 'REAL');
    assert.equal(notificationDeliveryModeSchema.parse('TEST'), 'TEST');
    assert.equal(notificationDeliveryModeSchema.parse('SIMULATED'), 'SIMULATED');
  });

  test('validates saveProjectEmailConfigInputSchema with strict email validation', () => {
    const validConfig = {
      projectId: 'a1111111-1111-1111-1111-111111111111',
      providerType: 'SMTP' as const,
      senderName: 'Platform Alerts',
      senderAddress: 'alerts@example.com',
      replyTo: 'no-reply@example.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'alert-user',
      smtpPassword: 'SecretPassword123!',
      isEnabled: true,
      minSeverity: 'HIGH' as const,
      qaTeamRecipients: [{ email: 'qa-lead@example.com', name: 'QA Lead' }],
    };

    const parsed = saveProjectEmailConfigInputSchema.parse(validConfig);
    assert.equal(parsed.senderAddress, 'alerts@example.com');
    assert.equal(parsed.qaTeamRecipients?.[0]?.email, 'qa-lead@example.com');

    // Rejects invalid email
    assert.throws(() =>
      saveProjectEmailConfigInputSchema.parse({
        ...validConfig,
        senderAddress: 'not-an-email',
      }),
    );
  });

  test('validates emailNotificationDtoSchema structure', () => {
    const validNotification = {
      id: 'b1111111-1111-1111-1111-111111111111',
      projectId: 'a1111111-1111-1111-1111-111111111111',
      eventType: 'BUG_ASSIGNED' as const,
      entityType: 'BUG_REPORT',
      entityId: 'c1111111-1111-1111-1111-111111111111',
      recipientAddress: 'engineer@example.com',
      recipientRole: 'ASSIGNED_ENGINEER',
      subject: 'Defect Assigned: BUG-101',
      bodyText: 'Defect BUG-101 assigned to you.',
      bodyHtml: '<p>Defect BUG-101 assigned to you.</p>',
      templateId: 'tpl-bug-assigned',
      templateVersion: '1.0.0',
      idempotencyKey: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      status: 'SENT' as const,
      deliveryMode: 'REAL' as const,
      attemptCount: 1,
      maxAttempts: 3,
      provider: 'SMTP',
      providerMessageId: '<msg-1@test.com>',
      providerResponse: '250 Ok',
      queuedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = emailNotificationDtoSchema.parse(validNotification);
    assert.equal(parsed.status, 'SENT');
    assert.equal(parsed.recipientAddress, 'engineer@example.com');
  });
});

describe('Phase 95 Real SMTP Wire Protocol Simulation', () => {
  let testServer: TestSmtpServer;
  let serverPort = 0;

  before(async () => {
    testServer = new TestSmtpServer({
      authRequired: true,
      expectedUser: 'testuser',
      expectedPassword: 'testpassword',
    });
    serverPort = await testServer.start();
  });

  after(async () => {
    await testServer.stop();
  });

  test('successfully executes full RFC 5321 SMTP handshake and delivers email with 250 OK', async () => {
    testServer.clear();

    const client = new SmtpClient({
      host: '127.0.0.1',
      port: serverPort,
      user: 'testuser',
      password: 'testpassword',
      clientHostname: 'test.internal',
      timeoutMs: 5000,
    });

    const result = await client.send({
      from: 'alerts@aiquality.internal',
      to: ['engineer@example.com'],
      subject: '[CRITICAL] Defect Alert: BUG-101',
      bodyText:
        'A critical defect was found in login flow.\n.Leading dot test line\nSummary complete.',
      bodyHtml: '<p>A critical defect was found in login flow.</p>',
    });

    assert.equal(result.accepted, true);
    assert.ok(result.messageId.includes('@test.internal'));
    assert.ok(result.response.includes('250'));

    // Verify captured message on server
    assert.equal(testServer.receivedMessages.length, 1);
    const msg = testServer.receivedMessages[0]!;
    assert.equal(msg.from, 'alerts@aiquality.internal');
    assert.deepEqual(msg.to, ['engineer@example.com']);
    assert.equal(msg.subject, '[CRITICAL] Defect Alert: BUG-101');
    assert.ok(msg.rawMessage.includes('A critical defect was found'));
    // Verify RFC 5321 dot-stuffing was unstuffed back to single leading dot
    assert.ok(msg.rawMessage.includes('.Leading dot test line'));
  });

  test('correctly classifies SMTP 4xx temporary rejection as transient provider unavailable error', async () => {
    testServer.clear();
    testServer.rejectNextMailFrom = {
      code: 421,
      message: 'Service temporarily unavailable, closing channel',
    };

    const client = new SmtpClient({
      host: '127.0.0.1',
      port: serverPort,
      user: 'testuser',
      password: 'testpassword',
      timeoutMs: 3000,
    });

    await assert.rejects(
      async () => {
        await client.send({
          from: 'alerts@aiquality.internal',
          to: ['dev@example.com'],
          subject: 'Test Subject',
          bodyText: 'Test Body',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof EmailProviderUnavailableError);
        assert.equal(err.isTransient, true);
        assert.ok(err.message.includes('421'));
        return true;
      },
    );
  });

  test('correctly classifies SMTP 550 permanent error as non-transient delivery failed error', async () => {
    testServer.clear();
    testServer.rejectNextRcptTo = {
      email: 'nonexistent@example.com',
      code: 550,
      message: 'No such user here',
    };

    const client = new SmtpClient({
      host: '127.0.0.1',
      port: serverPort,
      user: 'testuser',
      password: 'testpassword',
      timeoutMs: 3000,
    });

    await assert.rejects(
      async () => {
        await client.send({
          from: 'alerts@aiquality.internal',
          to: ['nonexistent@example.com'],
          subject: 'Test Subject',
          bodyText: 'Test Body',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof EmailDeliveryFailedError);
        assert.equal(err.isTransient, false);
        assert.ok(err.message.includes('550'));
        return true;
      },
    );
  });

  test('handles connection refused cleanly as transient error', async () => {
    const offlinePort = 59999;
    const client = new SmtpClient({
      host: '127.0.0.1',
      port: offlinePort,
      timeoutMs: 1000,
    });

    await assert.rejects(
      async () => {
        await client.send({
          from: 'alerts@aiquality.internal',
          to: ['dev@example.com'],
          subject: 'Test Subject',
          bodyText: 'Test Body',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof EmailProviderUnavailableError);
        assert.equal(err.isTransient, true);
        return true;
      },
    );
  });
});
