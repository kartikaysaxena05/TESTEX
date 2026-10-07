/**
 * @file packages/core/src/failures/bug-report/bug-report-real-browser-certification.test.ts
 * Real Playwright Chromium browser pipeline certification test for Structured Bug Report Generation & Failure Intelligence Workspace (V6 Phase 87).
 *
 * Executes real browser journeys hitting a live HTTP server:
 * - Journey 1: Real user checkout flow encountering HTTP 500 failure with real screenshot capture, console logs,
 *              and step telemetry -> Generates CONFIRMED_APPLICATION_DEFECT bug report (BUG-000001) with full traceability,
 *              reproduction steps, verified evidence integrity, root cause hypothesis disclaimer, and secret redaction.
 * - Journey 2: Selector missing automation failure -> Generates non-application DIAGNOSTIC REPORT (BUG-000002) with AUTOMATION_FAILURE state.
 * - Journey 3: Bug report regeneration with audit reason -> Verifies immutable revisioning (Rev 1 -> Rev 2),
 *              supersedes/supersededById links, and history retrieval.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { StructuredBugReportService } from './structured-bug-report-service.js';

test('Structured Bug Report: Real Playwright Browser Pipeline Certification (Phase 87)', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for real browser certification test');

  let server: http.Server | null = null;
  let serverUrl = '';
  let browser: Browser | null = null;

  const projectId = crypto.randomUUID();
  const service = new StructuredBugReportService(prisma);

  // 1. Setup local HTTP test server with sensitive tokens & endpoints
  await new Promise<void>(resolve => {
    server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Endpoint simulating order failure
      if (req.url?.startsWith('/api/order') && req.method === 'POST') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error:
              'Internal Server Error: Order validation failed on account token=secret-auth-token-123456789',
            code: 'ERR_ORDER_NULL_POINTER',
          }),
        );
        return;
      }

      // Page with checkout form and sensitive token parameter
      if (req.url?.startsWith('/checkout')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Checkout Page</title></head>
            <body>
              <h1>Checkout</h1>
              <input id="card-input" type="text" value="4111-2222-3333-4444" />
              <button id="pay-button">Place Order</button>
              <div id="status">Ready</div>
              <script>
                document.getElementById('pay-button').addEventListener('click', async () => {
                  document.getElementById('status').innerText = 'Processing...';
                  try {
                    const resp = await fetch('/api/order?auth_token=super-secret-jwt-token-xyz&user=admin', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer sk-topsecret-password-12345'
                      },
                      body: JSON.stringify({ amount: 99.99 })
                    });
                    const data = await resp.json();
                    document.getElementById('status').innerText = 'ERROR: ' + data.error;
                    console.error('Order dispatch failed with status 500:', data.error);
                  } catch (e) {
                    console.error('Fetch network exception:', e);
                  }
                });
              </script>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as AddressInfo;
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // 2. Launch headless Chromium browser
  browser = await chromium.launch({ headless: true });

  // 3. Setup Project, Requirement, and TestCase in DB
  await prisma.project.create({
    data: { id: projectId, name: `BugReport Browser Cert ${Date.now()}` },
  });

  const req1 = await prisma.requirement.create({
    data: {
      projectId,
      requirementKey: 'REQ-CHECKOUT-001',
      title: 'Checkout Flow Resilience',
      originalText: 'System shall handle orders resiliently and report errors clearly',
    },
  });

  const tc1 = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-CHECKOUT-${Date.now()}`,
      title: 'Verify checkout button click and order confirmation',
      objective: 'Ensure checkout button initiates order and returns confirmation',
      sourceRequirementId: req1.id,
      sourceRequirementKey: req1.requirementKey,
      sourceRequirementVersionNumber: 1,
      overallExpectedResult: 'Order confirmation modal opens and confirmation number is generated.',
      currentVersionNumber: 1,
    },
  });

  // Add preconditions
  await prisma.testCasePrecondition.create({
    data: {
      testCaseId: tc1.id,
      sequenceOrder: 1,
      description: 'User is authenticated as customer with active cart items',
    },
  });

  await prisma.testCasePrecondition.create({
    data: {
      testCaseId: tc1.id,
      sequenceOrder: 2,
      description: 'Payment gateway connection is initialized',
    },
  });

  const plan1 = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-bugreport-browser-${Date.now()}`,
      summary: 'Plan Browser Bug Report',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const tr1 = await prisma.testRun.create({
    data: {
      projectId,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: plan1.id,
      status: 'FAILED',
      planFingerprint: plan1.planFingerprint,
      testCaseTitle: tc1.title,
    },
  });

  // Execute real browser interaction for Journey 1
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const sensitiveUrl = `${serverUrl}/checkout?session_token=sensitive-session-cookie-998877`;
  await page.goto(sensitiveUrl);
  await page.click('#pay-button');
  await page.waitForSelector('#status:has-text("ERROR")');
  const screenshotBuffer = await page.screenshot();
  await page.close();

  const screenshotSha = crypto.createHash('sha256').update(screenshotBuffer).digest('hex');
  const consoleLogText = consoleErrors.join('\n');
  const consoleSha = crypto.createHash('sha256').update(consoleLogText).digest('hex');

  // Journey 1 Execution Record
  const exec1 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr1.id,
      testCaseId: tc1.id,
      executableTestPlanId: plan1.id,
      testCaseVersionNumber: 1,
      attempt: 1,
      status: 'FAILED',
      errorMessage: 'Order dispatch failed with status 500: Internal Server Error',
    },
  });

  // Derived StepExecutionRecords
  await prisma.stepExecutionRecord.create({
    data: {
      projectId,
      testRunId: tr1.id,
      executionId: exec1.id,
      stepIndex: 1,
      actionType: 'NAVIGATE',
      status: 'PASSED',
      durationMs: 420,
      targetSummary: 'Navigate to checkout page with token=secret-jwt-in-url',
      actionDataJson: {
        description: 'Navigate to checkout with token=secret-jwt-in-url',
        targetUrl: sensitiveUrl,
        selector: null,
      },
      expectedSummary: 'Checkout page loads successfully',
      actualSummary: 'Checkout page loaded',
    },
  });

  await prisma.stepExecutionRecord.create({
    data: {
      projectId,
      testRunId: tr1.id,
      executionId: exec1.id,
      stepIndex: 2,
      actionType: 'CLICK',
      status: 'FAILED',
      durationMs: 3100,
      targetSummary: 'Click #pay-button',
      actionDataJson: {
        description: 'Click place order button with auth=secret-token-bearer',
        targetUrl: null,
        selector: '#pay-button',
      },
      expectedSummary: 'Order confirmation modal appears',
      actualSummary:
        'HTTP 500 received: Internal Server Error: Order validation failed on account token=secret-auth-token-123456789',
      errorMessage: 'HTTP 500 error on /api/order',
    },
  });

  // Failure Case 1
  const fc1 = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec1.id,
      testRunId: tr1.id,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 2,
      title: 'Checkout POST /api/order failed with HTTP 500',
      errorMessage: 'Order dispatch failed with status 500: Internal Server Error',
      failureSignature: `sig-bugreport-j1-${Date.now()}`,
      isEligible: true,
      evidenceCompleteness: 'COMPLETE',
    },
  });

  // Evidence References
  await prisma.failureEvidenceReference.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      executionId: exec1.id,
      artifactType: 'SCREENSHOT',
      logicalName: 'checkout-failure.png',
      storageIdentity: 'artifacts/checkout-failure.png',
      mimeType: 'image/png',
      byteSize: screenshotBuffer.length,
      sha256: screenshotSha,
      integrityStatus: 'VERIFIED',
    },
  });

  await prisma.failureEvidenceReference.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      executionId: exec1.id,
      artifactType: 'CONSOLE_LOG',
      logicalName: 'browser-console.log',
      storageIdentity: 'artifacts/browser-console.log',
      mimeType: 'text/plain',
      byteSize: consoleLogText.length,
      sha256: consoleSha,
      integrityStatus: 'VERIFIED',
    },
  });

  // Classification: APPLICATION_FAILURE
  await prisma.failureClassification.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      category: 'APPLICATION_FAILURE',
      primaryRuleId: 'RULE-HTTP-500',
      matchedRuleIds: ['RULE-HTTP-500'],
      isAuthoritative: true,
    },
  });

  // Reproduction: REPRODUCED
  await prisma.failureReproductionAttempt.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      originalExecutionId: exec1.id,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      attemptNumber: 1,
      status: 'REPRODUCED',
      reproductionFailureSignature: fc1.failureSignature,
      isSignatureMatch: true,
    },
  });

  // Root-Cause Analysis
  await prisma.failureRootCauseAnalysis.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      rootCauseStatus: 'SUPPORTED_HYPOTHESIS',
      probableCause:
        'Order validation service raised null pointer exception when accessing token payload.',
      probableLayer: 'BACKEND',
      probableComponent: 'OrderProcessingService',
      humanExplanation: 'Verified null pointer exception in backend order processing service.',
      modelProvider: 'rule-engine',
      modelName: 'v6-rca',
      rootCauseFingerprint: 'b'.repeat(64),
    },
  });

  // Impact Assessment
  await prisma.failureImpactAssessment.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      severity: 'HIGH',
      severityRuleId: 'SEV_HIGH_MAJOR_WORKFLOW_BLOCKED_001',
      severityRationale: 'Checkout workflow completely blocked.',
      priority: 'P1_URGENT',
      priorityRuleId: 'PRI_P1_URGENT_001',
      priorityRationale: 'High severity on revenue checkout path.',
      functionalImpact: 'Users unable to complete purchase transactions.',
      businessImpact: 'Direct sales revenue blocked.',
      releaseRecommendation: 'BLOCK_RELEASE',
      releaseRecommendationRationale: 'Critical checkout path defect blocks release.',
      userImpact: 'ALL_USERS',
      dataImpact: 'NO_DATA_IMPACT',
      securityImpact: 'NONE_PROVEN',
      availabilityImpact: 'MODULE_UNAVAILABLE',
      integrationImpact: 'No integrations impacted',
      blastRadius: 'SINGLE_MODULE',
      workaroundStatus: 'NO_WORKAROUND',
      assessmentFingerprint: 'c'.repeat(64),
      isAuthoritative: true,
    },
  });

  // Defect Cluster
  const cluster1 = await prisma.defectCluster.create({
    data: {
      projectId,
      clusterKey: 'CLUSTER-CHECKOUT-500',
      title: 'Checkout 500 Internal Server Errors',
      representativeFailureId: fc1.id,
      memberCount: 3,
      clusterFingerprint: 'd'.repeat(64),
      clusterStatus: 'ACTIVE',
    },
  });

  await prisma.defectClusterMembership.create({
    data: {
      clusterId: cluster1.id,
      failureCaseId: fc1.id,
      projectId,
      relationshipType: 'EXACT_DUPLICATE',
      relationshipStrength: 'EXACT',
      similarityScore: 0.98,
      explanation: 'Exact signature and route match',
    },
  });

  // Confidence Assessment
  await prisma.confidenceAssessment.create({
    data: {
      projectId,
      failureCaseId: fc1.id,
      revision: 1,
      overallConfidence: 0.93,
      confidenceBand: 'VERY_HIGH',
      classificationConfidence: 0.95,
      reproducibilityConfidence: 0.95,
      rootCauseConfidence: 0.9,
      severityConfidence: 0.92,
      confidenceFingerprint: 'f'.repeat(64),
      humanExplanation: 'Verified real browser telemetry with reproduced application defect.',
      isAuthoritative: true,
    },
  });

  // Journey 2: Automation Failure (Diagnostic Report)
  const tr2 = await prisma.testRun.create({
    data: {
      projectId,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: plan1.id,
      status: 'FAILED',
      planFingerprint: plan1.planFingerprint,
      testCaseTitle: tc1.title,
    },
  });

  const exec2 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr2.id,
      testCaseId: tc1.id,
      executableTestPlanId: plan1.id,
      testCaseVersionNumber: 1,
      attempt: 1,
      status: 'FAILED',
      errorMessage: 'Timeout waiting for selector: #missing-element-xyz',
    },
  });

  const fc2 = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec2.id,
      testRunId: tr2.id,
      testCaseId: tc1.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 1,
      title: 'Automation selector timeout on non-existent element',
      errorMessage: 'Timeout waiting for selector: #missing-element-xyz',
      failureSignature: `sig-bugreport-j2-${Date.now()}`,
      isEligible: true,
      evidenceCompleteness: 'COMPLETE',
    },
  });

  await prisma.failureClassification.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc2.id,
      category: 'AUTOMATION_FAILURE',
      primaryRuleId: 'RULE-LOCATOR-TIMEOUT',
      matchedRuleIds: ['RULE-LOCATOR-TIMEOUT'],
      isAuthoritative: true,
    },
  });

  // Cleanup handler
  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise<void>(res => server!.close(() => res()));

    await prisma.structuredBugReport.deleteMany({ where: { projectId } });
    await prisma.confidenceAssessment.deleteMany({ where: { projectId } });
    await prisma.defectClusterMembership.deleteMany({ where: { projectId } });
    await prisma.defectCluster.deleteMany({ where: { projectId } });
    await prisma.failureImpactAssessment.deleteMany({ where: { projectId } });
    await prisma.failureRootCauseAnalysis.deleteMany({ where: { projectId } });
    await prisma.failureReproductionAttempt.deleteMany({ where: { projectId } });
    await prisma.failureClassification.deleteMany({ where: { projectId } });
    await prisma.failureEvidenceReference.deleteMany({ where: { projectId } });
    await prisma.stepExecutionRecord.deleteMany({ where: { project: { id: projectId } } });
    await prisma.failureCase.deleteMany({ where: { projectId } });
    await prisma.testCaseExecution.deleteMany({ where: { projectId } });
    await prisma.testRun.deleteMany({ where: { projectId } });
    await prisma.executableTestPlan.deleteMany({ where: { projectId } });
    await prisma.testCasePrecondition.deleteMany({ where: { testCase: { projectId } } });
    await prisma.testCase.deleteMany({ where: { projectId } });
    await prisma.requirement.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  });

  await t.test(
    'Certify Journey 1: Generate CONFIRMED_APPLICATION_DEFECT Bug Report from Real Browser Telemetry',
    async () => {
      const report = await service.createBugReport({
        projectId,
        failureCaseId: fc1.id,
      });

      // 1. Report numbering and status
      assert.strictEqual(report.reportNumber, 'BUG-000001');
      assert.strictEqual(report.revision, 1);
      assert.strictEqual(report.status, 'READY');

      // 2. Defect state and application defect flag
      assert.strictEqual(report.defectState, 'CONFIRMED_APPLICATION_DEFECT');
      assert.strictEqual(report.isApplicationDefect, true);

      // 3. Traceability
      assert.strictEqual(report.requirementKey, 'REQ-CHECKOUT-001');
      assert.strictEqual(report.requirementVersion, 1);
      assert.strictEqual(report.testCaseKey, tc1.testCaseKey);
      assert.strictEqual(report.testCaseVersion, 1);
      assert.strictEqual(report.preconditions.length, 2);
      assert.ok(report.preconditions.some(p => p.includes('active cart items')));

      // 4. Derived reproduction steps
      assert.strictEqual(report.reproductionSteps.length, 2);
      assert.strictEqual(report.failedStepIndex, 2);
      assert.strictEqual(report.reproductionSteps[0]?.actionType, 'NAVIGATE');
      assert.strictEqual(report.reproductionSteps[1]?.actionType, 'CLICK');
      assert.strictEqual(report.reproductionSteps[1]?.status, 'FAILED');

      // 5. Root-Cause Hypothesis with strict disclaimer
      assert.ok(report.rootCauseHypothesis !== null);
      assert.ok(report.rootCauseHypothesis?.includes('HYPOTHESIS'));
      assert.strictEqual(report.probableLayer, 'BACKEND');
      assert.strictEqual(report.probableComponent, 'OrderProcessingService');

      // 6. Impact & Cluster
      assert.strictEqual(report.severity, 'HIGH');
      assert.strictEqual(report.priority, 'P1_URGENT');
      assert.strictEqual(report.clusterKey, 'CLUSTER-CHECKOUT-500');
      assert.strictEqual(report.clusterMemberCount, 3);
      assert.strictEqual(report.calibratedScore, 0.93);

      // 7. Verified Evidence Artifacts
      assert.strictEqual(report.evidenceReferences.length, 2);
      const screenshotRef = report.evidenceReferences.find(r => r.evidenceType === 'SCREENSHOT');
      assert.ok(screenshotRef);
      assert.strictEqual(screenshotRef.sha256, screenshotSha);
      assert.strictEqual(screenshotRef.integrityStatus, 'VERIFIED');

      // 8. Secret Redaction: No raw tokens or passwords leaked
      assert.ok(!report.reportMarkdown.includes('super-secret-jwt-token-xyz'));
      assert.ok(!report.reportMarkdown.includes('sk-topsecret-password-12345'));
      assert.ok(!report.reportMarkdown.includes('sensitive-session-cookie-998877'));
      assert.ok(!report.summary.includes('secret-auth-token-123456789'));

      // 9. Markdown formatting & fingerprint
      assert.ok(report.reportMarkdown.includes('# BUG-000001'));
      assert.ok(report.reportMarkdown.includes('## Reproduction Steps'));
      assert.ok(report.reportMarkdown.includes('## Root-Cause Hypothesis'));
      assert.ok(report.reportFingerprint.length === 64);
    },
  );

  await t.test(
    'Certify Journey 2: Generate Non-Application DIAGNOSTIC REPORT for Automation Failure',
    async () => {
      const report = await service.createBugReport({
        projectId,
        failureCaseId: fc2.id,
      });

      // Sequential numbering
      assert.strictEqual(report.reportNumber, 'BUG-000002');
      assert.strictEqual(report.revision, 1);

      // Must be classified as AUTOMATION_FAILURE, NOT an application defect
      assert.strictEqual(report.defectState, 'AUTOMATION_FAILURE');
      assert.strictEqual(report.isApplicationDefect, false);

      // Markdown must clearly indicate Diagnostic Failure Report
      assert.ok(report.reportMarkdown.includes('Diagnostic Report'));
      assert.ok(report.reportMarkdown.includes('AUTOMATION_FAILURE'));
    },
  );

  await t.test(
    'Certify Journey 3: Bug Report Regeneration and Auditable Revision History',
    async () => {
      // Regenerate report for fc1 with reason
      const rev2 = await service.regenerateBugReport({
        projectId,
        failureCaseId: fc1.id,
        reason: 'Re-evaluating bug report after upstream triage log ingestion',
        titleOverride: 'Checkout 500 Internal Server Error (Triage Certified)',
      });

      assert.strictEqual(rev2.reportNumber, 'BUG-000001');
      assert.strictEqual(rev2.revision, 2);
      assert.strictEqual(rev2.title, 'Checkout 500 Internal Server Error (Triage Certified)');
      assert.strictEqual(
        rev2.regenerationReason,
        'Re-evaluating bug report after upstream triage log ingestion',
      );

      // Check Rev 1 was superseded
      const history = await service.listBugReportHistory({
        projectId,
        failureCaseId: fc1.id,
      });

      assert.strictEqual(history.length, 2);
      const rev1 = history.find(r => r.revision === 1);
      assert.ok(rev1);
      assert.strictEqual(rev1.status, 'SUPERSEDED');
      assert.strictEqual(rev1.supersededById, rev2.id);
      assert.strictEqual(rev2.supersedesId, rev1.id);
    },
  );
});
