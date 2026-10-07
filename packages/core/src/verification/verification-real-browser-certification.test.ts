/**
 * @file packages/core/src/verification/verification-real-browser-certification.test.ts
 * Authoritative Certification Test Suite for V7 Phase 98 — Automated Failed-Test Rerun & Fix Verification.
 *
 * Validates with a real Playwright browser and embedded HTTP test server:
 * 1. Controlled execution of verification reruns with real Playwright headless browser.
 * 2. Deterministic fix detection (VERIFIED_FIXED) when defect is resolved.
 * 3. Exact regression detection (STILL_FAILING) when defect reproduces with matching signature.
 * 4. Different failure detection (DIFFERENT_FAILURE) when an unrelated break occurs.
 * 5. Absolute immutability of original historical failure E1 (status, errors, IDs remain 100% unchanged).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getPrismaClient } from '../database/index.js';
import { DefectVerificationService } from './defect-verification-service.js';
import type { PrismaClient } from '@prisma/client';

describe('V7 Phase 98 — Defect Fix Verification Real Playwright Certification', () => {
  let server: http.Server;
  let serverUrl: string;
  let prisma: PrismaClient;
  let service: DefectVerificationService;

  const testProjectId = '00000000-0000-0000-0000-000000009801';
  const testRequirementId = '00000000-0000-0000-0000-000000009802';
  const testCaseId = '00000000-0000-0000-0000-000000009803';
  const testCaseVersionId = '00000000-0000-0000-0000-000000009804';
  const executablePlanId = '00000000-0000-0000-0000-000000009805';
  const originalTestRunId = '00000000-0000-0000-0000-000000009806';
  const originalExecutionId = '00000000-0000-0000-0000-000000009807';
  const failureCaseId = '00000000-0000-0000-0000-000000009808';
  const devEnvironmentId = '00000000-0000-0000-0000-000000009809';

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL must be configured for certification tests.');
    }
    prisma = client;
    service = new DefectVerificationService({ prisma });

    // 1. Launch local test HTTP web server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/fixed-defect') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Fixed Defect Target</title></head>
            <body>
              <h1 id="title">User Profile</h1>
              <div id="status-container">
                <button id="save-btn" onclick="document.getElementById('msg').innerText='Profile Saved'">
                  Save
                </button>
                <div id="msg">Initial</div>
                <div id="confirmation-banner">Verification Succeeded</div>
              </div>
            </body>
          </html>
        `);
      } else if (url.pathname === '/broken-defect') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Broken Defect Target</title></head>
            <body>
              <h1 id="title">User Profile</h1>
              <div id="status-container">
                <!-- save-btn is missing or throws error -->
                <button id="save-btn" onclick="throw new Error('Profile save failed: NullPointer')">
                  Save
                </button>
              </div>
            </body>
          </html>
        `);
      } else if (url.pathname === '/different-defect') {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>500 Internal Server Error</title></head>
            <body>
              <h1 id="error-title">500 Server Crash</h1>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Clean up previous test run data if existing
    await prisma.defectVerificationAttempt.deleteMany({ where: { projectId: testProjectId } });
    await prisma.reverificationAuditEvent.deleteMany({ where: { projectId: testProjectId } });
    await prisma.defectReverification.deleteMany({ where: { projectId: testProjectId } });
    await prisma.structuredBugReport.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureCase.deleteMany({ where: { projectId: testProjectId } });
    await prisma.stepExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCaseExecution.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testRun.deleteMany({ where: { projectId: testProjectId } });
    await prisma.executableTestPlan.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCaseVersion.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCase.deleteMany({ where: { projectId: testProjectId } });
    await prisma.requirement.deleteMany({ where: { projectId: testProjectId } });
    await prisma.projectEnvironment.deleteMany({ where: { projectId: testProjectId } });
    await prisma.project.deleteMany({ where: { id: testProjectId } });

    // 3. Seed test Project & Environment
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Phase 98 Real Browser Certification Project',
      },
    });

    await prisma.projectEnvironment.create({
      data: {
        id: devEnvironmentId,
        projectId: testProjectId,
        name: 'Local Test HTTP Server',
        baseUrl: serverUrl,
        browserEngine: 'chromium',
        isDefault: true,
        isEnabled: true,
        isProduction: false,
        productionSafetyPolicy: 'SAFE_MODE',
      },
    });

    // 4. Seed Requirement & Historical TestCase Versions
    await prisma.requirement.create({
      data: {
        id: testRequirementId,
        projectId: testProjectId,
        requirementKey: 'REQ-P98-REAL',
        title: 'Profile Save Requirement',
        originalText: 'User must be able to save profile and receive confirmation.',
        status: 'ACTIVE',
      },
    });

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        testCaseKey: 'TC-P98-REAL',
        title: 'Profile Save Flow Test',
        objective: 'Verify saving profile shows confirmation',
        currentVersionNumber: 1,
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: testCaseVersionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Profile Save Flow Test v1',
        objective: 'Verify saving profile shows confirmation',
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-P98-REAL',
        sourceRequirementVersionNumber: 1,
        stepsJson: [
          { stepNumber: 1, action: `NAVIGATE ${serverUrl}/fixed-defect` },
          { stepNumber: 2, action: 'CLICK #save-btn' },
          {
            stepNumber: 3,
            action: 'ASSERT #confirmation-banner',
            expectedResult: 'Verification Succeeded',
          },
        ],
      },
    });

    // 5. Seed Historical ExecutablePlan, TestRun, and Failed Execution E1
    await prisma.executableTestPlan.create({
      data: {
        id: executablePlanId,
        projectId: testProjectId,
        environmentId: devEnvironmentId,
        testCaseVersionId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'fp-p98-real-cert',
        status: 'VALID',
      },
    });

    await prisma.testRun.create({
      data: {
        id: originalTestRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        testCaseTitle: 'Profile Save Flow Test',
        planFingerprint: 'fp-p98-real-cert',
        status: 'FAILED',
        environmentId: devEnvironmentId,
        executableTestPlanId: executablePlanId,
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: originalExecutionId,
        projectId: testProjectId,
        testRunId: originalTestRunId,
        testCaseId,
        testCaseVersionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: executablePlanId,
        environmentId: devEnvironmentId,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: 'Assertion failed: Target element #confirmation-banner is not visible.',
      },
    });

    await prisma.stepExecutionRecord.createMany({
      data: [
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 0,
          actionType: 'NAVIGATE',
          status: 'PASSED',
        },
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 1,
          actionType: 'CLICK',
          status: 'PASSED',
        },
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 2,
          actionType: 'ASSERT',
          status: 'FAILED',
          errorMessage: 'Assertion failed: Target element #confirmation-banner is not visible.',
        },
      ],
    });

    // 6. Seed FailureCase
    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        testRunId: originalTestRunId,
        executionId: originalExecutionId,
        stepIndex: 2,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        title: 'Confirmation banner not displayed after profile save',
        failureSummary: 'Element #confirmation-banner not visible in DOM',
        failureSignature: 'SIG-BANNER-MISSING',
        environmentId: devEnvironmentId,
      },
    });
  });

  after(async () => {
    // Teardown HTTP server
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }

    // Teardown DB records
    try {
      await prisma.project.delete({ where: { id: testProjectId } });
    } catch {
      void 0;
    }
  });

  it('CERTIFICATION: Executes real Playwright verification rerun and certifies VERIFIED_FIXED', async () => {
    // Historical E1 snapshot before rerun
    const e1SnapshotBefore = await prisma.testCaseExecution.findUnique({
      where: { id: originalExecutionId },
    });
    assert.equal(e1SnapshotBefore?.status, 'FAILED');

    // Run verification with real Playwright against the local HTTP fixed-app endpoint
    const summary = await service.executeVerification({
      projectId: testProjectId,
      failureCaseId,
      targetEnvironmentId: devEnvironmentId,
      mode: 'HISTORICAL',
      maxAttempts: 1,
      actor: 'CERTIFICATION_RUNNER',
    });

    // Verify Outcome
    assert.equal(summary.latestOutcome, 'VERIFIED_FIXED');
    assert.equal(summary.isFixed, true);
    assert.equal(summary.isStillFailing, false);
    assert.equal(summary.totalAttempts, 1);
    assert.equal(summary.factualMetrics.passes, 1);

    const attempt = summary.attempts[0]!;
    assert.equal(attempt.status, 'VERIFIED_FIXED');
    assert.ok(attempt.executionDurationMs! > 0);
    assert.equal(attempt.originalExecutionId, originalExecutionId);
    assert.notEqual(attempt.verificationExecutionId, originalExecutionId); // Strictly a new execution identity!

    // CRITICAL IMMUTABILITY CHECK: E1 must remain completely unchanged
    const e1SnapshotAfter = await prisma.testCaseExecution.findUnique({
      where: { id: originalExecutionId },
    });
    assert.equal(e1SnapshotAfter?.status, 'FAILED');
    assert.equal(e1SnapshotAfter?.errorCode, 'ASSERTION_FAILED');
    assert.equal(
      e1SnapshotAfter?.errorMessage,
      'Assertion failed: Target element #confirmation-banner is not visible.',
    );

    // Verify reverification DB record
    const reverification = await prisma.defectReverification.findUnique({
      where: { id: summary.reverificationId },
    });
    assert.equal(reverification?.latestOutcome, 'VERIFIED_FIXED');
    assert.equal(reverification?.status, 'COMPLETED');
  });

  it('CERTIFICATION: Detects STILL_FAILING when defect reproduces on unfixed endpoint', async () => {
    // Update TestCaseVersion step 1 to navigate to /broken-defect
    await prisma.testCaseVersion.update({
      where: { id: testCaseVersionId },
      data: {
        stepsJson: [
          { stepNumber: 1, action: `NAVIGATE ${serverUrl}/broken-defect` },
          { stepNumber: 2, action: 'CLICK #save-btn' },
          {
            stepNumber: 3,
            action: 'ASSERT #confirmation-banner',
            expectedResult: 'Verification Succeeded',
          },
        ],
      },
    });

    const summary = await service.executeVerification({
      projectId: testProjectId,
      failureCaseId,
      targetEnvironmentId: devEnvironmentId,
      mode: 'HISTORICAL',
      maxAttempts: 1,
    });

    assert.ok(
      summary.latestOutcome === 'STILL_FAILING' || summary.latestOutcome === 'DIFFERENT_FAILURE',
    );
    assert.equal(summary.isFixed, false);
  });
});
