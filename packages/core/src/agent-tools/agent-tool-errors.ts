/**
 * @file packages/core/src/agent-tools/agent-tool-errors.ts
 * Typed domain errors for V10 Phase 143: Tool Registry & Invocation.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class AgentToolError extends Error {
  public readonly code: DesktopErrorCode;
  public readonly details?: unknown;

  constructor(code: DesktopErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AgentToolError';
    this.code = code;
    this.details = details;
  }
}

export class AgentToolNotFoundError extends AgentToolError {
  public readonly toolId: string;

  constructor(toolId: string) {
    super('TOOL_REGISTRY_NOT_FOUND', `Tool '${toolId}' was not found in the registry.`, { toolId });
    this.name = 'AgentToolNotFoundError';
    this.toolId = toolId;
  }
}

export class AgentToolDuplicateError extends AgentToolError {
  public readonly toolId: string;

  constructor(toolId: string) {
    super('TOOL_REGISTRY_DUPLICATE', `Tool '${toolId}' is already registered.`, { toolId });
    this.name = 'AgentToolDuplicateError';
    this.toolId = toolId;
  }
}

export class AgentToolDisabledError extends AgentToolError {
  public readonly toolId: string;

  constructor(toolId: string) {
    super('TOOL_REGISTRY_DISABLED', `Tool '${toolId}' is currently disabled.`, { toolId });
    this.name = 'AgentToolDisabledError';
    this.toolId = toolId;
  }
}

export class AgentToolValidationError extends AgentToolError {
  constructor(message: string, details?: unknown) {
    super('TOOL_REGISTRY_VALIDATION_ERROR', message, details);
    this.name = 'AgentToolValidationError';
  }
}

export class AgentToolInvocationError extends AgentToolError {
  public readonly toolId: string;

  constructor(toolId: string, message: string, details?: unknown) {
    super('TOOL_REGISTRY_INVOCATION_FAILED', `Invocation of tool '${toolId}' failed: ${message}`, {
      toolId,
      details,
    });
    this.name = 'AgentToolInvocationError';
    this.toolId = toolId;
  }
}

export class AgentToolOutputInvalidError extends AgentToolError {
  public readonly toolId: string;

  constructor(toolId: string, message: string, details?: unknown) {
    super(
      'TOOL_REGISTRY_OUTPUT_INVALID',
      `Tool '${toolId}' returned output failing schema validation: ${message}`,
      {
        toolId,
        details,
      },
    );
    this.name = 'AgentToolOutputInvalidError';
    this.toolId = toolId;
  }
}

export class AgentToolRegistryPermissionDeniedError extends AgentToolError {
  public readonly toolId: string;
  public readonly requiredLevel: string;
  public readonly userLevel?: string;

  constructor(toolId: string, requiredLevel: string, userLevel?: string) {
    super(
      'TOOL_REGISTRY_PERMISSION_DENIED',
      `Permission denied for tool '${toolId}'. Required level: ${requiredLevel}${userLevel ? `, user level: ${userLevel}` : ''}.`,
      { toolId, requiredLevel, userLevel },
    );
    this.name = 'AgentToolRegistryPermissionDeniedError';
    this.toolId = toolId;
    this.requiredLevel = requiredLevel;
    this.userLevel = userLevel;
  }
}
