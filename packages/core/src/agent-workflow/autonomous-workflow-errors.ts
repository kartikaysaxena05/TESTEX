/**
 * @file packages/core/src/agent-workflow/autonomous-workflow-errors.ts
 * Domain errors for V10 Phase 159: Full Autonomous Testing + Fix Workflow.
 */

export class AutonomousWorkflowError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'AUTONOMOUS_WORKFLOW_ERROR') {
    super(message);
    this.name = 'AutonomousWorkflowError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AutonomousWorkflowNotFoundError extends AutonomousWorkflowError {
  constructor(taskId: string) {
    super(
      `Autonomous workflow report for task '${taskId}' was not found.`,
      'WORKFLOW_REPORT_NOT_FOUND',
    );
    this.name = 'AutonomousWorkflowNotFoundError';
  }
}

export class AutonomousWorkflowPlanningError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow planning failed: ${message}`, 'WORKFLOW_PLANNING_FAILED');
    this.name = 'AutonomousWorkflowPlanningError';
  }
}

export class AutonomousWorkflowExecutionError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow execution failed: ${message}`, 'WORKFLOW_EXECUTION_FAILED');
    this.name = 'AutonomousWorkflowExecutionError';
  }
}

export class AutonomousWorkflowApprovalRequiredError extends AutonomousWorkflowError {
  constructor(proposalId: string) {
    super(
      `Workflow fix requires explicit human approval before patch application (proposal: ${proposalId}).`,
      'WORKFLOW_APPROVAL_REQUIRED',
    );
    this.name = 'AutonomousWorkflowApprovalRequiredError';
  }
}

export class AutonomousWorkflowReverificationFailedError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow reverification failed: ${message}`, 'WORKFLOW_REVERIFICATION_FAILED');
    this.name = 'AutonomousWorkflowReverificationFailedError';
  }
}

export class AutonomousWorkflowRegressionFailedError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow targeted regression test failed: ${message}`, 'WORKFLOW_REGRESSION_FAILED');
    this.name = 'AutonomousWorkflowRegressionFailedError';
  }
}

export class AutonomousWorkflowPatchFailedError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow patch application failed: ${message}`, 'WORKFLOW_PATCH_FAILED');
    this.name = 'AutonomousWorkflowPatchFailedError';
  }
}

export class AutonomousWorkflowSecurityError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow security policy violation: ${message}`, 'WORKFLOW_SECURITY_VIOLATION');
    this.name = 'AutonomousWorkflowSecurityError';
  }
}

export class AutonomousWorkflowValidationError extends AutonomousWorkflowError {
  constructor(message: string) {
    super(`Workflow validation error: ${message}`, 'WORKFLOW_VALIDATION_ERROR');
    this.name = 'AutonomousWorkflowValidationError';
  }
}
