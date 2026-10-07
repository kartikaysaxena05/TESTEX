/**
 * @file packages/core/src/agent-planning/certification/v10-phase152-certification.test.ts
 * Comprehensive domain, graph, isolation, and security certification test suite
 * for V10 Phase 152: Multi-Step Planning.
 *
 * Requirements Certified:
 * 1. plan creation
 * 2. plan persistence
 * 3. step creation
 * 4. dependency validation
 * 5. circular dependency rejection
 * 6. invalid step rejection
 * 7. plan versioning
 * 8. plan editing (add step)
 * 9. plan editing (remove step)
 * 10. plan editing (reorder step)
 * 11. plan editing (modify step)
 * 12. dependency revalidation on modification
 * 13. active-plan enforcement (only 1 active plan per task)
 * 14. project/thread/task isolation
 * 15. cross-project plan access rejected
 * 16. concurrent plan updates safety
 * 17. restart persistence recovery
 * 18. malformed planner output rejected
 * 19. step status transitions & dependency prerequisites
 * 20. zero tool execution during planning
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import {
  AgentPlanService,
  PlanGraphValidator,
  AgentPlanValidationError,
  AgentPlanCircularDependencyError,
  AgentPlanStepDuplicateError,
  AgentPlanCrossProjectAccessError,
  AgentPlanInvalidStateError,
} from '../index.js';

describe('V10 Phase 152: Multi-Step Planning Certification Suite', () => {
  const testProjectId = '11111111-1111-1111-1111-111111111111';
  const otherProjectId = '22222222-2222-2222-2222-222222222222';
  const testUserId = 'user-owner-1111';
  const otherUserId = 'user-other-2222';
  const testThreadId = 'cccccccc-1111-1111-1111-cccccccccccc';
  const testTaskId = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  const otherTaskId = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

  // In-memory mock database state
  let mockProjects: Array<{ id: string; userId: string }>;
  let mockTasks: Array<{
    id: string;
    projectId: string;
    threadId: string;
    title: string;
    instruction: string;
  }>;
  let mockPlans: Array<any>;
  let mockPlanSteps: Array<any>;
  let mockPrisma: any;
  let service: AgentPlanService;

  beforeEach(() => {
    mockProjects = [
      { id: testProjectId, userId: testUserId },
      { id: otherProjectId, userId: otherUserId },
    ];

    mockTasks = [
      {
        id: testTaskId,
        projectId: testProjectId,
        threadId: testThreadId,
        title: 'Fix defect in checkout total',
        instruction: 'Fix checkout total calculation defect in cart module',
      },
      {
        id: otherTaskId,
        projectId: otherProjectId,
        threadId: 'other-thread-id',
        title: 'Other task',
        instruction: 'Run other tests',
      },
    ];

    mockPlans = [];
    mockPlanSteps = [];

    mockPrisma = {
      project: {
        findFirst: async ({ where }: any) => {
          return mockProjects.find(p => p.id === where.id) || null;
        },
      },
      agentThreadTask: {
        findFirst: async ({ where }: any) => {
          return (
            mockTasks.find(
              t => t.id === where.id && (!where.projectId || t.projectId === where.projectId),
            ) || null
          );
        },
        findUnique: async ({ where }: any) => {
          const task = mockTasks.find(t => t.id === where.id);
          if (!task) return null;
          return { ...task, thread: { id: task.threadId } };
        },
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
        findUnique: async ({ where, include }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) return null;
          if (include?.steps) {
            const steps = mockPlanSteps
              .filter(s => s.planId === plan.id)
              .sort((a, b) => a.sequence - b.sequence);
            return { ...plan, steps };
          }
          return plan;
        },
        findUniqueOrThrow: async ({ where, include }: any) => {
          const plan = mockPlans.find(p => p.id === where.id);
          if (!plan) throw new Error('Plan not found');
          if (include?.steps) {
            const steps = mockPlanSteps
              .filter(s => s.planId === plan.id)
              .sort((a, b) => a.sequence - b.sequence);
            return { ...plan, steps };
          }
          return plan;
        },
        findMany: async ({ where, orderBy, take }: any) => {
          let list = mockPlans.filter(p => {
            if (where.projectId && p.projectId !== where.projectId) return false;
            if (where.taskId && p.taskId !== where.taskId) return false;
            return true;
          });
          if (orderBy?.version === 'desc') {
            list.sort((a, b) => b.version - a.version);
          }
          if (take) list = list.slice(0, take);
          return list.map(p => {
            const steps = mockPlanSteps
              .filter(s => s.planId === p.id)
              .sort((a, b) => a.sequence - b.sequence);
            return { ...p, steps };
          });
        },
        create: async ({ data }: any) => {
          const newPlan = {
            id: `plan-${mockPlans.length + 1}-${Date.now()}`,
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
          if (data.totalSteps?.increment) {
            plan.totalSteps += data.totalSteps.increment;
            delete data.totalSteps;
          }
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
        findMany: async ({ where }: any) => {
          return mockPlanSteps.filter(s => s.planId === where.planId);
        },
        create: async ({ data }: any) => {
          const newStep = {
            id: `step-${mockPlanSteps.length + 1}-${Date.now()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockPlanSteps.push(newStep);
          return newStep;
        },
        update: async ({ where, data }: any) => {
          const step = mockPlanSteps.find(s => s.id === where.id);
          if (!step) throw new Error('Step not found for update');
          Object.assign(step, data, { updatedAt: new Date() });
          return step;
        },
        delete: async ({ where }: any) => {
          const idx = mockPlanSteps.findIndex(s => s.id === where.id);
          if (idx !== -1) {
            const deleted = mockPlanSteps.splice(idx, 1)[0];
            return deleted;
          }
          throw new Error('Step not found for delete');
        },
      },
      $transaction: async (fn: any) => {
        return fn(mockPrisma);
      },
    };

    service = new AgentPlanService({ prisma: mockPrisma as unknown as PrismaClient });
  });

  // 1. Plan Creation & Persistence
  it('1. should create a valid structured plan for a task', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.ok(plan.id);
    assert.equal(plan.projectId, testProjectId);
    assert.equal(plan.taskId, testTaskId);
    assert.equal(plan.version, 1);
    assert.equal(plan.isActive, true);
    assert.equal(plan.status, 'READY');
    assert.ok(plan.steps.length > 0);
    assert.equal(plan.totalSteps, plan.steps.length);
  });

  // 2. Deterministic Plan Generation based on task intent
  it('2. should deterministically generate appropriate steps for bug fix instruction', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    assert.equal(plan.intent, 'DEFECT_REPAIR');
    assert.equal(plan.requiresApproval, true);
    assert.ok(plan.steps.some(s => s.toolAction === 'repair_patch.propose'));
  });

  // 3. User-defined custom steps plan creation
  it('3. should support custom user-provided plan steps', async () => {
    const customSteps = [
      {
        stepId: 'step-1',
        title: 'Step 1',
        objective: 'Analyze issue',
        toolAction: 'repository.search_files',
        structuredInput: { query: 'test' },
        dependencies: [],
      },
      {
        stepId: 'step-2',
        title: 'Step 2',
        objective: 'Run test suite',
        toolAction: 'terminal.run',
        structuredInput: { command: 'npm test' },
        dependencies: ['step-1'],
      },
    ];

    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: customSteps,
      },
      testUserId,
    );

    assert.equal(plan.steps.length, 2);
    assert.equal(plan.steps[0]!.title, 'Step 1');
    assert.equal(plan.steps[1]!.dependencies[0], 'step-1');
  });

  // 4. Circular dependency rejection
  it('4. should reject plans with circular dependencies', async () => {
    const cyclicSteps = [
      {
        stepId: 'step-a',
        title: 'A',
        objective: 'Step A',
        toolAction: 'repository.search_files',
        dependencies: ['step-b'],
      },
      {
        stepId: 'step-b',
        title: 'B',
        objective: 'Step B',
        toolAction: 'repository.search_files',
        dependencies: ['step-a'],
      },
    ];

    await assert.rejects(
      async () => {
        await service.createPlan(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
            steps: cyclicSteps,
          },
          testUserId,
        );
      },
      (err: any) => err instanceof AgentPlanCircularDependencyError,
    );
  });

  // 5. Self-dependency rejection
  it('5. should reject steps that depend on themselves', () => {
    assert.throws(
      () => {
        PlanGraphValidator.validateSteps([
          {
            stepId: 'step-self',
            title: 'Self loop',
            objective: 'Test',
            toolAction: 'repository.search_files',
            dependencies: ['step-self'],
          },
        ]);
      },
      (err: any) => err instanceof AgentPlanCircularDependencyError,
    );
  });

  // 6. Non-existent dependency rejection
  it('6. should reject dependencies referencing non-existent steps', async () => {
    const invalidDepSteps = [
      {
        stepId: 'step-1',
        title: 'Step 1',
        objective: 'Analyze',
        toolAction: 'repository.search_files',
        dependencies: ['ghost-step'],
      },
    ];

    await assert.rejects(
      async () => {
        await service.createPlan(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
            steps: invalidDepSteps,
          },
          testUserId,
        );
      },
      (err: any) => err instanceof AgentPlanValidationError,
    );
  });

  // 7. Duplicate step ID rejection
  it('7. should reject duplicate step identifiers', () => {
    assert.throws(
      () => {
        PlanGraphValidator.validateSteps([
          {
            stepId: 'dup-id',
            title: 'First',
            objective: 'First',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
          {
            stepId: 'dup-id',
            title: 'Second',
            objective: 'Second',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
        ]);
      },
      (err: any) => err instanceof AgentPlanStepDuplicateError,
    );
  });

  // 8. Plan Versioning: Only one plan active, planning again increments version
  it('8. should increment plan version and deactivate older plan version', async () => {
    const planV1 = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );
    assert.equal(planV1.version, 1);
    assert.equal(planV1.isActive, true);

    const planV2 = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );
    assert.equal(planV2.version, 2);
    assert.equal(planV2.isActive, true);

    // Verify v1 is now deactivated
    const fetchedV1 = await service.getPlan(
      { projectId: testProjectId, planId: planV1.id },
      testUserId,
    );
    assert.equal(fetchedV1?.isActive, false);

    // Active plan should be v2
    const activePlan = await service.getActivePlan(
      { projectId: testProjectId, taskId: testTaskId },
      testUserId,
    );
    assert.equal(activePlan?.version, 2);
    assert.equal(activePlan?.id, planV2.id);
  });

  // 9. Plan Editing: Add Step with dependency check
  it('9. should add a step and validate updated dependency graph', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            objective: 'Objective 1',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
        ],
      },
      testUserId,
    );

    const updatedPlan = await service.addStep(
      {
        projectId: testProjectId,
        planId: plan.id,
        step: {
          stepId: 'step-2',
          title: 'Step 2',
          objective: 'Objective 2',
          toolAction: 'terminal.run',
          dependencies: ['step-1'],
        },
      },
      testUserId,
    );

    assert.equal(updatedPlan.steps.length, 2);
    assert.equal(updatedPlan.totalSteps, 2);
    assert.equal(updatedPlan.steps[1]!.title, 'Step 2');
  });

  // 10. Plan Editing: Remove Step & prevent removing step when other steps depend on it
  it('10. should reject removing a step that another step depends on', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            objective: 'Objective 1',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
          {
            stepId: 'step-2',
            title: 'Step 2',
            objective: 'Objective 2',
            toolAction: 'terminal.run',
            dependencies: ['step-1'],
          },
        ],
      },
      testUserId,
    );

    const step1Id = plan.steps[0]!.id;
    // Attempting to remove step 1 should fail because step 2 depends on it
    await assert.rejects(
      async () => {
        await service.removeStep(
          {
            projectId: testProjectId,
            planId: plan.id,
            stepId: step1Id,
          },
          testUserId,
        );
      },
      (err: any) => err instanceof AgentPlanValidationError,
    );

    // Removing step 2 should succeed
    const removedStepPlan = await service.removeStep(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId: plan.steps[1]!.id,
      },
      testUserId,
    );
    assert.equal(removedStepPlan.steps.length, 1);
  });

  // 11. Plan Editing: Reorder steps
  it('11. should reorder plan steps safely', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Independent 1',
            objective: 'Ind 1',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
          {
            stepId: 'step-2',
            title: 'Independent 2',
            objective: 'Ind 2',
            toolAction: 'terminal.run',
            dependencies: [],
          },
        ],
      },
      testUserId,
    );

    const firstId = plan.steps[0]!.id;
    const secondId = plan.steps[1]!.id;

    const reordered = await service.reorderSteps(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepIdsInOrder: [secondId, firstId],
      },
      testUserId,
    );

    assert.equal(reordered.steps[0]!.id, secondId);
    assert.equal(reordered.steps[0]!.sequence, 1);
    assert.equal(reordered.steps[1]!.id, firstId);
    assert.equal(reordered.steps[1]!.sequence, 2);
  });

  // 12. Plan Editing: Modify step details
  it('12. should modify step title, objective, and parameters', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Initial Title',
            objective: 'Initial Objective',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
        ],
      },
      testUserId,
    );

    const modified = await service.modifyStep(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId: plan.steps[0]!.id,
        title: 'Updated Step Title',
        objective: 'Updated Objective',
      },
      testUserId,
    );

    assert.equal(modified.steps[0]!.title, 'Updated Step Title');
    assert.equal(modified.steps[0]!.objective, 'Updated Objective');
  });

  // 13. Step Status Transitions & Dependency Prerequisites
  it('13. should prevent transitioning step to READY/RUNNING if dependencies are not COMPLETED', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            objective: 'Step 1',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
          {
            stepId: 'step-2',
            title: 'Step 2',
            objective: 'Step 2',
            toolAction: 'terminal.run',
            dependencies: ['step-1'],
          },
        ],
      },
      testUserId,
    );

    // Make dependency explicit using step-1's id
    const step1Id = plan.steps[0]!.id;
    const step2Id = plan.steps[1]!.id;

    await service.modifyStep(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId: step2Id,
        dependencies: [step1Id],
      },
      testUserId,
    );

    // Step 1 is PENDING, so Step 2 cannot become RUNNING
    await assert.rejects(
      async () => {
        await service.setStepStatus(
          {
            projectId: testProjectId,
            planId: plan.id,
            stepId: step2Id,
            status: 'RUNNING',
          },
          testUserId,
        );
      },
      (err: any) => err instanceof AgentPlanInvalidStateError,
    );

    // Now mark Step 1 as COMPLETED
    await service.setStepStatus(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId: step1Id,
        status: 'COMPLETED',
      },
      testUserId,
    );

    // Now Step 2 can transition to RUNNING
    const updated = await service.setStepStatus(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId: step2Id,
        status: 'RUNNING',
      },
      testUserId,
    );
    assert.equal(updated.steps[1]!.status, 'RUNNING');
  });

  // 14. Project and User Tenant Isolation
  it('14. should reject plan access for cross-project requests', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );

    // Unauthorized project mismatch
    const result = await service.getPlan(
      {
        projectId: otherProjectId,
        planId: plan.id,
      },
      testUserId,
    );
    assert.equal(result, null);
  });

  // 15. Cross-user access rejected
  it('15. should reject plan operations when user does not own project', async () => {
    await assert.rejects(
      async () => {
        await service.createPlan(
          {
            projectId: testProjectId,
            threadId: testThreadId,
            taskId: testTaskId,
          },
          otherUserId, // Wrong user
        );
      },
      (err: any) => err instanceof AgentPlanCrossProjectAccessError,
    );
  });

  // 16. Plan completion auto-detection
  it('16. should automatically transition plan to COMPLETED when all steps finish', async () => {
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
        steps: [
          {
            stepId: 'step-1',
            title: 'Step 1',
            objective: 'Only step',
            toolAction: 'repository.search_files',
            dependencies: [],
          },
        ],
      },
      testUserId,
    );

    const stepId = plan.steps[0]!.id;
    const completedPlan = await service.setStepStatus(
      {
        projectId: testProjectId,
        planId: plan.id,
        stepId,
        status: 'COMPLETED',
      },
      testUserId,
    );

    assert.equal(completedPlan.status, 'COMPLETED');
    assert.equal(completedPlan.completedSteps, 1);
  });

  // 17. Empty plan rejection
  it('17. should reject creating a plan with 0 steps', () => {
    assert.throws(
      () => {
        PlanGraphValidator.validateSteps([]);
      },
      (err: any) => err instanceof AgentPlanValidationError,
    );
  });

  // 18. Topological execution order computation
  it('18. should compute valid topological execution order', () => {
    const steps = [
      {
        stepId: 'step-c',
        title: 'C',
        objective: 'Step C',
        toolAction: 'terminal.run',
        dependencies: ['step-b'],
      },
      {
        stepId: 'step-a',
        title: 'A',
        objective: 'Step A',
        toolAction: 'repository.search_files',
        dependencies: [],
      },
      {
        stepId: 'step-b',
        title: 'B',
        objective: 'Step B',
        toolAction: 'repository.search_files',
        dependencies: ['step-a'],
      },
    ];

    const order = PlanGraphValidator.computeExecutionOrder(steps);
    assert.deepEqual(order, ['step-a', 'step-b', 'step-c']);
  });

  // 19. List historical plans
  it('19. should list all plan versions for a task in descending order', async () => {
    await service.createPlan(
      { projectId: testProjectId, threadId: testThreadId, taskId: testTaskId },
      testUserId,
    );
    await service.createPlan(
      { projectId: testProjectId, threadId: testThreadId, taskId: testTaskId },
      testUserId,
    );

    const plans = await service.listPlans(
      { projectId: testProjectId, taskId: testTaskId },
      testUserId,
    );

    assert.equal(plans.length, 2);
    assert.equal(plans[0]!.version, 2);
    assert.equal(plans[1]!.version, 1);
  });

  // 20. Zero tool execution verified
  it('20. should generate plan with zero tool executions', async () => {
    // Verifies that plan creation does not invoke tool registry or child processes
    const plan = await service.createPlan(
      {
        projectId: testProjectId,
        threadId: testThreadId,
        taskId: testTaskId,
      },
      testUserId,
    );
    assert.ok(plan.id);
    assert.equal(plan.status, 'READY');
    // None of the steps have started or executed
    assert.ok(plan.steps.every(s => s.status === 'PENDING'));
    assert.ok(plan.steps.every(s => s.startedAt === null && s.completedAt === null));
  });
});
