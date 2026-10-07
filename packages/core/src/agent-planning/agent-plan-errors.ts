/**
 * @file packages/core/src/agent-planning/agent-plan-errors.ts
 * Domain errors for V10 Phase 152: Multi-Step Planning.
 */

export class AgentPlanError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'AGENT_PLAN_ERROR') {
    super(message);
    this.name = 'AgentPlanError';
    this.code = code;
  }
}

export class AgentPlanNotFoundError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_NOT_FOUND');
    this.name = 'AgentPlanNotFoundError';
  }
}

export class AgentPlanStepNotFoundError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_STEP_NOT_FOUND');
    this.name = 'AgentPlanStepNotFoundError';
  }
}

export class AgentPlanStepDuplicateError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_STEP_DUPLICATE');
    this.name = 'AgentPlanStepDuplicateError';
  }
}

export class AgentPlanValidationError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_VALIDATION_ERROR');
    this.name = 'AgentPlanValidationError';
  }
}

export class AgentPlanCircularDependencyError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_CIRCULAR_DEPENDENCY');
    this.name = 'AgentPlanCircularDependencyError';
  }
}

export class AgentPlanVersionConflictError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_VERSION_CONFLICT');
    this.name = 'AgentPlanVersionConflictError';
  }
}

export class AgentPlanInvalidStateError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_INVALID_STATE');
    this.name = 'AgentPlanInvalidStateError';
  }
}

export class AgentPlanCrossProjectAccessError extends AgentPlanError {
  constructor(message: string) {
    super(message, 'AGENT_PLAN_CROSS_PROJECT_ACCESS');
    this.name = 'AgentPlanCrossProjectAccessError';
  }
}
