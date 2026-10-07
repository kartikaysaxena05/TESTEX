/**
 * @file packages/core/src/execution/retry/retry-e2e-real-browser.test.ts
 * Comprehensive real-browser End-to-End integration test suite for V5 Phase 71.
 * Validates deterministic multi-attempt execution, attempt immutability, per-attempt evidence isolation,
 * flakiness detection, and multi-tenant security against real PostgreSQL database.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { EvidenceStorageService } from '../evidence/evidence-storage-service.js';
import { ExecutionEvidenceService } from '../evidence/execution-evidence-service.js';
import { EvidenceCaptureCoordinator } from '../evidence/evidence-capture-coordinator.js';
import { ExecutionPersistenceService } from '../persistence/execution-persistence-service.js';
import { RetryPolicyEngine } from './retry-policy-engine.js';
import { FlakinessDetector } from './flakiness-detector.js';

describe('Real Browser Retry & Flakiness E2E Suite (V5 Phase 71)', () => {
  let server: http.Server;
  let serverUrl: string;
  let prisma: NonNullable<ReturnType<typeof getPrismaClient>>;
  let tempStorageRoot: string;
  let storageService: EvidenceStorageService;
  let evidenceService: ExecutionEvidenceService;
  let persistenceService: ExecutionPersistenceService;
  let retryEngine: RetryPolicyEngine;
  let flakinessDetector: FlakinessDetector;

  let browser: Browser;

  let testProjectId: string;
  let otherProjectId: string;
  let testCaseId: string;
  let testCaseVersionId: string;
  let planId: string;
  let testRunId: string;

  let attemptCountOnServer = 0;

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    tempStorageRoot = path.join(
      os.tmpdir(),
      `ai-quality-e2e-retry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempStorageRoot, { recursive: true });

    storageService = new EvidenceStorageService(tempStorageRoot);
    evidenceService = new ExecutionEvidenceService({ prisma, storageService });
    persistenceService = new ExecutionPersistenceService({ prisma });
    retryEngine = new RetryPolicyEngine({
      maxAttempts: 3,
      retryDelayMs: 50,
      backoffMultiplier: 1.0,
    });
    flakinessDetector = new FlakinessDetector();

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();
    testCaseId = crypto.randomUUID();
    testCaseVersionId = crypto.randomUUID();
    planId = crypto.randomUUID();
    testRunId = crypto.randomUUID();

    // 1. Setup local HTTP test server with deterministic alternating behavior
    server = http.createServer((req, res) => {
      attemptCountOnServer++;

      if (req.url === '/flaky-target') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        // Attempt 1: does NOT contain target element #final-badge (simulates transient glitch)
        // Attempt 2: contains #final-badge (succeeds)
        if (attemptCountOnServer <= 1) {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Attempt 1 Flaky Glitch</title></head>
              <body>
                <h1>Attempt 1 Incomplete View</h1>
                <div id="status-error">Service temporarily busy</div>
              </body>
            </html>
          `);
        } else {
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Attempt 2 Success</title></head>
              <body>
                <h1>Attempt 2 Recovered View</h1>
                <div id="final-badge" data-test="success-indicator">Execution Succeeded</div>
              </body>
            </html>
          `);
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Default</body></html>');
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Setup durable entities in PostgreSQL
    await prisma.project.createMany({
      data: [
        { id: testProjectId, name: 'Phase 71 Retry Project' },
        { id: otherProjectId, name: 'Phase 71 Other Project' },
      ],
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Retry E2E Requirement',
        originalText: 'Original text for requirement',
      },
    });

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        testCaseKey: 'TC-PHASE71-001',
        title: 'Deterministic Flaky Target Test',
        objective: 'Test multi-attempt execution recovery',
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: testCaseVersionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Deterministic Flaky Target Test v1',
        objective: 'Objective for version 1',
        reviewStatus: 'APPROVED',
      },
    });

    await prisma.executableTestPlan.create({
      data: {
        id: planId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        planFingerprint: 'retry-e2e-fingerprint',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        isExecutable: true,
        status: 'VALID',
        stepsJson: [
          {
            id: crypto.randomUUID(),
            sequence: 1,
            action: 'NAVIGATE',
            description: 'Navigate to target',
            isOptional: false,
            assertions: [],
          },
          {
            id: crypto.randomUUID(),
            sequence: 2,
            action: 'WAIT_FOR_ELEMENT',
            description: 'Wait for success badge',
            target: { kind: 'ELEMENT', testId: 'success-indicator' },
            isOptional: false,
            assertions: [],
          },
        ],
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: planId,
        planFingerprint: 'retry-e2e-fingerprint',
        testCaseTitle: 'Deterministic Flaky Target Test',
        status: 'QUEUED',
        browserEngine: 'chromium',
        headless: true,
        timeoutMs: 30000,
        totalAttempts: 1,
        passedAfterRetry: false,
        reliabilityStatus: 'NOT_EVALUATED',
      },
    });

    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    await fs.rm(tempStorageRoot, { recursive: true, force: true }).catch(() => {});
    await prisma.project.deleteMany({
      where: { id: { in: [testProjectId, otherProjectId] } },
    });
  });

  it('executes real browser multi-attempt flow: records Attempt 1 failure evidence, Attempt 2 success, and classifies FLAKY_CANDIDATE', async () => {
    // --- ATTEMPT 1 ---
    const execAttempt1 = await persistenceService.createExecution({
      projectId: testProjectId,
      testRunId,
      testCaseId,
      testCaseVersionId,
      testCaseVersionNumber: 1,
      executableTestPlanId: planId,
      attempt: 1,
      browserEngine: 'chromium',
    });

    assert.equal(execAttempt1.attempt, 1);

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const coord1 = new EvidenceCaptureCoordinator({
      evidenceService,
      config: { traceMode: 'FAILURE_ONLY' },
    });
    await coord1.initializeSession({
      context: context1,
      page: page1,
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt1.id,
    });

    // Navigate to server
    await page1.goto(`${serverUrl}/flaky-target`);

    // Check for #final-badge (will fail on attempt 1)
    const badgeFound1 = (await page1.$('#final-badge')) !== null;
    assert.equal(badgeFound1, false, 'Attempt 1 should fail to find badge');

    // Capture failure evidence on attempt 1
    const bundleAttempt1 = await coord1.captureFailureEvidence({
      page: page1,
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt1.id,
      stepIndex: 2,
      errorSummary: 'Element #final-badge not found on page (Attempt 1 failure)',
    });

    await coord1.finalizeSessionTrace({
      context: context1,
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt1.id,
      bundleId: bundleAttempt1?.id,
      isFailed: true,
    });
    coord1.dispose();
    await context1.close();

    await persistenceService.completeExecution({
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt1.id,
      status: 'FAILED',
      errorMessage: 'Element #final-badge not found on page',
      errorCode: 'WAIT_TIMEOUT',
      durationMs: 150,
    });

    // Check retry eligibility via RetryPolicyEngine
    const decision = await retryEngine.evaluateDecision({
      projectId: testProjectId,
      testRunId,
      currentAttemptNumber: 1,
      failureCategory: 'TIMEOUT',
      errorMessage: 'Element #final-badge not found on page',
    });

    assert.equal(decision.shouldRetry, true);
    assert.equal(decision.remainingAttempts, 2);

    // --- ATTEMPT 2 (Recovery) ---
    const execAttempt2 = await persistenceService.createExecution({
      projectId: testProjectId,
      testRunId,
      testCaseId,
      testCaseVersionId,
      testCaseVersionNumber: 1,
      executableTestPlanId: planId,
      attempt: 2,
      browserEngine: 'chromium',
    });

    assert.equal(execAttempt2.attempt, 2);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    const coord2 = new EvidenceCaptureCoordinator({ evidenceService });
    await coord2.initializeSession({
      context: context2,
      page: page2,
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt2.id,
    });

    await page2.goto(`${serverUrl}/flaky-target`);

    const badgeFound2 = (await page2.$('#final-badge')) !== null;
    assert.equal(badgeFound2, true, 'Attempt 2 must find badge successfully');

    coord2.dispose();
    await context2.close();

    await persistenceService.completeExecution({
      projectId: testProjectId,
      testRunId,
      executionId: execAttempt2.id,
      status: 'PASSED',
      terminalReason: 'Badge found on attempt 2.',
      durationMs: 120,
    });

    // --- EVALUATE MULTI-ATTEMPT RELIABILITY ---
    const allAttempts = await persistenceService.listExecutionAttempts({
      projectId: testProjectId,
      testRunId,
    });

    assert.equal(allAttempts.length, 2, 'Must have exactly 2 preserved attempts');

    // Verify Attempt 1 immutability
    const attempt1 = allAttempts[0];
    assert.ok(attempt1);
    assert.equal(attempt1.attempt, 1);
    assert.equal(attempt1.status, 'FAILED');
    assert.equal(attempt1.errorMessage, 'Element #final-badge not found on page');

    // Verify Attempt 1 failure bundle exists and is attached
    const retrievedBundle = await evidenceService.getBundle({
      projectId: testProjectId,
      bundleId: bundleAttempt1!.id,
    });
    assert.equal(retrievedBundle.executionId, execAttempt1.id);
    assert.ok(retrievedBundle.artifacts.length >= 2, 'Attempt 1 evidence bundle preserved');

    // Verify Attempt 2 record
    const attempt2 = allAttempts[1];
    assert.ok(attempt2);
    assert.equal(attempt2.attempt, 2);
    assert.equal(attempt2.status, 'PASSED');

    // Evaluate reliability report
    const testRun = await prisma.testRun.findUniqueOrThrow({ where: { id: testRunId } });
    const reliabilityReport = flakinessDetector.evaluateReliability({
      projectId: testProjectId,
      testRunId,
      testRun: {
        id: testRun.id,
        projectId: testRun.projectId,
        testCaseId: testRun.testCaseId,
        testCaseVersionId: testRun.testCaseVersionId,
        testCaseVersionNumber: testRun.testCaseVersionNumber,
        executableTestPlanId: testRun.executableTestPlanId,
        environmentId: testRun.environmentId,
        targetApplicationId: testRun.targetApplicationId,
        status: 'PASSED',
        idempotencyKey: testRun.idempotencyKey,
        workerId: testRun.workerId,
        leaseExpiresAt: null,
        heartbeatAt: null,
        queuedAt: testRun.queuedAt.toISOString(),
        startedAt: null,
        completedAt: null,
        cancelRequestedAt: null,
        cancelledAt: null,
        terminalReason: testRun.terminalReason,
        errorMessage: testRun.errorMessage,
        executionDurationMs: testRun.executionDurationMs,
        planFingerprint: testRun.planFingerprint,
        testCaseTitle: testRun.testCaseTitle,
        environmentName: testRun.environmentName,
        browserEngine: 'chromium',
        headless: true,
        timeoutMs: 30000,
        totalAttempts: (testRun as any).totalAttempts ?? 1,
        passedAfterRetry: Boolean((testRun as any).passedAfterRetry),
        reliabilityStatus: (testRun as any).reliabilityStatus ?? 'NOT_EVALUATED',
        healingUsed: false,
        healingCount: 0,
        diagnosticsJson: [],
        metadataJson: {},
        createdAt: testRun.createdAt.toISOString(),
        updatedAt: testRun.updatedAt.toISOString(),
      },
      attempts: allAttempts,
    });

    assert.equal(reliabilityReport.finalStatus, 'PASSED');
    assert.equal(reliabilityReport.totalAttempts, 2);
    assert.equal(reliabilityReport.passedAfterRetry, true);
    assert.equal(reliabilityReport.reliabilityStatus, 'FLAKY_CANDIDATE');
    assert.equal(reliabilityReport.isFlakyCandidate, true);

    // Commit final TestRun state
    const finalizedRun = await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: 'PASSED',
        totalAttempts: allAttempts.length,
        passedAfterRetry: reliabilityReport.passedAfterRetry,
        reliabilityStatus: reliabilityReport.reliabilityStatus,
        completedAt: new Date(),
      },
    });

    assert.equal(finalizedRun.totalAttempts, 2);
    assert.equal(finalizedRun.passedAfterRetry, true);
    assert.equal(finalizedRun.reliabilityStatus, 'FLAKY_CANDIDATE');
  });

  it('enforces multi-tenant isolation: Project B cannot query Project A execution attempts', async () => {
    await assert.rejects(
      async () => {
        await persistenceService.listExecutionAttempts({
          projectId: otherProjectId,
          testRunId,
        });
      },
      (err: any) => err.name === 'ExecutionNotFoundError' || err.status === 404,
    );
  });
});
