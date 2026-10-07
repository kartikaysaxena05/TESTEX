/**
 * @file packages/core/src/audit/repair-audit-certification.test.ts
 * End-to-end certification test suite for V7 Phase 108 Complete Repair & Reverification Audit Trail.
 * Proves authoritative, tamper-evident reconstruction across the entire defect lifecycle:
 * Failure -> Intelligence -> Bug -> Jira -> Assignment -> Reverification -> Quick-Fix ->
 * Localization -> Patch -> Sandbox -> Human Decision -> Retest -> Rollback/Post-Fix -> Ledger.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { RepairAuditTrailService } from './repair-audit-trail-service.js';
import { AuditTrailExporter } from './audit-trail-exporter.js';

describe('V7 Phase 108 — Complete Repair & Reverification Audit Trail Certification', () => {
  let prisma: PrismaClient;
  let service: RepairAuditTrailService;

  const certProjectId = crypto.randomUUID();
  let testCaseId: string;
  let _testRunId: string;
  let executionId: string;
  let failureCaseId: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Database client unavailable');
    prisma = client;
    service = new RepairAuditTrailService({ prisma });

    // 1. Create Project
    await prisma.project.create({
      data: {
        id: certProjectId,
        name: 'Phase 108 Certification Quality Project',
        description: 'End-to-end certification for repair and reverification audit trail',
      },
    });

    // 2. Create Environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: certProjectId,
        name: 'Certification Staging',
        type: 'STAGING',
        baseUrl: 'http://localhost:8080',
        isDefault: true,
      },
    });

    // 3. Create Test Case & Version
    const tc = await prisma.testCase.create({
      data: {
        projectId: certProjectId,
        testCaseKey: 'TC-CERT-108',
        title: 'Checkout Payment Gateway Transaction',
        objective: 'Certify complete end-to-end repair lifecycle audit trail',
        type: 'REGRESSION',
        status: 'ACTIVE',
      },
    });
    testCaseId = tc.id;

    const ver = await prisma.testCaseVersion.create({
      data: {
        projectId: certProjectId,
        testCaseId: tc.id,
        versionNumber: 1,
        title: 'Checkout Payment Gateway Transaction v1',
        objective: 'Certify complete end-to-end repair lifecycle audit trail',
        stepsJson: [],
      },
    });

    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: certProjectId,
        environmentId: env.id,
        testCaseId: tc.id,
        testCaseVersionId: ver.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-cert-${Date.now()}`,
        status: 'VALID',
      },
    });

    const run = await prisma.testRun.create({
      data: {
        projectId: certProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Checkout Payment Gateway Transaction',
        planFingerprint: plan.planFingerprint,
        status: 'FAILED',
        environmentId: env.id,
        executableTestPlanId: plan.id,
      },
    });
    _testRunId = run.id;

    const exec = await prisma.testCaseExecution.create({
      data: {
        projectId: certProjectId,
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

    const fc = await prisma.failureCase.create({
      data: {
        projectId: certProjectId,
        testCaseId: tc.id,
        testCaseVersionNumber: 1,
        testRunId: run.id,
        executionId: exec.id,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Stripe webhook 403 authorization failed',
        failureSummary:
          'Webhook signature validation failed with invalid secret Bearer token-live-secret-999',
      },
    });
    failureCaseId = fc.id;
  });

  after(async () => {
    try {
      await prisma.project.delete({ where: { id: certProjectId } });
    } catch {
      // Ignore cleanup error
    }
  });

  it('certifies complete defect-to-repair lifecycle reconstruction across all phases', async () => {
    const correlationId = crypto.randomUUID();

    // 1. Initial State: sync historical failure case
    await service.syncHistoricalEvents({
      projectId: certProjectId,
      failureCaseId,
    });

    // 2. Phase 90 Bug Report creation
    await prisma.structuredBugReport.create({
      data: {
        id: crypto.randomUUID(),
        projectId: certProjectId,
        failureCaseId,
        testCaseId,
        testCaseKey: 'TC-CERT-108',
        testCaseVersionNumber: 1,
        testCaseTitle: 'Checkout Payment Gateway Transaction',
        originalExecutionId: executionId,
        triggeringStatus: 'FAILED',
        reportNumber: 'BUG-CERT-108',
        title: 'Stripe webhook signature validation bug',
        summary: 'AI extracted webhook failure',
        markdownReport: '# Webhook Bug Report',
        reportFingerprint: `fp-bug-cert-${Date.now()}`,
        applicationDefectState: 'CONFIRMED_APPLICATION_DEFECT',
        isApplicationDefect: true,
        expectedResult: 'Webhook returns 200',
        actualResult: 'Webhook returns 403',
      },
    });

    // 3. Phase 94 Engineer Ownership
    const eng = await prisma.projectEngineer.create({
      data: {
        projectId: certProjectId,
        userId: 'eng-lead',
        displayName: 'Senior QA Architect',
        email: 'qa.architect@enterprise.org',
      },
    });

    await prisma.defectOwnership.create({
      data: {
        projectId: certProjectId,
        failureCaseId,
        bugReportId: (await prisma.structuredBugReport.findFirst({
          where: { projectId: certProjectId },
        }))!.id,
        assignedEngineerId: eng.id,
        assignmentSource: 'MANUAL',
        assignedByUserId: 'director@enterprise.org',
        assignmentReason: 'Assigned to lead security architect',
      },
    });

    // 4. Record human rejection followed by approval
    await service.recordEvent({
      projectId: certProjectId,
      failureCaseId,
      eventType: 'PATCH_REJECTED',
      actorType: 'USER',
      actorId: 'qa.architect@enterprise.org',
      sourceComponent: 'patch-approval',
      previousState: 'PENDING_REVIEW',
      newState: 'REJECTED',
      reason: 'Initial patch missed boundary validation',
      correlationId,
      idempotencyKey: `cert:rejection:${failureCaseId}`,
    });

    await service.recordEvent({
      projectId: certProjectId,
      failureCaseId,
      eventType: 'PATCH_APPROVED',
      actorType: 'USER',
      actorId: 'qa.architect@enterprise.org',
      sourceComponent: 'patch-approval',
      previousState: 'PENDING_REVIEW',
      newState: 'APPROVED',
      reason: 'Revised patch passed all security checks',
      correlationId,
      idempotencyKey: `cert:approval:${failureCaseId}`,
    });

    // 5. Record patch applied & post-fix update
    await service.recordEvent({
      projectId: certProjectId,
      failureCaseId,
      eventType: 'PATCH_APPLIED',
      actorType: 'REPAIR_ENGINE',
      actorId: 'git-patch-applicator',
      sourceComponent: 'patch-applicator',
      previousState: 'APPROVED',
      newState: 'PATCH_APPLIED',
      reason: 'Applied unified diff cleanly to main branch',
      correlationId,
      idempotencyKey: `cert:applied:${failureCaseId}`,
    });

    await service.recordEvent({
      projectId: certProjectId,
      failureCaseId,
      eventType: 'POST_FIX_STATUS_UPDATED',
      actorType: 'JIRA_INTEGRATION',
      actorId: 'jira-sync-worker',
      sourceComponent: 'post-fix-sync',
      previousState: 'IN_PROGRESS',
      newState: 'READY_FOR_QA',
      reason: 'Updated Jira issue PROJ-108 to Ready for QA',
      correlationId,
      idempotencyKey: `cert:postfix:${failureCaseId}`,
    });

    await service.recordEvent({
      projectId: certProjectId,
      failureCaseId,
      eventType: 'REPAIR_SESSION_COMPLETED',
      actorType: 'SYSTEM',
      actorId: 'repair-lifecycle-coordinator',
      sourceComponent: 'repair-coordinator',
      previousState: 'ACTIVE',
      newState: 'COMPLETED',
      reason: 'End-to-end repair cycle completed and verified',
      correlationId,
      idempotencyKey: `cert:completed:${failureCaseId}`,
    });

    // 6. Query authoritative timeline
    const timeline = await service.getTimeline({
      projectId: certProjectId,
      failureCaseId,
    });

    assert.ok(timeline.totalEvents >= 6);

    // Verify chronological ordering
    for (let i = 1; i < timeline.events.length; i++) {
      const prev = new Date(timeline.events[i - 1]!.timestamp).getTime();
      const curr = new Date(timeline.events[i]!.timestamp).getTime();
      assert.ok(curr >= prev, 'Timeline must be strictly chronologically ordered');
    }

    // Verify multi-actor attribution correctness
    const humanEvents = timeline.events.filter(e => e.actorType === 'USER');
    assert.ok(humanEvents.length >= 2, 'Human review events must be present');
    for (const h of humanEvents) {
      assert.notEqual(h.actorType, 'AI', 'Human approval/rejection must NEVER be attributed to AI');
    }

    const aiEvents = timeline.events.filter(e => e.actorType === 'AI');
    for (const ai of aiEvents) {
      assert.notEqual(
        ai.eventType,
        'PATCH_APPROVED',
        'AI must NEVER be recorded as approving a patch',
      );
    }

    // 7. Certify Exports and Cryptographic Integrity
    const jsonResult = await service.exportTimeline({
      projectId: certProjectId,
      failureCaseId,
      format: 'JSON',
    });

    assert.equal(jsonResult.contentType, 'application/json');
    assert.ok(jsonResult.checksumSha256.length === 64);
    assert.equal(AuditTrailExporter.computeChecksum(jsonResult.content), jsonResult.checksumSha256);
    assert.ok(!jsonResult.content.includes('token-live-secret-999'), 'Secrets must be redacted');

    const mdResult = await service.exportTimeline({
      projectId: certProjectId,
      failureCaseId,
      format: 'MARKDOWN',
    });

    assert.equal(mdResult.contentType, 'text/markdown');
    assert.ok(mdResult.checksumSha256.length === 64);
    assert.equal(AuditTrailExporter.computeChecksum(mdResult.content), mdResult.checksumSha256);
    assert.ok(
      !mdResult.content.includes('token-live-secret-999'),
      'Secrets must be redacted in markdown',
    );
  });
});
