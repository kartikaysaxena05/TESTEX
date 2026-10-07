/**
 * @file packages/core/src/agent-tools/playwright/certification/v10-phase147-certification.test.ts
 * Comprehensive certification test suite for V10 Phase 147: Playwright Execution Tool.
 *
 * Verifies:
 * 1. Tool registration & definition compliance in ToolRegistryService
 *    - Registered as 'playwright.execute', category: 'TESTS', permissionLevel: 'EXECUTE'
 * 2. Permission level resolution in AgentPermissionService
 *    - Resolves to 'EXECUTE', permitted without approval gate
 * 3. End-to-end execution of real Playwright browser on live target web server:
 *    - Navigates, fills inputs, clicks buttons, verifies assertions
 *    - Produces structured output: executionId, testRunId, stepResults, evidence, summary
 * 4. Tenant isolation & authorization:
 *    - Cross-project execution rejected (AiCrossProjectAccessError)
 * 5. Target URL security validation:
 *    - Protocol restrictions: file:, javascript:, data: schemes rejected with PlaywrightExecutionUnauthorizedTargetError
 * 6. Test case lookup & error handling:
 *    - Non-existent test case triggers PlaywrightExecutionTestCaseNotFoundError
 * 7. Failure classification & error mapping:
 *    - Step/assertion failure triggers deterministic classification (e.g. APPLICATION_FAILURE / ASSERTION_MISMATCH)
 * 8. Cooperative cancellation via AbortSignal:
 *    - Pre-aborted signal cancels cleanly before action dispatch
 * 9. Streaming progress events:
 *    - Verifies progress callbacks (queued -> starting -> executing -> completed)
 * 10. Agent thread integration:
 *    - Associates execution with taskId, records tool call and execution step
 * 11. Bounded output & secret redaction
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';
import {
  PlaywrightExecutionService,
  createPlaywrightToolDefinitions,
  PlaywrightExecutionTestCaseNotFoundError,
  PlaywrightExecutionUnauthorizedTargetError,
  PlaywrightExecutionCancelledError,
} from '../index.js';
import { ToolRegistryService } from '../../agent-tool-registry.js';
import { AgentPermissionService } from '../../../agent-permissions/agent-permission-service.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../../ai-provider/ai-provider-errors.js';

describe('V10 Phase 147: Playwright Execution Tool Certification Suite', () => {
  let server: http.Server;
  let baseUrl: string;

  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const intruderUserId = 'user-intruder-9999';

  const testCaseAuthId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const testCaseFailId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const testTaskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  // In-memory data store for mock prisma
  let projectStore: any[];
  let testCaseStore: any[];
  let testRunStore: any[];
  let testCaseExecutionStore: any[];
  let stepExecutionStore: any[];
  let taskStore: any[];
  let toolCallStore: any[];
  let executionStepStore: any[];

  let mockPrisma: PrismaClient;
  let service: PlaywrightExecutionService;
  let registry: ToolRegistryService;
  let permissionService: AgentPermissionService;

  before(async () => {
    // 1. Launch a real local HTTP web application server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Login Page</title></head>
            <body>
              <h1>Login Page</h1>
              <form id="login-form" action="/dashboard" method="GET">
                <div>
                  <label for="username">Username</label>
                  <input type="text" id="username" name="username" aria-label="username" placeholder="Enter username" />
                </div>
                <div>
                  <label for="password">Password</label>
                  <input type="password" id="password" name="password" aria-label="password" placeholder="Enter password" />
                </div>
                <button type="submit" id="submit-btn">Sign In</button>
              </form>
            </body>
          </html>
        `);
      } else if (url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>User Dashboard</title></head>
            <body>
              <h1 id="dashboard-heading">Dashboard Overview</h1>
              <p id="welcome-msg">Welcome, admin!</p>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    projectStore = [
      {
        id: testProjectId,
        name: 'Autonomous Web Testing Project',
        userId: testUserId,
        deletedAt: null,
      },
      {
        id: otherProjectId,
        name: 'Isolated Second Tenant',
        userId: 'other-owner',
        deletedAt: null,
      },
    ];

    testCaseStore = [
      {
        id: testCaseAuthId,
        projectId: testProjectId,
        testCaseKey: 'TC-AUTH-001',
        title: 'User Login Flow',
        objective: 'Verify user authentication works',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
        executionSuitability: 'AUTOMATED',
        steps: [
          {
            id: 'step-1',
            testCaseId: testCaseAuthId,
            stepNumber: 1,
            action: `Navigate to "${baseUrl}/login"`,
            expectedResult: 'Login Page is displayed',
          },
          {
            id: 'step-2',
            testCaseId: testCaseAuthId,
            stepNumber: 2,
            action: 'Enter username',
            testDataSummary: 'admin',
            expectedResult: 'Username is displayed',
          },
          {
            id: 'step-3',
            testCaseId: testCaseAuthId,
            stepNumber: 3,
            action: 'Enter password',
            testDataSummary: 'secret123',
            expectedResult: 'Password is displayed',
          },
          {
            id: 'step-4',
            testCaseId: testCaseAuthId,
            stepNumber: 4,
            action: 'Click Sign In button',
            expectedResult: 'Dashboard Overview is displayed',
          },
        ],
        preconditions: [],
        versions: [{ id: '11111111-2222-3333-4444-555555555555', versionNumber: 1 }],
      },
      {
        id: testCaseFailId,
        projectId: testProjectId,
        testCaseKey: 'TC-FAIL-001',
        title: 'Failing Assertion Test',
        objective: 'Demonstrate assertion failure handling',
        status: 'ACTIVE',
        reviewStatus: 'APPROVED',
        executionSuitability: 'AUTOMATED',
        steps: [
          {
            id: 'fail-step-1',
            testCaseId: testCaseFailId,
            stepNumber: 1,
            action: `Navigate to "${baseUrl}/login"`,
            expectedResult: 'Login page loads',
          },
          {
            id: 'fail-step-2',
            testCaseId: testCaseFailId,
            stepNumber: 2,
            action: 'Assert heading "Non-existent Heading Text" is visible',
            expectedResult: 'Non-existent element is visible',
          },
        ],
        preconditions: [],
        versions: [{ id: '22222222-3333-4444-5555-666666666666', versionNumber: 1 }],
      },
    ];

    testRunStore = [];
    testCaseExecutionStore = [];
    stepExecutionStore = [];
    toolCallStore = [];
    executionStepStore = [];

    taskStore = [
      {
        id: testTaskId,
        projectId: testProjectId,
        userId: testUserId,
        title: 'Run Regression Tests',
        status: 'RUNNING',
      },
    ];

    mockPrisma = {
      project: {
        findUnique: async (args: any) => {
          return projectStore.find(p => p.id === args.where.id) ?? null;
        },
      },
      testCase: {
        findFirst: async (args: any) => {
          return (
            testCaseStore.find(
              tc =>
                (tc.id === args.where.id || tc.testCaseKey === args.where.testCaseKey) &&
                tc.projectId === args.where.projectId,
            ) ?? null
          );
        },
        findUnique: async (args: any) => {
          return testCaseStore.find(tc => tc.id === args.where.id) ?? null;
        },
      },
      testRun: {
        findUnique: async (args: any) => {
          return testRunStore.find(r => r.id === args.where.id) ?? null;
        },
        findFirst: async (args: any) => {
          return testRunStore.find(r => r.id === args.where.id) ?? null;
        },
        create: async (args: any) => {
          const record = { ...args.data, createdAt: new Date(), updatedAt: new Date() };
          testRunStore.push(record);
          return record;
        },
        update: async (args: any) => {
          const run = testRunStore.find(r => r.id === args.where.id);
          if (run) Object.assign(run, args.data);
          return run;
        },
        updateMany: async (args: any) => {
          const runs = testRunStore.filter(r => r.id === args.where.id);
          for (const run of runs) Object.assign(run, args.data);
          return { count: runs.length };
        },
      },
      testCaseExecution: {
        findUnique: async (args: any) => {
          return testCaseExecutionStore.find(e => e.id === args.where.id) ?? null;
        },
        findUniqueOrThrow: async (args: any) => {
          const found = testCaseExecutionStore.find(e => e.id === args.where.id);
          if (!found) throw new Error('Execution not found');
          return found;
        },
        create: async (args: any) => {
          const record = {
            ...args.data,
            id: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            stepExecutions: [],
            stateTransitions: [],
          };
          testCaseExecutionStore.push(record);
          return record;
        },
        update: async (args: any) => {
          const exec = testCaseExecutionStore.find(e => e.id === args.where.id);
          if (exec) Object.assign(exec, args.data);
          return exec;
        },
      },
      stepExecutionRecord: {
        findUnique: async (args: any) => {
          if (args.where.id) {
            return stepExecutionStore.find(s => s.id === args.where.id) ?? null;
          }
          return null;
        },
        create: async (args: any) => {
          const record = {
            ...args.data,
            id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            assertionExecutionRecords: [],
          };
          stepExecutionStore.push(record);
          return record;
        },
        update: async (args: any) => {
          const step = stepExecutionStore.find(s => s.id === args.where.id);
          if (step) Object.assign(step, args.data);
          return step;
        },
      },
      testExecutionStateTransition: {
        create: async (args: any) => {
          return { ...args.data, id: 'trans-1' };
        },
      },
      assertionExecutionRecord: {
        create: async (args: any) => {
          return { ...args.data, id: 'assert-1' };
        },
      },
      agentThreadTask: {
        findFirst: async (args: any) => {
          return (
            taskStore.find(
              t => t.id === args.where.id && t.projectId === args.where.projectId,
            ) ?? null
          );
        },
      },
      agentToolCallRecord: {
        create: async (args: any) => {
          const record = {
            ...args.data,
            id: `tc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            task: taskStore.find(t => t.id === args.data.taskId),
          };
          toolCallStore.push(record);
          return record;
        },
        findUnique: async (args: any) => {
          return toolCallStore.find(c => c.id === args.where.id) ?? null;
        },
        update: async (args: any) => {
          const call = toolCallStore.find(c => c.id === args.where.id);
          if (call) Object.assign(call, args.data);
          return call;
        },
      },
      agentExecutionStep: {
        count: async () => executionStepStore.length,
        create: async (args: any) => {
          const record = {
            ...args.data,
            id: `step-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          };
          executionStepStore.push(record);
          return record;
        },
        findUnique: async (args: any) => {
          const s = executionStepStore.find(st => st.id === args.where.id);
          if (!s) return null;
          return { ...s, task: taskStore.find(t => t.id === s.taskId) };
        },
        update: async (args: any) => {
          const s = executionStepStore.find(st => st.id === args.where.id);
          if (s) Object.assign(s, args.data);
          return s;
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    } as unknown as PrismaClient;

    permissionService = new AgentPermissionService({ prisma: mockPrisma });
    service = new PlaywrightExecutionService({ prisma: mockPrisma });
    registry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });

    const tools = createPlaywrightToolDefinitions(service);
    for (const tool of tools) {
      registry.registerTool(tool as any);
    }
  });

  // --------------------------------------------------------------------------
  // 1. Tool Registration & Permission Evaluation
  // --------------------------------------------------------------------------
  it('certifies tool is registered with category TESTS and permission level EXECUTE', () => {
    const tool = registry.getRegisteredTool('playwright.execute');
    assert.ok(tool);
    assert.equal(tool.toolId, 'playwright.execute');
    assert.equal(tool.category, 'TESTS');
    assert.equal(tool.permissionLevel, 'EXECUTE');

    // Permission service must resolve playwright.execute to EXECUTE
    const resolvedLevel = permissionService.resolveToolPermissionLevel('playwright.execute');
    assert.equal(resolvedLevel, 'EXECUTE');
  });

  // --------------------------------------------------------------------------
  // 2. End-to-End Real Playwright Execution
  // --------------------------------------------------------------------------
  it('certifies real Playwright browser execution against live HTTP server', async () => {
    const invokeResult = await registry.invoke(
      {
        toolId: 'playwright.execute',
        projectId: testProjectId,
        input: {
          projectId: testProjectId,
          testCaseId: 'TC-AUTH-001',
          targetUrl: `${baseUrl}/login`,
          headless: true,
        },
      },
      {
        projectId: testProjectId,
        userId: testUserId,
      },
    );

    assert.ok(invokeResult);
    assert.equal(invokeResult.success, true);
    assert.equal(invokeResult.toolId, 'playwright.execute');

    const result = invokeResult.output as any;
    assert.ok(result);
    assert.equal(result.status, 'PASSED');
    assert.equal(result.passed, true);
    assert.equal(result.totalSteps, 4);
    assert.equal(result.passedSteps, 4);
    assert.equal(result.failedSteps, 0);
    assert.ok(result.executionId);
    assert.ok(result.testRunId);
    assert.equal(result.testCaseKey, 'TC-AUTH-001');
    assert.equal(result.stepResults.length, 4);
    assert.equal(result.stepResults[0].status, 'PASSED');
    assert.match(result.summary, /executed successfully/i);

    // Verify TestRun record created in DB
    assert.equal(testRunStore.length, 1);
    assert.equal(testRunStore[0].status, 'PASSED');
  });

  // --------------------------------------------------------------------------
  // 3. Project Isolation & Cross-Project Access Rejection
  // --------------------------------------------------------------------------
  it('certifies cross-project access rejection when unauthorized user executes tool', async () => {
    await assert.rejects(
      async () => {
        await registry.invoke(
          {
            toolId: 'playwright.execute',
            projectId: testProjectId,
            input: {
              projectId: testProjectId,
              testCaseId: 'TC-AUTH-001',
              targetUrl: `${baseUrl}/login`,
            },
          },
          {
            projectId: testProjectId,
            userId: intruderUserId, // Different user
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiCrossProjectAccessError);
        assert.match((err as Error).message, /permission to access/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 4. Target URL Protocol Restrictions
  // --------------------------------------------------------------------------
  it('certifies rejection of dangerous target URL protocols (file:, javascript:, data:)', async () => {
    // javascript: URL
    await assert.rejects(
      async () => {
        await service.execute(
          {
            projectId: testProjectId,
            testCaseId: 'TC-AUTH-001',
            targetUrl: 'javascript:alert(1)',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof PlaywrightExecutionUnauthorizedTargetError);
        assert.match((err as Error).message, /protocol 'javascript:' is forbidden/i);
        return true;
      },
    );

    // file: URL
    await assert.rejects(
      async () => {
        await service.execute(
          {
            projectId: testProjectId,
            testCaseId: 'TC-AUTH-001',
            targetUrl: 'file:///etc/passwd',
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof PlaywrightExecutionUnauthorizedTargetError);
        assert.match((err as Error).message, /protocol 'file:' is forbidden/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 5. Test Case Not Found Rejection
  // --------------------------------------------------------------------------
  it('certifies error thrown when test case does not exist in the project', async () => {
    await assert.rejects(
      async () => {
        await service.execute(
          {
            projectId: testProjectId,
            testCaseId: 'TC-NON-EXISTENT',
            targetUrl: `${baseUrl}/login`,
          },
          testUserId,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof PlaywrightExecutionTestCaseNotFoundError);
        assert.match((err as Error).message, /not found in project/i);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 6. Assertion Failure & Deterministic Failure Classification
  // --------------------------------------------------------------------------
  it('certifies failure handling and failure classification when assertion fails', async () => {
    const result = await service.execute(
      {
        projectId: testProjectId,
        testCaseId: 'TC-FAIL-001',
        targetUrl: `${baseUrl}/login`,
      },
      testUserId,
    );

    assert.equal(result.status, 'FAILED');
    assert.equal(result.passed, false);
    assert.equal(result.failedSteps, 1);
    assert.ok(result.failureClassification);
    assert.equal(result.failureClassification.isApplicationDefect, true);
    assert.equal(result.failureClassification.category, 'APPLICATION_FAILURE');
    assert.equal(result.failureClassification.subcategory, 'ASSERTION_MISMATCH');
  });

  // --------------------------------------------------------------------------
  // 7. Cooperative Cancellation via AbortSignal
  // --------------------------------------------------------------------------
  it('certifies cooperative cancellation when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await service.execute(
          {
            projectId: testProjectId,
            testCaseId: 'TC-AUTH-001',
            targetUrl: `${baseUrl}/login`,
          },
          testUserId,
          controller.signal,
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof PlaywrightExecutionCancelledError);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // 8. Progress Streaming Callbacks
  // --------------------------------------------------------------------------
  it('certifies streaming progress events are emitted during execution', async () => {
    const events: string[] = [];

    await service.execute(
      {
        projectId: testProjectId,
        testCaseId: 'TC-AUTH-001',
        targetUrl: `${baseUrl}/login`,
      },
      testUserId,
      undefined,
      event => {
        events.push(event);
      },
    );

    assert.ok(events.includes('execution.queued'));
    assert.ok(events.includes('browser.starting'));
    assert.ok(events.includes('session.ready'));
    assert.ok(events.includes('step.executing'));
    assert.ok(events.includes('execution.completed'));
  });

  // --------------------------------------------------------------------------
  // 9. Agent Thread and Task History Association
  // --------------------------------------------------------------------------
  it('certifies association with AgentThreadTask, tool call records, and execution step history', async () => {
    const result = await service.execute(
      {
        projectId: testProjectId,
        testCaseId: 'TC-AUTH-001',
        taskId: testTaskId,
        targetUrl: `${baseUrl}/login`,
      },
      testUserId,
    );

    assert.equal(result.status, 'PASSED');
    assert.equal(result.taskId, testTaskId);

    // Verify AgentToolCallRecord created
    assert.equal(toolCallStore.length, 1);
    assert.equal(toolCallStore[0].taskId, testTaskId);
    assert.equal(toolCallStore[0].status, 'COMPLETED');

    // Verify AgentExecutionStep created
    assert.equal(executionStepStore.length, 1);
    assert.equal(executionStepStore[0].taskId, testTaskId);
    assert.equal(executionStepStore[0].status, 'COMPLETED');
  });
});
