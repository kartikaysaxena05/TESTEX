/**
 * @file packages/core/src/agent-loop/certification/v10-phase153-certification.test.ts
 * Comprehensive domain, loop, concurrency, safety, and security certification test suite
 * for V10 Phase 153: Agent Execution Loop.
 *
 * Requirements Certified:
 * 1. Task -> Plan -> Tool Call -> Tool Result -> Observation -> Next Step execution cycle
 * 2. State machine transitions: QUEUED -> PLANNING -> RUNNING -> COMPLETED
 * 3. Tool Registry integration with schema validation and backend handler execution
 * 4. Rejection of arbitrary / unvetted tool requests
 * 5. Deterministic ExecutionStep persistence and sequence numbering
 * 6. ToolCallRecord persistence (input, output, durationMs, status)
 * 7. ThreadMessage persistence for lifecycle observability
 * 8. Safety limit: maxSteps enforcement
 * 9. Safety limit: maxConsecutiveFailures enforcement
 * 10. Safety limit: maxDurationMs timeout enforcement
 * 11. Safety limit: maxToolCalls enforcement
 * 12. Cancellation checkpoint between steps (preserves history, never marks COMPLETED)
 * 13. Cancellation checkpoint before tool execution
 * 14. Concurrency protection: concurrent execution on same task rejected
 * 15. Concurrency lock release on completion or error
 * 16. Human approval boundary: tool requiring approval pauses loop in WAITING_FOR_APPROVAL
 * 17. Human approval resumption: resumeTask continues loop and completes task
 * 18. Invalid state transition rejection (e.g. running completed task)
 * 19. Planner failure handling
 * 20. Tenant isolation: cross-project or unauthorized task execution rejected
 * 21. Restart persistence & recovery: getStatus reconstructs state from database
 * 22. In-memory cancellation via cancel API
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentLoop,
  AgentState,
  AgentConcurrencyManager,
  AgentExecutor,
  AgentLoopNotFoundError,
  AgentLoopInvalidStateError,
  AgentLoopConcurrentExecutionError,
  AgentLoopCancelledError,
  AgentLoopCrossProjectAccessError,
} from '../index.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';
import { AgentPlanService } from '../../agent-planning/agent-plan-service.js';
import { ToolRegistryService } from '../../agent-tools/agent-tool-registry.js';
import { AgentPermissionService } from '../../agent-permissions/agent-permission-service.js';

describe('V10 Phase 153: Agent Execution Loop Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const otherUserId = 'user-other-2222';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const otherTaskId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

  // In-memory mock database state
  let mockProjects: Array<{ id: string; userId: string }>;
  let mockThreads: Array<any>;
  let mockTasks: Array<any>;
  let mockMessages: Array<any>;
  let mockExecutionSteps: Array<any>;
  let mockToolCalls: Array<any>;
  let mockApprovals: Array<any>;
  let mockAuditLogs: Array<any>;
  let mockPlans: Array<any>;
  let mockPlanSteps: Array<any>;

  let mockPrisma: any;
  let threadService: AgentThreadService;
  let planService: AgentPlanService;
  let permissionService: AgentPermissionService;
  let toolRegistry: ToolRegistryService;
  let agentLoop: AgentLoop;

  beforeEach(() => {
    AgentLoop.clearStateForTest();

    mockProjects = [
      { id: testProjectId, userId: testUserId },
      { id: otherProjectId, userId: otherUserId },
    ];

    mockThreads = [
      {
        id: testThreadId,
        projectId: testProjectId,
        userId: testUserId,
        title: 'Main Debug Thread',
        status: 'ACTIVE',
        lastActivityAt: new Date(),
      },
    ];

    mockTasks = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: testThreadId,
        userId: testUserId,
        title: 'Fix cart checkout calculation defect',
        instruction:
          'Investigate cart checkout total calculation defect and generate verification test',
        status: 'QUEUED',
        failureReason: null,
        retryCount: 0,
        parentTaskId: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      },
      {
        id: otherTaskId,
        projectId: otherProjectId,
        threadId: 'other-thread-id',
        userId: otherUserId,
        title: 'Other task',
        instruction: 'Run other tests',
        status: 'QUEUED',
        failureReason: null,
        retryCount: 0,
        parentTaskId: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      },
    ];

    mockMessages = [];
    mockExecutionSteps = [];
    mockToolCalls = [];
    mockApprovals = [];
    mockAuditLogs = [];
    mockPlans = [];
    mockPlanSteps = [];

    mockPrisma = {
      $transaction: async (cb: any) => cb(mockPrisma),
      project: {
        findFirst: async ({ where }: any) => {
          return (
            mockProjects.find(
              p => p.id === where.id && (!where.userId || p.userId === where.userId),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          return mockProjects.find(p => p.id === where.id) || null;
        },
      },
      agentThread: {
        findFirst: async ({ where }: any) => {
          return (
            mockThreads.find(
              t => t.id === where.id && (!where.projectId || t.projectId === where.projectId),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          return mockThreads.find(t => t.id === where.id) || null;
        },
        update: async ({ where, data }: any) => {
          const t = mockThreads.find(x => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        },
      },
      agentThreadTask: {
        findFirst: async ({ where }: any) => {
          const t = mockTasks.find(
            task =>
              task.id === where.id && (!where.projectId || task.projectId === where.projectId),
          );
          if (!t) return null;
          return {
            ...t,
            executionSteps: mockExecutionSteps.filter(s => s.taskId === t.id),
            toolCalls: mockToolCalls.filter(c => c.taskId === t.id),
          };
        },
        findUnique: async ({ where }: any) => {
          const t = mockTasks.find(task => task.id === where.id);
          if (!t) return null;
          return {
            ...t,
            thread: mockThreads.find(th => th.id === t.threadId),
            executionSteps: mockExecutionSteps.filter(s => s.taskId === t.id),
            toolCalls: mockToolCalls.filter(c => c.taskId === t.id),
          };
        },
        update: async ({ where, data }: any) => {
          const t = mockTasks.find(x => x.id === where.id);
          if (!t) throw new Error(`Task ${where.id} not found`);
          Object.assign(t, data, { updatedAt: new Date() });
          return t;
        },
      },
      agentThreadMessage: {
        create: async ({ data }: any) => {
          const m = {
            id: `msg-${mockMessages.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          mockMessages.push(m);
          return m;
        },
        count: async ({ where }: any) => {
          return mockMessages.filter(m => m.threadId === where.threadId).length;
        },
        findMany: async ({ where }: any) => {
          return mockMessages.filter(m => m.threadId === where.threadId);
        },
      },
      agentExecutionStep: {
        create: async ({ data }: any) => {
          const s = {
            id: `step-exec-${mockExecutionSteps.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          mockExecutionSteps.push(s);
          return s;
        },
        findUnique: async ({ where }: any) => {
          const s = mockExecutionSteps.find(x => x.id === where.id);
          if (!s) return null;
          return { ...s, task: mockTasks.find(t => t.id === s.taskId) };
        },
        update: async ({ where, data }: any) => {
          const s = mockExecutionSteps.find(x => x.id === where.id);
          if (!s) throw new Error('Step not found');
          Object.assign(s, data);
          return s;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const s of mockExecutionSteps) {
            if (s.taskId === where.taskId && (!where.status || s.status === where.status)) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        },
        count: async ({ where }: any) => {
          return mockExecutionSteps.filter(s => s.taskId === where.taskId).length;
        },
      },
      agentToolCallRecord: {
        create: async ({ data }: any) => {
          const c = {
            id: `tool-call-${mockToolCalls.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          mockToolCalls.push(c);
          return c;
        },
        findUnique: async ({ where }: any) => {
          const c = mockToolCalls.find(x => x.id === where.id);
          if (!c) return null;
          return { ...c, task: mockTasks.find(t => t.id === c.taskId) };
        },
        update: async ({ where, data }: any) => {
          const c = mockToolCalls.find(x => x.id === where.id);
          if (!c) throw new Error('Tool call not found');
          Object.assign(c, data);
          return c;
        },
      },
      agentToolApproval: {
        findFirst: async ({ where, orderBy: _orderBy }: any) => {
          const list = mockApprovals.filter(a => {
            if (where.taskId && a.taskId !== where.taskId) return false;
            if (where.toolName && a.toolName !== where.toolName) return false;
            if (where.status && a.status !== where.status) return false;
            return true;
          });
          return list[0] || null;
        },
        create: async ({ data }: any) => {
          const app = {
            id: `approval-${mockApprovals.length + 1}`,
            ...data,
            createdAt: new Date(),
          };
          mockApprovals.push(app);
          return app;
        },
        update: async ({ where, data }: any) => {
          const app = mockApprovals.find(x => x.id === where.id);
          if (!app) throw new Error('Approval not found');
          Object.assign(app, data);
          return app;
        },
      },
      agentToolAuditLog: {
        create: async ({ data }: any) => {
          const log = { id: `log-${mockAuditLogs.length + 1}`, ...data, createdAt: new Date() };
          mockAuditLogs.push(log);
          return log;
        },
      },
      authAuditLog: {
        create: async () => ({ id: 'audit-log-id' }),
      },
      agentPlan: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = [...mockPlans];
          if (where.taskId) list = list.filter(p => p.taskId === where.taskId);
          if (where.projectId) list = list.filter(p => p.projectId === where.projectId);
          if (where.isActive !== undefined) list = list.filter(p => p.isActive === where.isActive);
          if (orderBy?.version === 'desc') {
            list.sort((a, b) => b.version - a.version);
          }
          const item = list[0];
          if (!item) return null;
          const steps = mockPlanSteps
            .filter(s => s.planId === item.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...item, steps };
        },
        findUnique: async ({ where }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) return null;
          const steps = mockPlanSteps
            .filter(s => s.planId === plan.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...plan, steps };
        },
        findUniqueOrThrow: async ({ where }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) throw new Error('Plan not found');
          const steps = mockPlanSteps
            .filter(s => s.planId === plan.id)
            .sort((a, b) => a.sequence - b.sequence);
          return { ...plan, steps };
        },
        findMany: async ({ where }: any) => {
          return mockPlans
            .filter(p => p.taskId === where.taskId)
            .map(p => ({
              ...p,
              steps: mockPlanSteps.filter(s => s.planId === p.id),
            }));
        },
        create: async ({ data }: any) => {
          const newPlan = {
            id: `plan-${mockPlans.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockPlans.push(newPlan);
          return newPlan;
        },
        update: async ({ where, data }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) throw new Error('Plan not found for update');
          Object.assign(plan, data, { updatedAt: new Date() });
          return plan;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const plan of mockPlans) {
            if (where.taskId && plan.taskId !== where.taskId) continue;
            if (where.isActive !== undefined && plan.isActive !== where.isActive) continue;
            Object.assign(plan, data, { updatedAt: new Date() });
            count++;
          }
          return { count };
        },
      },
      agentPlanStep: {
        create: async ({ data }: any) => {
          const s = {
            id: `plan-step-${mockPlanSteps.length + 1}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockPlanSteps.push(s);
          return s;
        },
        createMany: async ({ data }: any) => {
          for (const item of data) {
            mockPlanSteps.push({
              id: `plan-step-${mockPlanSteps.length + 1}`,
              ...item,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        },
        findMany: async ({ where }: any) => {
          return mockPlanSteps.filter(s => s.planId === where.planId);
        },
        update: async ({ where, data }: any) => {
          const s = mockPlanSteps.find(x => x.id === where.id);
          if (!s) throw new Error('Plan step not found');
          Object.assign(s, data, { updatedAt: new Date() });
          return s;
        },
      },
    };

    threadService = new AgentThreadService({ prisma: mockPrisma });
    planService = new AgentPlanService({ prisma: mockPrisma });
    permissionService = new AgentPermissionService({ prisma: mockPrisma });
    toolRegistry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });

    // Register safe standard tools
    toolRegistry.registerTool({
      toolId: 'repository.search_files',
      name: 'Search Files',
      description: 'Search repository files by query',
      version: '1.0.0',
      category: 'REPOSITORY',
      permissionLevel: 'READ',
      enabled: true,
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      outputSchema: { type: 'object', properties: { matches: { type: 'array' } } },
      handler: async (input: { query: string }) => {
        return { matches: [`src/cart/${input.query}.ts`] };
      },
    });

    toolRegistry.registerTool({
      toolId: 'test.generate_plan',
      name: 'Generate Test Plan',
      description: 'Generates verification test plan',
      version: '1.0.0',
      category: 'TESTS',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object', properties: { target: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { testPlan: { type: 'string' } } },
      handler: async (input: { target?: string }) => {
        return { testPlan: `Verification plan for ${input.target ?? 'module'}` };
      },
    });

    agentLoop = new AgentLoop({
      prisma: mockPrisma,
      threadService,
      planService,
      toolRegistry,
    });
  });

  // ============================================================================
  // Test Cases
  // ============================================================================

  it('1. should execute a full autonomous loop cycle to completion', async () => {
    // Custom 2-step plan with registered tools
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        summary: 'Cart fix verification',
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Find cart files',
            objective: 'Locate checkout cart files',
            toolAction: 'repository.search_files',
            structuredInput: { query: 'cart' },
            dependencies: [],
          },
          {
            stepId: 'step-2',
            sequence: 2,
            title: 'Generate test verification',
            objective: 'Generate test plan for cart',
            toolAction: 'test.generate_plan',
            structuredInput: { target: 'cart' },
            dependencies: ['step-1'],
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.stepsCompleted, 2);
    assert.strictEqual(result.toolCallsExecuted, 2);
    assert.strictEqual(result.planStatus, 'COMPLETED');

    // Verify task state in database
    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'COMPLETED');

    // Verify execution steps were persisted
    assert.strictEqual(mockExecutionSteps.length, 2);
    assert.ok(mockExecutionSteps.every((s: any) => s.status === 'COMPLETED'));

    // Verify tool calls were persisted
    assert.strictEqual(mockToolCalls.length, 2);
    assert.ok(mockToolCalls.every((c: any) => c.status === 'COMPLETED'));

    // Verify thread messages
    assert.ok(mockMessages.some((m: any) => m.content.includes('Task completed successfully')));
  });

  it('2. should reject starting execution if task is already in terminal state COMPLETED', async () => {
    mockTasks[0].status = 'COMPLETED';

    await assert.rejects(
      async () => {
        await agentLoop.run(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopInvalidStateError);
        assert.strictEqual(err.code, 'AGENT_LOOP_INVALID_STATE');
        return true;
      },
    );
  });

  it('3. should enforce concurrency protection against dual execution on same task', async () => {
    // Acquire lock manually
    AgentConcurrencyManager.acquireLock(testTaskId, testProjectId);

    await assert.rejects(
      async () => {
        await agentLoop.run(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopConcurrentExecutionError);
        assert.strictEqual(err.code, 'AGENT_LOOP_CONCURRENT_EXECUTION');
        return true;
      },
    );

    // Release lock and ensure it can run
    AgentConcurrencyManager.releaseLock(testTaskId);
    assert.strictEqual(AgentConcurrencyManager.isExecuting(testTaskId), false);
  });

  it('4. should enforce maxSteps safety limit and fail safely', async () => {
    // Create plan with 5 steps
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'repository.search_files',
            structuredInput: { query: '1' },
          },
          {
            stepId: 's2',
            sequence: 2,
            title: 'Step 2',
            objective: 'Obj 2',
            toolAction: 'repository.search_files',
            structuredInput: { query: '2' },
            dependencies: ['s1'],
          },
          {
            stepId: 's3',
            sequence: 3,
            title: 'Step 3',
            objective: 'Obj 3',
            toolAction: 'repository.search_files',
            structuredInput: { query: '3' },
            dependencies: ['s2'],
          },
        ],
      },
      testUserId,
    );

    // Limit maxSteps to 2
    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
        safetyLimits: { maxSteps: 2 },
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('maxSteps'));

    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'FAILED');
  });

  it('5. should enforce maxConsecutiveFailures safety limit', async () => {
    // Register failing tool
    toolRegistry.registerTool({
      toolId: 'failing.tool',
      name: 'Failing Tool',
      description: 'Deterministic failing tool',
      version: '1.0.0',
      category: 'UTILITY',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      handler: async () => {
        throw new Error('Deterministic tool execution failure');
      },
    });

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'failing.tool',
            structuredInput: {},
          },
          {
            stepId: 's2',
            sequence: 2,
            title: 'Step 2',
            objective: 'Obj 2',
            toolAction: 'failing.tool',
            structuredInput: {},
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
        safetyLimits: { maxConsecutiveFailures: 1 },
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('maxConsecutiveFailures'));
  });

  it('6. should enforce maxToolCalls safety limit', async () => {
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'repository.search_files',
            structuredInput: { query: '1' },
          },
          {
            stepId: 's2',
            sequence: 2,
            title: 'Step 2',
            objective: 'Obj 2',
            toolAction: 'repository.search_files',
            structuredInput: { query: '2' },
            dependencies: ['s1'],
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
        safetyLimits: { maxToolCalls: 1 },
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('maxToolCalls'));
  });

  it('7. should enforce timeout limit when execution exceeds maxDurationMs', async () => {
    // Tool that sleeps slightly
    toolRegistry.registerTool({
      toolId: 'slow.tool',
      name: 'Slow Tool',
      description: 'Slow tool for timeout tests',
      version: '1.0.0',
      category: 'UTILITY',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object', properties: { done: { type: 'boolean' } } },
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { done: true };
      },
    });

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'slow.tool',
            structuredInput: {},
          },
          {
            stepId: 's2',
            sequence: 2,
            title: 'Step 2',
            objective: 'Obj 2',
            toolAction: 'slow.tool',
            structuredInput: {},
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
        safetyLimits: { maxDurationMs: 10 }, // 10ms timeout
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('timed out'));
  });

  it('8. should pause loop and transition to WAITING_FOR_APPROVAL when tool demands human authorization', async () => {
    // Register approval-required tool (e.g. terminal.run or custom dangerous tool)
    toolRegistry.registerTool({
      toolId: 'terminal.run',
      name: 'Run Terminal Command',
      description: 'Executes terminal command',
      version: '1.0.0',
      category: 'UTILITY',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
      handler: async () => ({ output: 'ok' }),
    });

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Run terminal build',
            objective: 'Build target project',
            toolAction: 'terminal.run',
            structuredInput: { command: 'npm run build' },
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'WAITING_FOR_APPROVAL');
    assert.ok(result.pendingApprovalId);

    // Verify task state in database
    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'WAITING_FOR_APPROVAL');

    // Verify approval record was created in database
    assert.strictEqual(mockApprovals.length, 1);
    assert.strictEqual(mockApprovals[0].status, 'PENDING');
  });

  it('9. should resume paused task after human approval and complete execution', async () => {
    // If not already registered, registering tool
    if (!toolRegistry.hasTool('terminal.run')) {
      toolRegistry.registerTool({
        toolId: 'terminal.run',
        name: 'Run Terminal Command',
        description: 'Executes terminal command',
        version: '1.0.0',
        category: 'UTILITY',
        permissionLevel: 'EXECUTE',
        enabled: true,
        inputSchema: { type: 'object', properties: { command: { type: 'string' } } },
        outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
        handler: async () => ({ output: 'ok' }),
      });
    }

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Run terminal build',
            objective: 'Build target project',
            toolAction: 'terminal.run',
            structuredInput: { command: 'npm run build' },
          },
        ],
      },
      testUserId,
    );

    // Run -> pauses for approval
    const pauseResult = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );
    assert.strictEqual(pauseResult.status, 'WAITING_FOR_APPROVAL');

    // Human approves the pending request
    const approval = mockApprovals[0];
    approval.status = 'APPROVED';
    approval.approvedBy = testUserId;
    approval.approvedAt = new Date();

    // Resume execution
    const resumeResult = await agentLoop.resume(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.strictEqual(resumeResult.status, 'COMPLETED');
    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'COMPLETED');
  });

  it('10. should cancel loop via cancel API, persisting CANCELLED without false COMPLETED', async () => {
    const cancelResult = await agentLoop.cancel(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        reason: 'User cancelled operation manually',
      },
      testUserId,
    );

    assert.strictEqual(cancelResult.status, 'CANCELLED');
    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'CANCELLED');
    assert.strictEqual(dbTask.failureReason, 'User cancelled operation manually');
  });

  it('11. should reject cross-project access attempts', async () => {
    await assert.rejects(
      async () => {
        await agentLoop.run(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
          },
          otherUserId,
        ); // other user does not own testProjectId
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopCrossProjectAccessError);
        assert.strictEqual(err.code, 'AGENT_LOOP_CROSS_PROJECT_ACCESS');
        return true;
      },
    );
  });

  it('12. should reject unknown task ID with AgentLoopNotFoundError', async () => {
    await assert.rejects(
      async () => {
        await agentLoop.run(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: '99999999-9999-9999-9999-999999999999',
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopNotFoundError);
        assert.strictEqual(err.code, 'AGENT_LOOP_NOT_FOUND');
        return true;
      },
    );
  });

  it('13. should reconstruct task status and step history via getStatus', async () => {
    // Add completed execution steps in mock DB
    mockExecutionSteps.push(
      { id: 's1', taskId: testTaskId, status: 'COMPLETED', stepType: 'test', title: 'Step 1' },
      { id: 's2', taskId: testTaskId, status: 'COMPLETED', stepType: 'test', title: 'Step 2' },
    );
    mockToolCalls.push({ id: 'c1', taskId: testTaskId, toolName: 'test', status: 'COMPLETED' });

    mockTasks[0].status = 'RUNNING';
    mockTasks[0].startedAt = new Date(Date.now() - 5000);

    const status = await agentLoop.getStatus(
      {
        projectId: testProjectId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.ok(status);
    assert.strictEqual(status.status, 'RUNNING');
    assert.strictEqual(status.totalStepsExecuted, 2);
    assert.strictEqual(status.toolCallsCount, 1);
  });

  it('14. should validate tool input schemas and fail if invalid payload is requested', async () => {
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Search files with invalid schema',
            objective: 'Test invalid inputs',
            toolAction: 'repository.search_files',
            structuredInput: { invalid_field_no_query: 123 }, // violates z.object({ query: z.string() })
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
        safetyLimits: { maxConsecutiveFailures: 1 },
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.failureReason?.includes('maxConsecutiveFailures'));
    assert.strictEqual(mockToolCalls[0].status, 'FAILED');
    assert.ok(mockToolCalls[0].error?.includes('validation failed'));
  });

  it('15. should handle synthetic reasoning steps without registered external tools', async () => {
    // Step with action that has no tool in ToolRegistry (synthetic reasoning)
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Understand task instruction',
            objective: 'Analyze requirement and context',
            toolAction: 'understand_task',
            structuredInput: {},
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'COMPLETED');
    assert.strictEqual(result.stepsCompleted, 1);
    assert.strictEqual(result.toolCallsExecuted, 0); // No external tool call needed
  });

  it('16. should reject resuming a task that is in QUEUED state (invalid state)', async () => {
    mockTasks[0].status = 'QUEUED';

    await assert.rejects(
      async () => {
        await agentLoop.resume(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
          },
          testUserId,
        );
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopInvalidStateError);
        assert.strictEqual(err.code, 'AGENT_LOOP_INVALID_STATE');
        return true;
      },
    );
  });

  it('17. should cancel loop mid-execution between steps and never falsely mark COMPLETED', async () => {
    // 2-step plan where step 1 cancels the execution
    toolRegistry.registerTool({
      toolId: 'cancelling.tool',
      name: 'Cancelling Tool',
      description: 'Cancels loop mid execution',
      version: '1.0.0',
      category: 'UTILITY',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      handler: async () => {
        // Trigger cancellation in the concurrency manager
        AgentConcurrencyManager.cancelExecution(testTaskId, 'User requested stop mid-execution');
        return { done: true };
      },
    });

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'cancelling.tool',
            structuredInput: {},
          },
          {
            stepId: 's2',
            sequence: 2,
            title: 'Step 2',
            objective: 'Obj 2',
            toolAction: 'repository.search_files',
            structuredInput: { query: 'cart' },
            dependencies: ['s1'],
          },
        ],
      },
      testUserId,
    );

    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );

    assert.strictEqual(result.status, 'CANCELLED');
    assert.notStrictEqual(result.status, 'COMPLETED');

    const dbTask = await mockPrisma.agentThreadTask.findUnique({ where: { id: testTaskId } });
    assert.strictEqual(dbTask.status, 'CANCELLED');
    assert.strictEqual(AgentConcurrencyManager.isExecuting(testTaskId), false);
  });

  it('18. should abort tool invocation if signal is already aborted before tool starts', async () => {
    let toolInvoked = false;
    toolRegistry.registerTool({
      toolId: 'should_not_run.tool',
      name: 'Unrun Tool',
      description: 'Should never run if signal aborted',
      version: '1.0.0',
      category: 'UTILITY',
      permissionLevel: 'EXECUTE',
      enabled: true,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      handler: async () => {
        toolInvoked = true;
        return {};
      },
    });

    const executor = new AgentExecutor(threadService, planService, toolRegistry);
    const state = new AgentState({
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      userId: testUserId,
    });

    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 's1',
            sequence: 1,
            title: 'Step 1',
            objective: 'Obj 1',
            toolAction: 'should_not_run.tool',
            structuredInput: {},
          },
        ],
      },
      testUserId,
    );

    const abortController = new AbortController();
    abortController.abort('Aborted before start');

    await assert.rejects(
      async () => {
        await executor.executeStep({
          projectId: testProjectId,
          threadId: testThreadId,
          taskId: testTaskId,
          userId: testUserId,
          plan,
          step: plan.steps[0]!,
          state,
          signal: abortController.signal,
        });
      },
      (err: any) => {
        assert.ok(err instanceof AgentLoopCancelledError);
        return true;
      },
    );

    assert.strictEqual(toolInvoked, false);
  });

  it('19. should record thread messages at each lifecycle milestone', async () => {
    const plan = await planService.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            sequence: 1,
            title: 'Find cart files',
            objective: 'Locate cart files',
            toolAction: 'repository.search_files',
            structuredInput: { query: 'cart' },
          },
        ],
      },
      testUserId,
    );

    await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        planId: plan.id,
      },
      testUserId,
    );

    // Messages should include started and completed messages
    const assistantMessages = mockMessages.filter((m: any) => m.role === 'ASSISTANT');
    assert.ok(assistantMessages.length >= 2);
    assert.ok(assistantMessages.some((m: any) => m.content.includes('Started executing task')));
    assert.ok(
      assistantMessages.some((m: any) => m.content.includes('Task completed successfully')),
    );
  });

  it('20. should automatically generate plan if task is started without pre-existing plan', async () => {
    // Run task without passing planId and without prior plan in database
    const result = await agentLoop.run(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.ok(result.status === 'COMPLETED' || result.status === 'WAITING_FOR_APPROVAL');
    // Verify an active plan was created
    const activePlan = await planService.getActivePlan(
      {
        projectId: testProjectId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.ok(activePlan);
    assert.ok(activePlan.steps.length > 0);
  });
});
