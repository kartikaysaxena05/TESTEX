/**
 * @file packages/core/src/agent-tools/agent-tool-definition.ts
 * Typed definition contracts and validation for V10 Phase 143 Tool Registry.
 */

import {
  agentToolDefinitionDtoSchema,
  type AgentToolDefinitionDto,
  type AgentToolCategory,
  type AgentToolPermissionLevel,
} from '@ai-quality/contracts';
import { AgentToolValidationError } from './agent-tool-errors.js';

export interface ToolExecutionContext {
  readonly projectId: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly stepId?: string;
  readonly signal?: AbortSignal;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<TOutput>;

export interface RegisteredToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: AgentToolCategory;
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly permissionLevel: AgentToolPermissionLevel;
  enabled: boolean;
  readonly handler: ToolHandler<TInput, TOutput>;
}

export function validateToolDefinition<TInput, TOutput>(
  tool: Partial<RegisteredToolDefinition<TInput, TOutput>>,
): asserts tool is RegisteredToolDefinition<TInput, TOutput> {
  if (!tool) {
    throw new AgentToolValidationError('Tool definition must not be null or undefined.');
  }

  if (typeof tool.handler !== 'function') {
    throw new AgentToolValidationError('Tool handler must be an executable function reference.');
  }

  if (typeof tool.name === 'string' && tool.name.trim().length === 0) {
    throw new AgentToolValidationError('Tool name must not be empty or whitespace.');
  }

  const parseResult = agentToolDefinitionDtoSchema.safeParse({
    toolId: tool.toolId,
    name: tool.name,
    description: tool.description,
    version: tool.version,
    category: tool.category,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    permissionLevel: tool.permissionLevel,
    enabled: tool.enabled ?? true,
  });

  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new AgentToolValidationError(`Invalid tool definition: ${errorDetails}`, {
      errors: parseResult.error.format(),
    });
  }
}

export function toToolDefinitionDto(tool: RegisteredToolDefinition): AgentToolDefinitionDto {
  return {
    toolId: tool.toolId,
    name: tool.name,
    description: tool.description,
    version: tool.version,
    category: tool.category,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    permissionLevel: tool.permissionLevel,
    enabled: tool.enabled,
  };
}
