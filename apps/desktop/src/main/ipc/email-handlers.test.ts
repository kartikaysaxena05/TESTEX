/**
 * @file apps/desktop/src/main/ipc/email-handlers.test.ts
 * Main-process IPC handler tests for Phase 95 Email Notification System.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetEmailConfig,
  handleSaveEmailConfig,
  handleTestEmailConnection,
  handleListEmailNotifications,
  handleGetEmailNotification,
  handleRetryEmailNotification,
  handleSendWorkflowNotification,
} from './email-handlers.js';
import { getPrismaClient } from '@ai-quality/core';

describe('Phase 95 Email IPC Handlers Security & Boundary Tests', () => {
  const prisma = getPrismaClient()!;
  let testProjectId: string;

  const trustedEvent = {
    senderFrame: {
      url: 'app://renderer/index.html',
      parent: null,
    },
    sender: {
      id: 1,
    },
  } as unknown as IpcMainInvokeEvent;

  const untrustedEvent = {
    senderFrame: {
      url: 'https://evil.attacker.com/malicious.html',
      parent: null,
    },
    sender: {
      id: 99,
    },
  } as unknown as IpcMainInvokeEvent;

  before(async () => {
    const project = await prisma.project.create({
      data: {
        name: `Email IPC Test Project ${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    testProjectId = project.id;
  });

  test('rejects untrusted IPC sender on all Phase 95 channels', async () => {
    const r1 = await handleGetEmailConfig(untrustedEvent, { projectId: testProjectId });
    assert.equal(r1.ok, false);
    assert.equal(r1.error.code, 'UNAUTHORIZED_SENDER');

    const r2 = await handleSaveEmailConfig(untrustedEvent, {
      projectId: testProjectId,
      senderAddress: 'test@example.com',
    });
    assert.equal(r2.ok, false);
    assert.equal(r2.error.code, 'UNAUTHORIZED_SENDER');

    const r3 = await handleTestEmailConnection(untrustedEvent, { projectId: testProjectId });
    assert.equal(r3.ok, false);
    assert.equal(r3.error.code, 'UNAUTHORIZED_SENDER');

    const r4 = await handleListEmailNotifications(untrustedEvent, { projectId: testProjectId });
    assert.equal(r4.ok, false);
    assert.equal(r4.error.code, 'UNAUTHORIZED_SENDER');

    const r5 = await handleGetEmailNotification(untrustedEvent, {
      projectId: testProjectId,
      notificationId: 'a1111111-1111-1111-1111-111111111111',
    });
    assert.equal(r5.ok, false);
    assert.equal(r5.error.code, 'UNAUTHORIZED_SENDER');

    const r6 = await handleRetryEmailNotification(untrustedEvent, {
      projectId: testProjectId,
      notificationId: 'a1111111-1111-1111-1111-111111111111',
    });
    assert.equal(r6.ok, false);
    assert.equal(r6.error.code, 'UNAUTHORIZED_SENDER');

    const r7 = await handleSendWorkflowNotification(untrustedEvent, {
      projectId: testProjectId,
      eventType: 'BUG_CREATED',
    });
    assert.equal(r7.ok, false);
    assert.equal(r7.error.code, 'UNAUTHORIZED_SENDER');
  });

  test('validates input and returns VALIDATION_ERROR on malformed request payloads', async () => {
    // Malformed projectId
    const res = await handleGetEmailConfig(trustedEvent, { projectId: 'not-a-uuid' });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VALIDATION_ERROR');

    // Invalid email address format
    const res2 = await handleSaveEmailConfig(trustedEvent, {
      projectId: testProjectId,
      senderAddress: 'bad-email-address',
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.error.code, 'VALIDATION_ERROR');
  });

  test('successfully saves and retrieves project email configuration over trusted IPC', async () => {
    const saveRes = await handleSaveEmailConfig(trustedEvent, {
      projectId: testProjectId,
      providerType: 'SANDBOX',
      senderName: 'Quality Bot',
      senderAddress: 'quality-bot@example.com',
      isEnabled: true,
      minSeverity: 'MEDIUM',
    });

    assert.equal(saveRes.ok, true);
    if (saveRes.ok) {
      assert.equal(saveRes.data.senderAddress, 'quality-bot@example.com');
      assert.equal(saveRes.data.providerType, 'SANDBOX');
    }

    const getRes = await handleGetEmailConfig(trustedEvent, { projectId: testProjectId });
    assert.equal(getRes.ok, true);
    if (getRes.ok) {
      assert.equal(getRes.data?.senderName, 'Quality Bot');
    }
  });

  test('successfully tests connection over trusted IPC', async () => {
    const res = await handleTestEmailConnection(trustedEvent, {
      projectId: testProjectId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.success, true);
      assert.equal(res.data.provider, 'SANDBOX');
    }
  });

  test('successfully queries notifications list over trusted IPC', async () => {
    const res = await handleListEmailNotifications(trustedEvent, {
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(Array.isArray(res.data.items));
      assert.equal(typeof res.data.total, 'number');
    }
  });
});
