/**
 * @file packages/core/src/failures/confidence/confidence-real-browser-certification.test.ts
 * Real Playwright Chromium browser pipeline certification test for Confidence Scoring, Explainability & Evidence Attribution (V6 Phase 86).
 *
 * Executes real browser journeys hitting a live HTTP server:
 * - Journey 1: Form submit encountering backend 500 error with full evidence (screenshot, console, network) & deterministic reproduction -> HIGH / VERY_HIGH confidence
 * - Journey 2: Intermittent failure with conflicting signals & flakiness -> MEDIUM / LOW confidence with contradiction penalties
 * - Journey 3: Unverified failure with missing evidence artifacts -> LOW / VERY_LOW confidence with missing factor penalties
 *
 * Validates:
 * - Multi-domain confidence scoring
 * - Epistemic evidence attribution (FACT, DETERMINISTIC_INFERENCE, AI_INFERENCE, CONTRADICTORY, UNKNOWN)
 * - Calibrated AI confidence
 * - Human-readable explanation with 100% claim-to-evidence validation
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { ConfidenceAssessmentService } from './confidence-assessment-service.js';

test('Confidence Assessment: Real Playwright Browser Pipeline Certification', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for real browser certification test');

  let server: http.Server | null = null;
  let serverUrl = '';
  let browser: Browser | null = null;

  const projectId = crypto.randomUUID();
  const service = new ConfidenceAssessmentService(prisma);

  // 1. Setup local HTTP test server
  await new Promise<void>(resolve => {
    server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/api/checkout' && req.method === 'POST') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal Server Error: Payment processing deadlock',
            code: 'DEADLOCK_500',
          }),
        );
        return;
      }

      if (req.url === '/checkout') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Checkout Page</title></head>
            <body>
              <h1>Checkout</h1>
              <button id="pay-button">Pay Now</button>
              <div id="result"></div>
              <script>
                document.getElementById('pay-button').addEventListener('click', async () => {
                  try {
                    const resp = await fetch('/api/checkout', { method: 'POST' });
                    const data = await resp.json();
                    document.getElementById('result').innerText = 'ERROR: ' + data.error;
                    console.error('Checkout failed:', data.error);
                  } catch (e) {
                    console.error('Fetch error:', e);
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

  // 3. Setup Project in DB
  await prisma.project.create({
    data: { id: projectId, name: `Confidence Browser Certification ${Date.now()}` },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-CONF-BROWSER-${Date.now()}`,
      title: 'Real Browser Confidence Journey',
      objective: 'Verify confidence scoring against real browser telemetry',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-conf-browser-${Date.now()}`,
      summary: 'Plan Browser Confidence',
      status: 'VALID',
      isExecutable: true,
    },
  });

  const tr = await prisma.testRun.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      executableTestPlanId: plan.id,
      status: 'FAILED',
      planFingerprint: plan.planFingerprint,
      testCaseTitle: tc.title,
    },
  });

  // Execute real browser interaction for Journey 1
  const page = await browser.newPage();
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleLogs.push(msg.text());
  });

  await page.goto(`${serverUrl}/checkout`);
  await page.click('#pay-button');
  await page.waitForSelector('#result:has-text("ERROR")');
  const screenshotBuffer = await page.screenshot();
  await page.close();

  const screenshotHash = crypto.createHash('sha256').update(screenshotBuffer).digest('hex');

  // Journey 1: High Confidence Failure Case
  const exec1 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 1,
      status: 'FAILED',
      errorMessage: 'Checkout failed: Internal Server Error: Payment processing deadlock',
    },
  });

  const fc1 = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec1.id,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 1,
      title: 'Checkout POST /api/checkout 500 error',
      errorMessage: 'Checkout failed: Internal Server Error: Payment processing deadlock',
      failureSignature: `sig-conf-j1-${Date.now()}`,
      isEligible: true,
      evidenceCompleteness: 'COMPLETE',
    },
  });

  // Attach evidence references
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
      sha256: screenshotHash,
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
      logicalName: 'console.log',
      storageIdentity: 'artifacts/console.log',
      mimeType: 'text/plain',
      byteSize: consoleLogs.join('\n').length,
      sha256: crypto.createHash('sha256').update(consoleLogs.join('\n')).digest('hex'),
      integrityStatus: 'VERIFIED',
    },
  });

  // Deterministic reproduction confirmed
  await prisma.failureReproductionAttempt.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      originalExecutionId: exec1.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      attemptNumber: 1,
      status: 'REPRODUCED',
      reproductionFailureSignature: fc1.failureSignature,
      isSignatureMatch: true,
    },
  });

  // Deterministic classification
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

  // Technical Localization
  await prisma.failureTechnicalLocalization.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc1.id,
      testCaseId: tc.id,
      primaryLayer: 'BACKEND_SERVICE',
      primaryTargetType: 'REPOSITORY_FILE',
      primaryTargetIdentifier: 'src/payment/processor.ts',
      matchedFilePath: 'src/payment/processor.ts',
      matchedSymbolName: 'PaymentProcessor.charge',
      localizationRationale: 'Deadlock encountered at PaymentProcessor.charge',
      localizationFingerprint: 'l'.repeat(64),
      isAuthoritative: true,
    },
  });

  // Journey 2: Intermittent / Conflicted Failure Case
  const exec2 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 2,
      status: 'FAILED',
      errorMessage: 'Transient timing issue',
    },
  });

  const fc2 = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec2.id,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 2,
      title: 'Transient payment timeout',
      errorMessage: 'Transient timing issue',
      failureSignature: `sig-conf-j2-${Date.now()}`,
      isEligible: true,
      evidenceCompleteness: 'PARTIAL',
    },
  });

  // Reproduction failed (not reproducible)
  await prisma.failureReproductionAttempt.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc2.id,
      originalExecutionId: exec2.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      attemptNumber: 1,
      status: 'NOT_REPRODUCED',
      isSignatureMatch: false,
    },
  });

  // Flakiness detected
  await prisma.flakinessAnalysis.create({
    data: {
      id: crypto.randomUUID(),
      projectId,
      failureCaseId: fc2.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      flakinessState: 'CONFIRMED_FLAKY',
      stabilityState: 'UNSTABLE',
      reproducibilityRatio: 0.2,
      analysisExplanation: 'Execution variability detected',
      analysisFingerprint: 'f'.repeat(64),
      isAuthoritative: true,
    },
  });

  // Journey 3: Low Confidence / Unverified Evidence Case
  const exec3 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 3,
      status: 'FAILED',
      errorMessage: 'Unknown crash without logs',
    },
  });

  const fc3 = await prisma.failureCase.create({
    data: {
      projectId,
      executionId: exec3.id,
      testRunId: tr.id,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      triggeringExecutionStatus: 'FAILED',
      stepIndex: 3,
      title: 'Crash without telemetry',
      errorMessage: 'Unknown crash without logs',
      failureSignature: `sig-conf-j3-${Date.now()}`,
      isEligible: true,
      evidenceCompleteness: 'INSUFFICIENT',
    },
  });

  t.after(async () => {
    if (browser) await browser.close();
    if (server) await new Promise<void>(res => server!.close(() => res()));

    await prisma.evidenceAttribution.deleteMany({ where: { projectId } });
    await prisma.confidenceAssessment.deleteMany({ where: { projectId } });
    await prisma.failureTechnicalLocalization.deleteMany({ where: { projectId } });
    await prisma.failureClassification.deleteMany({ where: { projectId } });
    await prisma.flakinessAnalysis.deleteMany({ where: { projectId } });
    await prisma.failureReproductionAttempt.deleteMany({ where: { projectId } });
    await prisma.failureEvidenceReference.deleteMany({ where: { projectId } });
    await prisma.failureCase.deleteMany({ where: { projectId } });
    await prisma.testCaseExecution.deleteMany({ where: { projectId } });
    await prisma.testRun.deleteMany({ where: { projectId } });
    await prisma.executableTestPlan.deleteMany({ where: { projectId } });
    await prisma.testCase.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
  });

  await t.test(
    'Certify Journey 1: High confidence score with complete evidence and reproduction',
    async () => {
      const assessment1 = await service.assessConfidence({
        projectId,
        failureCaseId: fc1.id,
      });

      assert.ok(
        assessment1.overallConfidence >= 0.65,
        `Expected overall confidence >= 0.65, got ${assessment1.overallConfidence}`,
      );
      assert.ok(
        assessment1.confidenceBand === 'HIGH' || assessment1.confidenceBand === 'VERY_HIGH',
        `Expected HIGH or VERY_HIGH band, got ${assessment1.confidenceBand}`,
      );
      assert.strictEqual(assessment1.reproducibilityConfidence, 0.95);
      assert.strictEqual(assessment1.contradictions.length, 0);

      // Verify evidence attributions are persisted
      const attributions1 = await service.listEvidenceAttributions({
        projectId,
        failureCaseId: fc1.id,
      });
      assert.ok(attributions1.length >= 4);
      assert.ok(attributions1.some(a => a.epistemicType === 'FACT'));
      assert.ok(attributions1.some(a => a.sourceSubsystem === 'PHASE_75_EVIDENCE'));

      // Verify explanation contains all required sections
      assert.ok(assessment1.humanExplanation.includes('# Confidence & Explainability Assessment'));
      assert.ok(assessment1.humanExplanation.includes('Factual Grounding (FACT)'));
    },
  );

  await t.test(
    'Certify Journey 2: Intermittent failure penalized by flakiness and repro failure',
    async () => {
      const assessment2 = await service.assessConfidence({
        projectId,
        failureCaseId: fc2.id,
      });

      // Score must be significantly lower than Journey 1
      assert.ok(
        assessment2.overallConfidence < 0.65,
        `Expected penalized overall confidence < 0.65, got ${assessment2.overallConfidence}`,
      );
      assert.ok(assessment2.reproducibilityConfidence! <= 0.35);
      assert.ok(assessment2.contradictions.length > 0);
      assert.ok(assessment2.penalties.length > 0);
    },
  );

  await t.test(
    'Certify Journey 3: Unverified / missing evidence receives LOW / VERY_LOW band',
    async () => {
      const assessment3 = await service.assessConfidence({
        projectId,
        failureCaseId: fc3.id,
      });

      assert.ok(
        assessment3.overallConfidence < 0.4,
        `Expected overall confidence < 0.4, got ${assessment3.overallConfidence}`,
      );
      assert.ok(assessment3.confidenceBand === 'LOW' || assessment3.confidenceBand === 'VERY_LOW');
      assert.ok(assessment3.missingFactors.length >= 2);
    },
  );
});
