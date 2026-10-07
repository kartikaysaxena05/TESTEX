/**
 * @file packages/core/src/terminal-gateway/terminal-tool-adapter.ts
 * Agent-facing Tool Adapter for terminal execution (`terminal.run`).
 *
 * Guarantees:
 * 1. Exposes strict input schema (`projectId`, `taskId`, `command`, `workingDirectory`, `timeoutMs`).
 * 2. Returns bounded, structured machine-readable result without internal secrets.
 * 3. Integrates with Tool Registry and Tool Permission System (APPROVAL_REQUIRED).
 */

import type {
  TerminalRunToolInputDto,
  TerminalRunToolOutputDto,
} from '@ai-quality/contracts';
import type { RegisteredToolDefinition, ToolExecutionContext } from '../agent-tools/agent-tool-definition.js';
import type { TerminalCommandGateway } from './terminal-command-gateway.js';

export function createTerminalToolDefinition(
  gateway: TerminalCommandGateway,
): RegisteredToolDefinition<TerminalRunToolInputDto, TerminalRunToolOutputDto> {
  return {
    toolId: 'terminal.run',
    name: 'terminal.run',
    description:
      'Executes controlled, sandboxed terminal commands inside the project worktree. Bounded development toolchain (npm, git, node, python, etc.). Unrestricted shell commands, destructive file deletion, and arbitrary downloads are prohibited.',
    version: '1.0.0',
    category: 'UTILITY',
    permissionLevel: 'WRITE',
    enabled: true,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid', description: 'Authorized project UUID.' },
        taskId: { type: 'string', format: 'uuid', description: 'Active agent task UUID.' },
        command: { type: 'string', description: 'Development command string to execute (e.g. npm test, git status).' },
        workingDirectory: { type: 'string', description: 'Relative path within the project worktree.' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000, default: 30000 },
      },
      required: ['projectId', 'taskId', 'command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        exitCode: { type: ['integer', 'null'] },
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        durationMs: { type: ['integer', 'null'] },
        timedOut: { type: 'boolean' },
        cancelled: { type: 'boolean' },
      },
      required: ['executionId', 'status', 'stdout', 'stderr', 'timedOut', 'cancelled'],
    },
    handler: async (
      input: TerminalRunToolInputDto,
      context: ToolExecutionContext,
    ): Promise<TerminalRunToolOutputDto> => {
      const result = await gateway.executeCommand(
        {
          projectId: input.projectId,
          taskId: input.taskId,
          threadId: context.threadId,
          command: input.command,
          workingDirectory: input.workingDirectory,
          timeoutMs: input.timeoutMs,
        },
        context.userId,
      );

      return {
        executionId: result.id,
        status: result.status,
        exitCode: result.exitCode ?? null,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs ?? null,
        timedOut: result.timedOut,
        cancelled: result.cancelled,
      };
    },
  };
}
