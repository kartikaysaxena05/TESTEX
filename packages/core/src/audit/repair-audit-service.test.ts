/**
 * @file packages/core/src/audit/repair-audit-service.test.ts
 * Integration tests for RepairAuditTrailService (V7 Phase 108).
 * Verifies session tracking, append-only event recording, deterministic sequence numbering,
 * deduplication via idempotency keys, filtering, exports, and historical synchronization.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { RepairAuditTrailService } from './repair-audit-trail-service.js';

describe('RepairAuditTrailService Integration', () => {
  let prisma: PrismaClient;
  const testProjectId = crypto.randomUUID();
  let failureCaseId: string;
  let testCaseId: string;
  let _testRunId: string;
  let executionId: string;
  let service: RepairAuditTrailService;

  before(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Database client unavailable');
    prisma = client;
    service = new RepairAuditTrailService({ prisma });

    // 1. Create Project
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Phase 108 Audit Test Project',
        description: 'Integration test project for repair audit trail',
      },
    });

    // 2. Create Environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Dev Environment',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3000',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });

    // 3. Create Test Case & Version
    const tc = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: 'TC-AUDIT-108',
        title: 'Checkout Payment Verification',
        objective: 'Test payment token validation',
        type: 'REGRESSION',
        status: 'ACTIVE',
        priority: 'HIGH',
      },
    });
    testCaseId = tc.id;

    const ver = await prisma.testCaseVersion.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        versionNumber: 1,
        title: 'Checkout Payment Verification v1',
        objective: 'Test payment token validation',
        stepsJson: [],
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        environmentId: env.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-108-${Date.now()}`,
        status: 'VALID',
      },
    });

    // 4. Create Test Run & Execution
    const run = await prisma.testRun.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Checkout Payment Verification',
        planFingerprint: plan.planFingerprint,
        status: 'FAILED',
        environmentId: env.id,
        executableTestPlanId: plan.id,
      },
    });
    _testRunId = run.id;

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: testProjectId,
        testRunId: run.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        environmentId: env.id,
        status: 'FAILED',
      },
    });
    executionId = exec.id;

    // 5. Create Failure Case
    const fc = await prisma.failureCase.create({
      data: {
        projectId: testProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Payment gateway timeout',
        failureSummary: 'Timeout during token exchange',
      },
    });
    failureCaseId = fc.id;
  });

  after(async () => {
    // Cascade delete project and all associated records
    try {
      await prisma.project.delete({
        where: { id: testProjectId },
      });
    } catch {
      // Ignore teardown error
    }
  });

  it('creates and re-uses repair session idempotently', async () => {
    const session1 = await service.getOrCreateSession({
      projectId: testProjectId,
      failureCaseId,
      actorId: 'qa-engineer',
    });

    assert.ok(session1.id);
    assert.equal(session1.projectId, testProjectId);
    assert.equal(session1.failureCaseId, failureCaseId);
    assert.equal(session1.status, 'ACTIVE');
    assert.ok(session1.sessionKey.startsWith('RS-'));

    // Second call should return the exact same active session
    const session2 = await service.getOrCreateSession({
      projectId: testProjectId,
      failureCaseId,
      actorId: 'developer',
    });

    assert.equal(session2.id, session1.id);
    assert.equal(session2.sessionKey, session1.sessionKey);
  });

  it('records events with monotonic sequence numbers and deduplicates via idempotencyKey', async () => {
    const correlationId = crypto.randomUUID();
    const uniqueKey1 = `test:${testProjectId}:${failureCaseId}:evt1`;
    const uniqueKey2 = `test:${testProjectId}:${failureCaseId}:evt2`;

    // Event 1
    const evt1 = await service.recordEvent({
      projectId: testProjectId,
      failureCaseId,
      eventType: 'FAILURE_CREATED',
      actorType: 'TEST_ENGINE',
      actorId: 'playwright-runner',
      sourceComponent: 'failure-intelligence',
      previousState: 'PASSED',
      newState: 'FAILED',
      reason: 'Checkout payment gateway failure',
      correlationId,
      idempotencyKey: uniqueKey1,
    });

    assert.equal(evt1.sequenceNumber, 1);
    assert.equal(evt1.actorType, 'TEST_ENGINE');

    // Duplicate Event 1 with same idempotencyKey -> should return existing without re-inserting
    const duplicateEvt1 = await service.recordEvent({
      projectId: testProjectId,
      failureCaseId,
      eventType: 'FAILURE_CREATED',
      actorType: 'TEST_ENGINE',
      actorId: 'playwright-runner',
      sourceComponent: 'failure-intelligence',
      previousState: 'PASSED',
      newState: 'FAILED',
      reason: 'Checkout payment gateway failure (duplicate)',
      correlationId,
      idempotencyKey: uniqueKey1,
    });

    assert.equal(duplicateEvt1.id, evt1.id);
    assert.equal(duplicateEvt1.sequenceNumber, 1);

    // Event 2
    const evt2 = await service.recordEvent({
      projectId: testProjectId,
      failureCaseId,
      eventType: 'PATCH_APPROVED',
      actorType: 'USER',
      actorId: 'lead-dev@corp.com',
      sourceComponent: 'patch-approval',
      previousState: 'PENDING_REVIEW',
      newState: 'APPROVED',
      reason: 'Patch validated and approved for merge',
      correlationId,
      idempotencyKey: uniqueKey2,
    });

    assert.equal(evt2.sequenceNumber, 2);
    assert.equal(evt2.actorType, 'USER');
  });

  it('queries timeline with deterministic ordering and actorType filtering', async () => {
    const timeline = await service.getTimeline({
      projectId: testProjectId,
      failureCaseId,
      limit: 100,
      offset: 0,
    });

    assert.equal(timeline.projectId, testProjectId);
    assert.equal(timeline.failureCaseId, failureCaseId);
    assert.ok(timeline.totalEvents >= 2);

    // Verify chronological ordering
    for (let i = 1; i < timeline.events.length; i++) {
      const prev = new Date(timeline.events[i - 1]!.timestamp).getTime();
      const curr = new Date(timeline.events[i]!.timestamp).getTime();
      assert.ok(
        curr >= prev,
        `Events must be sorted ascending by timestamp (prev: ${prev}, curr: ${curr})`,
      );
    }

    // Filter by USER actor
    const userEvents = await service.getTimeline({
      projectId: testProjectId,
      failureCaseId,
      actorTypeFilter: ['USER'],
    });

    assert.ok(userEvents.events.length >= 1);
    for (const ev of userEvents.events) {
      assert.equal(ev.actorType, 'USER');
    }
  });

  it('retrieves session by id and lists sessions', async () => {
    const sessions = await service.listSessions({
      projectId: testProjectId,
      limit: 10,
    });

    assert.ok(sessions.length >= 1);
    const first = sessions[0]!;

    const fetched = await service.getSession({
      projectId: testProjectId,
      sessionIdOrKey: first.id,
    });

    assert.ok(fetched);
    assert.equal(fetched?.id, first.id);
    assert.equal(fetched?.projectId, testProjectId);
  });

  it('exports timeline to JSON and Markdown with cryptographic checksums', async () => {
    const jsonExport = await service.exportTimeline({
      projectId: testProjectId,
      failureCaseId,
      format: 'JSON',
    });

    assert.equal(jsonExport.contentType, 'application/json');
    assert.ok(jsonExport.eventCount >= 2);
    assert.ok(jsonExport.checksumSha256.length === 64);

    const mdExport = await service.exportTimeline({
      projectId: testProjectId,
      failureCaseId,
      format: 'MARKDOWN',
    });

    assert.equal(mdExport.contentType, 'text/markdown');
    assert.ok(mdExport.eventCount >= 2);
    assert.ok(mdExport.content.includes('# Repair & Reverification Forensic Audit Report'));
    assert.ok(mdExport.checksumSha256.length === 64);
  });

  it('synchronizes historical cross-phase entities automatically', async () => {
    // Create a StructuredBugReport directly in db to simulate Phase 90
    const bugId = crypto.randomUUID();
    await prisma.structuredBugReport.create({
      data: {
        id: bugId,
        projectId: testProjectId,
        failureCaseId,
        testCaseId,
        testCaseKey: 'TC-AUDIT-108',
        testCaseVersionNumber: 1,
        testCaseTitle: 'Checkout Payment Verification',
        originalExecutionId: executionId,
        triggeringStatus: 'FAILED',
        reportNumber: 'BUG-108-HIST',
        title: 'Historical Bug Report for Audit Trail',
        summary: 'Synchronized bug report from earlier phase',
        markdownReport: '# Historical Bug Report\nPayment token exchange timed out.',
        reportFingerprint: `fp-bug-108-${Date.now()}`,
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        expectedResult: 'Payment token processed',
        actualResult: 'Token timed out',
      },
    });

    const syncedCount = await service.syncHistoricalEvents({
      projectId: testProjectId,
      failureCaseId,
    });

    assert.ok(syncedCount >= 1);

    const updatedTimeline = await service.getTimeline({
      projectId: testProjectId,
      failureCaseId,
    });

    const hasBugEvent = updatedTimeline.events.some(
      e => e.eventType === 'BUG_REPORT_CREATED' && e.idempotencyKey.includes(bugId),
    );
    assert.ok(hasBugEvent, 'Historical bug report must appear in audit timeline');
  });
});
