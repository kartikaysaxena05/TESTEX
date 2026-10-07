/**
 * @file packages/core/src/failures/reproduction/failure-reproduction-certification.test.ts
 * Authoritative Certification Test Suite for V6 Phase 76 — Failure Reproduction & Reproducibility Verification.
 *
 * Validates end-to-end:
 * 1. Controlled re-execution of historical failures using real Playwright browser.
 * 2. Exact historical test version resolution (v2 executed even when v3 is latest).
 * 3. Strict immutability of original V5 execution E1 (unmodified fields, distinct E2 ID).
 * 4. Deterministic failure signature comparison (stripping volatile tokens/timestamps).
 * 5. Reproduction outcomes: REPRODUCED, NOT_REPRODUCED, and ENVIRONMENT_DRIFT detection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/client.js';
import { FailureReproductionService } from './failure-reproduction-service.js';

describe('V6 Phase 76 — Failure Reproduction Certification Suite (Real Playwright Browser)', () => {
  let server: http.Server;
  let serverUrl: string;
  const prisma = getPrismaClient()!;

  const testProjectId = '00000000-0000-0000-0000-000000007601';
  const testRequirementId = '00000000-0000-0000-0000-000000007602';
  const testCaseId = '00000000-0000-0000-0000-000000007603';
  const testVersion1Id = '00000000-0000-0000-0000-000000007611';
  const testVersion2Id = '00000000-0000-0000-0000-000000007612';
  const testVersion3Id = '00000000-0000-0000-0000-000000007613';
  const testPlanId = '00000000-0000-0000-0000-000000007620';
  const originalTestRunId = '00000000-0000-0000-0000-000000007630';
  const originalExecutionId = '00000000-0000-0000-0000-000000007640';
  const failureCaseId = '00000000-0000-0000-0000-000000007650';
  const environmentId = '00000000-0000-0000-0000-000000007660';

  let service: FailureReproductionService;
  let originalExecutionSnapshot: any;

  before(async () => {
    // 1. Launch local test HTTP web server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/failing-app') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Reproduction Target App</title></head>
            <body>
              <h1 id="app-title">Reproduction Test Application</h1>
              <div id="content-container">
                <button id="broken-action" onclick="throw new Error('Deterministic Business Logic Failure')">
                  Execute Flawed Operation
                </button>
              </div>
            </body>
          </html>
        `);
      } else if (url.pathname === '/fixed-app') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Reproduction Target App</title></head>
            <body>
              <h1 id="app-title">Reproduction Test Application</h1>
              <div id="content-container">
                <button id="broken-action" onclick="document.getElementById('result').innerText='Success!'">
                  Execute Flawed Operation
                </button>
                <div id="result">Initial</div>
                <div id="expected-element">Verification Succeeded</div>
              </div>
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
    await prisma.failureReproductionAttempt.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureEvidenceReference.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureAnalysisRun.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureCase.deleteMany({ where: { projectId: testProjectId } });
    await prisma.stepExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
    await prisma.assertionExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
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
        name: 'Phase 76 Certification Project',
        description: 'Test project for Failure Reproduction certification',
      },
    });

    await prisma.projectEnvironment.create({
      data: {
        id: environmentId,
        projectId: testProjectId,
        name: 'Local Real HTTP Staging',
        baseUrl: serverUrl,
        browserEngine: 'chromium',
        isDefault: true,
      },
    });

    // 4. Seed Requirement & Historical TestCase Versions
    await prisma.requirement.create({
      data: {
        id: testRequirementId,
        projectId: testProjectId,
        requirementKey: 'REQ-76-CERT',
        title: 'Certification Requirement',
        originalText: 'System must verify reproduction without mutating historical data.',
        status: 'ACTIVE',
      },
    });

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-76-CERT',
        testCaseKey: 'TC-76-CERT',
        title: 'Reproduction Verification Test Case',
        objective: 'Reproduction verification test case objective',
        currentVersionNumber: 3, // Current version is 3
        status: 'ACTIVE',
      },
    });

    // Version 1 (Obsolete)
    await prisma.testCaseVersion.create({
      data: {
        id: testVersion1Id,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Initial Draft Flow',
        objective: 'Draft flow objective',
        stepsJson: [{ id: 's1-1', stepNumber: 1, action: 'navigate to "/old"' }],
      },
    });

    // Version 2 (The exact historical version that failed originally!)
    await prisma.testCaseVersion.create({
      data: {
        id: testVersion2Id,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 2,
        title: 'Historical Failing Flow (Version 2)',
        objective: 'Historical failing flow objective',
        stepsJson: [
          { id: 's2-1', stepNumber: 1, action: `navigate to "${serverUrl}/failing-app"` },
          { id: 's2-2', stepNumber: 2, action: 'click "#broken-action"' },
          { id: 's2-3', stepNumber: 3, action: 'assert "#expected-element"' }, // This element does not exist on failing-app!
        ],
      },
    });

    // Version 3 (The current newest version, which has different steps)
    await prisma.testCaseVersion.create({
      data: {
        id: testVersion3Id,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 3,
        title: 'Updated Modern Flow (Version 3)',
        objective: 'Updated modern flow objective',
        stepsJson: [
          { id: 's3-1', stepNumber: 1, action: `navigate to "${serverUrl}/modern"` },
          { id: 's3-2', stepNumber: 2, action: 'click "#modern-btn"' },
        ],
      },
    });

    // 5. Seed ExecutableTestPlan & Original TestRun
    await prisma.executableTestPlan.create({
      data: {
        id: testPlanId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: testVersion2Id,
        testCaseVersionNumber: 2,
        planFingerprint: crypto.createHash('sha256').update('cert-plan').digest('hex'),
        status: 'VALID',
        compilerVersion: '1.0.0',
      },
    });

    await prisma.testRun.create({
      data: {
        id: originalTestRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: testVersion2Id,
        testCaseVersionNumber: 2,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Local Real HTTP Staging',
        status: 'FAILED',
        planFingerprint: crypto.createHash('sha256').update('plan').digest('hex'),
        testCaseTitle: 'Historical Failing Flow (Version 2)',
        browserEngine: 'chromium',
      },
    });

    // 6. Seed Original TestCaseExecution (E1)
    await prisma.testCaseExecution.create({
      data: {
        id: originalExecutionId,
        projectId: testProjectId,
        testRunId: originalTestRunId,
        testCaseId,
        testCaseVersionId: testVersion2Id,
        testCaseVersionNumber: 2,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: "Assertion failed: Target element '#expected-element' is not visible.",
        durationMs: 342,
        browserEngine: 'chromium',
        environmentSnapshotJson: {
          baseUrl: serverUrl,
          viewport: { width: 1280, height: 720 },
          browserEngine: 'chromium',
        },
      },
    });

    // Seed original StepExecutionRecords for E1
    await prisma.stepExecutionRecord.createMany({
      data: [
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 0,
          attempt: 1,
          actionType: 'navigate',
          status: 'PASSED',
          durationMs: 120,
          targetSummary: `navigate to "${serverUrl}/failing-app"`,
        },
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 1,
          attempt: 1,
          actionType: 'click',
          status: 'PASSED',
          durationMs: 80,
          targetSummary: 'click "#broken-action"',
        },
        {
          projectId: testProjectId,
          testRunId: originalTestRunId,
          executionId: originalExecutionId,
          stepIndex: 2,
          attempt: 1,
          actionType: 'assert',
          status: 'FAILED',
          durationMs: 142,
          targetSummary: 'assert "#expected-element"',
          errorMessage: "Assertion failed: Target element '#expected-element' is not visible.",
        },
      ],
    });

    // Capture snapshot of original execution E1 to prove immutability
    originalExecutionSnapshot = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: originalExecutionId },
      include: { stepExecutions: true },
    });

    // 7. Seed FailureCase referencing original execution E1 and historical version 2
    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId: originalTestRunId,
        executionId: originalExecutionId,
        testCaseId,
        testCaseVersionNumber: 2,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'ASSERTION_FAILED',
        errorMessage: "Assertion failed: Target element '#expected-element' is not visible.",
        title: 'Failure in Historical Flow v2',
      },
    });

    service = new FailureReproductionService({ prisma });
  });

  after(async () => {
    // Teardown HTTP server
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }

    // Clean up DB records
    await prisma.failureReproductionAttempt.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureEvidenceReference.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureAnalysisRun.deleteMany({ where: { projectId: testProjectId } });
    await prisma.failureCase.deleteMany({ where: { projectId: testProjectId } });
    await prisma.stepExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
    await prisma.assertionExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCaseExecution.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testRun.deleteMany({ where: { projectId: testProjectId } });
    await prisma.executableTestPlan.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCaseVersion.deleteMany({ where: { projectId: testProjectId } });
    await prisma.testCase.deleteMany({ where: { projectId: testProjectId } });
    await prisma.requirement.deleteMany({ where: { projectId: testProjectId } });
    await prisma.projectEnvironment.deleteMany({ where: { projectId: testProjectId } });
    await prisma.project.deleteMany({ where: { id: testProjectId } });
  });

  it('1. Executes real browser reproduction, reproduces identical failure, and preserves E1 immutability', async () => {
    const summary = await service.executeReproduction({
      projectId: testProjectId,
      failureCaseId,
      maxAttempts: 1,
      browserEngine: 'chromium',
    });

    assert.equal(summary.overallOutcome, 'REPRODUCED');
    assert.equal(summary.attemptsRequested, 1);
    assert.equal(summary.attemptsCompleted, 1);
    assert.equal(summary.equivalentFailures, 1);
    assert.equal(summary.passes, 0);
    assert.equal(summary.reproducibilityRatio, 1);

    // Fetch persisted reproduction attempt record
    const attempts = await service.getReproductionAttempts({
      projectId: testProjectId,
      failureCaseId,
    });
    assert.equal(attempts.length, 1);
    const attempt = attempts[0]!;

    assert.equal(attempt.attemptNumber, 1);
    assert.equal(attempt.status, 'REPRODUCED');
    assert.equal(attempt.isSignatureMatch, true);
    assert.ok(attempt.reproductionExecutionId);
    assert.notEqual(attempt.reproductionExecutionId, originalExecutionId); // Strict E2 != E1 check

    // Verify historical version resolution: v2 executed (NOT v3)
    assert.equal(attempt.testCaseVersionNumber, 2);
    assert.equal(attempt.testCaseVersionId, testVersion2Id);

    // Step comparisons: 3 steps executed, step 3 failed
    assert.equal(attempt.stepComparison.length, 3);
    assert.equal(attempt.stepComparison[0]?.originalStatus, 'PASSED');
    assert.equal(attempt.stepComparison[0]?.reproductionStatus, 'PASSED');
    assert.equal(attempt.stepComparison[1]?.originalStatus, 'PASSED');
    assert.equal(attempt.stepComparison[1]?.reproductionStatus, 'PASSED');
    assert.equal(attempt.stepComparison[2]?.originalStatus, 'FAILED');
    assert.equal(attempt.stepComparison[2]?.reproductionStatus, 'FAILED');
    assert.equal(attempt.stepComparison[2]?.isMatch, true);

    // CRITICAL IMMUTABILITY CHECK: Original execution E1 must be 100% UNTOUCHED
    const currentE1 = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: originalExecutionId },
      include: { stepExecutions: true },
    });

    assert.equal(currentE1.id, originalExecutionSnapshot.id);
    assert.equal(currentE1.status, originalExecutionSnapshot.status);
    assert.equal(currentE1.errorCode, originalExecutionSnapshot.errorCode);
    assert.equal(currentE1.errorMessage, originalExecutionSnapshot.errorMessage);
    assert.equal(currentE1.durationMs, originalExecutionSnapshot.durationMs);
    assert.equal(
      currentE1.createdAt.toISOString(),
      originalExecutionSnapshot.createdAt.toISOString(),
    );
    assert.equal(currentE1.stepExecutions.length, originalExecutionSnapshot.stepExecutions.length);
  });

  it('2. Detects NOT_REPRODUCED when test passes on fixed page', async () => {
    // Update TestCaseVersion 2 to point to /fixed-app where the element exists
    await prisma.testCaseVersion.update({
      where: { id: testVersion2Id },
      data: {
        stepsJson: [
          { id: 's2-1', stepNumber: 1, action: `navigate to "${serverUrl}/fixed-app"` },
          { id: 's2-2', stepNumber: 2, action: 'click "#broken-action"' },
          { id: 's2-3', stepNumber: 3, action: 'assert "#expected-element"' },
        ],
      },
    });

    const summary = await service.executeReproduction({
      projectId: testProjectId,
      failureCaseId,
      maxAttempts: 1,
      browserEngine: 'chromium',
    });

    // Now that the test passes, the failure is NOT reproduced
    assert.equal(summary.overallOutcome, 'NOT_REPRODUCED');
    assert.equal(summary.passes, 1);

    const attempts = await service.getReproductionAttempts({
      projectId: testProjectId,
      failureCaseId,
    });
    // Attempt #2 recorded
    assert.equal(attempts.length, 2);
    const secondAttempt = attempts.find(a => a.attemptNumber === 2)!;
    assert.equal(secondAttempt.status, 'NOT_REPRODUCED');

    // Reproducibility summary ratio should now reflect 1 reproduced out of 2 = 50%
    const finalSummary = await service.getReproducibilitySummary({
      projectId: testProjectId,
      failureCaseId,
    });
    assert.equal(finalSummary.reproducibilityRatio, 0.5);
    assert.equal(finalSummary.equivalentFailures, 1);
    assert.equal(finalSummary.passes, 1);
  });

  it('3. Reconstructs environment and detects ENVIRONMENT_DRIFT when baseUrl differs', async () => {
    // Create an environment with a drifted base URL
    const driftedEnv = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Drifted Port Environment',
        baseUrl: 'http://127.0.0.1:9999', // Drifted port
        browserEngine: 'chromium',
      },
    });

    // Reset TestCaseVersion 2 to point to local serverUrl
    await prisma.testCaseVersion.update({
      where: { id: testVersion2Id },
      data: {
        stepsJson: [
          { id: 's2-1', stepNumber: 1, action: `navigate to "${serverUrl}/failing-app"` },
        ],
      },
    });

    const summary = await service.executeReproduction({
      projectId: testProjectId,
      failureCaseId,
      maxAttempts: 1,
      targetEnvironmentId: driftedEnv.id,
      browserEngine: 'chromium',
    });

    assert.equal(summary.environmentDriftDetected, true);

    const attempts = await service.getReproductionAttempts({
      projectId: testProjectId,
      failureCaseId,
    });
    const latestAttempt = attempts[attempts.length - 1]!;
    assert.equal(latestAttempt.environmentEquivalence, 'DRIFTED');
    assert.ok(latestAttempt.environmentComparison.driftItems.length > 0);
    assert.ok(
      latestAttempt.environmentComparison.driftItems.some(d => d.includes('Base URL changed')),
    );
  });
});
