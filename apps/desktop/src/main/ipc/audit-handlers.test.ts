/**
 * @file apps/desktop/src/main/ipc/audit-handlers.test.ts
 * IPC handler tests for Complete Repair & Reverification Audit Trail (V7 Phase 108).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMainInvokeEvent } from 'electron';
import {
  handleGetRepairTimeline,
  handleGetRepairSession,
  handleListRepairSessions,
  handleExportRepairTimeline,
  handleRecordRepairAuditEvent,
  setRepairAuditTrailService,
} from './audit-handlers.js';
import { AuditProjectMismatchError } from '@ai-quality/core';
import type {
  RepairAuditTimelineDto,
  RepairSessionDto,
  RepairAuditEventDto,
  ExportRepairTimelineResultDto,
} from '@ai-quality/contracts';

describe('Audit Trail IPC Handlers (Phase 108)', () => {
  const fakeTrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: null,
      url: 'app://renderer/index.html',
    } as any,
  } as IpcMainInvokeEvent;

  const fakeUntrustedEvent: IpcMainInvokeEvent = {
    senderFrame: {
      parent: {} as any,
      url: 'https://malicious.origin/attack.html',
    } as any,
  } as IpcMainInvokeEvent;

  const validProjectId = '11111111-1111-1111-1111-111111111111';
  const validFailureCaseId = '22222222-2222-2222-2222-222222222222';
  const validSessionId = '33333333-3333-3333-3333-333333333333';
  const validEventId = '44444444-4444-4444-4444-444444444444';

  const mockSessionDto: RepairSessionDto = {
    id: validSessionId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    sessionKey: 'RS-108-01',
    status: 'ACTIVE',
    totalEventsCount: 1,
    startedAt: new Date().toISOString(),
    completedAt: null,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [],
  };

  const mockEventDto: RepairAuditEventDto = {
    id: validEventId,
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    repairSessionId: validSessionId,
    sequenceNumber: 1,
    eventType: 'FAILURE_CREATED',
    actorType: 'TEST_ENGINE',
    actorId: 'playwright-runner',
    sourceComponent: 'failure-intelligence',
    timestamp: new Date().toISOString(),
    previousState: 'PASSED',
    newState: 'FAILED',
    evidenceReferences: [],
    repositoryState: {},
    testRunReferences: [],
    jiraReference: {},
    notificationReference: {},
    reason: 'Payment timeout',
    correlationId: 'corr-108',
    causationId: null,
    idempotencyKey: 'idemp-108',
    schemaVersion: '1.0.0',
    metadata: {},
    createdAt: new Date().toISOString(),
  };

  const mockTimelineDto: RepairAuditTimelineDto = {
    projectId: validProjectId,
    failureCaseId: validFailureCaseId,
    session: mockSessionDto,
    totalEvents: 1,
    events: [mockEventDto],
    generatedAt: new Date().toISOString(),
  };

  const mockExportResult: ExportRepairTimelineResultDto = {
    fileName: 'repair-audit-108.json',
    contentType: 'application/json',
    content: '{}',
    eventCount: 1,
    checksumSha256: 'a'.repeat(64),
    exportedAt: new Date().toISOString(),
  };

  const mockService = {
    getTimeline: async () => mockTimelineDto,
    getSession: async () => mockSessionDto,
    listSessions: async () => [mockSessionDto],
    exportTimeline: async () => mockExportResult,
    recordEvent: async () => mockEventDto,
    syncHistoricalEvents: async () => 1,
    getOrCreateSession: async () => mockSessionDto,
  };

  beforeEach(() => {
    setRepairAuditTrailService(mockService as any);
  });

  it('rejects untrusted sender frame origins across all handlers', async () => {
    const r1 = await handleGetRepairTimeline(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.equal(r1.error.code, 'UNAUTHORIZED_SENDER');

    const r2 = await handleGetRepairSession(fakeUntrustedEvent, {
      projectId: validProjectId,
      sessionIdOrKey: validSessionId,
    });
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.error.code, 'UNAUTHORIZED_SENDER');

    const r3 = await handleListRepairSessions(fakeUntrustedEvent, {
      projectId: validProjectId,
    });
    assert.equal(r3.ok, false);
    if (!r3.ok) assert.equal(r3.error.code, 'UNAUTHORIZED_SENDER');

    const r4 = await handleExportRepairTimeline(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(r4.ok, false);
    if (!r4.ok) assert.equal(r4.error.code, 'UNAUTHORIZED_SENDER');

    const r5 = await handleRecordRepairAuditEvent(fakeUntrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      eventType: 'FAILURE_CREATED',
      actorType: 'TEST_ENGINE',
      actorId: 'runner',
      sourceComponent: 'test',
      correlationId: 'corr',
    });
    assert.equal(r5.ok, false);
    if (!r5.ok) assert.equal(r5.error.code, 'UNAUTHORIZED_SENDER');
  });

  it('rejects invalid schema inputs with VALIDATION_ERROR', async () => {
    const res = await handleGetRepairTimeline(fakeTrustedEvent, {
      projectId: 'not-a-valid-uuid',
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error.code, 'VALIDATION_ERROR');
  });

  it('handles getTimeline successfully with trusted sender and valid input', async () => {
    const res = await handleGetRepairTimeline(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.projectId, validProjectId);
      assert.equal(res.data.events.length, 1);
    }
  });

  it('handles exportTimeline successfully', async () => {
    const res = await handleExportRepairTimeline(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
      format: 'JSON',
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.contentType, 'application/json');
      assert.equal(res.data.checksumSha256.length, 64);
    }
  });

  it('maps domain exceptions into structured DesktopError envelopes', async () => {
    setRepairAuditTrailService({
      getTimeline: async () => {
        throw new AuditProjectMismatchError('Cross-project access forbidden');
      },
    } as any);

    const res = await handleGetRepairTimeline(fakeTrustedEvent, {
      projectId: validProjectId,
      failureCaseId: validFailureCaseId,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'AUDIT_PROJECT_MISMATCH');
      assert.ok(res.error.message.includes('forbidden'));
    }
  });
});
