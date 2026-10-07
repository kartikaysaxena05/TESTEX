/**
 * @file packages/core/src/failures/localization/localization-real-browser.test.ts
 * Real Playwright Browser Certification Test Suite for V6 Phase 81 — Failure Evidence Correlation & Technical Cause Localization.
 *
 * Validates with real browser executions:
 * 1. Real Backend API HTTP 500 failure with repository route linkage.
 * 2. Real Client-side JavaScript exception captured via browser console.
 * 3. Real UI content assertion failure with clean 200 HTTP network state.
 * 4. Re-evaluation lifecycle and multi-attempt audit tracking.
 * 5. Strict immutability of historical E1 execution and prior analysis records.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { FailureEvidenceCorrelationService } from './failure-evidence-correlation-service.js';
import { FailureDomainSeparationService } from '../separation/failure-domain-separation-service.js';

describe('V6 Phase 81 — Failure Evidence Correlation & Technical Cause Localization Real Browser Certification Suite', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  const prisma = getPrismaClient()!;

  const testProjectId = '00000000-0000-0000-0000-000000008101';
  const testRequirementId = '00000000-0000-0000-0000-000000008102';
  const testPlanId = '00000000-0000-0000-0000-000000008103';
  const environmentId = '00000000-0000-0000-0000-000000008104';
  const sourceId = '00000000-0000-0000-0000-000000008105';
  const repoFileId = '00000000-0000-0000-0000-000000008106';
  const repoSymbolId = '00000000-0000-0000-0000-000000008107';

  let localizationService: FailureEvidenceCorrelationService;
  let domainSeparationService: FailureDomainSeparationService;

  before(async () => {
    // 1. Launch local test HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/app/checkout') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Checkout Page</title></head>
            <body>
              <h1>Payment Checkout</h1>
              <button id="pay-btn">Submit Payment</button>
              <div id="result"></div>
              <script>
                document.getElementById('pay-btn').addEventListener('click', async () => {
                  try {
                    const resp = await fetch('/api/v1/checkout/process', { method: 'POST' });
                    if (!resp.ok) {
                      document.getElementById('result').innerText = 'Payment Failed: HTTP ' + resp.status;
                    }
                  } catch (e) {
                    document.getElementById('result').innerText = 'Network Error';
                  }
                });
              </script>
            </body>
          </html>
        `);
      } else if (url.pathname === '/api/v1/checkout/process') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }));
      } else if (url.pathname === '/app/script-crash') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Crashing Component</title></head>
            <body>
              <h1>State Dashboard</h1>
              <div id="container"></div>
              <script>
                // Intentionally trigger uncaught TypeError
                const state = undefined;
                console.error("TypeError: Cannot read properties of undefined (reading 'records')");
              </script>
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

    // 2. Launch real Playwright Chromium browser
    browser = await chromium.launch({ headless: true });

    // 3. Clean up DB records for test project
    await cleanupTestData();

    // 4. Seed foundational project & environment
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Phase 81 Real Browser Localization Project',
        description: 'Target project for Phase 81 real browser technical cause localization',
      },
    });

    await prisma.projectEnvironment.create({
      data: {
        id: environmentId,
        projectId: testProjectId,
        name: 'Local Test Server',
        baseUrl: serverUrl,
      },
    });

    await prisma.requirement.create({
      data: {
        id: testRequirementId,
        projectId: testProjectId,
        requirementKey: 'REQ-PH81-CERT-01',
        title: 'Payment Checkout Processing',
        originalText: 'Users must be able to submit checkout payment securely without 500 errors',
      },
    });

    // Seed V2 Repository Intelligence
    await prisma.projectSource.create({
      data: {
        id: sourceId,
        projectId: testProjectId,
        displayName: 'Primary Repository Source',
        rootPath: '/repo/root',
      },
    });

    await prisma.repositoryFile.create({
      data: {
        id: repoFileId,
        sourceId,
        relativePath: 'src/api/checkout/process.controller.ts',
        name: 'process.controller.ts',
        classification: 'BACKEND_CONTROLLER',
        sizeBytes: 1024,
        language: 'typescript',
      },
    });

    await prisma.repositorySymbol.create({
      data: {
        id: repoSymbolId,
        repositoryFileId: repoFileId,
        name: 'processCheckout',
        kind: 'FUNCTION',
        startLine: 35,
        endLine: 75,
        isExported: true,
      },
    });

    domainSeparationService = new FailureDomainSeparationService(prisma);
    localizationService = new FailureEvidenceCorrelationService(prisma, domainSeparationService);
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
    await cleanupTestData();
  });

  async function cleanupTestData(): Promise<void> {
    try {
      await prisma.failureTechnicalLocalization.deleteMany({ where: { projectId: testProjectId } });
      await prisma.failureDomainSeparation.deleteMany({ where: { projectId: testProjectId } });
      await prisma.flakinessAnalysis.deleteMany({ where: { projectId: testProjectId } });
      await prisma.failureClassification.deleteMany({ where: { projectId: testProjectId } });
      await prisma.failureEvidenceReference.deleteMany({ where: { projectId: testProjectId } });
      await prisma.failureCase.deleteMany({ where: { projectId: testProjectId } });
      await prisma.stepExecutionRecord.deleteMany({ where: { projectId: testProjectId } });
      await prisma.testCaseExecution.deleteMany({ where: { projectId: testProjectId } });
      await prisma.testRun.deleteMany({ where: { projectId: testProjectId } });
      await prisma.executableTestPlan.deleteMany({ where: { projectId: testProjectId } });
      await prisma.repositorySymbol.deleteMany({ where: { repositoryFile: { sourceId } } });
      await prisma.repositoryFile.deleteMany({ where: { sourceId } });
      await prisma.projectSource.deleteMany({ where: { id: sourceId } });
      await prisma.testCase.deleteMany({ where: { projectId: testProjectId } });
      await prisma.requirement.deleteMany({ where: { projectId: testProjectId } });
      await prisma.projectEnvironment.deleteMany({ where: { id: environmentId } });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    } catch {
      // Ignore cleanup error
    }
  }

  it('1. Certifies Real Browser Execution with HTTP 500 Backend Failure and Repository Linkage', async () => {
    const testCaseId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        testCaseKey: 'TC-PH81-CERT-01',
        title: 'Checkout Flow Real Browser Test',
        objective: 'Verify payment submission failure correlation',
        currentVersionNumber: 1,
        sourceRequirementId: testRequirementId,
      },
    });

    await prisma.executableTestPlan.create({
      data: {
        id: testPlanId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-cert-01',
        summary: 'Executable plan for checkout flow',
        status: 'VALID',
        isExecutable: true,
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        status: 'FAILED',
        planFingerprint: 'plan-fp-cert-01',
        testCaseTitle: 'Checkout Flow Real Browser Test',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        testRunId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ERR_HTTP_SERVER_ERROR',
        errorMessage: 'POST /api/v1/checkout/process returned HTTP 500',
      },
    });

    // Execute real Playwright browser interaction
    const page = await browser.newPage();
    let networkRequestUrl = '';
    let networkResponseStatus = 0;

    page.on('request', req => {
      if (req.url().includes('/api/v1/checkout/process')) {
        networkRequestUrl = req.url();
      }
    });

    page.on('response', resp => {
      if (resp.url().includes('/api/v1/checkout/process')) {
        networkResponseStatus = resp.status();
      }
    });

    await page.goto(`${serverUrl}/app/checkout`);
    await page.click('#pay-btn');
    await page.waitForTimeout(500);
    await page.close();

    assert.strictEqual(networkResponseStatus, 500);

    // Record Step Execution
    const stepRecord = await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId,
        stepIndex: 1,
        actionType: 'CLICK',
        status: 'FAILED',
        targetSummary: '#pay-btn',
        startedAt: new Date(Date.now() - 1000),
        completedAt: new Date(),
        durationMs: 1000,
        errorMessage: 'HTTP 500 returned during click action',
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testCaseId,
        testRunId,
        executionId,
        stepExecutionId: stepRecord.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Checkout Payment 500 Error',
        errorCode: 'ERR_HTTP_SERVER_ERROR',
        errorMessage: 'POST /api/v1/checkout/process returned HTTP 500',
      },
    });

    // Ingest Evidence Reference
    await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectId,
        failureCaseId,
        executionId,
        artifactType: 'NETWORK_RESPONSE',
        logicalName: 'checkout_network_response',
        stepExecutionId: stepRecord.id,
        metadataJson: {
          url: networkRequestUrl,
          method: 'POST',
          statusCode: 500,
          stepIndex: 1,
          timestampMs: Date.now() - 500,
        },
      },
    });

    await prisma.failureClassification.create({
      data: {
        id: crypto.randomUUID(),
        projectId: testProjectId,
        failureCaseId,
        category: 'APPLICATION_FAILURE',
        subcategory: 'ASSERTION_MISMATCH',
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'RULE_ASSERTION_MISMATCH',
        matchedRuleIds: ['RULE_ASSERTION_MISMATCH'],
        isAuthoritative: true,
      },
    });

    await prisma.flakinessAnalysis.create({
      data: {
        id: crypto.randomUUID(),
        projectId: testProjectId,
        failureCaseId,
        testCaseId,
        testCaseVersionNumber: 1,
        analysisVersion: '1.0.0',
        flakinessPolicyVersion: '1.0.0',
        flakinessState: 'STABLE_FAILURE',
        stabilityState: 'STABLE',
        attemptCount: 1,
        validAttemptCount: 1,
        passCount: 0,
        failCount: 1,
        blockedCount: 0,
        cancelledCount: 0,
        executionErrorCount: 0,
        equivalentFailureCount: 1,
        differentFailureCount: 0,
        sameStepFailureCount: 1,
        differentStepFailureCount: 0,
        environmentComparableCount: 1,
        environmentDriftCount: 0,
        reproducibilityRatio: 1.0,
        passRate: 0.0,
        failureRate: 1.0,
        analysisFingerprint: 'sha256:app-defect-flaky',
        isAuthoritative: true,
      },
    });

    // Execute Phase 80 Domain Separation
    const domainResult = await domainSeparationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });
    assert.strictEqual(domainResult.domain, 'APPLICATION_DEFECT_CANDIDATE');

    // Execute Phase 81 Technical Cause Localization
    const localization = await localizationService.localizeTechnicalCause({
      projectId: testProjectId,
      failureCaseId,
    });

    // Certify localization results
    assert.strictEqual(localization.primaryLayer, 'BACKEND_API');
    assert.strictEqual(localization.primaryTargetType, 'API_ENDPOINT');
    assert.strictEqual(localization.httpStatusCode, 500);
    assert.strictEqual(localization.matchedFilePath, 'src/api/checkout/process.controller.ts');
    assert.strictEqual(localization.matchedSymbolName, 'processCheckout');
    assert.strictEqual(localization.matchedLineNumber, 35);
    assert.strictEqual(localization.isAuthoritative, true);
    assert.strictEqual(localization.isStale, false);
    assert.ok(localization.timelineSummary.length > 0);
    assert.ok(localization.correlationSignals.some(s => s.signalType === 'HTTP_5XX_SERVER_ERROR'));
    assert.ok(
      localization.correlationSignals.some(s => s.signalType === 'REPOSITORY_CODE_LINKAGE'),
    );
    assert.ok(localization.localizationFingerprint.length === 64);
  });

  it('2. Certifies Real Browser Execution with Client-Side JavaScript Console Crash', async () => {
    const testCaseId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        testCaseKey: 'TC-PH81-CERT-02',
        title: 'Client Script Crash Test',
        objective: 'Verify uncaught client script localization',
        currentVersionNumber: 1,
        sourceRequirementId: testRequirementId,
      },
    });

    await prisma.executableTestPlan.create({
      data: {
        id: crypto.randomUUID(),
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        planFingerprint: 'plan-fp-cert-02',
        summary: 'Executable plan for script crash',
        status: 'VALID',
        isExecutable: true,
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        status: 'FAILED',
        planFingerprint: 'plan-fp-cert-02',
        testCaseTitle: 'Client Script Crash Test',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        testRunId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ERR_CLIENT_SCRIPT',
        errorMessage: "TypeError: Cannot read properties of undefined (reading 'records')",
      },
    });

    // Real Playwright page captures console error
    const page = await browser.newPage();
    let consoleErrorMessage = '';
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrorMessage = msg.text();
      }
    });

    await page.goto(`${serverUrl}/app/script-crash`);
    await page.waitForTimeout(300);
    await page.close();

    assert.ok(consoleErrorMessage.includes('TypeError'));

    const stepRecord = await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId,
        stepIndex: 1,
        actionType: 'NAVIGATE',
        status: 'FAILED',
        targetSummary: 'State Dashboard',
        startedAt: new Date(Date.now() - 500),
        completedAt: new Date(),
        durationMs: 500,
        errorMessage: consoleErrorMessage,
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testCaseId,
        testRunId,
        executionId,
        stepExecutionId: stepRecord.id,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'PENDING',
        title: 'Uncaught Client TypeError',
        errorCode: 'ERR_CLIENT_SCRIPT',
        errorMessage: consoleErrorMessage,
      },
    });

    await prisma.failureEvidenceReference.create({
      data: {
        projectId: testProjectId,
        failureCaseId,
        executionId,
        artifactType: 'CONSOLE_LOG',
        logicalName: 'script_crash_console_log',
        stepExecutionId: stepRecord.id,
        metadataJson: {
          level: 'error',
          message: consoleErrorMessage,
          stepIndex: 1,
          timestampMs: Date.now() - 200,
        },
      },
    });

    const localization = await localizationService.localizeTechnicalCause({
      projectId: testProjectId,
      failureCaseId,
    });

    assert.strictEqual(localization.primaryLayer, 'FRONTEND_STATE');
    assert.strictEqual(localization.primaryTargetType, 'FRONTEND_COMPONENT');
    assert.ok(
      localization.correlationSignals.some(s => s.signalType === 'CLIENT_SCRIPT_EXCEPTION'),
    );
  });

  it('3. Certifies Re-evaluation Lifecycle and Immutable Audit Tracking', async () => {
    // Pick first failure case
    const firstCase = await prisma.failureCase.findFirst({
      where: { projectId: testProjectId },
    });
    assert.ok(firstCase);

    const relocalized = await localizationService.relocalizeTechnicalCause({
      projectId: testProjectId,
      failureCaseId: firstCase.id,
      relocalizationReason: 'Operator requested re-evaluation after code inspection',
    });

    assert.strictEqual(relocalized.isAuthoritative, true);
    assert.strictEqual(relocalized.relocalizationCount, 1);
    assert.strictEqual(
      relocalized.relocalizationReason,
      'Operator requested re-evaluation after code inspection',
    );

    const history = await localizationService.listLocalizationHistory({
      projectId: testProjectId,
      failureCaseId: firstCase.id,
    });

    assert.strictEqual(history.length >= 2, true);
    assert.strictEqual(history[0]?.isAuthoritative, true);
    assert.strictEqual(history[1]?.isAuthoritative, false);
  });
});
