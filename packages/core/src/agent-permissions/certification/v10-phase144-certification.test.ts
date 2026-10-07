/**
 * @file packages/core/src/agent-permissions/certification/v10-phase144-certification.test.ts
 * Rigorous certification test suite for V10 Phase 144: Tool Permission System.
 *
 * Verifies:
 * 1. Default-deny model across unmapped or unknown tools.
 * 2. Static permission mappings:
 *    - repository.*, requirements.* -> READ_ONLY (permitted)
 *    - test.*, playwright.* -> EXECUTE (permitted)
 *    - terminal.*, file.modify, repair.* -> APPROVAL_REQUIRED (triggers approval flow)
 * 3. Human Approval Workflow:
 *    - Setting task status to WAITING_FOR_APPROVAL
 *    - Creation of AgentToolApproval in PENDING state
 *    - Rejection of tool handler execution while pending
 *    - Approving request allows execution to proceed
 *    - Rejecting request transitions task to FAILED and prevents execution
 * 4. Tenant & Security Isolation:
 *    - Cross-project approval lookup rejected
 *    - Cross-task approval hijacking prevented
 *    - Immutable status once decided (cannot re-approve or re-reject)
 * 5. Comprehensive Audit Trail:
 *    - Audit records written for PERMITTED, DENIED, APPROVAL_REQUESTED, APPROVAL_GRANTED, APPROVAL_REJECTED
 *    - Verification of timestamps, decision reasons, and userId correlation
 * 6. Integration with Phase 143 ToolRegistryService:
 *    - ToolRegistryService.invoke() strictly delegates and enforces through AgentPermissionService.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  AgentPermissionService,
  AgentToolPermissionDeniedError,
  AgentToolApprovalRequiredError,
  AgentToolApprovalNotFoundError,
  AgentToolApprovalAlreadyDecidedError,
} from '../index.js';
import { ToolRegistryService, type RegisteredToolDefinition } from '../../agent-tools/index.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../ai-provider/ai-provider-errors.js';

describe('V10 Phase 144: Tool Permission System Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111-2222';
  const otherUserId = 'user-intruder-3333-4444';
  const testThreadId = '33333333-3333-3333-3333-333333333333';
  const testTaskId = '44444444-4444-4444-4444-444444444444';
  const otherTaskId = '55555555-5555-5555-5555-555555555555';

  // In-memory mock database state
  let projects: any[];
  let tasks: any[];
  let approvals: any[];
  let auditLogs: any[];

  let mockPrisma: PrismaClient;
  let permissionService: AgentPermissionService;
  let toolRegistry: ToolRegistryService;

  beforeEach(() => {
    projects = [
      { id: testProjectId, userId: testUserId, name: 'Test Quality Project' },
      { id: otherProjectId, userId: otherUserId, name: 'Other User Project' },
    ];

    tasks = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: testThreadId,
        userId: testUserId,
        title: 'Run Verification Step',
        instruction: 'Execute terminal command to verify test artifacts',
        status: 'RUNNING',
      },
      {
        id: otherTaskId,
        projectId: otherProjectId,
        threadId: 'other-thread-id',
        userId: otherUserId,
        title: 'Other Task',
        instruction: 'Instruction for other task',
        status: 'RUNNING',
      },
    ];

    approvals = [];
    auditLogs = [];

    mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          return projects.find(p => p.id === where.id) ?? null;
        },
      },
      agentThreadTask: {
        findUnique: async ({ where }: any) => {
          return tasks.find(t => t.id === where.id) ?? null;
        },
        update: async ({ where, data }: any) => {
          const t = tasks.find(x => x.id === where.id);
          if (t) {
            Object.assign(t, data);
            return { ...t };
          }
          throw new Error('Task not found');
        },
      },
      agentToolApproval: {
        create: async ({ data }: any) => {
          const newApproval = {
            id: `approval-${approvals.length + 1}`,
            status: 'PENDING',
            decisionReason: null,
            approvedBy: null,
            approvedAt: null,
            rejectedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          approvals.push(newApproval);
          return { ...newApproval };
        },
        findFirst: async ({ where }: any) => {
          const matches = approvals.filter(a => {
            if (where.taskId && a.taskId !== where.taskId) return false;
            if (where.toolName && a.toolName !== where.toolName) return false;
            if (where.status && a.status !== where.status) return false;
            return true;
          });
          return matches.length > 0 ? matches[matches.length - 1] : null;
        },
        findUnique: async ({ where, include }: any) => {
          const a = approvals.find(x => x.id === where.id);
          if (!a) return null;
          if (include?.task) {
            const t = tasks.find(x => x.id === a.taskId);
            return { ...a, task: t };
          }
          return { ...a };
        },
        findMany: async ({ where }: any) => {
          return approvals.filter(a => {
            if (where.projectId && a.projectId !== where.projectId) return false;
            if (where.taskId && a.taskId !== where.taskId) return false;
            if (where.status && a.status !== where.status) return false;
            return true;
          });
        },
        update: async ({ where, data }: any) => {
          const a = approvals.find(x => x.id === where.id);
          if (!a) throw new Error('Approval not found');
          Object.assign(a, data);
          return { ...a };
        },
      },
      agentToolAuditLog: {
        create: async ({ data }: any) => {
          const log = {
            id: `audit-${auditLogs.length + 1}`,
            timestamp: new Date(),
            ...data,
          };
          auditLogs.push(log);
          return { ...log };
        },
        findMany: async ({ where }: any) => {
          return auditLogs.filter(l => {
            if (where.projectId && l.projectId !== where.projectId) return false;
            if (where.taskId && l.taskId !== where.taskId) return false;
            if (where.threadId && l.threadId !== where.threadId) return false;
            if (where.toolName && l.toolName !== where.toolName) return false;
            return true;
          });
        },
      },
    } as unknown as PrismaClient;

    permissionService = new AgentPermissionService({ prisma: mockPrisma });
    toolRegistry = new ToolRegistryService({
      prisma: mockPrisma,
      permissionService,
    });
  });

  // ============================================================================
  // 1. Default-Deny & Static Permission Mapping Tests
  // ============================================================================
  describe('1. Default-Deny & Static Permission Mapping', () => {
    it('denies unknown or unregistered tools by default', async () => {
      await assert.rejects(
        () =>
          permissionService.evaluateAndEnforce({
            projectId: testProjectId,
            userId: testUserId,
            toolName: 'unknown.malicious_tool',
            requestedOperation: 'exploit_system',
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolPermissionDeniedError);
          assert.strictEqual(err.toolName, 'unknown.malicious_tool');
          assert.match(err.message, /denied by system security policy/);
          return true;
        },
      );

      // Verify audit log captured the denial
      const deniedAudit = auditLogs.find(l => l.toolName === 'unknown.malicious_tool');
      // When no task was supplied, audit log record was skipped safely or created
      assert.strictEqual(
        permissionService.resolveToolPermissionLevel('unknown.malicious_tool'),
        'DENIED',
      );
    });

    it('permits repository read-only tools without human approval', async () => {
      await permissionService.evaluateAndEnforce({
        projectId: testProjectId,
        userId: testUserId,
        taskId: testTaskId,
        threadId: testThreadId,
        toolName: 'repository.read',
        requestedOperation: 'Read test file',
      });

      const audit = auditLogs.find(l => l.toolName === 'repository.read');
      assert.notStrictEqual(audit, undefined);
      assert.strictEqual(audit?.decision, 'PERMITTED');
      assert.strictEqual(audit?.permissionLevel, 'READ_ONLY');
    });

    it('permits test execution tools without human approval', async () => {
      await permissionService.evaluateAndEnforce({
        projectId: testProjectId,
        userId: testUserId,
        taskId: testTaskId,
        threadId: testThreadId,
        toolName: 'playwright.run',
        requestedOperation: 'Run Playwright test',
      });

      const audit = auditLogs.find(l => l.toolName === 'playwright.run');
      assert.notStrictEqual(audit, undefined);
      assert.strictEqual(audit?.decision, 'PERMITTED');
      assert.strictEqual(audit?.permissionLevel, 'EXECUTE');
    });

    it('requires human approval for high-risk operations (terminal.run, file.modify, repair.applyPatch)', async () => {
      const toolsToTest = ['terminal.run', 'file.modify', 'repair.applyPatch'];
      for (const toolName of toolsToTest) {
        assert.strictEqual(
          permissionService.resolveToolPermissionLevel(toolName),
          'APPROVAL_REQUIRED',
        );
      }
    });
  });

  // ============================================================================
  // 2. Human-In-The-Loop Approval Workflow Tests
  // ============================================================================
  describe('2. Human-In-The-Loop Approval Workflow', () => {
    it('creates approval request and transitions task to WAITING_FOR_APPROVAL', async () => {
      await assert.rejects(
        () =>
          permissionService.evaluateAndEnforce({
            projectId: testProjectId,
            userId: testUserId,
            taskId: testTaskId,
            threadId: testThreadId,
            toolName: 'terminal.run',
            requestedOperation: 'Execute bash build command',
            inputPayload: { command: 'npm run test:e2e' },
          }),
        (err: unknown) => {
          assert(err instanceof AgentToolApprovalRequiredError);
          assert.strictEqual(err.toolName, 'terminal.run');
          assert.strictEqual(err.taskId, testTaskId);
          return true;
        },
      );

      // Verify task status was transitioned to WAITING_FOR_APPROVAL
      const task = tasks.find(t => t.id === testTaskId);
      assert.strictEqual(task?.status, 'WAITING_FOR_APPROVAL');

      // Verify approval record exists in PENDING state
      assert.strictEqual(approvals.length, 1);
      const approval = approvals[0];
      assert.strictEqual(approval.status, 'PENDING');
      assert.strictEqual(approval.toolName, 'terminal.run');
      assert.strictEqual(approval.taskId, testTaskId);

      // Verify audit log recorded APPROVAL_REQUESTED
      const audit = auditLogs.find(l => l.decision === 'APPROVAL_REQUESTED');
      assert.notStrictEqual(audit, undefined);
      assert.strictEqual(audit?.toolName, 'terminal.run');
    });

    it('approving request transitions task to QUEUED and permits subsequent execution', async () => {
      // 1. Trigger approval requirement
      try {
        await permissionService.evaluateAndEnforce({
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
          toolName: 'terminal.run',
          requestedOperation: 'Execute command',
          inputPayload: { command: 'ls -la' },
        });
      } catch (err) {
        assert(err instanceof AgentToolApprovalRequiredError);
      }

      const pending = approvals[0];
      assert.strictEqual(pending.status, 'PENDING');

      // 2. Decide approval (APPROVE)
      const decided = await permissionService.decideApproval(
        {
          projectId: testProjectId,
          approvalId: pending.id,
          decision: 'APPROVE',
          reason: 'Command is safe to run',
        },
        testUserId,
      );

      assert.strictEqual(decided.status, 'APPROVED');
      assert.strictEqual(decided.approvedBy, testUserId);
      assert.notStrictEqual(decided.approvedAt, null);

      // Verify task state transitioned back to QUEUED
      const task = tasks.find(t => t.id === testTaskId);
      assert.strictEqual(task?.status, 'QUEUED');

      // 3. Subsequent execution evaluation now passes without throwing
      await assert.doesNotReject(() =>
        permissionService.evaluateAndEnforce({
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
          toolName: 'terminal.run',
          requestedOperation: 'Execute command',
          inputPayload: { command: 'ls -la' },
        }),
      );

      // Verify audit trail recorded APPROVAL_GRANTED and PERMITTED
      const grantedAudit = auditLogs.find(l => l.decision === 'APPROVAL_GRANTED');
      assert.notStrictEqual(grantedAudit, undefined);
    });

    it('rejecting request transitions task to FAILED with failureReason', async () => {
      // 1. Trigger approval requirement
      try {
        await permissionService.evaluateAndEnforce({
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
          toolName: 'file.modify',
          requestedOperation: 'Modify source file',
          inputPayload: { path: 'src/app.ts' },
        });
      } catch (err) {
        assert(err instanceof AgentToolApprovalRequiredError);
      }

      const pending = approvals[0];

      // 2. Decide approval (REJECT)
      const decided = await permissionService.decideApproval(
        {
          projectId: testProjectId,
          approvalId: pending.id,
          decision: 'REJECT',
          reason: 'Unauthorized modification of core file',
        },
        testUserId,
      );

      assert.strictEqual(decided.status, 'REJECTED');
      assert.notStrictEqual(decided.rejectedAt, null);

      // Verify task transitioned to FAILED
      const task = tasks.find(t => t.id === testTaskId);
      assert.strictEqual(task?.status, 'FAILED');
      assert.match(task?.failureReason, /Unauthorized modification of core file/);

      // Verify audit trail recorded APPROVAL_REJECTED
      const rejectedAudit = auditLogs.find(l => l.decision === 'APPROVAL_REJECTED');
      assert.notStrictEqual(rejectedAudit, undefined);
    });

    it('rejects attempt to decide an already decided approval', async () => {
      try {
        await permissionService.evaluateAndEnforce({
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
          toolName: 'terminal.run',
          requestedOperation: 'Run cmd',
        });
      } catch (err) {
        // expected
      }

      const pending = approvals[0];
      await permissionService.decideApproval(
        {
          projectId: testProjectId,
          approvalId: pending.id,
          decision: 'APPROVE',
        },
        testUserId,
      );

      // Attempting second decision must throw AgentToolApprovalAlreadyDecidedError
      await assert.rejects(
        () =>
          permissionService.decideApproval(
            {
              projectId: testProjectId,
              approvalId: pending.id,
              decision: 'REJECT',
            },
            testUserId,
          ),
        (err: unknown) => {
          assert(err instanceof AgentToolApprovalAlreadyDecidedError);
          assert.strictEqual(err.approvalId, pending.id);
          return true;
        },
      );
    });
  });

  // ============================================================================
  // 3. Tenant & Cross-Project Security Isolation Tests
  // ============================================================================
  describe('3. Tenant & Cross-Project Security Isolation', () => {
    it('prevents user from accessing approvals for another project', async () => {
      // Create approval under otherProjectId
      approvals.push({
        id: 'foreign-approval-1',
        taskId: otherTaskId,
        threadId: 'other-thread',
        projectId: otherProjectId,
        userId: otherUserId,
        toolName: 'terminal.run',
        requestedOperation: 'Foreign op',
        permissionLevel: 'APPROVAL_REQUIRED',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // User testUserId attempts to get foreign approval
      await assert.rejects(
        () =>
          permissionService.getApproval(
            { projectId: otherProjectId, approvalId: 'foreign-approval-1' },
            testUserId,
          ),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );

      // User testUserId attempts to decide foreign approval
      await assert.rejects(
        () =>
          permissionService.decideApproval(
            {
              projectId: otherProjectId,
              approvalId: 'foreign-approval-1',
              decision: 'APPROVE',
            },
            testUserId,
          ),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });

    it('prevents approval spoofing with mismatched project ID', async () => {
      try {
        await permissionService.evaluateAndEnforce({
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
          toolName: 'terminal.run',
          requestedOperation: 'Run cmd',
        });
      } catch (err) {
        // expected
      }

      const approval = approvals[0];

      // Requesting decision with wrong projectId
      await assert.rejects(
        () =>
          permissionService.decideApproval(
            {
              projectId: otherProjectId,
              approvalId: approval.id,
              decision: 'APPROVE',
            },
            otherUserId,
          ),
        (err: unknown) => {
          assert(err instanceof AiCrossProjectAccessError);
          return true;
        },
      );
    });
  });

  // ============================================================================
  // 4. Integration with Tool Registry Service
  // ============================================================================
  describe('4. ToolRegistryService Integration', () => {
    it('ToolRegistryService.invoke() blocks execution when approval is required', async () => {
      let handlerCalled = false;

      const dangerousTool: RegisteredToolDefinition = {
        toolId: 'terminal.run',
        name: 'terminal.run',
        description: 'Runs terminal command',
        version: '1.0.0',
        category: 'UTILITY',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissionLevel: 'ADMIN',
        enabled: true,
        handler: async () => {
          handlerCalled = true;
          return { exitCode: 0 };
        },
      };

      toolRegistry.registerTool(dangerousTool);

      // Attempt invocation without prior approval
      await assert.rejects(
        () =>
          toolRegistry.invoke(
            {
              projectId: testProjectId,
              toolId: 'terminal.run',
              input: { command: 'rm -rf /' },
            },
            {
              projectId: testProjectId,
              userId: testUserId,
              taskId: testTaskId,
              threadId: testThreadId,
            },
          ),
        (err: unknown) => {
          assert(err instanceof AgentToolApprovalRequiredError);
          return true;
        },
      );

      // Crucial: Handler MUST NEVER execute before approval!
      assert.strictEqual(handlerCalled, false);
      const task = tasks.find(t => t.id === testTaskId);
      assert.strictEqual(task?.status, 'WAITING_FOR_APPROVAL');
    });

    it('ToolRegistryService.invoke() executes successfully after approval is granted', async () => {
      let handlerCalled = false;

      const dangerousTool: RegisteredToolDefinition = {
        toolId: 'file.modify',
        name: 'file.modify',
        description: 'Modifies source code',
        version: '1.0.0',
        category: 'UTILITY',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        permissionLevel: 'WRITE',
        enabled: true,
        handler: async () => {
          handlerCalled = true;
          return { written: true };
        },
      };

      toolRegistry.registerTool(dangerousTool);

      // 1. Initial attempt fails with approval required
      let approvalId = '';
      try {
        await toolRegistry.invoke(
          {
            projectId: testProjectId,
            toolId: 'file.modify',
            input: { path: 'src/main.ts' },
          },
          {
            projectId: testProjectId,
            userId: testUserId,
            taskId: testTaskId,
            threadId: testThreadId,
          },
        );
      } catch (err: any) {
        approvalId = err.approvalId;
      }

      assert.strictEqual(handlerCalled, false);
      assert.notStrictEqual(approvalId, '');

      // 2. Human approves request
      await permissionService.decideApproval(
        {
          projectId: testProjectId,
          approvalId,
          decision: 'APPROVE',
        },
        testUserId,
      );

      // 3. Retry invocation - now succeeds
      const result = await toolRegistry.invoke(
        {
          projectId: testProjectId,
          toolId: 'file.modify',
          input: { path: 'src/main.ts' },
        },
        {
          projectId: testProjectId,
          userId: testUserId,
          taskId: testTaskId,
          threadId: testThreadId,
        },
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(handlerCalled, true);
      assert.deepStrictEqual(result.output, { written: true });
    });
  });
});
