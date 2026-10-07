/**
 * @file packages/core/src/execution/actions/action-execution-service.test.ts
 * Integration tests for ActionExecutionService sequence control, project isolation, and safety policies.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import crypto from 'node:crypto';
import { getPrismaClient } from '../../database/index.js';
import { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';
import { ActionExecutionService } from './action-execution-service.js';
import { CrossRunExecutionError } from './action-errors.js';
import type { ExecutablePlanStepDto } from '@ai-quality/contracts';

describe('ActionExecutionService Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let sessionManager: BrowserSessionManager;
  let actionService: ActionExecutionService;
  let projectIdA: string;
  let projectIdB: string;
  let testRunIdA: string;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  before(async () => {
    sessionManager = new BrowserSessionManager(prisma, new PlaywrightBrowserProvider());
    actionService = new ActionExecutionService(prisma, sessionManager);

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<body>
  <h1>Execution Sequence Test Page</h1>
  <button id="step1-btn" onclick="this.dataset.done = 'true'">Step 1</button>
  <button id="step3-btn" onclick="this.dataset.done = 'true'">Step 3</button>
</body>
</html>`);
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // 1. Create Project A and Project B
    const projectA = await prisma.project.create({
      data: { name: 'Action Test Project A', status: 'ACTIVE' },
    });
    projectIdA = projectA.id;

    const projectB = await prisma.project.create({
      data: { name: 'Action Test Project B', status: 'ACTIVE' },
    });
    projectIdB = projectB.id;

    // 2. Create Requirement and TestCase
    const req = await prisma.requirement.create({
      data: {
        projectId: projectIdA,
        title: 'Action Sequence Requirement',
        requirementKey: 'REQ-ACT-001',
        originalText: 'Test requirement',
      },
    });

    const testCase = await prisma.testCase.create({
      data: {
        projectId: projectIdA,
        sourceRequirementId: req.id,
        title: 'Action Sequence Test',
        testCaseKey: 'TC-ACT-001',
        objective: 'Test action sequence execution',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
      },
    });

    // 3. Create ExecutableTestPlan
    const plan = await prisma.executableTestPlan.create({
      data: {
        projectId: projectIdA,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        planFingerprint: 'fp-action-test-01',
        status: 'VALID',
      },
    });

    // 4. Create TestRun
    const testRun = await prisma.testRun.create({
      data: {
        projectId: projectIdA,
        testCaseId: testCase.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan.id,
        testCaseTitle: 'Action Sequence Test',
        planFingerprint: 'fp-action-test-01',
        status: 'RUNNING',
      },
    });
    testRunIdA = testRun.id;

    // 5. Create BrowserExecutionSession
    const session = await sessionManager.createSession({
      testRunId: testRunIdA,
      projectId: projectIdA,
      headless: true,
    });
    await session.page.goto(serverUrl);
  });

  after(async () => {
    await sessionManager.closeAllSessions();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (projectIdA) await prisma.project.delete({ where: { id: projectIdA } }).catch(() => {});
    if (projectIdB) await prisma.project.delete({ where: { id: projectIdB } }).catch(() => {});
  });

  it('executes a single action and returns typed ActionResultDto', async () => {
    const result = await actionService.executeAction({
      projectId: projectIdA,
      testRunId: testRunIdA,
      action: {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#step1-btn'] },
        description: 'Click step 1 button',
        isOptional: false,
        assertions: [],
      },
    });

    assert.equal(result.status, 'PASSED');
    assert.equal(result.actionType, 'CLICK');
    assert.ok(result.durationMs >= 0);
  });

  it('enforces multi-tenant project isolation and rejects cross-project execution', async () => {
    await assert.rejects(
      async () => {
        await actionService.executeAction({
          projectId: projectIdB, // Project B attempts to execute on Project A's run
          testRunId: testRunIdA,
          action: {
            id: crypto.randomUUID(),
            sequence: 1,
            action: 'CLICK',
            target: { kind: 'CONTROL', locatorHints: ['#step1-btn'] },
            description: 'Attempt cross project click',
            isOptional: false,
            assertions: [],
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof CrossRunExecutionError);
        assert.equal((err as CrossRunExecutionError).code, 'CROSS_RUN_EXECUTION_ERROR');
        return true;
      },
    );
  });

  it('executes sequential steps with stop-on-failure policy', async () => {
    const steps: ExecutablePlanStepDto[] = [
      {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#step1-btn'] },
        description: 'Step 1: Valid Click',
        isOptional: false,
        assertions: [],
      },
      {
        id: crypto.randomUUID(),
        sequence: 2,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#non-existent-button'] },
        description: 'Step 2: Failing Click',
        isOptional: false,
        timeoutMs: 500,
        assertions: [],
      },
      {
        id: crypto.randomUUID(),
        sequence: 3,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#step3-btn'] },
        description: 'Step 3: Dependent Click',
        isOptional: false,
        assertions: [],
      },
    ];

    const results = await actionService.executePlanSteps(projectIdA, testRunIdA, steps, {
      stopOnFailure: true,
    });

    // Step 1 should pass, Step 2 should fail, Step 3 must NOT execute
    assert.equal(results.length, 2);
    assert.equal(results[0]?.status, 'PASSED');
    assert.equal(results[1]?.status, 'FAILED');
  });

  it('supports cooperative cancellation during plan execution', async () => {
    const abortController = new AbortController();
    abortController.abort(); // Cancel before execution

    const steps: ExecutablePlanStepDto[] = [
      {
        id: crypto.randomUUID(),
        sequence: 1,
        action: 'CLICK',
        target: { kind: 'CONTROL', locatorHints: ['#step1-btn'] },
        description: 'Step 1: Click',
        isOptional: false,
        assertions: [],
      },
    ];

    const results = await actionService.executePlanSteps(projectIdA, testRunIdA, steps, {
      abortSignal: abortController.signal,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, 'CANCELLED');
  });

  it('rejects malformed action payloads and unknown action types safely', async () => {
    await assert.rejects(
      async () => {
        await actionService.executeAction({
          projectId: projectIdA,
          testRunId: testRunIdA,
          action: {
            id: crypto.randomUUID(),
            sequence: 1,
            action: 'UNKNOWN_CUSTOM_ACTION' as any,
            description: 'Unknown action type',
            isOptional: false,
            assertions: [],
          },
        });
      },
      (err: unknown) => {
        assert.ok(err);
        return true;
      },
    );
  });

  it('throws BrowserSessionNotFoundError when session does not exist for run', async () => {
    // Create a standalone run without creating a browser session
    const tc = await prisma.testCase.findFirst({ where: { projectId: projectIdA } });
    const plan = await prisma.executableTestPlan.findFirst({ where: { projectId: projectIdA } });
    const orphanedRun = await prisma.testRun.create({
      data: {
        projectId: projectIdA,
        testCaseId: tc!.id,
        testCaseVersionNumber: 1,
        executableTestPlanId: plan!.id,
        testCaseTitle: 'Orphaned Run',
        planFingerprint: 'fp-orphan-01',
        status: 'RUNNING',
      },
    });

    await assert.rejects(
      async () => {
        await actionService.executeAction({
          projectId: projectIdA,
          testRunId: orphanedRun.id,
          action: {
            id: crypto.randomUUID(),
            sequence: 1,
            action: 'CLICK',
            target: { kind: 'CONTROL', locatorHints: ['#step1-btn'] },
            description: 'Click on orphaned run',
            isOptional: false,
            assertions: [],
          },
        });
      },
      (err: unknown) => {
        assert.equal((err as any).name, 'BrowserSessionNotFoundError');
        return true;
      },
    );

    await prisma.testRun.delete({ where: { id: orphanedRun.id } });
  });
});
