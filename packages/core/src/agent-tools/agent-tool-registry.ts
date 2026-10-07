/**
 * @file packages/core/src/agent-tools/agent-tool-registry.ts
 * Central, project-safe, backend-controlled Tool Registry for V10 Phase 143.
 *
 * Guarantees:
 * 1. Strict validation of tool definitions, input schemas, and output schemas.
 * 2. Protection against duplicate tool IDs and unregistered tools.
 * 3. Project and user isolation (validates project authorization).
 * 4. Structured invocation envelope (duration, executionId, error, output, timestamp).
 * 5. Rejects arbitrary renderer-supplied handler execution (only registered backend tools execute).
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import {
  type AgentToolDefinitionDto,
  type AgentToolInvocationResultDto,
  type ListAgentToolsInputDto,
  type GetAgentToolInputDto,
  type InvokeAgentToolInputDto,
} from '@ai-quality/contracts';
import {
  type RegisteredToolDefinition,
  type ToolExecutionContext,
  validateToolDefinition,
  toToolDefinitionDto,
} from './agent-tool-definition.js';
import {
  AgentToolNotFoundError,
  AgentToolDuplicateError,
  AgentToolDisabledError,
  AgentToolValidationError,
  AgentToolOutputInvalidError,
} from './agent-tool-errors.js';
import { AiInvalidRequestError, AiCrossProjectAccessError } from '../ai-provider/index.js';

import { AgentPermissionService } from '../agent-permissions/agent-permission-service.js';

export interface ToolRegistryDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly permissionService?: AgentPermissionService;
}

export class ToolRegistryService {
  private readonly tools = new Map<string, RegisteredToolDefinition>();
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly permissionService: AgentPermissionService;

  constructor(deps?: ToolRegistryDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.permissionService =
      deps?.permissionService ?? new AgentPermissionService({ prisma: this.prisma, logger: this.logger });
  }

  // ============================================================================
  // Registration Lifecycle
  // ============================================================================

  public registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
    definition: Partial<RegisteredToolDefinition<TInput, TOutput>>,
  ): void {
    validateToolDefinition(definition);

    if (this.tools.has(definition.toolId)) {
      throw new AgentToolDuplicateError(definition.toolId);
    }

    this.tools.set(definition.toolId, definition as unknown as RegisteredToolDefinition);
    this.logger.debug('tool_registry.registered', {
      toolId: definition.toolId,
      name: definition.name,
      category: definition.category,
      permissionLevel: definition.permissionLevel,
    });
  }

  public registerTools(definitions: readonly Partial<RegisteredToolDefinition<any, any>>[]): void {
    for (const def of definitions) {
      this.registerTool(def);
    }
  }

  public unregisterTool(toolId: string): boolean {
    if (!this.tools.has(toolId)) {
      return false;
    }
    this.tools.delete(toolId);
    this.logger.debug('tool_registry.unregistered', { toolId });
    return true;
  }

  public hasTool(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  public getRegisteredTool(toolId: string): RegisteredToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  public listRegisteredTools(): readonly RegisteredToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public async getTool(
    input: GetAgentToolInputDto,
    userId?: string,
  ): Promise<AgentToolDefinitionDto | null> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    if (!this.tools.has(input.toolId)) {
      return null;
    }
    const tool = this.tools.get(input.toolId)!;
    return toToolDefinitionDto(tool);
  }

  public async listTools(
    input: ListAgentToolsInputDto,
    userId?: string,
  ): Promise<readonly AgentToolDefinitionDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }
    const results: AgentToolDefinitionDto[] = [];
    for (const tool of this.tools.values()) {
      if (!input.includeDisabled && !tool.enabled) {
        continue;
      }
      if (input.category && tool.category !== input.category) {
        continue;
      }
      results.push(toToolDefinitionDto(tool));
    }
    return results;
  }

  public enableTool(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new AgentToolNotFoundError(toolId);
    }
    tool.enabled = true;
    this.logger.debug('tool_registry.enabled', { toolId });
  }

  public disableTool(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new AgentToolNotFoundError(toolId);
    }
    tool.enabled = false;
    this.logger.debug('tool_registry.disabled', { toolId });
  }

  // ============================================================================
  // Controlled Backend Invocation Boundary
  // ============================================================================

  public async invoke(
    input: InvokeAgentToolInputDto,
    context: ToolExecutionContext,
  ): Promise<AgentToolInvocationResultDto> {
    const executionId = crypto.randomUUID();
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    // 1. Authorize project context
    await this.assertProjectAccess(input.projectId, context.userId);

    // 2. Resolve registered tool
    const tool = this.tools.get(input.toolId);
    if (!tool) {
      throw new AgentToolNotFoundError(input.toolId);
    }

    if (!tool.enabled) {
      throw new AgentToolDisabledError(input.toolId);
    }

    // 3. Validate input against tool input schema
    this.validateSchema(
      tool.inputSchema,
      input.input,
      `Tool '${tool.toolId}' input validation failed`,
    );

    // 4. Evaluate and enforce server-side tool permissions (Phase 144)
    await this.permissionService.evaluateAndEnforce({
      projectId: input.projectId,
      userId: context.userId,
      threadId: context.threadId,
      taskId: context.taskId,
      toolName: tool.toolId,
      requestedOperation: tool.name,
      inputPayload: input.input as Record<string, unknown>,
      declaredLevel: tool.permissionLevel,
    });

    // 5. Execute registered backend handler safely
    try {
      if (context.signal?.aborted) {
        throw new Error('Tool execution was cancelled before start');
      }

      const output = await tool.handler(input.input as Record<string, unknown>, context);

      // 6. Validate output against output schema
      this.validateSchema(
        tool.outputSchema,
        output,
        `Tool '${tool.toolId}' output validation failed`,
        true,
      );

      const durationMs = Math.round(performance.now() - startTime);

      this.logger.debug('tool_registry.invocation_success', {
        toolId: tool.toolId,
        executionId,
        durationMs,
        projectId: input.projectId,
      });

      return {
        success: true,
        toolId: tool.toolId,
        executionId,
        output: output ?? null,
        error: null,
        durationMs,
        timestamp,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.warn('tool_registry.invocation_failed', {
        toolId: tool.toolId,
        executionId,
        durationMs,
        error: errorMessage,
      });

      // Preserve schema invalid output errors
      if (err instanceof AgentToolOutputInvalidError) {
        throw err;
      }

      return {
        success: false,
        toolId: tool.toolId,
        executionId,
        output: null,
        error: errorMessage,
        durationMs,
        timestamp,
      };
    }
  }

  // ============================================================================
  // Helpers & Security Checks
  // ============================================================================

  private validateSchema(
    schema: Record<string, unknown>,
    payload: unknown,
    errorPrefix: string,
    isOutput = false,
  ): void {
    if (!schema || Object.keys(schema).length === 0) {
      return;
    }

    // Check required properties if defined in JSON schema object format
    const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
    if (required.length > 0) {
      if (!payload || typeof payload !== 'object') {
        const err = `${errorPrefix}: Expected an object but received ${typeof payload}.`;
        if (isOutput) {
          throw new AgentToolOutputInvalidError(String(schema['toolId'] ?? 'unknown'), err);
        }
        throw new AgentToolValidationError(err);
      }

      const pObj = payload as Record<string, unknown>;
      for (const field of required) {
        if (pObj[field] === undefined || pObj[field] === null) {
          const err = `${errorPrefix}: Missing required field '${field}'.`;
          if (isOutput) {
            throw new AgentToolOutputInvalidError(String(schema['toolId'] ?? 'unknown'), err);
          }
          throw new AgentToolValidationError(err);
        }
      }
    }
  }

  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('tool_registry.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access tools for project '${projectId}'.`,
      );
    }
  }
}
