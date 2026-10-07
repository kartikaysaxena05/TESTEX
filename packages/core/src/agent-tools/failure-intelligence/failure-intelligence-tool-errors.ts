/**
 * @file packages/core/src/agent-tools/failure-intelligence/failure-intelligence-tool-errors.ts
 * Domain-specific errors for V10 Phase 148: Failure Intelligence Tool.
 */

import { AgentToolError } from '../agent-tool-errors.js';

export class FailureIntelligenceToolError extends AgentToolError {
  constructor(code: any, message: string, context?: Record<string, unknown>) {
    super(code, message, context);
    this.name = 'FailureIntelligenceToolError';
  }
}

export class FailureIntelligenceExecutionNotFoundError extends FailureIntelligenceToolError {
  constructor(executionId: string, projectId: string) {
    super('NOT_FOUND', `Execution '${executionId}' not found in project '${projectId}'.`, {
      executionId,
      projectId,
    });
    this.name = 'FailureIntelligenceExecutionNotFoundError';
  }
}

export class FailureIntelligenceCaseNotFoundError extends FailureIntelligenceToolError {
  constructor(failureId: string, projectId: string) {
    super('FAILURE_CASE_NOT_FOUND', `FailureCase '${failureId}' not found in project '${projectId}'.`, {
      failureId,
      projectId,
    });
    this.name = 'FailureIntelligenceCaseNotFoundError';
  }
}

export class FailureIntelligenceIneligibleExecutionError extends FailureIntelligenceToolError {
  constructor(executionId: string, status: string) {
    super(
      'EXECUTION_INELIGIBLE',
      `Execution '${executionId}' with status '${status}' is not eligible for failure intelligence analysis (must be FAILED or AUTOMATION_ERROR).`,
      { executionId, status },
    );
    this.name = 'FailureIntelligenceIneligibleExecutionError';
  }
}

export class FailureIntelligenceValidationError extends FailureIntelligenceToolError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, context);
    this.name = 'FailureIntelligenceValidationError';
  }
}
