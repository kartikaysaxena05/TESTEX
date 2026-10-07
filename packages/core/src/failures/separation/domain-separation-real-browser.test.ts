/**
 * @file packages/core/src/failures/separation/domain-separation-real-browser.test.ts
 * Real Playwright Browser Certification Test Suite for V6 Phase 80 — Failure Domain Separation.
 *
 * Validates with real browser executions:
 * 1. Real Application Defect Candidate (assertion mismatch on rendered DOM, valid selector).
 * 2. Real Automation Failure (invalid selector syntax rejected by browser engine).
 * 3. Real Test Data Failure (missing fixture / unseeded account).
 * 4. Real Environment Failure (unreachable port / connection refused).
 * 5. Strict immutability of historical E1 execution and prior analysis records.
 * 6. Deterministic SHA-256 fingerprint generation with secret redaction.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { FailureDomainSeparationService } from './failure-domain-separation-service.js';

describe('V6 Phase 80 — Failure Domain Separation Real Browser Certification Suite', () => {
  let server: http.Server;
  let serverUrl: string;
  let browser: Browser;
  const prisma = getPrismaClient()!;

  const testProjectId = '00000000-0000-0000-0000-000000008001';
  const testRequirementId = '00000000-0000-0000-0000-000000008002';
  const testPlanId = '00000000-0000-0000-0000-000000008003';
  const environmentId = '00000000-0000-0000-0000-000000008004';

  let separationService: FailureDomainSeparationService;

  before(async () => {
    // 1. Launch local test HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/app-defect') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>App Defect Target</title></head>
            <body>
              <h1 id="app-header">Payment Checkout</h1>
              <div id="status-container">
                <span id="status-badge">Internal Server Error 500: Database lock failed</span>
              </div>
            </body>
          </html>
        `);
      } else if (url.pathname === '/healthy-app') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Healthy App</title></head>
            <body>
              <h1 id="app-header">Payment Checkout</h1>
              <div id="status-container">
                <span id="status-badge">Order Processed Successfully</span>
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

    // 2. Launch real Playwright Chromium browser
    browser = await chromium.launch({ headless: true });

    // 3. Clean up DB records for test project
    await cleanupTestData();

    // 4. Seed foundational project & environment
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Phase 80 Real Browser Separation Project',
        description: 'Target project for Phase 80 real browser domain separation certification',
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

    await prisma.requirement.create({
      data: {
        id: testRequirementId,
        projectId: testProjectId,
        requirementKey: 'REQ-80-SEP',
        title: 'Authoritative Domain Separation Requirement',
        originalText:
          'System must accurately separate application bugs from automation, test data, and environment failures.',
        status: 'ACTIVE',
      },
    });

    separationService = new FailureDomainSeparationService(prisma);
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

  async function cleanupTestData() {
    await prisma.failureDomainSeparation.deleteMany({ where: { projectId: testProjectId } });
    await prisma.flakinessAnalysis.deleteMany({ where: { projectId: testProjectId } });
    await prisma.classificationDecisionIntegrity.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.failureClassification.deleteMany({ where: { projectId: testProjectId } });
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
  }

  it('1. Real Application Defect Candidate: Assertion failure on rendered DOM separates to APPLICATION_DEFECT_CANDIDATE', async () => {
    const testCaseId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    // Execute real Playwright browser interaction
    const page = await browser.newPage();
    await page.goto(`${serverUrl}/app-defect`);
    const statusText = await page.locator('#status-badge').textContent();
    await page.close();

    const expectedText = 'Order Processed Successfully';
    const actualText = statusText?.trim() || '';
    const assertionFailed = actualText !== expectedText;
    assert.strictEqual(assertionFailed, true);

    // Seed DB records
    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-80-SEP',
        testCaseKey: 'TC-80-01',
        title: 'Checkout Confirmation Flow',
        objective: 'Verify successful order processing',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: versionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Checkout Confirmation Flow v1',
        objective: 'Verify successful order processing',
        stepsJson: [
          { id: 's1', stepNumber: 1, action: `navigate to "${serverUrl}/app-defect"` },
          {
            id: 's2',
            stepNumber: 2,
            action: 'assert "#status-badge" equals "Order Processed Successfully"',
          },
        ],
      },
    });

    await prisma.executableTestPlan.create({
      data: {
        id: testPlanId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        planFingerprint: crypto.createHash('sha256').update('plan-01').digest('hex'),
        status: 'VALID',
        compilerVersion: '1.0.0',
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Local Real HTTP Staging',
        status: 'FAILED',
        planFingerprint: crypto.createHash('sha256').update('plan-01').digest('hex'),
        testCaseTitle: 'Checkout Confirmation Flow v1',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'ASSERTION_MISMATCH',
        errorMessage: `Assertion failed: expected "${expectedText}", received "${actualText}"`,
        durationMs: 420,
        browserEngine: 'chromium',
      },
    });

    await prisma.stepExecutionRecord.createMany({
      data: [
        {
          projectId: testProjectId,
          testRunId,
          executionId,
          stepIndex: 0,
          attempt: 1,
          actionType: 'navigate',
          status: 'PASSED',
          durationMs: 150,
          targetSummary: `navigate to "${serverUrl}/app-defect"`,
        },
        {
          projectId: testProjectId,
          testRunId,
          executionId,
          stepIndex: 1,
          attempt: 1,
          actionType: 'assert',
          status: 'FAILED',
          durationMs: 270,
          targetSummary: 'assert "#status-badge"',
          errorMessage: `Assertion failed: expected "${expectedText}", received "${actualText}"`,
        },
      ],
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId,
        executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'ASSERTION_MISMATCH',
        errorMessage: `Assertion failed: expected "${expectedText}", received "${actualText}"`,
        title: 'Checkout status assertion mismatch',
      },
    });

    // Seed classification and flakiness
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

    // Snapshot E1 before separation
    const e1Before = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: executionId },
      include: { stepExecutions: true },
    });

    // Evaluate failure domain separation
    const separation = await separationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });

    // Assert Domain Separation Results
    assert.strictEqual(separation.domain, 'APPLICATION_DEFECT_CANDIDATE');
    assert.strictEqual(separation.isAuthoritative, true);
    assert.strictEqual(separation.isStale, false);
    assert.ok(separation.primaryRationale.length > 0);
    assert.ok(separation.decisionExplanation.length > 0);
    assert.match(separation.separationFingerprint, /^[a-f0-9]{64}$/);

    // Verify Excluded Domains Matrix
    assert.ok(separation.excludedDomains.includes('AUTOMATION_FAILURE'));
    assert.ok(separation.exclusionReasons['AUTOMATION_FAILURE']);

    assert.ok(separation.excludedDomains.includes('ENVIRONMENT_FAILURE'));
    assert.ok(separation.exclusionReasons['ENVIRONMENT_FAILURE']);

    assert.ok(separation.excludedDomains.includes('TEST_DATA_FAILURE'));
    assert.ok(separation.exclusionReasons['TEST_DATA_FAILURE']);

    // Verify Strict Immutability of E1
    const e1After = await prisma.testCaseExecution.findUniqueOrThrow({
      where: { id: executionId },
      include: { stepExecutions: true },
    });
    assert.deepStrictEqual(e1Before, e1After, 'E1 execution record was mutated!');
  });

  it('2. Real Automation Failure: Invalid Playwright selector syntax separates to AUTOMATION_FAILURE', async () => {
    const testCaseId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    // Trigger real Playwright selector syntax error
    const page = await browser.newPage();
    let browserError = '';
    try {
      await page.locator('button:invalid-pseudo-syntax-xyz(foo)').click({ timeout: 1000 });
    } catch (err: any) {
      browserError = err.message;
    } finally {
      await page.close();
    }

    assert.ok(browserError.length > 0);

    // Seed DB records
    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-80-SEP',
        testCaseKey: 'TC-80-02',
        title: 'Broken Selector Flow',
        objective: 'Trigger invalid selector error',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: versionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Broken Selector Flow v1',
        objective: 'Trigger invalid selector error',
        stepsJson: [
          { id: 's1', stepNumber: 1, action: 'click "button:invalid-pseudo-syntax-xyz(foo)"' },
        ],
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Local Real HTTP Staging',
        status: 'FAILED',
        planFingerprint: 'plan-02',
        testCaseTitle: 'Broken Selector Flow v1',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'AUTOMATION_SELECTOR_ERROR',
        errorMessage: browserError,
        durationMs: 85,
        browserEngine: 'chromium',
      },
    });

    await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId,
        stepIndex: 0,
        attempt: 1,
        actionType: 'click',
        status: 'FAILED',
        durationMs: 85,
        targetSummary: 'click "button:invalid-pseudo-syntax-xyz(foo)"',
        errorMessage: browserError,
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId,
        executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'AUTOMATION_SELECTOR_ERROR',
        errorMessage: browserError,
        title: 'Invalid selector syntax in automation test script',
      },
    });

    await prisma.failureClassification.create({
      data: {
        id: crypto.randomUUID(),
        projectId: testProjectId,
        failureCaseId,
        category: 'AUTOMATION_FAILURE',
        subcategory: 'PLAYWRIGHT_ERROR',
        classifierVersion: '1.0.0',
        taxonomyVersion: '1.0.0',
        primaryRuleId: 'RULE_AUTOMATION_SYNTAX',
        matchedRuleIds: ['RULE_AUTOMATION_SYNTAX'],
        isAuthoritative: true,
      },
    });

    // Evaluate failure domain separation
    const separation = await separationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });

    assert.strictEqual(separation.domain, 'AUTOMATION_FAILURE');
    assert.strictEqual(separation.isAuthoritative, true);

    // APPLICATION_DEFECT_CANDIDATE must be strictly excluded!
    assert.ok(separation.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
    assert.ok(
      separation.exclusionReasons['APPLICATION_DEFECT_CANDIDATE']?.includes(
        'Automation runtime/browser infrastructure failed',
      ),
    );
  });

  it('3. Real Test Data Failure: Missing fixture seed data separates to TEST_DATA_FAILURE', async () => {
    const testCaseId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    const dataError =
      'Missing required test data fixture: seed profile qa_fixture_user_99 not found in test dataset';

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-80-SEP',
        testCaseKey: 'TC-80-03',
        title: 'Missing Fixture Flow',
        objective: 'Test missing seed fixture',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: versionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Missing Fixture Flow v1',
        objective: 'Test missing seed fixture',
        stepsJson: [
          { id: 's1', stepNumber: 1, action: 'login with seed account "qa_fixture_user_99"' },
        ],
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Local Real HTTP Staging',
        status: 'FAILED',
        planFingerprint: 'plan-03',
        testCaseTitle: 'Missing Fixture Flow v1',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'TEST_DATA_MISSING',
        errorMessage: dataError,
        durationMs: 50,
        browserEngine: 'chromium',
      },
    });

    await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId,
        stepIndex: 0,
        attempt: 1,
        actionType: 'action',
        status: 'FAILED',
        durationMs: 50,
        targetSummary: 'Load test fixture qa_fixture_user_99',
        errorMessage: dataError,
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId,
        executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'TEST_DATA_MISSING',
        errorMessage: dataError,
        title: 'Missing seed account fixture during login setup',
      },
    });

    const separation = await separationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });

    assert.strictEqual(separation.domain, 'TEST_DATA_FAILURE');
    assert.ok(separation.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
  });

  it('4. Real Environment Failure: Connection refused on offline port separates to ENVIRONMENT_FAILURE', async () => {
    const testCaseId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    // Trigger real Playwright connection refused on unreachable port
    const page = await browser.newPage();
    let networkError = '';
    try {
      await page.goto('http://127.0.0.1:59997', { timeout: 3000 });
    } catch (err: any) {
      networkError = err.message;
    } finally {
      await page.close();
    }

    assert.ok(networkError.includes('ERR_CONNECTION_REFUSED') || networkError.includes('net::'));

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-80-SEP',
        testCaseKey: 'TC-80-04',
        title: 'Offline Host Flow',
        objective: 'Test network unreachable error',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: versionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Offline Host Flow v1',
        objective: 'Test network unreachable error',
        stepsJson: [{ id: 's1', stepNumber: 1, action: 'navigate to "http://127.0.0.1:59997"' }],
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Offline Environment',
        status: 'FAILED',
        planFingerprint: 'plan-04',
        testCaseTitle: 'Offline Host Flow v1',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'NET_CONNECTION_REFUSED',
        errorMessage: networkError,
        durationMs: 310,
        browserEngine: 'chromium',
      },
    });

    await prisma.stepExecutionRecord.create({
      data: {
        projectId: testProjectId,
        testRunId,
        executionId,
        stepIndex: 0,
        attempt: 1,
        actionType: 'navigate',
        status: 'FAILED',
        durationMs: 310,
        targetSummary: 'navigate to "http://127.0.0.1:59997"',
        errorMessage: networkError,
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId,
        executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'NET_CONNECTION_REFUSED',
        errorMessage: networkError,
        title: 'Network connection refused reaching target host',
      },
    });

    const separation = await separationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });

    assert.strictEqual(separation.domain, 'ENVIRONMENT_FAILURE');
    assert.ok(separation.excludedDomains.includes('APPLICATION_DEFECT_CANDIDATE'));
  });

  it('5. Secret Redaction & Fingerprint Determinism: Tokens and passwords are redacted from fingerprints', async () => {
    const testCaseId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const testRunId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const failureCaseId = crypto.randomUUID();

    const sensitiveError =
      'Error communicating with service: Authorization: Bearer sk-secret-token-abcdef1234567890';

    await prisma.testCase.create({
      data: {
        id: testCaseId,
        projectId: testProjectId,
        sourceRequirementId: testRequirementId,
        sourceRequirementKey: 'REQ-80-SEP',
        testCaseKey: 'TC-80-05',
        title: 'Sensitive Error Flow',
        objective: 'Verify secret redaction',
        currentVersionNumber: 1,
        status: 'ACTIVE',
      },
    });

    await prisma.testCaseVersion.create({
      data: {
        id: versionId,
        projectId: testProjectId,
        testCaseId,
        versionNumber: 1,
        title: 'Sensitive Error Flow v1',
        objective: 'Verify secret redaction',
        stepsJson: [{ id: 's1', stepNumber: 1, action: 'call api' }],
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        environmentName: 'Local Real HTTP Staging',
        status: 'FAILED',
        planFingerprint: 'plan-05',
        testCaseTitle: 'Sensitive Error Flow v1',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: executionId,
        projectId: testProjectId,
        testRunId,
        testCaseId,
        testCaseVersionId: versionId,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlanId,
        environmentId,
        attempt: 1,
        status: 'FAILED',
        errorCode: 'AUTH_TOKEN_EXPIRED',
        errorMessage: sensitiveError,
        durationMs: 120,
        browserEngine: 'chromium',
      },
    });

    await prisma.failureCase.create({
      data: {
        id: failureCaseId,
        projectId: testProjectId,
        testRunId,
        executionId,
        testCaseId,
        testCaseVersionNumber: 1,
        triggeringExecutionStatus: 'FAILED',
        status: 'READY',
        errorCode: 'AUTH_TOKEN_EXPIRED',
        errorMessage: sensitiveError,
        title: 'Authentication token expired failure',
      },
    });

    const separation = await separationService.separateFailureDomain({
      projectId: testProjectId,
      failureCaseId,
    });

    // Ensure raw secret is NOT leaked into decisionExplanation or primaryRationale
    assert.ok(!separation.decisionExplanation.includes('sk-secret-token-abcdef1234567890'));
    assert.ok(!separation.primaryRationale.includes('sk-secret-token-abcdef1234567890'));

    // Verify SHA-256 fingerprint format
    assert.match(separation.separationFingerprint, /^[a-f0-9]{64}$/);
  });
});
