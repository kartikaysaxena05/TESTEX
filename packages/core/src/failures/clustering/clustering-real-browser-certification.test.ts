/**
 * @file packages/core/src/failures/clustering/clustering-real-browser-certification.test.ts
 * Real Playwright Chromium browser pipeline certification test for Defect Clustering (V6 Phase 85).
 * Executes real browser journeys hitting a live HTTP server:
 * - Journey 1: Desktop checkout encounters backend HTTP 500 at /api/orders
 * - Journey 2: Mobile checkout encounters same backend HTTP 500 at /api/orders
 * - Journey 3: Catalog navigation encounters client-side locator timeout (automation flaw)
 * Certifies that Journey 1 and Journey 2 are clustered together as duplicates,
 * while Journey 3 is isolated into a distinct cluster.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/index.js';
import { DefectClusteringService } from './defect-clustering-service.js';

test('DefectClustering: Real Playwright Browser Pipeline Certification', async t => {
  const prisma = getPrismaClient() as PrismaClient;
  assert.ok(prisma, 'Prisma client required for real browser certification test');

  let server: http.Server | null = null;
  let serverUrl = '';
  let browser: Browser | null = null;

  const projectId = crypto.randomUUID();
  const service = new DefectClusteringService(prisma);

  // 1. Setup local HTTP test server
  await new Promise<void>(resolve => {
    server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/api/orders' && req.method === 'POST') {
        // Shared backend failure
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Internal Server Error: Database deadlock in OrderService.saveOrder',
            code: 'DB_DEADLOCK',
            statusCode: 500,
          }),
        );
        return;
      }

      if (req.url === '/checkout/desktop') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Desktop Checkout</title></head>
            <body>
              <h1>Desktop Checkout</h1>
              <button id="pay-btn">Complete Payment</button>
              <div id="status"></div>
              <script>
                document.getElementById('pay-btn').addEventListener('click', async () => {
                  try {
                    const resp = await fetch('/api/orders', { method: 'POST' });
                    if (!resp.ok) {
                      const data = await resp.json();
                      document.getElementById('status').innerText = 'ERROR: ' + data.error;
                      window.__lastError = data.error;
                    }
                  } catch (e) {
                    document.getElementById('status').innerText = 'NETWORK_ERROR: ' + e.message;
                  }
                });
              </script>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/checkout/mobile') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Mobile Checkout</title></head>
            <body>
              <h1>Mobile Checkout</h1>
              <button id="mobile-pay-btn">Pay Now</button>
              <div id="status"></div>
              <script>
                document.getElementById('mobile-pay-btn').addEventListener('click', async () => {
                  try {
                    const resp = await fetch('/api/orders', { method: 'POST' });
                    if (!resp.ok) {
                      const data = await resp.json();
                      document.getElementById('status').innerText = 'ERROR: ' + data.error;
                      window.__lastError = data.error;
                    }
                  } catch (e) {
                    document.getElementById('status').innerText = 'NETWORK_ERROR: ' + e.message;
                  }
                });
              </script>
            </body>
          </html>
        `);
        return;
      }

      if (req.url === '/catalog') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Product Catalog</title></head>
            <body>
              <h1>Products</h1>
              <p>Standard product list without missing buttons</p>
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

  // 2. Launch headless browser
  browser = await chromium.launch({ headless: true });

  // 3. Create Project in DB
  await prisma.project.create({
    data: { id: projectId, name: `Real Browser Cluster Certification ${Date.now()}` },
  });

  const tc = await prisma.testCase.create({
    data: {
      projectId,
      testCaseKey: `TC-BROWSER-${Date.now()}`,
      title: 'Browser Journey Suite',
      objective: 'Verify duplicate failure detection across real browser executions',
      currentVersionNumber: 1,
    },
  });

  const plan = await prisma.executableTestPlan.create({
    data: {
      projectId,
      testCaseId: tc.id,
      testCaseVersionNumber: 1,
      planFingerprint: `plan-browser-${Date.now()}`,
      summary: 'Plan Browser',
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

  // Journey 1 Execution: Desktop Checkout -> 500 Error
  const page1 = await browser.newPage();
  await page1.goto(`${serverUrl}/checkout/desktop`);
  await page1.click('#pay-btn');
  await page1.waitForFunction(() => (window as any).__lastError !== undefined, null, {
    timeout: 5000,
  });
  const errorMsg1 = await page1.evaluate(() => (window as any).__lastError);
  await page1.close();

  const exec1 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 1,
      status: 'FAILED',
      errorMessage: errorMsg1,
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
      title: 'Desktop Checkout Payment Failed',
      errorMessage: errorMsg1,
      failureSignature: 'sig-orders-deadlock',
      isEligible: true,
      metadataJson: {
        endpoint: '/api/orders',
        httpStatus: 500,
      },
    },
  });

  // Attach evidence and technical localization for Journey 1
  await prisma.failureTechnicalLocalization.create({
    data: {
      projectId,
      failureCaseId: fc1.id,
      testCaseId: tc.id,
      primaryLayer: 'BACKEND_SERVICE',
      primaryTargetType: 'REPOSITORY_FILE',
      primaryTargetIdentifier: 'src/orders/order.service.ts',
      matchedFilePath: 'src/orders/order.service.ts',
      matchedSymbolName: 'OrderService.saveOrder',
      httpEndpoint: '/api/orders',
      httpStatusCode: 500,
      localizationRationale: 'Deadlock encountered inside OrderService.saveOrder',
      localizationFingerprint: `loc-j1-${Date.now()}`,
      isAuthoritative: true,
    },
  });

  await prisma.failureDomainSeparation.create({
    data: {
      projectId,
      failureCaseId: fc1.id,
      testCaseId: tc.id,
      domain: 'APPLICATION_DEFECT_CANDIDATE',
      primaryRationale: 'Database deadlock is an application backend bug',
      decisionExplanation: '500 error from orders endpoint indicates application defect',
      separationFingerprint: `sep-j1-${Date.now()}`,
      isAuthoritative: true,
    },
  });

  // Journey 2 Execution: Mobile Checkout -> same 500 Error
  const page2 = await browser.newPage();
  await page2.goto(`${serverUrl}/checkout/mobile`);
  await page2.click('#mobile-pay-btn');
  await page2.waitForFunction(() => (window as any).__lastError !== undefined, null, {
    timeout: 5000,
  });
  const errorMsg2 = await page2.evaluate(() => (window as any).__lastError);
  await page2.close();

  const exec2 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 2,
      status: 'FAILED',
      errorMessage: errorMsg2,
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
      stepIndex: 1,
      title: 'Mobile Checkout Payment Failed',
      errorMessage: errorMsg2,
      failureSignature: 'sig-orders-deadlock',
      isEligible: true,
      metadataJson: {
        endpoint: '/api/orders',
        httpStatus: 500,
      },
    },
  });

  await prisma.failureTechnicalLocalization.create({
    data: {
      projectId,
      failureCaseId: fc2.id,
      testCaseId: tc.id,
      primaryLayer: 'BACKEND_SERVICE',
      primaryTargetType: 'REPOSITORY_FILE',
      primaryTargetIdentifier: 'src/orders/order.service.ts',
      matchedFilePath: 'src/orders/order.service.ts',
      matchedSymbolName: 'OrderService.saveOrder',
      httpEndpoint: '/api/orders',
      httpStatusCode: 500,
      localizationRationale: 'Deadlock encountered inside OrderService.saveOrder',
      localizationFingerprint: `loc-j2-${Date.now()}`,
      isAuthoritative: true,
    },
  });

  await prisma.failureDomainSeparation.create({
    data: {
      projectId,
      failureCaseId: fc2.id,
      testCaseId: tc.id,
      domain: 'APPLICATION_DEFECT_CANDIDATE',
      primaryRationale: 'Database deadlock is an application backend bug',
      decisionExplanation: '500 error from orders endpoint indicates application defect',
      separationFingerprint: `sep-j2-${Date.now()}`,
      isAuthoritative: true,
    },
  });

  // Journey 3 Execution: Catalog -> Locator Timeout (Automation Flaw)
  const page3 = await browser.newPage();
  await page3.goto(`${serverUrl}/catalog`);
  let locatorError = '';
  try {
    await page3.click('#non-existent-button-99', { timeout: 1000 });
  } catch (e: any) {
    locatorError = e.message;
  }
  await page3.close();

  const exec3 = await prisma.testCaseExecution.create({
    data: {
      projectId,
      testRunId: tr.id,
      testCaseId: tc.id,
      executableTestPlanId: plan.id,
      testCaseVersionNumber: 1,
      attempt: 3,
      status: 'FAILED',
      errorMessage: locatorError,
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
      stepIndex: 2,
      title: 'Catalog Button Not Found',
      errorMessage: locatorError,
      failureSignature: `sig-j3-${Date.now()}`,
      isEligible: true,
    },
  });

  await prisma.failureDomainSeparation.create({
    data: {
      projectId,
      failureCaseId: fc3.id,
      testCaseId: tc.id,
      domain: 'AUTOMATION_FAILURE',
      primaryRationale: 'Timeout waiting for non-existent locator is an automation failure',
      decisionExplanation: 'Client script failed to locate element',
      separationFingerprint: `sep-j3-${Date.now()}`,
      isAuthoritative: true,
    },
  });

  // Run Clustering across all 3 failures
  await t.test(
    'Real Browser Certification: Group duplicates and isolate automation failure',
    async () => {
      const clusters = await service.clusterDefects({
        projectId,
        failureCaseIds: [fc1.id, fc2.id, fc3.id],
      });

      assert.ok(clusters.length >= 1);

      // 1. Verify fc1 and fc2 are grouped together in the same cluster
      const mem1 = await service.getFailureMembership({ projectId, failureCaseId: fc1.id });
      const mem2 = await service.getFailureMembership({ projectId, failureCaseId: fc2.id });

      assert.ok(mem1, 'Failure 1 must have a cluster membership');
      assert.ok(mem2, 'Failure 2 must have a cluster membership');
      assert.equal(
        mem1.clusterId,
        mem2.clusterId,
        'Failures 1 and 2 must share the exact same defect cluster',
      );

      // Verify relationship type is duplicate
      assert.ok(
        mem1.relationshipType === 'EXACT_DUPLICATE' ||
          mem1.relationshipType === 'PROBABLE_DUPLICATE',
      );
      assert.ok(
        mem2.relationshipType === 'EXACT_DUPLICATE' ||
          mem2.relationshipType === 'PROBABLE_DUPLICATE',
      );

      // 2. Verify fc3 (automation locator flaw) is NOT in the payment cluster
      const clusterWith1 = await service.getCluster({ projectId, clusterId: mem1.clusterId });
      assert.ok(clusterWith1);
      const memberIds = (clusterWith1.memberships || []).map(m => m.failureCaseId);
      assert.ok(
        !memberIds.includes(fc3.id),
        'Automation locator failure fc3 must NOT be merged into application defect cluster',
      );

      // 3. Verify representative failure is valid
      assert.ok(
        clusterWith1.representativeFailureId === fc1.id ||
          clusterWith1.representativeFailureId === fc2.id,
      );

      // 4. Verify 64-char cluster fingerprint
      assert.equal(clusterWith1.clusterFingerprint.length, 64);
    },
  );

  // Teardown
  if (browser) await browser.close();
  if (server) {
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
});
