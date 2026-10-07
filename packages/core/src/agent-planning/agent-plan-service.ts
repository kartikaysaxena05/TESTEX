/**
 * @file packages/core/src/agent-planning/agent-plan-service.ts
 * Privileged business domain service for V10 Phase 152: Multi-Step Planning.
 *
 * Guarantees:
 * 1. Strict Tenant Isolation (userId -> projectId -> threadId -> taskId -> planId).
 * 2. Plan Versioning: Only one plan is active at a time for a task. Planning again
 *    creates a new version and marks prior versions inactive.
 * 3. Dependency Graph Validation: Circular dependencies and invalid references
 *    are rejected with explicit domain errors.
 * 4. Plan Editing: addStep, removeStep, reorderSteps, modifyStep, setStepStatus, setPlanStatus.
 *    Graph integrity is revalidated after every modification.
 * 5. Zero tool execution occurs during planning operations.
 * 6. Audit Trail: Logs planning events.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import {
  type AgentPlanExecutionDto,
  type AgentPlanStepExecutionDto,
  type CreateAgentPlanInputDto,
  type GetAgentPlanInputDto,
  type ListAgentPlansInputDto,
  type GetActiveAgentPlanInputDto,
  type AddAgentPlanStepInputDto,
  type RemoveAgentPlanStepInputDto,
  type ReorderAgentPlanStepsInputDto,
  type ModifyAgentPlanStepInputDto,
  type SetAgentPlanStepStatusInputDto,
  type SetAgentPlanStatusInputDto,
  type AgentPlanExecutionStatus,
  type AgentPlanStepExecutionStatus,
  type PlannedStepDefinitionDto,
} from '@ai-quality/contracts';
import {
  AgentPlanNotFoundError,
  AgentPlanStepNotFoundError,
  AgentPlanCrossProjectAccessError,
  AgentPlanValidationError,
  AgentPlanInvalidStateError,
} from './agent-plan-errors.js';
import { PlanGraphValidator } from './plan-graph-validator.js';
import { AgentPlanGenerator } from './agent-plan-generator.js';

export interface AgentPlanServiceDependencies {
  prisma?: PrismaClient;
  logger?: ILogger;
}

export class AgentPlanService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;

  constructor(deps?: AgentPlanServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
  }

  // ============================================================================
  // 1. Plan Creation & Versioning
  // ============================================================================

  public async createPlan(
    input: CreateAgentPlanInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    await this.assertTaskAccess(input.projectId, input.threadId, input.taskId, userId);

    const task = await this.prisma.agentThreadTask.findUnique({
      where: { id: input.taskId },
      include: { thread: true },
    });

    if (!task) {
      throw new AgentPlanValidationError(`Task "${input.taskId}" was not found.`);
    }

    // Determine steps to use: caller-supplied or generated
    let stepsToPersist: PlannedStepDefinitionDto[];
    let summary = input.summary?.trim() || '';
    let intent = input.intent?.trim() || '';
    let requiresApproval = false;

    if (input.steps && input.steps.length > 0) {
      stepsToPersist = input.steps;
      summary = summary || `Execution plan for task "${task.title}"`;
      intent = intent || 'USER_SPECIFIED_PLAN';
    } else {
      const generated = AgentPlanGenerator.generatePlan({
        instruction: task.instruction,
        taskTitle: task.title,
      });
      stepsToPersist = generated.steps;
      summary = summary || generated.summary;
      intent = intent || generated.intent;
      requiresApproval = generated.requiresApproval;
    }

    // Ensure sequences and map steps for validation
    const normalizedSteps = stepsToPersist.map((s, idx) => ({
      ...s,
      stepId: s.stepId || `step-${idx + 1}`,
      sequence: s.sequence !== undefined && s.sequence > 0 ? s.sequence : idx + 1,
      dependencies: s.dependencies ?? [],
    }));

    // Validate graph integrity
    PlanGraphValidator.validateSteps(normalizedSteps);

    // Atomic transaction: determine next version, deactivate older versions, create plan and steps
    return await this.prisma.$transaction(async tx => {
      // Find latest version
      const latestPlan = await tx.agentPlan.findFirst({
        where: { taskId: input.taskId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = latestPlan ? latestPlan.version + 1 : 1;

      // Deactivate all older plans for this task
      await tx.agentPlan.updateMany({
        where: { taskId: input.taskId, isActive: true },
        data: { isActive: false },
      });

      // Create new active plan
      const newPlan = await tx.agentPlan.create({
        data: {
          projectId: input.projectId,
          threadId: input.threadId,
          taskId: input.taskId,
          version: nextVersion,
          isActive: true,
          status: 'READY',
          summary,
          intent,
          totalSteps: normalizedSteps.length,
          completedSteps: 0,
          requiresApproval,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? {},
        },
      });

      // Insert steps
      for (const step of normalizedSteps) {
        await tx.agentPlanStep.create({
          data: {
            planId: newPlan.id,
            sequence: step.sequence,
            title: step.title,
            objective: step.objective,
            toolAction: step.toolAction,
            structuredInput: (step.structuredInput as Prisma.InputJsonValue) ?? {},
            dependencies: step.dependencies ?? [],
            status: 'PENDING',
          },
        });
      }

      const createdWithSteps = await tx.agentPlan.findUniqueOrThrow({
        where: { id: newPlan.id },
        include: {
          steps: {
            orderBy: { sequence: 'asc' },
          },
        },
      });

      this.logger.info(
        `[AgentPlanService] Created plan ${newPlan.id} v${nextVersion} for task ${input.taskId}`,
      );
      return this.mapPlanToDto(createdWithSteps);
    });
  }

  // ============================================================================
  // 2. Querying Plans
  // ============================================================================

  public async getPlan(
    input: GetAgentPlanInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto | null> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!plan || plan.projectId !== input.projectId) {
      return null;
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    return this.mapPlanToDto(plan);
  }

  public async getActivePlan(
    input: GetActiveAgentPlanInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto | null> {
    await this.assertTaskAccess(input.projectId, undefined, input.taskId, userId);

    const plan = await this.prisma.agentPlan.findFirst({
      where: {
        projectId: input.projectId,
        taskId: input.taskId,
        isActive: true,
      },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return plan ? this.mapPlanToDto(plan) : null;
  }

  public async listPlans(
    input: ListAgentPlansInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto[]> {
    await this.assertTaskAccess(input.projectId, undefined, input.taskId, userId);

    const plans = await this.prisma.agentPlan.findMany({
      where: {
        projectId: input.projectId,
        taskId: input.taskId,
      },
      orderBy: { version: 'desc' },
      take: input.limit ?? 50,
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return plans.map(p => this.mapPlanToDto(p));
  }

  // ============================================================================
  // 3. Plan Editing (Add, Remove, Reorder, Modify)
  // ============================================================================

  public async addStep(
    input: AddAgentPlanStepInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found in project.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') {
      throw new AgentPlanInvalidStateError(
        `Cannot add step to plan "${plan.id}" in state "${plan.status}".`,
      );
    }

    const nextSeq = input.step.sequence ?? plan.steps.length + 1;
    const candidateStep = {
      ...input.step,
      sequence: nextSeq,
      stepId: input.step.stepId || `step-${nextSeq}`,
      dependencies: input.step.dependencies ?? [],
    };

    // Reconstruct list of steps and validate graph
    const combined = [
      ...plan.steps.map(s => ({
        id: s.id,
        stepId: s.id,
        sequence: s.sequence,
        title: s.title,
        objective: s.objective,
        toolAction: s.toolAction,
        dependencies: (s.dependencies as string[]) ?? [],
      })),
      candidateStep,
    ];

    PlanGraphValidator.validateSteps(combined);

    return await this.prisma.$transaction(async tx => {
      await tx.agentPlanStep.create({
        data: {
          planId: plan.id,
          sequence: candidateStep.sequence,
          title: candidateStep.title,
          objective: candidateStep.objective,
          toolAction: candidateStep.toolAction,
          structuredInput: (candidateStep.structuredInput as Prisma.InputJsonValue) ?? {},
          dependencies: candidateStep.dependencies,
          status: 'PENDING',
        },
      });

      await tx.agentPlan.update({
        where: { id: plan.id },
        data: {
          totalSteps: { increment: 1 },
        },
      });

      const updated = await tx.agentPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      return this.mapPlanToDto(updated);
    });
  }

  public async removeStep(
    input: RemoveAgentPlanStepInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    if (plan.status === 'COMPLETED' || plan.status === 'CANCELLED') {
      throw new AgentPlanInvalidStateError(
        `Cannot remove step from plan "${plan.id}" in state "${plan.status}".`,
      );
    }

    const stepIndex = plan.steps.findIndex(s => s.id === input.stepId);
    if (stepIndex === -1) {
      throw new AgentPlanStepNotFoundError(`Step "${input.stepId}" not found in plan.`);
    }

    const remainingSteps = plan.steps.filter(s => s.id !== input.stepId);
    if (remainingSteps.length === 0) {
      throw new AgentPlanValidationError('A plan must contain at least one step.');
    }

    const targetStep = plan.steps[stepIndex]!;
    const targetAliases = new Set<string>([
      input.stepId,
      targetStep.id,
      `step-${targetStep.sequence}`,
    ]);

    // Check if other steps depend on the removed step
    for (const step of remainingSteps) {
      const deps = (step.dependencies as string[]) ?? [];
      const hasDep = deps.some(d => targetAliases.has(d));
      if (hasDep) {
        throw new AgentPlanValidationError(
          `Cannot remove step "${input.stepId}" because step "${step.title}" (${step.id}) depends on it.`,
        );
      }
    }

    // Renumber remaining steps sequences to remain contiguous
    const renumbered = remainingSteps.map((s, idx) => ({
      id: s.id,
      sequence: idx + 1,
      title: s.title,
      objective: s.objective,
      toolAction: s.toolAction,
      dependencies: (s.dependencies as string[]) ?? [],
    }));

    PlanGraphValidator.validateSteps(renumbered);

    return await this.prisma.$transaction(async tx => {
      await tx.agentPlanStep.delete({
        where: { id: input.stepId },
      });

      for (let i = 0; i < renumbered.length; i++) {
        const item = renumbered[i]!;
        await tx.agentPlanStep.update({
          where: { id: item.id },
          data: { sequence: item.sequence },
        });
      }

      await tx.agentPlan.update({
        where: { id: plan.id },
        data: { totalSteps: renumbered.length },
      });

      const updated = await tx.agentPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      return this.mapPlanToDto(updated);
    });
  }

  public async reorderSteps(
    input: ReorderAgentPlanStepsInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    if (input.stepIdsInOrder.length !== plan.steps.length) {
      throw new AgentPlanValidationError(
        `Reordered step count (${input.stepIdsInOrder.length}) does not match existing plan steps (${plan.steps.length}).`,
      );
    }

    const stepMap = new Map(plan.steps.map(s => [s.id, s]));
    const reordered: Array<{
      id: string;
      sequence: number;
      title: string;
      objective: string;
      toolAction: string;
      dependencies: string[];
    }> = [];

    for (let i = 0; i < input.stepIdsInOrder.length; i++) {
      const stepId = input.stepIdsInOrder[i]!;
      const step = stepMap.get(stepId);
      if (!step) {
        throw new AgentPlanStepNotFoundError(`Step "${stepId}" does not exist in this plan.`);
      }
      reordered.push({
        id: step.id,
        sequence: i + 1,
        title: step.title,
        objective: step.objective,
        toolAction: step.toolAction,
        dependencies: (step.dependencies as string[]) ?? [],
      });
    }

    // Validate graph with new ordering
    PlanGraphValidator.validateSteps(reordered);

    return await this.prisma.$transaction(async tx => {
      // Temporary shift sequence to avoid unique constraint collisions
      for (let i = 0; i < reordered.length; i++) {
        const item = reordered[i]!;
        await tx.agentPlanStep.update({
          where: { id: item.id },
          data: { sequence: 10000 + i },
        });
      }

      // Assign actual sequences
      for (let i = 0; i < reordered.length; i++) {
        const item = reordered[i]!;
        await tx.agentPlanStep.update({
          where: { id: item.id },
          data: { sequence: item.sequence },
        });
      }

      const updated = await tx.agentPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      });
      return this.mapPlanToDto(updated);
    });
  }

  public async modifyStep(
    input: ModifyAgentPlanStepInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    const targetStep = plan.steps.find(s => s.id === input.stepId);
    if (!targetStep) {
      throw new AgentPlanStepNotFoundError(`Step "${input.stepId}" not found in plan.`);
    }

    // Construct preview of modified steps
    const previewSteps = plan.steps.map(s => {
      if (s.id !== input.stepId) {
        return {
          id: s.id,
          sequence: s.sequence,
          title: s.title,
          objective: s.objective,
          toolAction: s.toolAction,
          dependencies: (s.dependencies as string[]) ?? [],
        };
      }
      return {
        id: s.id,
        sequence: s.sequence,
        title: input.title !== undefined ? input.title.trim() : s.title,
        objective: input.objective !== undefined ? input.objective.trim() : s.objective,
        toolAction: input.toolAction !== undefined ? input.toolAction.trim() : s.toolAction,
        dependencies:
          input.dependencies !== undefined ? input.dependencies : (s.dependencies as string[]),
      };
    });

    PlanGraphValidator.validateSteps(previewSteps);

    const dataToUpdate: Record<string, unknown> = {};
    if (input.title !== undefined) dataToUpdate.title = input.title.trim();
    if (input.objective !== undefined) dataToUpdate.objective = input.objective.trim();
    if (input.toolAction !== undefined) dataToUpdate.toolAction = input.toolAction.trim();
    if (input.structuredInput !== undefined) dataToUpdate.structuredInput = input.structuredInput;
    if (input.dependencies !== undefined) dataToUpdate.dependencies = input.dependencies;

    await this.prisma.agentPlanStep.update({
      where: { id: input.stepId },
      data: dataToUpdate,
    });

    const updated = await this.prisma.agentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    return this.mapPlanToDto(updated);
  }

  // ============================================================================
  // 4. Status Transitions (Step and Plan Status)
  // ============================================================================

  public async setStepStatus(
    input: SetAgentPlanStepStatusInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    const step = plan.steps.find(s => s.id === input.stepId);
    if (!step) {
      throw new AgentPlanStepNotFoundError(`Step "${input.stepId}" not found in plan.`);
    }

    // Dependency check: if transitioning to READY or RUNNING, verify dependencies are COMPLETED
    if (input.status === 'READY' || input.status === 'RUNNING') {
      const deps = (step.dependencies as string[]) ?? [];
      const stepMap = new Map(plan.steps.map(s => [s.id, s]));

      for (const depId of deps) {
        const depStep = stepMap.get(depId);
        if (depStep && depStep.status !== 'COMPLETED') {
          throw new AgentPlanInvalidStateError(
            `Cannot transition step "${step.title}" to ${input.status}: dependency "${depStep.title}" is ${depStep.status} (must be COMPLETED).`,
          );
        }
      }
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: input.status,
    };

    if (input.resultReference !== undefined) updateData.resultReference = input.resultReference;
    if (input.errorInfo !== undefined) updateData.errorInfo = input.errorInfo;
    if (input.status === 'RUNNING' && !step.startedAt) updateData.startedAt = now;
    if (input.status === 'COMPLETED' || input.status === 'FAILED') updateData.completedAt = now;

    await this.prisma.$transaction(async tx => {
      await tx.agentPlanStep.update({
        where: { id: input.stepId },
        data: updateData,
      });

      // Recalculate completed steps count
      const updatedSteps = await tx.agentPlanStep.findMany({
        where: { planId: plan.id },
      });
      const completedCount = updatedSteps.filter(s => s.status === 'COMPLETED').length;

      // Automatically update plan status if all steps completed
      let nextPlanStatus = plan.status;
      if (completedCount === updatedSteps.length && updatedSteps.length > 0) {
        nextPlanStatus = 'COMPLETED';
      } else if (input.status === 'RUNNING' && plan.status === 'READY') {
        nextPlanStatus = 'EXECUTING';
      } else if (input.status === 'FAILED' && plan.status !== 'FAILED') {
        nextPlanStatus = 'FAILED';
      }

      await tx.agentPlan.update({
        where: { id: plan.id },
        data: {
          completedSteps: completedCount,
          status: nextPlanStatus,
        },
      });
    });

    const updated = await this.prisma.agentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    return this.mapPlanToDto(updated);
  }

  public async setPlanStatus(
    input: SetAgentPlanStatusInputDto,
    userId?: string,
  ): Promise<AgentPlanExecutionDto> {
    const plan = await this.prisma.agentPlan.findUnique({
      where: { id: input.planId },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    if (!plan || plan.projectId !== input.projectId) {
      throw new AgentPlanNotFoundError(`Plan "${input.planId}" not found.`);
    }

    if (userId) {
      await this.assertProjectAccess(plan.projectId, userId);
    }

    await this.prisma.agentPlan.update({
      where: { id: input.planId },
      data: { status: input.status },
    });

    const updated = await this.prisma.agentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    return this.mapPlanToDto(updated);
  }

  // ============================================================================
  // 5. Tenant & Authorization Isolation
  // ============================================================================

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId },
    });
    if (!project) {
      throw new AgentPlanCrossProjectAccessError(`Project "${projectId}" was not found.`);
    }
    if (project.userId && project.userId !== userId) {
      throw new AgentPlanCrossProjectAccessError(
        `User "${userId}" does not have access to project "${projectId}".`,
      );
    }
  }

  private async assertTaskAccess(
    projectId: string,
    threadId: string | undefined,
    taskId: string,
    userId?: string,
  ): Promise<void> {
    if (userId) {
      await this.assertProjectAccess(projectId, userId);
    }

    const task = await this.prisma.agentThreadTask.findFirst({
      where: { id: taskId, projectId },
    });

    if (!task) {
      throw new AgentPlanCrossProjectAccessError(
        `Task "${taskId}" does not belong to project "${projectId}".`,
      );
    }

    if (threadId && task.threadId !== threadId) {
      throw new AgentPlanCrossProjectAccessError(
        `Task "${taskId}" does not belong to thread "${threadId}".`,
      );
    }
  }

  // ============================================================================
  // 6. Mapping Utilities
  // ============================================================================

  private mapPlanToDto(plan: any): AgentPlanExecutionDto {
    return {
      id: plan.id,
      projectId: plan.projectId,
      threadId: plan.threadId,
      taskId: plan.taskId,
      version: plan.version,
      isActive: plan.isActive,
      status: plan.status as AgentPlanExecutionStatus,
      summary: plan.summary,
      intent: plan.intent,
      totalSteps: plan.totalSteps,
      completedSteps: plan.completedSteps,
      requiresApproval: plan.requiresApproval,
      metadata: (plan.metadata as Record<string, unknown>) ?? {},
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      steps: (plan.steps || []).map((s: any) => this.mapStepToDto(s)),
    };
  }

  private mapStepToDto(step: any): AgentPlanStepExecutionDto {
    return {
      id: step.id,
      planId: step.planId,
      sequence: step.sequence,
      title: step.title,
      objective: step.objective,
      toolAction: step.toolAction,
      structuredInput: (step.structuredInput as Record<string, unknown>) ?? {},
      dependencies: (step.dependencies as string[]) ?? [],
      status: step.status as AgentPlanStepExecutionStatus,
      resultReference: step.resultReference ?? null,
      errorInfo: step.errorInfo ?? null,
      startedAt: step.startedAt ? step.startedAt.toISOString() : null,
      completedAt: step.completedAt ? step.completedAt.toISOString() : null,
      createdAt: step.createdAt.toISOString(),
      updatedAt: step.updatedAt.toISOString(),
    };
  }
}
