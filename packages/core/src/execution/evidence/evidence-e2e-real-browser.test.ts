/**
 * @file packages/core/src/execution/evidence/evidence-e2e-real-browser.test.ts
 * Comprehensive real-browser End-to-End integration test suite for Phase 70 evidence collectors.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { EvidenceStorageService } from './evidence-storage-service.js';
import { ExecutionEvidenceService } from './execution-evidence-service.js';
import { EvidenceCaptureCoordinator } from './evidence-capture-coordinator.js';

describe('Real Browser Evidence Collection E2E Suite (V5 Phase 70)', () => {
  let server: http.Server;
  let serverUrl: string;
  let prisma: NonNullable<ReturnType<typeof getPrismaClient>>;
  let tempStorageRoot: string;
  let storageService: EvidenceStorageService;
  let evidenceService: ExecutionEvidenceService;

  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  let testProjectId: string;
  let otherProjectId: string;
  let testRunId: string;
  let testExecutionId: string;
  let stepExecutionId: string;

  before(async () => {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('Prisma client unavailable');
    }
    prisma = client;

    tempStorageRoot = path.join(
      os.tmpdir(),
      `ai-quality-e2e-evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempStorageRoot, { recursive: true });

    storageService = new EvidenceStorageService(tempStorageRoot);
    evidenceService = new ExecutionEvidenceService({ prisma, storageService });

    testProjectId = crypto.randomUUID();
    otherProjectId = crypto.randomUUID();
    testRunId = crypto.randomUUID();
    testExecutionId = crypto.randomUUID();
    stepExecutionId = crypto.randomUUID();

    // 1. Setup local HTTP test server
    server = http.createServer((req, res) => {
      const url = req.url || '';
      if (url.startsWith('/api/data')) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'session=secret-session-token-999; Path=/',
        });
        res.end(JSON.stringify({ status: 'ok', items: [1, 2, 3] }));
      } else if (url.startsWith('/api/fail-500')) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      } else if (url.startsWith('/api/fail-404')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Resource Not Found' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>E2E Evidence Target Page</title></head>
            <body style="padding: 20px; font-family: sans-serif;">
              <h1>Autonomous Testing Target Application</h1>
              <form id="authForm">
                <label>Username: <input type="text" id="username" value="qa_tester" /></label><br/><br/>
                <label>Password: <input type="password" id="password" value="SuperSecretPassword99!" /></label><br/><br/>
                <button type="button" id="submitBtn" data-token="secret-auth-token-456">Submit</button>
              </form>
            </body>
          </html>
        `);
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Seed Database Entities
    await prisma.project.createMany({
      data: [
        {
          id: testProjectId,
          name: 'Primary E2E Project',
        },
        {
          id: otherProjectId,
          name: 'Unauthorized Isolated Project',
        },
      ],
    });

    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Staging',
        baseUrl: 'https://staging.example.com',
      },
    });

    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'E2E Requirement',
        originalText: 'Original text',
      },
    });

    const testCase = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'E2E Test Case',
        objective: 'Objective for E2E',
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });

    const testPlan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        environmentId: env.id,
        planFingerprint: 'dummy-fp-e2e',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });

    await prisma.testRun.create({
      data: {
        id: testRunId,
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseTitle: testCase.title,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlan.id,
        planFingerprint: testPlan.planFingerprint,
        status: 'RUNNING',
        browserEngine: 'chromium',
      },
    });

    await prisma.testCaseExecution.create({
      data: {
        id: testExecutionId,
        projectId: testProjectId,
        testRunId,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: testPlan.id,
        status: 'RUNNING',
        browserEngine: 'chromium',
        attempt: 1,
      },
    });

    await prisma.stepExecutionRecord.create({
      data: {
        id: stepExecutionId,
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        stepIndex: 1,
        actionType: 'ASSERT_EXISTS',
        targetSummary: 'button#missingConfirmButton',
        status: 'FAILED',
      },
    });

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      await fs.rm(tempStorageRoot, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  it('executes full failure lifecycle: captures Screenshot, Console, Network, DOM & Trace with secret redaction and 0o444 immutability', async () => {
    const coordinator = new EvidenceCaptureCoordinator({
      evidenceService,
      config: {
        captureFailureScreenshot: true,
        captureConsole: true,
        captureNetwork: true,
        captureDom: true,
        traceMode: 'FAILURE_ONLY',
      },
    });

    // 1. Initialize session monitoring
    await coordinator.initializeSession({
      context,
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
    });

    // 2. Perform actions on live page
    await page.goto(`${serverUrl}/`);

    // Emit console logs and uncaught error
    await page.evaluate(() => {
      console.log('App initialization started');
      console.warn('Backend latency elevated');
      console.error('Failed with Bearer token_secret_xyz123');
      setTimeout(() => {
        throw new Error('Uncaught async component exception');
      }, 0);
    });

    // Perform network calls with credentials
    await page.evaluate(url => {
      fetch(`${url}/api/data?auth_token=super_secret_token_abc&password=SecretPass123!`, {
        headers: {
          Authorization: 'Bearer test-jwt-token-12345',
          Cookie: 'session_id=secret-cookie-777',
        },
      });
      fetch(`${url}/api/fail-500`);
      fetch(`${url}/api/fail-404`);
    }, serverUrl);

    await page.waitForTimeout(100);

    // 3. Simulate step assertion failure and capture evidence bundle
    const failureBundle = await coordinator.captureFailureEvidence({
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      stepExecutionId,
      stepIndex: 1,
      errorSummary: 'Assertion failed: expected locator button#missingConfirmButton to exist',
      failedElementContext: {
        locatorStrategy: 'CSS',
        targetSelector: 'button#missingConfirmButton',
        role: 'button',
        accessibleName: 'Confirm Transaction',
        isVisible: false,
      },
    });

    assert.ok(failureBundle);
    assert.equal(failureBundle.status, 'COMPLETE');
    assert.equal(failureBundle.executionId, testExecutionId);
    assert.equal(failureBundle.stepExecutionId, stepExecutionId);

    // 4. Query and verify all stored evidence artifacts
    const artifactList = await evidenceService.listArtifacts({
      projectId: testProjectId,
      bundleId: failureBundle.id,
    });

    assert.equal(artifactList.total, 5); // SCREENSHOT, CONSOLE_LOG, NETWORK_LOG, DOM_SNAPSHOT, PLAYWRIGHT_TRACE
    const artifactTypes = artifactList.items.map(a => a.artifactType);
    assert.ok(artifactTypes.includes('SCREENSHOT'));
    assert.ok(artifactTypes.includes('CONSOLE_LOG'));
    assert.ok(artifactTypes.includes('NETWORK_LOG'));
    assert.ok(artifactTypes.includes('DOM_SNAPSHOT'));
    assert.ok(artifactTypes.includes('PLAYWRIGHT_TRACE'));

    // 6. Verify filesystem storage and cryptographic SHA-256 integrity
    for (const artifact of artifactList.items) {
      const managedPath = storageService.resolveManagedPath(
        testProjectId,
        testRunId,
        testExecutionId,
        artifact.storageIdentity,
      );

      const stat = await fs.stat(managedPath);
      assert.ok(stat.isFile());
      assert.equal(stat.size, artifact.byteSize);

      // Verify read-only permissions (0o444)
      const mode = stat.mode & 0o777;
      assert.equal(mode, 0o444);

      // Verify SHA-256 integrity check
      const integrity = await storageService.verifyArtifactIntegrity({
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        storageIdentity: artifact.storageIdentity,
        expectedSha256: artifact.sha256,
      });
      assert.equal(integrity.isValid, true);
    }

    // 7. Security Audit: Verify secrets are redacted in stored files on disk
    const consoleArtifact = artifactList.items.find(a => a.artifactType === 'CONSOLE_LOG');
    assert.ok(consoleArtifact);
    const consoleFile = await storageService.readArtifact({
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      storageIdentity: consoleArtifact.storageIdentity,
    });
    const consoleText = consoleFile.buffer.toString('utf8');
    assert.ok(!consoleText.includes('token_secret_xyz123'));
    assert.ok(consoleText.includes('Bearer ***'));

    const networkArtifact = artifactList.items.find(a => a.artifactType === 'NETWORK_LOG');
    assert.ok(networkArtifact);
    const networkFile = await storageService.readArtifact({
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      storageIdentity: networkArtifact.storageIdentity,
    });
    const networkText = networkFile.buffer.toString('utf8');
    assert.ok(!networkText.includes('super_secret_token_abc'));
    assert.ok(!networkText.includes('test-jwt-token-12345'));
    assert.ok(!networkText.includes('secret-cookie-777'));
    assert.ok(networkText.includes('auth_token=***'));

    const domArtifact = artifactList.items.find(a => a.artifactType === 'DOM_SNAPSHOT');
    assert.ok(domArtifact);
    const domFile = await storageService.readArtifact({
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      storageIdentity: domArtifact.storageIdentity,
    });
    const domText = domFile.buffer.toString('utf8');
    assert.ok(!domText.includes('SuperSecretPassword99!'));
    assert.ok(!domText.includes('secret-auth-token-456'));
    assert.ok(domText.includes('value="***"'));
    assert.ok(domText.includes('data-token="***"'));

    // 8. Multi-tenant isolation test: Unauthorized project cannot query or read bundle/artifacts
    await assert.rejects(
      async () => {
        await evidenceService.getBundle({
          projectId: otherProjectId,
          bundleId: failureBundle.id,
        });
      },
      (err: any) =>
        err.code === 'EVIDENCE_BUNDLE_NOT_FOUND' || err.code === 'EVIDENCE_OWNERSHIP_MISMATCH',
    );

    coordinator.dispose();
  });
});
