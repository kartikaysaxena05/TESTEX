/**
 * @file packages/core/src/agent-loop/agent-planner-adapter.ts
 * Planning boundary adapter for V10 Phase 153: Agent Execution Loop.
 *
 * Interfaces with AgentPlanService to:
 * 1. Ensure an active plan exists for the task (or load a specified plan).
 * 2. Evaluate dependency graph topology to determine the next executable step.
 * 3. Detect when all plan steps have been completed.
 */

import { type AgentPlanExecutionDto, type AgentPlanStepExecutionDto } from '@ai-quality/contracts';
import { AgentPlanService } from '../agent-planning/agent-plan-service.js';
import { AgentLoopPlannerError } from './agent-loop-errors.js';
import type { AgentState } from './agent-state.js';

export type PlannerDecision =
  | { readonly type: 'EXECUTE_STEP'; readonly step: AgentPlanStepExecutionDto }
  | { readonly type: 'COMPLETE' }
  | { readonly type: 'BLOCKED'; readonly reason: string };

export interface EnsurePlanContext {
  readonly projectId: string;
  readonly threadId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly planId?: string;
}

export interface IAgentPlanner {
  ensurePlan(context: EnsurePlanContext): Promise<AgentPlanExecutionDto>;
  resolveNextStep(plan: AgentPlanExecutionDto, state: AgentState): PlannerDecision;
}

export class AgentPlanner implements IAgentPlanner {
  constructor(private readonly planService: AgentPlanService) {}

  /**
   * Ensures the task has an active plan. If planId is specified, loads it;
   * otherwise checks for an active plan, or creates a new one using AgentPlanService.
   */
  public async ensurePlan(context: EnsurePlanContext): Promise<AgentPlanExecutionDto> {
    try {
      if (context.planId) {
        const plan = await this.planService.getPlan(
          { projectId: context.projectId, planId: context.planId },
          context.userId,
        );
        if (!plan) {
          throw new AgentLoopPlannerError(`Specified plan "${context.planId}" was not found.`);
        }
        return plan;
      }

      // Check for existing active plan
      const existing = await this.planService.getActivePlan(
        { projectId: context.projectId, taskId: context.taskId },
        context.userId,
      );

      if (existing) {
        return existing;
      }

      // Create a new structured plan for this task
      const created = await this.planService.createPlan(
        {
          projectId: context.projectId,
          threadId: context.threadId,
          taskId: context.taskId,
        },
        context.userId,
      );

      return created;
    } catch (err: unknown) {
      if (err instanceof AgentLoopPlannerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new AgentLoopPlannerError(message);
    }
  }

  /**
   * Resolves the next executable step in topological order where all dependencies are COMPLETED.
   */
  public resolveNextStep(plan: AgentPlanExecutionDto, _state: AgentState): PlannerDecision {
    if (!plan.steps || plan.steps.length === 0) {
      return { type: 'COMPLETE' };
    }

    const stepMap = new Map<string, AgentPlanStepExecutionDto>();
    for (const step of plan.steps) {
      stepMap.set(step.id, step);
      stepMap.set(`step-${step.sequence}`, step);
      stepMap.set(String(step.sequence), step);
    }

    // Check if all steps are completed or skipped
    const allFinished = plan.steps.every(s => s.status === 'COMPLETED' || s.status === 'SKIPPED');
    if (allFinished) {
      return { type: 'COMPLETE' };
    }

    // Check for any failed steps
    const hasFailed = plan.steps.some(s => s.status === 'FAILED');

    // Find the first pending or ready step whose dependencies are all COMPLETED
    for (const step of plan.steps) {
      if (step.status === 'PENDING' || step.status === 'READY') {
        const deps = step.dependencies ?? [];
        let depsSatisfied = true;
        let blockedByFailure = false;

        for (const depId of deps) {
          const depStep = stepMap.get(depId);
          if (!depStep) {
            continue;
          }
          if (depStep.status === 'FAILED') {
            blockedByFailure = true;
            depsSatisfied = false;
            break;
          }
          if (depStep.status !== 'COMPLETED' && depStep.status !== 'SKIPPED') {
            depsSatisfied = false;
            break;
          }
        }

        if (blockedByFailure) {
          return {
            type: 'BLOCKED',
            reason: `Step "${step.title}" cannot proceed because dependency failed.`,
          };
        }

        if (depsSatisfied) {
          return { type: 'EXECUTE_STEP', step };
        }
      }
    }

    if (hasFailed) {
      const failedStep = plan.steps.find(s => s.status === 'FAILED');
      const detail = failedStep?.errorInfo ? `: ${failedStep.errorInfo}` : '.';
      return {
        type: 'BLOCKED',
        reason: `Execution stopped because one or more prior steps failed${detail}`,
      };
    }

    return {
      type: 'BLOCKED',
      reason: 'No eligible step found whose dependencies are satisfied.',
    };
  }
}
