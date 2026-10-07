/**
 * @file packages/core/src/agent-planning/plan-graph-validator.ts
 * Dependency graph and structure validator for V10 Phase 152: Multi-Step Planning.
 *
 * Guarantees:
 * 1. Checks duplicate step IDs or sequences.
 * 2. Validates that all dependency references exist in the plan.
 * 3. Enforces that a step only depends on prior steps (or detects cycles with Kahn's algorithm / DFS).
 * 4. Detects circular dependencies (cycles).
 * 5. Validates non-empty fields and known/valid action types.
 */

import {
  AgentPlanValidationError,
  AgentPlanCircularDependencyError,
  AgentPlanStepDuplicateError,
} from './agent-plan-errors.js';

export interface PlanStepValidationItem {
  id?: string;
  stepId?: string;
  sequence?: number;
  title: string;
  objective: string;
  toolAction: string;
  dependencies: string[];
}

export class PlanGraphValidator {
  /**
   * Validates an entire list of plan steps:
   * - No duplicates (by key/id/sequence)
   * - No missing dependencies
   * - No cycles (topological sort)
   * - Required fields are non-empty
   */
  public static validateSteps(
    steps: readonly PlanStepValidationItem[],
    options?: {
      knownTools?: ReadonlySet<string>;
      allowArbitraryActions?: boolean;
    },
  ): void {
    if (!steps || steps.length === 0) {
      throw new AgentPlanValidationError('Plan must contain at least one step.');
    }

    const seenIdentifiers = new Set<string>();
    const seenSequences = new Set<number>();
    const identifierList: string[] = [];

    // 1. Basic field & identifier validation
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const identifier = (step.stepId || step.id || `step-${i + 1}`).trim();

      if (!identifier) {
        throw new AgentPlanValidationError(`Step at index ${i} has an empty identifier.`);
      }

      if (seenIdentifiers.has(identifier)) {
        throw new AgentPlanStepDuplicateError(
          `Duplicate step identifier detected in plan: "${identifier}"`,
        );
      }
      seenIdentifiers.add(identifier);
      if (step.id && step.id !== identifier) {
        seenIdentifiers.add(step.id);
      }
      if (step.stepId && step.stepId !== identifier) {
        seenIdentifiers.add(step.stepId);
      }
      if (step.sequence !== undefined) {
        seenIdentifiers.add(`step-${step.sequence}`);
      }
      identifierList.push(identifier);

      if (step.sequence !== undefined) {
        if (step.sequence <= 0) {
          throw new AgentPlanValidationError(
            `Step "${identifier}" sequence must be positive, got ${step.sequence}.`,
          );
        }
        if (seenSequences.has(step.sequence)) {
          throw new AgentPlanValidationError(
            `Duplicate sequence number detected: ${step.sequence}.`,
          );
        }
        seenSequences.add(step.sequence);
      }

      if (!step.title || step.title.trim().length === 0) {
        throw new AgentPlanValidationError(`Step "${identifier}" requires a non-empty title.`);
      }

      if (!step.objective || step.objective.trim().length === 0) {
        throw new AgentPlanValidationError(`Step "${identifier}" requires a non-empty objective.`);
      }

      if (!step.toolAction || step.toolAction.trim().length === 0) {
        throw new AgentPlanValidationError(
          `Step "${identifier}" requires a non-empty tool/action type.`,
        );
      }

      if (
        options?.knownTools &&
        !options.allowArbitraryActions &&
        !options.knownTools.has(step.toolAction)
      ) {
        throw new AgentPlanValidationError(
          `Unknown tool/action type "${step.toolAction}" for step "${identifier}".`,
        );
      }
    }

    // 2. Validate dependencies exist and self-dependency
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const identifier = identifierList[i]!;

      for (const dep of step.dependencies) {
        const trimmedDep = dep.trim();
        if (!trimmedDep) continue;

        if (trimmedDep === identifier) {
          throw new AgentPlanCircularDependencyError(
            `Step "${identifier}" cannot depend on itself.`,
          );
        }

        if (!seenIdentifiers.has(trimmedDep)) {
          throw new AgentPlanValidationError(
            `Step "${identifier}" depends on non-existent step "${trimmedDep}".`,
          );
        }
      }
    }

    // 3. Cycle Detection using Kahn's algorithm (Topological sort)
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const id of seenIdentifiers) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    for (let i = 0; i < steps.length; i++) {
      const stepItem = steps[i]!;
      const v = identifierList[i]!;
      for (const dep of stepItem.dependencies) {
        const u = dep.trim();
        if (!u) continue;
        const list = adjList.get(u);
        if (list) {
          list.push(v);
        }
        inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visitedCount++;

      for (const neighbor of adjList.get(curr)!) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount < seenIdentifiers.size) {
      const cyclicNodes = Array.from(inDegree.entries())
        .filter(([, deg]) => deg > 0)
        .map(([id]) => id);
      throw new AgentPlanCircularDependencyError(
        `Circular dependency detected involving steps: ${cyclicNodes.join(', ')}`,
      );
    }
  }

  /**
   * Topological sort of steps. Returns an array of identifiers in valid execution order.
   */
  public static computeExecutionOrder(steps: readonly PlanStepValidationItem[]): string[] {
    this.validateSteps(steps);

    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    const idMap = new Map<string, PlanStepValidationItem>();

    steps.forEach((step, i) => {
      const id = (step.stepId || step.id || `step-${i + 1}`).trim();
      idMap.set(id, step);
      inDegree.set(id, 0);
      adjList.set(id, []);
    });

    for (const [v, step] of idMap.entries()) {
      for (const dep of step.dependencies) {
        const u = dep.trim();
        if (!u) continue;
        adjList.get(u)?.push(v);
        inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const ordered: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      ordered.push(curr);

      for (const neighbor of adjList.get(curr) ?? []) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    return ordered;
  }
}
