/**
 * @file packages/core/src/agent-permissions/agent-permission-errors.ts
 * Typed domain errors for V10 Phase 144: Tool Permission System.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class AgentPermissionError extends Error {
  public readonly code: DesktopErrorCode;
  public readonly details?: unknown;

  constructor(code: DesktopErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AgentPermissionError';
    this.code = code;
    this.details = details;
  }
}

export class AgentToolPermissionDeniedError extends AgentPermissionError {
  public readonly toolName: string;
  public readonly requestedOperation: string;
  public readonly reason: string;

  constructor(toolName: string, requestedOperation: string, reason: string) {
    super(
      'TOOL_PERMISSION_DENIED',
      `Permission denied for tool '${toolName}' (operation: '${requestedOperation}'): ${reason}`,
      { toolName, requestedOperation, reason },
    );
    this.name = 'AgentToolPermissionDeniedError';
    this.toolName = toolName;
    this.requestedOperation = requestedOperation;
    this.reason = reason;
  }
}

export class AgentToolApprovalRequiredError extends AgentPermissionError {
  public readonly approvalId: string;
  public readonly toolName: string;
  public readonly taskId: string;

  constructor(approvalId: string, toolName: string, taskId: string) {
    super(
      'TOOL_APPROVAL_REQUIRED',
      `Tool '${toolName}' requires human approval before execution (Approval ID: ${approvalId}, Task: ${taskId}).`,
      { approvalId, toolName, taskId },
    );
    this.name = 'AgentToolApprovalRequiredError';
    this.approvalId = approvalId;
    this.toolName = toolName;
    this.taskId = taskId;
  }
}

export class AgentToolApprovalNotFoundError extends AgentPermissionError {
  public readonly approvalId: string;

  constructor(approvalId: string) {
    super(
      'TOOL_APPROVAL_NOT_FOUND',
      `Tool approval request with ID '${approvalId}' was not found.`,
      {
        approvalId,
      },
    );
    this.name = 'AgentToolApprovalNotFoundError';
    this.approvalId = approvalId;
  }
}

export class AgentToolApprovalAlreadyDecidedError extends AgentPermissionError {
  public readonly approvalId: string;
  public readonly currentStatus: string;

  constructor(approvalId: string, currentStatus: string) {
    super(
      'TOOL_APPROVAL_ALREADY_DECIDED',
      `Tool approval request '${approvalId}' has already been decided (current status: ${currentStatus}).`,
      { approvalId, currentStatus },
    );
    this.name = 'AgentToolApprovalAlreadyDecidedError';
    this.approvalId = approvalId;
    this.currentStatus = currentStatus;
  }
}
