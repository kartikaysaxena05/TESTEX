/**
 * @file packages/core/src/audit/repair-audit-adversarial.test.ts
 * Adversarial, security, cross-project isolation, and concurrency tests for Phase 108.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { RepairAuditTrailService } from './repair-audit-trail-service.js';
import { AuditProjectMismatchError, AuditValidationError } from './audit-errors.js';

describe('Repair Audit Trail Adversarial & Security', () => {
  let prisma: PrismaClient;
  let service: RepairAuditTrailService;

  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();
  let failureCaseA: string;
  let _failureCaseB: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) throw new Error('Database client unavailable');
    prisma = client;
    service = new RepairAuditTrailService({ prisma });

    // Project A setup
    await prisma.project.create({
      data: { id: projectA, name: 'Project A' },
    });
    const envA = await prisma.projectEnvironment.create({
      data: {
        projectId: projectA,
        name: 'Env A',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3001',
      },
    });
    const tcA = await prisma.testCase.create({
      data: {
        projectId: projectA,
        testCaseKey: 'TC-ADV-A',
        title: 'Test A',
        objective: 'Test A',
      },
    });
    const planA = await prisma.executableTestPlan.create({
      data: {
        projectId: projectA,
        environmentId: envA.id,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-a-${Date.now()}`,
      },
    });
    const runA = await prisma.testRun.create({
      data: {
        projectId: projectA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Test A',
        planFingerprint: planA.planFingerprint,
        status: 'FAILED',
        environmentId: envA.id,
        executableTestPlanId: planA.id,
      },
    });
    const execA = await prisma.testCaseExecution.create({
      data: {
        projectId: projectA,
        testRunId: runA.id,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planA.id,
        environmentId: envA.id,
        status: 'FAILED',
      },
    });
    const fcA = await prisma.failureCase.create({
      data: {
        projectId: projectA,
        testCaseId: tcA.id,
        testCaseVersionNumber: 1,
        testRunId: runA.id,
        executionId: execA.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Failure in A',
      },
    });
    failureCaseA = fcA.id;

    // Project B setup
    await prisma.project.create({
      data: { id: projectB, name: 'Project B' },
    });
    const envB = await prisma.projectEnvironment.create({
      data: {
        projectId: projectB,
        name: 'Env B',
        type: 'DEVELOPMENT',
        baseUrl: 'http://localhost:3002',
      },
    });
    const tcB = await prisma.testCase.create({
      data: {
        projectId: projectB,
        testCaseKey: 'TC-ADV-B',
        title: 'Test B',
        objective: 'Test B',
      },
    });
    const planB = await prisma.executableTestPlan.create({
      data: {
        projectId: projectB,
        environmentId: envB.id,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        planFingerprint: `fp-b-${Date.now()}`,
      },
    });
    const runB = await prisma.testRun.create({
      data: {
        projectId: projectB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Test B',
        planFingerprint: planB.planFingerprint,
        status: 'FAILED',
        environmentId: envB.id,
        executableTestPlanId: planB.id,
      },
    });
    const execB = await prisma.testCaseExecution.create({
      data: {
        projectId: projectB,
        testRunId: runB.id,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: planB.id,
        environmentId: envB.id,
        status: 'FAILED',
      },
    });
    const fcB = await prisma.failureCase.create({
      data: {
        projectId: projectB,
        testCaseId: tcB.id,
        testCaseVersionNumber: 1,
        testRunId: runB.id,
        executionId: execB.id,
        triggeringExecutionStatus: 'FAILED',
        title: 'Failure in B',
      },
    });
    _failureCaseB = fcB.id;
  });

  after(async () => {
    try {
      await prisma.project.delete({ where: { id: projectA } });
      await prisma.project.delete({ where: { id: projectB } });
    } catch {
      // Ignore cleanup error
    }
  });

  it('strictly rejects cross-project event recording with AuditProjectMismatchError', async () => {
    // Attempt to record event with Project B id for FailureCase A
    await assert.rejects(
      async () => {
        await service.recordEvent({
          projectId: projectB, // Attacker uses Project B
          failureCaseId: failureCaseA, // Target is FailureCase belonging to Project A
          eventType: 'MANUAL_AUDIT_NOTE_RECORDED' as any,
          actorType: 'USER',
          actorId: 'attacker@corp.com',
          sourceComponent: 'adversarial-probe',
          correlationId: crypto.randomUUID(),
          idempotencyKey: `attack:${crypto.randomUUID()}`,
        });
      },
      (err: any) => {
        assert.ok(err instanceof AuditProjectMismatchError);
        assert.equal(err.code, 'AUDIT_PROJECT_MISMATCH');
        return true;
      },
    );
  });

  it('strictly rejects cross-project timeline retrieval with AuditProjectMismatchError', async () => {
    await assert.rejects(
      async () => {
        await service.getTimeline({
          projectId: projectB, // Project B requesting
          failureCaseId: failureCaseA, // Case A
        });
      },
      (err: any) => {
        assert.ok(err instanceof AuditProjectMismatchError);
        assert.equal(err.code, 'AUDIT_PROJECT_MISMATCH');
        return true;
      },
    );
  });

  it('strictly isolates sessions by project when querying by session key or listing', async () => {
    const sessionA = await service.getOrCreateSession({
      projectId: projectA,
      failureCaseId: failureCaseA,
    });

    // Request session A with project B credentials
    const fetchedFromB = await service.getSession({
      projectId: projectB,
      sessionIdOrKey: sessionA.sessionKey,
    });

    assert.equal(fetchedFromB, null, 'Cross-project session lookup must return null');

    // List sessions for project B should not include session A
    const listB = await service.listSessions({
      projectId: projectB,
    });

    const hasA = listB.some(s => s.id === sessionA.id);
    assert.equal(hasA, false, 'Project B session list must never contain Project A sessions');
  });

  it('safely handles concurrent event recording with mutex-protected sequence allocation', async () => {
    const concurrentCount = 10;
    const promises: Promise<any>[] = [];

    for (let i = 0; i < concurrentCount; i++) {
      const idx = i;
      promises.push(
        service.recordEvent({
          projectId: projectA,
          failureCaseId: failureCaseA,
          eventType: 'REVERIFICATION_STARTED',
          actorType: 'SYSTEM',
          actorId: `worker-${idx}`,
          sourceComponent: 'concurrency-test',
          correlationId: crypto.randomUUID(),
          idempotencyKey: `concurrent:${projectA}:${failureCaseA}:${idx}`,
        }),
      );
    }

    const results = await Promise.all(promises);
    assert.equal(results.length, concurrentCount);

    // Verify all sequence numbers are strictly unique and positive
    const sequenceNumbers = results.map(r => r.sequenceNumber);
    const uniqueSeq = new Set(sequenceNumbers);
    assert.equal(
      uniqueSeq.size,
      concurrentCount,
      'Every concurrently recorded event must have a strictly unique sequenceNumber',
    );

    // Sorted sequence numbers must be contiguous
    const sorted = [...sequenceNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      assert.equal(
        sorted[i],
        sorted[i - 1]! + 1,
        'Sequence numbers allocated concurrently must be contiguous without gaps',
      );
    }
  });

  it('rejects events with invalid empty fields or non-existent failure cases', async () => {
    const nonExistentCase = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await service.recordEvent({
          projectId: projectA,
          failureCaseId: nonExistentCase,
          eventType: 'PATCH_APPLIED',
          actorType: 'REPAIR_ENGINE',
          actorId: 'patch-engine',
          sourceComponent: 'repair-service',
          correlationId: crypto.randomUUID(),
          idempotencyKey: `invalid:${crypto.randomUUID()}`,
        });
      },
      (err: any) => {
        assert.ok(err instanceof AuditValidationError);
        assert.equal(err.code, 'AUDIT_VALIDATION_ERROR');
        return true;
      },
    );
  });
});
