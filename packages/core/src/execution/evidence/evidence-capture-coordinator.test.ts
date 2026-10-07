/**
 * @file packages/core/src/execution/evidence/evidence-capture-coordinator.test.ts
 * Unit and orchestration tests for EvidenceCaptureCoordinator.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getPrismaClient } from '../../database/client.js';
import { EvidenceStorageService } from './evidence-storage-service.js';
import { ExecutionEvidenceService } from './execution-evidence-service.js';
import { EvidenceCaptureCoordinator } from './evidence-capture-coordinator.js';

describe('EvidenceCaptureCoordinator Orchestration Tests (V5 Phase 70)', () => {
  let prisma: NonNullable<ReturnType<typeof getPrismaClient>>;
  let tempStorageRoot: string;
  let storageService: EvidenceStorageService;
  let evidenceService: ExecutionEvidenceService;

  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  let testProjectId: string;
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
      `ai-quality-coord-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tempStorageRoot, { recursive: true });

    storageService = new EvidenceStorageService(tempStorageRoot);
    evidenceService = new ExecutionEvidenceService({ prisma, storageService });

    testProjectId = crypto.randomUUID();
    testRunId = crypto.randomUUID();
    testExecutionId = crypto.randomUUID();
    stepExecutionId = crypto.randomUUID();

    // 1. Create project
    await prisma.project.create({
      data: {
        id: testProjectId,
        name: 'Coordinator Test Project',
      },
    });

    // 2. Create environment
    const env = await prisma.projectEnvironment.create({
      data: {
        projectId: testProjectId,
        name: 'Staging',
        baseUrl: 'https://staging.example.com',
      },
    });

    // 3. Create requirement
    const req = await prisma.requirement.create({
      data: {
        projectId: testProjectId,
        requirementKey: `REQ-${Date.now().toString(36).toUpperCase()}`,
        title: 'Coordinator Req',
        originalText: 'Original requirement text',
      },
    });

    // 4. Create test case
    const testCase = await prisma.testCase.create({
      data: {
        projectId: testProjectId,
        testCaseKey: `TC-${Date.now().toString(36).toUpperCase()}`,
        title: 'Coordinator Test Case',
        objective: 'Test coordinator flow',
        sourceRequirementId: req.id,
        sourceRequirementVersionNumber: 1,
      },
    });

    // 5. Create plan
    const testPlan = await prisma.executableTestPlan.create({
      data: {
        projectId: testProjectId,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        environmentId: env.id,
        planFingerprint: 'dummy-fp-coord',
        compilerVersion: '1.0.0',
        planSchemaVersion: 1,
        status: 'VALID',
        isExecutable: true,
      },
    });

    // 6. Create TestRun
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

    // 7. Create TestCaseExecution
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

    // 8. Create StepExecutionRecord
    await prisma.stepExecutionRecord.create({
      data: {
        id: stepExecutionId,
        projectId: testProjectId,
        testRunId,
        executionId: testExecutionId,
        stepIndex: 1,
        actionType: 'CLICK',
        targetSummary: 'button#login',
        status: 'FAILED',
      },
    });

    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await browser?.close();
    try {
      await fs.rm(tempStorageRoot, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  });

  beforeEach(async () => {
    context = await browser.newContext();
    page = await context.newPage();
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Evidence Capture Coordinator Test</title></head>
        <body>
          <h1>Execution Failed Here</h1>
          <input type="password" id="userPassword" value="top_secret_123!" />
        </body>
      </html>
    `);
  });

  it('orchestrates all collectors on failure and persists COMPLETE evidence bundle', async () => {
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

    await coordinator.initializeSession({
      context,
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
    });

    // Simulate page activity
    await page.evaluate(() => {
      console.warn('Simulated diagnostic console warning');
    });

    // Trigger failure capture
    const bundle = await coordinator.captureFailureEvidence({
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      stepExecutionId,
      stepIndex: 1,
      errorSummary: 'Assertion failed: expected button visible',
    });

    assert.ok(bundle);
    assert.equal(bundle.status, 'COMPLETE');
    assert.equal(bundle.projectId, testProjectId);
    assert.equal(bundle.executionId, testExecutionId);
    assert.equal(bundle.stepExecutionId, stepExecutionId);

    // Verify bundle has artifacts (screenshot, console, DOM, trace)
    const artifacts = await evidenceService.listArtifacts({
      projectId: testProjectId,
      bundleId: bundle.id,
    });

    assert.ok(artifacts.items.length >= 4);
    const types = artifacts.items.map(a => a.artifactType);
    assert.ok(types.includes('SCREENSHOT'));
    assert.ok(types.includes('CONSOLE_LOG'));
    assert.ok(types.includes('DOM_SNAPSHOT'));
    assert.ok(types.includes('PLAYWRIGHT_TRACE'));

    coordinator.dispose();
    await context.close();
  });

  it('marks bundle status as PARTIAL when a non-critical collector encounters an issue', async () => {
    // Inject mock screenshot collector that fails
    const coordinator = new EvidenceCaptureCoordinator({
      evidenceService,
      screenshotCollector: {
        captureFailureScreenshot: async () => ({
          success: false,
          mimeType: 'image/png',
          byteSize: 0,
          isFullPage: false,
          isMasked: false,
          capturedAt: new Date().toISOString(),
          errorMessage: 'Simulated screenshot failure',
        }),
        captureStepScreenshot: async () => ({
          success: false,
          mimeType: 'image/png',
          byteSize: 0,
          isFullPage: false,
          isMasked: false,
          capturedAt: new Date().toISOString(),
          errorMessage: 'Simulated screenshot failure',
        }),
      },
      config: {
        captureFailureScreenshot: true,
        captureConsole: true,
        captureNetwork: true,
        captureDom: true,
      },
    });

    await coordinator.initializeSession({
      context,
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
    });

    const bundle = await coordinator.captureFailureEvidence({
      page,
      projectId: testProjectId,
      testRunId,
      executionId: testExecutionId,
      stepExecutionId,
      stepIndex: 1,
      errorSummary: 'Locator timed out',
    });

    assert.ok(bundle);
    assert.equal(bundle.status, 'PARTIAL');

    coordinator.dispose();
    await context.close();
  });
});
