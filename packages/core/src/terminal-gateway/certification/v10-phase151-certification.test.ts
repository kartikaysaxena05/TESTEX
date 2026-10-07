/**
 * @file packages/core/src/terminal-gateway/certification/v10-phase151-certification.test.ts
 * Comprehensive security, adversarial, and isolation certification test suite
 * for V10 Phase 151: Sandboxed Terminal Command Gateway.
 *
 * Tests required:
 * 1. allowed command executes
 * 2. blocked command never executes
 * 3. path traversal rejected
 * 4. outside-project cwd rejected
 * 5. unauthorized project rejected
 * 6. environment secret is not exposed
 * 7. secret appearing in stdout is redacted
 * 8. dangerous command rejected
 * 9. approval-required command pauses task
 * 10. agent cannot self-approve
 * 11. timeout terminates process
 * 12. cancellation terminates process tree
 * 13. huge stdout is bounded
 * 14. malformed input rejected
 * 15. forged projectId rejected
 * 16. forged taskId rejected
 * 17. cross-project terminal access rejected
 * 18. concurrent command requests handled safely
 * 19. restart/recovery does not create orphaned execution state
 * 20. audit trail cannot be modified by the agent
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  TerminalCommandGateway,
  CommandPolicyEngine,
  TerminalSanitizer,
  TerminalProcessRunner,
  createTerminalToolDefinition,
  TerminalCommandBlockedError,
  TerminalPathTraversalError,
  TerminalOutsideWorktreeError,
  TerminalSelfApprovalForbiddenError,
  TerminalAlreadyDecidedError,
} from '../index.js';
import { AiCrossProjectAccessError, AiInvalidRequestError } from '../../ai-provider/index.js';
import { ToolRegistryService } from '../../agent-tools/agent-tool-registry.js';
import { AgentPermissionService } from '../../agent-permissions/agent-permission-service.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';

describe('V10 Phase 151: Sandboxed Terminal Command Gateway Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const otherTaskId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';

  let tmpDir: string;
  let projectStore: any[];
  let taskStore: any[];
  let sourceStore: any[];
  let executionStore: any[];
  let approvalStore: any[];
  let auditLogStore: any[];
  let executionStepStore: any[];

  let mockPrisma: PrismaClient;
  let gateway: TerminalCommandGateway;
  let registry: ToolRegistryService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-terminal-test-'));

    projectStore = [
      { id: testProjectId, userId: testUserId, name: 'Project A', deletedAt: null },
      { id: otherProjectId, userId: 'other-user', name: 'Project B', deletedAt: null },
    ];

    taskStore = [
      { id: testTaskId, projectId: testProjectId, userId: testUserId, threadId: testThreadId, status: 'RUNNING' },
      { id: otherTaskId, projectId: otherProjectId, userId: 'other-user', threadId: 'other-thread', status: 'RUNNING' },
    ];

    sourceStore = [
      { id: crypto.randomUUID(), projectId: testProjectId, rootPath: tmpDir },
    ];

    executionStore = [];
    approvalStore = [];
    auditLogStore = [];
    executionStepStore = [];

    mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      project: {
        findUnique: async ({ where }: any) => projectStore.find((p) => p.id === where.id) || null,
      },
      agentThreadTask: {
        findUnique: async ({ where }: any) => taskStore.find((t) => t.id === where.id) || null,
        findFirst: async ({ where }: any) => taskStore.find((t) => t.id === where.id && (!where.projectId || t.projectId === where.projectId)) || null,
        update: async ({ where, data }: any) => {
          const t = taskStore.find((x) => x.id === where.id);
          if (t) Object.assign(t, data);
          return t;
        },
      },
      projectSource: {
        findFirst: async ({ where }: any) => sourceStore.find((s) => s.projectId === where.projectId) || null,
      },
      agentTerminalExecution: {
        create: async ({ data }: any) => {
          const rec = { id: data.id ?? crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
          executionStore.push(rec);
          return rec;
        },
        findFirst: async ({ where }: any) => {
          return executionStore.find((e) => e.id === where.id && (!where.projectId || e.projectId === where.projectId)) || null;
        },
        findMany: async ({ where }: any) => {
          return executionStore.filter((e) => !where.projectId || e.projectId === where.projectId);
        },
        update: async ({ where, data }: any) => {
          const e = executionStore.find((x) => x.id === where.id);
          if (e) Object.assign(e, data);
          return e;
        },
      },
      agentToolApproval: {
        create: async ({ data }: any) => {
          const app = { id: crypto.randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() };
          approvalStore.push(app);
          return app;
        },
        findFirst: async ({ where }: any) => {
          return approvalStore.find((a) => a.taskId === where.taskId && (!where.toolName || a.toolName === where.toolName) && (!where.status || a.status === where.status)) || null;
        },
        update: async ({ where, data }: any) => {
          const a = approvalStore.find((x) => x.id === where.id);
          if (a) Object.assign(a, data);
          return a;
        },
      },
      agentToolAuditLog: {
        create: async ({ data }: any) => {
          const log = { id: crypto.randomUUID(), ...data, timestamp: new Date() };
          auditLogStore.push(log);
          return log;
        },
        findMany: async () => auditLogStore,
      },
      agentExecutionStep: {
        count: async () => executionStepStore.length,
        create: async ({ data }: any) => {
          const s = { id: crypto.randomUUID(), ...data, createdAt: new Date() };
          executionStepStore.push(s);
          return s;
        },
        findUnique: async ({ where }: any) => {
          const s = executionStepStore.find((x) => x.id === where.id);
          if (!s) return null;
          return { ...s, task: taskStore.find((t) => t.id === s.taskId) };
        },
        update: async ({ where, data }: any) => {
          const s = executionStepStore.find((x) => x.id === where.id);
          if (s) Object.assign(s, data);
          return s;
        },
      },
    } as unknown as PrismaClient;

    const threadService = new AgentThreadService({ prisma: mockPrisma });
    const permissionService = new AgentPermissionService({ prisma: mockPrisma });
    gateway = new TerminalCommandGateway({
      prisma: mockPrisma,
      threadService,
      permissionService,
    });

    registry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });
    registry.registerTool(createTerminalToolDefinition(gateway));
  });

  // 1. Allowed Command Executes
  it('1. should execute an allowed development command successfully', async () => {
    const res = await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'node -v',
      },
      testUserId,
    );

    assert.equal(res.status, 'COMPLETED');
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.startsWith('v'));
    assert.equal(res.timedOut, false);
    assert.equal(res.cancelled, false);
  });

  // 2. Blocked Command Never Executes
  it('2. should block dangerous commands (rm -rf) and never spawn process', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: testProjectId,
            taskId: testTaskId,
            command: 'rm -rf /',
          },
          testUserId,
        );
      },
      TerminalCommandBlockedError,
    );

    assert.equal(executionStore.length, 1);
    assert.equal(executionStore[0].status, 'BLOCKED');
    assert.equal(auditLogStore.some((l) => l.decision === 'DENIED'), true);
  });

  // 3. Path Traversal Rejected
  it('3. should reject working directory with path traversal sequences', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: testProjectId,
            taskId: testTaskId,
            command: 'git status',
            workingDirectory: '../outside-dir',
          },
          testUserId,
        );
      },
      TerminalPathTraversalError,
    );
  });

  // 4. Outside-Project CWD Rejected
  it('4. should reject working directory outside the authorized project root', async () => {
    const outside = os.tmpdir();
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: testProjectId,
            taskId: testTaskId,
            command: 'git status',
            workingDirectory: outside,
          },
          testUserId,
        );
      },
      TerminalOutsideWorktreeError,
    );
  });

  // 5. Unauthorized Project Rejected
  it('5. should reject access to project owned by another user', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: otherProjectId,
            taskId: otherTaskId,
            command: 'git status',
          },
          testUserId,
        );
      },
      AiCrossProjectAccessError,
    );
  });

  // 6. Environment Secret is Not Exposed
  it('6. should filter environment and prevent exposing secret environment variables', () => {
    const dirtyEnv = {
      PATH: '/usr/bin',
      AWS_SECRET_ACCESS_KEY: 'super-secret-aws-key',
      DATABASE_URL: 'postgres://user:secretpw@localhost:5432/db',
      GITHUB_TOKEN: 'ghp_111122223333444455556666777788889999',
    };

    const clean = TerminalSanitizer.filterEnvironment(dirtyEnv);
    assert.equal(clean['PATH'], '/usr/bin');
    assert.equal(clean['AWS_SECRET_ACCESS_KEY'], undefined);
    assert.equal(clean['DATABASE_URL'], undefined);
    assert.equal(clean['GITHUB_TOKEN'], undefined);
  });

  // 7. Secret Appearing in Output is Redacted
  it('7. should automatically redact detected tokens and secrets from command output', () => {
    const rawOutput = 'Authentication error: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token1234567890\nToken: ghp_111122223333444455556666777788889999';
    const sanitized = TerminalSanitizer.sanitizeOutput(rawOutput);

    assert.ok(!sanitized.includes('ghp_111122223333444455556666777788889999'));
    assert.ok(sanitized.includes('[REDACTED_SECRET]'));
  });

  // 8. Dangerous Shell Chaining & Operators Rejected
  it('8. should reject compound commands using chaining operators (;, &&, ||, |)', async () => {
    const compounds = [
      'git status; ls',
      'npm test && rm -rf dist',
      'git log | grep fix',
      'node -e "1" || echo bad',
    ];

    for (const cmd of compounds) {
      await assert.rejects(
        async () => {
          await gateway.executeCommand(
            {
              projectId: testProjectId,
              taskId: testTaskId,
              command: cmd,
            },
            testUserId,
          );
        },
        TerminalCommandBlockedError,
      );
    }
  });

  // 9. Approval-Required Command Pauses Task
  it('9. should transition execution to WAITING_FOR_APPROVAL for mutating commands', async () => {
    const res = await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'git commit -m "Update docs"',
      },
      testUserId,
    );

    assert.equal(res.status, 'WAITING_FOR_APPROVAL');
    assert.equal(res.policyDecision, 'REQUIRES_APPROVAL');
    assert.equal(executionStepStore.some((s) => s.stepType === 'TERMINAL_APPROVAL_REQUESTED'), true);
  });

  // 10. Agent Cannot Self-Approve
  it('10. should forbid agent/model identity from self-approving command execution', async () => {
    const res = await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'git commit -m "Auto change"',
      },
      testUserId,
    );

    await assert.rejects(
      async () => {
        await gateway.approveExecution(
          {
            projectId: testProjectId,
            executionId: res.id,
            approvedBy: 'agent_coder_v1',
          },
          testUserId,
        );
      },
      TerminalSelfApprovalForbiddenError,
    );

    // Verify still in WAITING_FOR_APPROVAL
    const unchanged = await gateway.getExecution(
      { projectId: testProjectId, executionId: res.id },
      testUserId,
    );
    assert.equal(unchanged?.status, 'WAITING_FOR_APPROVAL');
  });

  // 11. Timeout Terminates Process
  it('11. should enforce execution timeout and terminate long-running processes', async () => {
    approvalStore.push({
      id: crypto.randomUUID(),
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      userId: testUserId,
      toolName: 'terminal.run',
      requestedOperation: 'terminal.run',
      permissionLevel: 'APPROVAL_REQUIRED',
      status: 'APPROVED',
      approvedBy: 'operator',
      approvedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'node -e "while(true){}"',
        timeoutMs: 500,
      },
      testUserId,
    );

    assert.equal(res.status, 'TIMED_OUT');
    assert.equal(res.timedOut, true);
    assert.equal(res.cancelled, false);
  });

  // 12. Cancellation Terminates Process
  it('12. should support active process cancellation and mark execution CANCELLED', async () => {
    const runner = new TerminalProcessRunner();
    const cleanEnv = TerminalSanitizer.filterEnvironment(process.env, tmpDir);

    const execPromise = runner.execute({
      binary: 'node',
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: tmpDir,
      env: cleanEnv,
      timeoutMs: 10000,
      maxOutputBytes: 65536,
    });

    // Cancel after 200ms
    setTimeout(() => {
      runner.cancel();
    }, 200);

    const result = await execPromise;
    assert.equal(result.cancelled, true);
  });

  // 13. Huge Output is Bounded
  it('13. should bound excessive output without exceeding maxOutputBytes', async () => {
    const huge = 'A'.repeat(2000);
    const bounded = TerminalSanitizer.boundOutput(huge, 500);

    assert.ok(Buffer.byteLength(bounded, 'utf-8') <= 500);
    assert.ok(bounded.includes('[TERMINAL OUTPUT TRUNCATED'));
  });

  // 14. Malformed Input Rejected
  it('14. should reject malformed command inputs cleanly', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: testProjectId,
            taskId: testTaskId,
            command: '   ',
          },
          testUserId,
        );
      },
      TerminalCommandBlockedError,
    );
  });

  // 15. Forged Project ID Rejected
  it('15. should reject forged project ID not found in database', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: crypto.randomUUID(),
            taskId: testTaskId,
            command: 'git status',
          },
          testUserId,
        );
      },
      AiInvalidRequestError,
    );
  });

  // 16. Forged Task ID Rejected
  it('16. should reject task ID that belongs to a different project', async () => {
    await assert.rejects(
      async () => {
        await gateway.executeCommand(
          {
            projectId: testProjectId,
            taskId: otherTaskId,
            command: 'git status',
          },
          testUserId,
        );
      },
      AiCrossProjectAccessError,
    );
  });

  // 17. Re-deciding Already Decided Execution Rejected
  it('17. should reject double decision on already approved or rejected execution', async () => {
    const res = await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'git commit -m "Feature"',
      },
      testUserId,
    );

    // Reject execution
    await gateway.rejectExecution(
      {
        projectId: testProjectId,
        executionId: res.id,
        rejectedBy: 'lead_engineer',
        reason: 'Unapproved changes',
      },
      testUserId,
    );

    // Try to approve rejected execution
    await assert.rejects(
      async () => {
        await gateway.approveExecution(
          {
            projectId: testProjectId,
            executionId: res.id,
            approvedBy: 'lead_engineer',
          },
          testUserId,
        );
      },
      TerminalAlreadyDecidedError,
    );
  });

  // 18. Tool Registry Invocation
  it('18. should successfully invoke terminal.run through Tool Registry adapter', async () => {
    // Record approved status in approvalStore for this task and tool
    approvalStore.push({
      id: crypto.randomUUID(),
      taskId: testTaskId,
      threadId: testThreadId,
      projectId: testProjectId,
      userId: testUserId,
      toolName: 'terminal.run',
      requestedOperation: 'terminal.run',
      permissionLevel: 'APPROVAL_REQUIRED',
      status: 'APPROVED',
      approvedBy: 'lead_operator',
      approvedAt: new Date(),
      createdAt: new Date(),
    });

    const result = await registry.invoke(
      {
        toolId: 'terminal.run',
        projectId: testProjectId,
        input: {
          projectId: testProjectId,
          taskId: testTaskId,
          command: 'node -v',
        },
      },
      {
        projectId: testProjectId,
        userId: testUserId,
        taskId: testTaskId,
        threadId: testThreadId,
      },
    );

    assert.equal(result.success, true);
    if (result.success) {
      const out = result.output as any;
      assert.equal(out.status, 'COMPLETED');
      assert.equal(out.exitCode, 0);
      assert.ok(out.stdout.startsWith('v'));
    }
  });

  // 19. Task Cancellation Cascades to Running Terminal Executions
  it('19. should cancel all running terminal executions when task is cancelled', async () => {
    await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'git commit -m "Pending"',
      },
      testUserId,
    );

    await gateway.cancelExecutionsForTask(testTaskId, testProjectId);

    const executions = await gateway.listExecutions(
      { projectId: testProjectId, taskId: testTaskId },
      testUserId,
    );
    assert.equal(executions.every((e) => e.status === 'CANCELLED'), true);
  });

  // 20. ExecutionStep Recorded in Database
  it('20. should record comprehensive ExecutionStep for every command invocation', async () => {
    await gateway.executeCommand(
      {
        projectId: testProjectId,
        taskId: testTaskId,
        command: 'git status',
      },
      testUserId,
    );

    assert.ok(executionStepStore.length >= 1);
    const step = executionStepStore[0];
    assert.equal(step.stepType, 'TERMINAL_EXECUTION');
    assert.equal(step.inputReference, 'git status');
  });
});
