/**
 * @file packages/core/src/agent-runtime/agent-tool-stub.ts
 * Interface and secure stub for agent tool calls in V10 Phase 141.
 * Strict boundary:
 * - NO arbitrary shell commands
 * - NO arbitrary filesystem mutations
 * - Rejects any tool not explicitly whitelisted/registered in the stub
 */

import type { AgentRuntimeToolCallDto } from '@ai-quality/contracts';
import { AgentUnauthorizedToolError } from './agent-runtime-errors.js';

export interface IAgentToolExecutor {
  execute(
    toolCall: AgentRuntimeToolCallDto,
    context: { projectId: string; taskId: string; signal?: AbortSignal },
  ): Promise<unknown>;

  isToolSupported(toolName: string): boolean;
}

/**
 * Foundation tool executor stub.
 * Only supports registered safe stub tools (e.g. echo, ping, read-only inspection stub)
 * and strictly rejects arbitrary commands or unauthorized tools.
 */
export class AgentToolExecutorStub implements IAgentToolExecutor {
  private readonly handlers = new Map<
    string,
    (args: Record<string, unknown>, context: { projectId: string; taskId: string; signal?: AbortSignal }) => Promise<unknown>
  >();

  constructor() {
    // Register baseline safe demo tools for foundation tests
    this.registerTool('echo', async (args) => {
      return { echoed: args };
    });

    this.registerTool('inspect_context', async (args, ctx) => {
      return { projectId: ctx.projectId, inspected: true, query: args['query'] ?? null };
    });
  }

  public registerTool(
    name: string,
    handler: (args: Record<string, unknown>, context: { projectId: string; taskId: string; signal?: AbortSignal }) => Promise<unknown>,
  ): void {
    this.handlers.set(name, handler);
  }

  public isToolSupported(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  public async execute(
    toolCall: AgentRuntimeToolCallDto,
    context: { projectId: string; taskId: string; signal?: AbortSignal },
  ): Promise<unknown> {
    if (context.signal?.aborted) {
      throw new Error('Tool execution aborted by cancellation signal');
    }

    const handler = this.handlers.get(toolCall.name);
    if (!handler) {
      throw new AgentUnauthorizedToolError(
        toolCall.name,
        `Tool '${toolCall.name}' is not registered or not authorized for Phase 141 runtime execution.`,
      );
    }

    return handler(toolCall.arguments, context);
  }
}
