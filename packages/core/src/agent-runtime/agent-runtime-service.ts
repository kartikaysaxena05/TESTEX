/**
 * @file packages/core/src/agent-runtime/agent-runtime-service.ts
 * Main orchestrator for V10 Phase 141: Agent Runtime Foundation.
 * Manages task lifecycle, state machine transitions, context assembly,
 * AI provider model invocations, tool execution loops, cancellation,
 * bounded timeouts, and audit event logging.
 */

import crypto from 'node:crypto';
import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import type {
  AgentRuntimeTaskDto,
  AgentRuntimeTaskEventDto,
  CreateAgentRuntimeTaskInputDto,
  GetAgentRuntimeTaskInputDto,
  CancelAgentRuntimeTaskInputDto,
  GetAgentRuntimeTaskEventsInputDto,
  AgentRuntimeToolCallDto,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import type { AiProviderService } from '../ai-provider/ai-provider-service.js';
import { AgentStateMachine } from './agent-state-machine.js';
import { AgentContextBuilder } from './agent-context-builder.js';
import { AgentToolExecutorStub, type IAgentToolExecutor } from './agent-tool-stub.js';
import {
  AgentRuntimeError,
  AgentTimeoutError,
  AgentCancelledError,
  AgentMalformedResponseError,
} from './agent-runtime-errors.js';
import { AiCrossProjectAccessError, AiInvalidRequestError } from '../ai-provider/ai-provider-errors.js';

export interface ActiveTaskExecution {
  task: AgentRuntimeTaskDto;
  stateMachine: AgentStateMachine;
  abortController: AbortController;
  events: AgentRuntimeTaskEventDto[];
  timeoutHandle?: NodeJS.Timeout;
}

export class AgentRuntimeService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly contextBuilder: AgentContextBuilder;
  private readonly toolExecutor: IAgentToolExecutor;
  private readonly activeTasks = new Map<string, ActiveTaskExecution>();

  constructor(
    private readonly aiProviderService: AiProviderService,
    prisma?: PrismaClient,
    logger?: ILogger,
    toolExecutor?: IAgentToolExecutor,
  ) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = logger ?? getLogger();
    this.toolExecutor = toolExecutor ?? new AgentToolExecutorStub();
    this.contextBuilder = new AgentContextBuilder(
      this.prisma,
      this.aiProviderService.getRequirementTestContextAdapter(),
    );
  }

  /**
   * Creates and asynchronously starts an Agent Runtime task.
   */
  public async createTask(
    input: CreateAgentRuntimeTaskInputDto,
    userId?: string,
  ): Promise<AgentRuntimeTaskDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const taskId = crypto.randomUUID();
    const now = new Date();
    const timeoutMs = input.timeoutMs ?? 120000;
    const maxIterations = input.maxIterations ?? 10;
    const providerId = input.providerId ?? 'OLLAMA';

    const task: AgentRuntimeTaskDto = {
      id: taskId,
      projectId: input.projectId,
      threadId: input.threadId,
      userRequest: input.userRequest,
      state: 'IDLE',
      currentIteration: 0,
      maxIterations,
      timeoutMs,
      providerId,
      modelId: input.modelId,
      toolCalls: [],
      result: null,
      error: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
    };

    const stateMachine = new AgentStateMachine('IDLE');
    const abortController = new AbortController();
    const events: AgentRuntimeTaskEventDto[] = [];

    const execution: ActiveTaskExecution = {
      task,
      stateMachine,
      abortController,
      events,
    };

    this.activeTasks.set(taskId, execution);

    // Record creation event
    await this.recordEvent(execution, 'TASK_CREATED', {
      userRequest: input.userRequest,
      providerId,
      modelId: input.modelId,
    });

    // Start background execution loop without awaiting it directly
    void this.runExecutionLoop(execution, input, userId);

    return { ...execution.task };
  }

  /**
   * Retrieves an active or stored task by ID with project isolation check.
   */
  public async getTask(
    input: GetAgentRuntimeTaskInputDto,
    userId?: string,
  ): Promise<AgentRuntimeTaskDto | null> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const active = this.activeTasks.get(input.taskId);
    if (active && active.task.projectId === input.projectId) {
      return { ...active.task };
    }

    return null;
  }

  /**
   * Cancels a running agent runtime task.
   */
  public async cancelTask(
    input: CancelAgentRuntimeTaskInputDto,
    userId?: string,
  ): Promise<AgentRuntimeTaskDto> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const execution = this.activeTasks.get(input.taskId);
    if (!execution || execution.task.projectId !== input.projectId) {
      throw new AgentRuntimeError(`Task '${input.taskId}' not found for cancellation.`, 'NOT_FOUND');
    }

    if (execution.stateMachine.isTerminal()) {
      return { ...execution.task };
    }

    // Abort active controller
    execution.abortController.abort();
    if (execution.timeoutHandle) {
      clearTimeout(execution.timeoutHandle);
    }

    const previousState = execution.task.state;
    execution.stateMachine.transition('CANCELLED', input.reason);
    execution.task.state = 'CANCELLED';
    execution.task.updatedAt = new Date().toISOString();
    execution.task.completedAt = new Date().toISOString();
    execution.task.error = {
      code: 'AGENT_CANCELLED',
      message: input.reason ?? 'User requested cancellation',
    };

    await this.recordEvent(execution, 'TASK_CANCELLED', {
      previousState,
      reason: input.reason,
    });

    return { ...execution.task };
  }

  /**
   * Retrieves audit events for a task.
   */
  public async getTaskEvents(
    input: GetAgentRuntimeTaskEventsInputDto,
    userId?: string,
  ): Promise<readonly AgentRuntimeTaskEventDto[]> {
    if (userId) {
      await this.assertProjectAccess(input.projectId, userId);
    }

    const active = this.activeTasks.get(input.taskId);
    if (active && active.task.projectId === input.projectId) {
      return [...active.events];
    }

    return [];
  }

  /**
   * Primary execution loop:
   * Task -> Context -> Model -> Response -> Decide Next Action -> Continue/Finish
   */
  private async runExecutionLoop(
    execution: ActiveTaskExecution,
    input: CreateAgentRuntimeTaskInputDto,
    userId?: string,
  ): Promise<void> {
    const startTime = Date.now();
    const taskId = execution.task.id;

    // Setup bounded timeout
    execution.timeoutHandle = setTimeout(() => {
      if (!execution.stateMachine.isTerminal()) {
        execution.abortController.abort();
        const prev = execution.task.state;
        try {
          execution.stateMachine.transition('TIMEOUT', 'Execution timeout exceeded');
        } catch {
          // ignore transition conflict on timeout
        }
        execution.task.state = 'TIMEOUT';
        execution.task.updatedAt = new Date().toISOString();
        execution.task.completedAt = new Date().toISOString();
        execution.task.error = {
          code: 'AGENT_TIMEOUT',
          message: `Agent task exceeded timeout of ${execution.task.timeoutMs}ms`,
        };
        void this.recordEvent(execution, 'TASK_TIMED_OUT', {
          previousState: prev,
          timeoutMs: execution.task.timeoutMs,
        });
      }
    }, execution.task.timeoutMs);

    try {
      // 1. Initial Transition to THINKING
      this.transitionState(execution, 'THINKING', 'Starting execution loop');

      // 2. Build Context
      const contextSnapshot = await this.contextBuilder.buildContext(input);

      let currentPrompt = contextSnapshot.assembledPrompt;
      let finalOutput = '';

      // 3. Iteration Loop
      while (
        execution.task.currentIteration < execution.task.maxIterations &&
        !execution.stateMachine.isTerminal()
      ) {
        if (execution.abortController.signal.aborted) {
          throw new AgentCancelledError(taskId);
        }

        execution.task.currentIteration += 1;
        execution.task.updatedAt = new Date().toISOString();

        await this.recordEvent(execution, 'ITERATION_STARTED', {
          iteration: execution.task.currentIteration,
        });

        // Invoke configured V9 AI provider
        await this.recordEvent(execution, 'MODEL_INVOCATION_STARTED', {
          iteration: execution.task.currentIteration,
          providerId: execution.task.providerId,
          modelId: execution.task.modelId,
        });

        let modelResponse: import('@ai-quality/contracts').NormalizedAiResponseDto;
        try {
          modelResponse = await this.aiProviderService.generate(
            {
              requestId: crypto.randomUUID(),
              projectId: execution.task.projectId,
              providerId: execution.task.providerId,
              model: execution.task.modelId ?? 'llama3',
              prompt: currentPrompt,
              systemPrompt: contextSnapshot.systemPrompt,
              parameters: { temperature: 0.2 },
            },
            userId,
            execution.abortController.signal,
          );
        } catch (err) {
          if (execution.abortController.signal.aborted) {
            throw new AgentCancelledError(taskId);
          }
          throw err;
        }

        await this.recordEvent(execution, 'MODEL_RESPONSE_RECEIVED', {
          iteration: execution.task.currentIteration,
          tokenUsage: modelResponse.usage,
        });

        // Parse Model Action
        const actionDecision = this.parseModelDecision(modelResponse.text);

        if (actionDecision.type === 'FINISH') {
          finalOutput = actionDecision.output;
          break;
        }

        if (actionDecision.type === 'TOOL') {
          // Tool calling step
          const toolCallDto: AgentRuntimeToolCallDto = {
            id: crypto.randomUUID(),
            name: actionDecision.toolName,
            arguments: actionDecision.arguments,
          };

          this.transitionState(execution, 'TOOL_CALLING', `Executing tool '${actionDecision.toolName}'`);
          execution.task.toolCalls.push(toolCallDto);

          await this.recordEvent(execution, 'TOOL_CALL_DETECTED', {
            toolName: actionDecision.toolName,
            arguments: actionDecision.arguments,
          });

          this.transitionState(execution, 'WAITING_FOR_TOOL', `Waiting for tool '${actionDecision.toolName}' execution`);

          // Execute tool via stub
          let toolResult: unknown;
          try {
            toolResult = await this.toolExecutor.execute(toolCallDto, {
              projectId: execution.task.projectId,
              taskId: execution.task.id,
              signal: execution.abortController.signal,
            });
            toolCallDto.result = toolResult;
          } catch (toolErr) {
            const errMessage = toolErr instanceof Error ? toolErr.message : String(toolErr);
            toolCallDto.error = errMessage;
            throw toolErr;
          }

          await this.recordEvent(execution, 'TOOL_CALL_COMPLETED', {
            toolName: actionDecision.toolName,
            success: !toolCallDto.error,
          });

          // Transition back to THINKING
          this.transitionState(execution, 'THINKING', 'Tool call finished, continuing thought process');

          // Append tool feedback to prompt
          currentPrompt += `\n\n[Tool Result for ${actionDecision.toolName}]:\n${JSON.stringify(
            toolResult,
          )}\nWhat is the next action or final answer?`;
        }
      }

      // Check terminal state
      if (!execution.stateMachine.isTerminal()) {
        this.transitionState(execution, 'COMPLETED', 'Execution loop finished');
        execution.task.state = 'COMPLETED';
        execution.task.completedAt = new Date().toISOString();
        execution.task.result = {
          output: finalOutput || 'Agent task completed successfully.',
          toolCallsExecuted: execution.task.toolCalls.length,
          iterations: execution.task.currentIteration,
          durationMs: Date.now() - startTime,
        };

        await this.recordEvent(execution, 'TASK_COMPLETED', {
          durationMs: Date.now() - startTime,
          toolCallsCount: execution.task.toolCalls.length,
          iterations: execution.task.currentIteration,
        });
      }
    } catch (err: unknown) {
      if (execution.timeoutHandle) {
        clearTimeout(execution.timeoutHandle);
      }

      if (execution.stateMachine.currentState === 'CANCELLED' || execution.stateMachine.currentState === 'TIMEOUT') {
        return;
      }

      const isCancelled =
        err instanceof AgentCancelledError ||
        (err instanceof Error && err.name === 'AbortError') ||
        execution.abortController.signal.aborted;

      const targetState = isCancelled ? 'CANCELLED' : 'FAILED';
      const errorCode = isCancelled
        ? 'AGENT_CANCELLED'
        : err instanceof AgentRuntimeError
        ? err.code
        : 'AGENT_RUNTIME_ERROR';
      const errorMessage = err instanceof Error ? err.message : String(err);

      try {
        execution.stateMachine.transition(targetState, errorMessage);
      } catch {
        // Safe catch on unexpected state transitions during exception handling
      }

      execution.task.state = targetState;
      execution.task.completedAt = new Date().toISOString();
      execution.task.error = {
        code: errorCode,
        message: errorMessage,
      };

      await this.recordEvent(execution, isCancelled ? 'TASK_CANCELLED' : 'TASK_FAILED', {
        errorCode,
        errorMessage,
      });

      this.logger.warn('agent_runtime.task_failed', {
        taskId,
        state: targetState,
        errorCode,
        errorMessage,
      });
    } finally {
      if (execution.timeoutHandle) {
        clearTimeout(execution.timeoutHandle);
      }
      execution.task.updatedAt = new Date().toISOString();
    }
  }

  private transitionState(
    execution: ActiveTaskExecution,
    targetState: import('@ai-quality/contracts').AgentRuntimeState,
    reason?: string,
  ): void {
    const from = execution.task.state;
    execution.stateMachine.transition(targetState, reason);
    execution.task.state = targetState;
    execution.task.updatedAt = new Date().toISOString();

    void this.recordEvent(execution, 'STATE_CHANGED', {
      previousState: from,
      newState: targetState,
      reason,
    });
  }

  private parseModelDecision(
    content: string,
  ):
    | { type: 'FINISH'; output: string }
    | { type: 'TOOL'; toolName: string; arguments: Record<string, unknown> } {
    // Attempt JSON parse
    const trimmed = content.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.tool && typeof parsed.tool === 'string') {
          return {
            type: 'TOOL',
            toolName: parsed.tool,
            arguments: (parsed.arguments as Record<string, unknown>) ?? {},
          };
        }
        if (parsed.action === 'FINISH' || parsed.action === 'finish') {
          return {
            type: 'FINISH',
            output: String(parsed.output ?? content),
          };
        }
      }
    } catch {
      // Look for embedded json block ```json ... ```
      const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && typeof parsed.tool === 'string') {
            return {
              type: 'TOOL',
              toolName: parsed.tool,
              arguments: (parsed.arguments as Record<string, unknown>) ?? {},
            };
          }
          if (parsed && (parsed.action === 'FINISH' || parsed.action === 'finish')) {
            return {
              type: 'FINISH',
              output: String(parsed.output ?? content),
            };
          }
        } catch {
          // not valid json block
        }
      }
    }

    // Default decision: Treat as direct final text output
    return {
      type: 'FINISH',
      output: content,
    };
  }

  private async recordEvent(
    execution: ActiveTaskExecution,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: AgentRuntimeTaskEventDto = {
      id: crypto.randomUUID(),
      taskId: execution.task.id,
      projectId: execution.task.projectId,
      threadId: execution.task.threadId,
      eventType,
      previousState: (payload.previousState as import('@ai-quality/contracts').AgentRuntimeState) ?? undefined,
      newState: (payload.newState as import('@ai-quality/contracts').AgentRuntimeState) ?? execution.task.state,
      iteration: execution.task.currentIteration,
      payload,
      timestamp: new Date().toISOString(),
    };

    execution.events.push(event);

    // Map to AuthAuditAction if appropriate
    let auditAction: AuthAuditAction | null = null;
    switch (eventType) {
      case 'STATE_CHANGED':
        auditAction = 'AGENT_STATE_CHANGED';
        break;
      case 'MODEL_INVOCATION_STARTED':
        auditAction = 'AGENT_MODEL_INVOKED';
        break;
      case 'MODEL_RESPONSE_RECEIVED':
        auditAction = 'AGENT_MODEL_RESPONDED';
        break;
      case 'TASK_TIMED_OUT':
        auditAction = 'AGENT_TASK_TIMED_OUT';
        break;
      case 'TASK_COMPLETED':
        auditAction = 'AGENT_TASK_COMPLETED';
        break;
      case 'TASK_FAILED':
        auditAction = 'AGENT_TASK_FAILED';
        break;
    }

    if (auditAction) {
      try {
        await this.prisma.authAuditEvent.create({
          data: {
            action: auditAction,
            metadata: {
              taskId: execution.task.id,
              projectId: execution.task.projectId,
              threadId: execution.task.threadId,
              ...payload,
            } as import('@prisma/client').Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        this.logger.warn('agent_runtime.audit_event_failed', {
          eventType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Enforces project tenant isolation: ensures project exists and belongs to the given user.
   */
  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('agent_runtime.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access Agent Runtime for project '${projectId}'.`,
      );
    }
  }
}
