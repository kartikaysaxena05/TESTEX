/**
 * @file packages/core/src/agent-activity/agent-activity-stream-service.ts
 * Core Streaming Activity and Tool Progress Service for V10 Phase 154.
 *
 * Responsibilities:
 * 1. Typed event streaming from backend agent runtime to Electron UI.
 * 2. Monotonic sequence numbering and deduplication per task.
 * 3. Deep secret redaction & payload sanitization prior to dispatch.
 * 4. In-memory bounded circular event caching per task for smooth playback.
 * 5. Persistent timeline recovery across app reloads and reconnections.
 * 6. Multi-tenant project and user isolation.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  type AgentActivityEventDto,
  type AgentActivityEventType,
  type AgentActivityItemDto,
  type AgentActivityTimelineDto,
  type AgentToolExecutionStatus,
  type GetAgentActivityTimelineInputDto,
  agentActivityEventSchema,
} from '@ai-quality/contracts';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import {
  AgentActivityNotFoundError,
  AgentActivityUnauthorizedError,
  AgentActivityInvalidEventError,
} from './agent-activity-errors.js';
import { AgentActivitySanitizer } from './agent-activity-sanitizer.js';

export interface AgentActivityStreamServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly maxHistoryPerTask?: number;
}

export type ActivityEventListener = (event: AgentActivityEventDto) => void;

export class AgentActivityStreamService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly maxHistoryPerTask: number;

  // Default maximum events to retain in-memory buffer per task
  public static readonly DEFAULT_MAX_EVENTS_PER_TASK = 500;

  // Static in-memory sequence counter per task
  private static readonly taskSequences = new Map<string, number>();

  // Static in-memory bounded event buffer per task: taskId -> AgentActivityEventDto[]
  private static readonly taskEventBuffers = new Map<string, AgentActivityEventDto[]>();

  // Static subscriber map: taskId -> Set<ActivityEventListener>
  private static readonly taskSubscribers = new Map<string, Set<ActivityEventListener>>();

  // Global listeners (e.g. for IPC event forwarding)
  private static readonly globalSubscribers = new Set<ActivityEventListener>();

  constructor(deps?: AgentActivityStreamServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.maxHistoryPerTask =
      deps?.maxHistoryPerTask ?? AgentActivityStreamService.DEFAULT_MAX_EVENTS_PER_TASK;
  }

  // ============================================================================
  // 1. Publishing & Streaming Events
  // ============================================================================

  /**
   * Publishes a typed activity event to all active task and global subscribers.
   * Assigns a monotonic sequence number, applies deep secret redaction,
   * validates against schema, caches in the circular buffer, and broadcasts.
   */
  public async publish(params: {
    readonly taskId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly type: AgentActivityEventType;
    readonly payload: Record<string, unknown>;
  }): Promise<AgentActivityEventDto> {
    const { taskId, threadId, projectId, type, payload } = params;

    // 1. Monotonically increment sequence for this task
    const currentSeq = (AgentActivityStreamService.taskSequences.get(taskId) ?? 0) + 1;
    AgentActivityStreamService.taskSequences.set(taskId, currentSeq);

    // 2. Sanitize and redact payload secrets
    const sanitizedPayload = AgentActivitySanitizer.redact(payload) as Record<string, unknown>;

    const rawEvent: AgentActivityEventDto = {
      eventId: randomUUID(),
      sequence: currentSeq,
      taskId,
      threadId,
      projectId,
      type,
      timestamp: new Date().toISOString(),
      payload: sanitizedPayload,
    };

    // 3. Validate against strict schema
    const parseResult = agentActivityEventSchema.safeParse(rawEvent);
    if (!parseResult.success) {
      this.logger.error('Failed to validate AgentActivityEvent payload', {
        errors: parseResult.error.format(),
        type,
        taskId,
      });
      throw new AgentActivityInvalidEventError(
        `Invalid activity event schema for type "${type}": ${parseResult.error.message}`,
        parseResult.error,
      );
    }

    const event = parseResult.data;

    // 4. Record into bounded circular buffer for this task
    let buffer = AgentActivityStreamService.taskEventBuffers.get(taskId);
    if (!buffer) {
      buffer = [];
      AgentActivityStreamService.taskEventBuffers.set(taskId, buffer);
    }
    buffer.push(event);
    if (buffer.length > this.maxHistoryPerTask) {
      buffer.shift();
    }

    // 5. Broadcast to task-specific subscribers
    const subscribers = AgentActivityStreamService.taskSubscribers.get(taskId);
    if (subscribers && subscribers.size > 0) {
      for (const listener of subscribers) {
        try {
          listener(event);
        } catch (err) {
          this.logger.warn('Error in agent activity subscriber listener', {
            error: err instanceof Error ? err.message : String(err),
            taskId,
            eventId: event.eventId,
          });
        }
      }
    }

    // 6. Broadcast to global subscribers
    if (AgentActivityStreamService.globalSubscribers.size > 0) {
      for (const listener of AgentActivityStreamService.globalSubscribers) {
        try {
          listener(event);
        } catch (err) {
          this.logger.warn('Error in global agent activity subscriber listener', {
            error: err instanceof Error ? err.message : String(err),
            taskId,
            eventId: event.eventId,
          });
        }
      }
    }

    return event;
  }

  // ============================================================================
  // 2. Subscription Management
  // ============================================================================

  /**
   * Subscribes a listener to live activity events for a specific task.
   * Returns an unsubscription callback.
   */
  public subscribe(taskId: string, listener: ActivityEventListener): () => void {
    let subscribers = AgentActivityStreamService.taskSubscribers.get(taskId);
    if (!subscribers) {
      subscribers = new Set();
      AgentActivityStreamService.taskSubscribers.set(taskId, subscribers);
    }
    subscribers.add(listener);

    return () => {
      this.unsubscribe(taskId, listener);
    };
  }

  /**
   * Subscribes a global listener to all agent activity events.
   */
  public subscribeGlobal(listener: ActivityEventListener): () => void {
    AgentActivityStreamService.globalSubscribers.add(listener);
    return () => {
      AgentActivityStreamService.globalSubscribers.delete(listener);
    };
  }

  /**
   * Unsubscribes a listener for a specific task.
   */
  public unsubscribe(taskId: string, listener: ActivityEventListener): void {
    const subscribers = AgentActivityStreamService.taskSubscribers.get(taskId);
    if (subscribers) {
      subscribers.delete(listener);
      if (subscribers.size === 0) {
        AgentActivityStreamService.taskSubscribers.delete(taskId);
      }
    }
  }

  /**
   * Returns recent buffered events for an active task.
   */
  public getRecentEvents(taskId: string): readonly AgentActivityEventDto[] {
    return AgentActivityStreamService.taskEventBuffers.get(taskId) ?? [];
  }

  // ============================================================================
  // 3. Persistent Timeline Recovery
  // ============================================================================

  /**
   * Reconstructs the complete activity timeline from persistent database records
   * when the UI mounts, reloads, or reconnects.
   */
  public async getTaskTimeline(
    input: GetAgentActivityTimelineInputDto,
    userId: string,
  ): Promise<AgentActivityTimelineDto> {
    // 1. Authorize user & project
    await this.assertProjectAccess(input.projectId, userId);

    // 2. Load Task from database
    const task = await this.prisma.agentThreadTask.findFirst({
      where: {
        id: input.taskId,
      },
      include: {
        executionSteps: {
          orderBy: { sequence: 'asc' },
        },
        toolCalls: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new AgentActivityNotFoundError(`Task "${input.taskId}" was not found.`);
    }

    if (task.projectId !== input.projectId) {
      throw new AgentActivityUnauthorizedError(
        `Access denied: task "${input.taskId}" belongs to project "${task.projectId}", not "${input.projectId}".`,
      );
    }

    const executionSteps: any[] =
      (task as any).executionSteps ??
      (await this.prisma.agentExecutionStep.findMany({
        where: { taskId: input.taskId },
        orderBy: { sequence: 'asc' },
      })) ??
      [];

    const toolCalls: any[] =
      (task as any).toolCalls ??
      (await this.prisma.agentToolCallRecord.findMany({
        where: { taskId: input.taskId },
        orderBy: { startedAt: 'asc' },
      })) ??
      [];

    // 3. Load active plan if exists
    const activePlan = await this.prisma.agentPlan.findFirst({
      where: {
        taskId: input.taskId,
        projectId: input.projectId,
        status: { in: ['READY', 'EXECUTING', 'COMPLETED', 'FAILED'] },
      },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
      orderBy: { version: 'desc' },
    });

    // 4. Load approvals if exist
    const approvals = await this.prisma.agentToolApproval.findMany({
      where: {
        taskId: input.taskId,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 5. Assemble Timeline Items in chronological order
    const items: AgentActivityItemDto[] = [];
    let itemSeq = 0;

    // Item: Task Initialized / Planning
    if (task.startedAt || task.status !== 'QUEUED') {
      items.push({
        id: `${task.id}-init`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'PLANNING',
        title: 'Task Planning',
        description: `Planning execution for: "${task.title}"`,
        status: activePlan ? activePlan.status : 'COMPLETED',
        stepId: null,
        toolName: null,
        toolStatus: null,
        inputSummary: null,
        resultSummary: activePlan
          ? {
              version: activePlan.version,
              totalSteps: activePlan.steps.length,
              status: activePlan.status,
            }
          : null,
        error: null,
        durationMs: null,
        startedAt: task.startedAt?.toISOString() ?? task.createdAt.toISOString(),
        completedAt:
          executionSteps.length > 0 && executionSteps[0]?.startedAt
            ? executionSteps[0].startedAt.toISOString()
            : null,
        timestamp: task.startedAt?.toISOString() ?? task.createdAt.toISOString(),
      });
    }

    // Correlate execution steps and tool calls
    for (const step of executionSteps) {
      // Find tool calls matching this step's sequence/timeline
      const matchingToolCalls = toolCalls.filter(tc => {
        // If step has outputReference matching toolCall or timestamps overlap
        if (step.outputReference && step.outputReference === tc.id) return true;
        if (tc.startedAt && step.startedAt) {
          const tcTime = tc.startedAt.getTime();
          const stepStart = step.startedAt.getTime();
          const stepEnd = step.completedAt ? step.completedAt.getTime() : Infinity;
          return tcTime >= stepStart && tcTime <= stepEnd;
        }
        return false;
      });

      const stepStartIso = step.startedAt?.toISOString() ?? task.createdAt.toISOString();

      // Item: Step execution
      items.push({
        id: `${step.id}-step`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'ANALYSIS',
        title: `Step ${step.sequence}: ${step.title}`,
        description: step.title,
        status: step.status,
        stepId: step.id,
        toolName: null,
        toolStatus: null,
        inputSummary: null,
        resultSummary: null,
        error: AgentActivitySanitizer.sanitizeError(step.error),
        durationMs:
          step.completedAt && step.startedAt
            ? step.completedAt.getTime() - step.startedAt.getTime()
            : null,
        startedAt: stepStartIso,
        completedAt: step.completedAt?.toISOString() ?? null,
        timestamp: stepStartIso,
      });

      // Items for tool calls
      for (const tc of matchingToolCalls) {
        const toolStatus = this.mapToolCallStatus(tc.status);

        items.push({
          id: `${tc.id}-tool`,
          taskId: task.id,
          sequence: itemSeq++,
          kind: 'TOOL_EXECUTION',
          title: `Tool: ${tc.toolName}`,
          description: `Executing tool ${tc.toolName}`,
          status: tc.status,
          stepId: step.id,
          toolName: tc.toolName,
          toolStatus,
          inputSummary: AgentActivitySanitizer.summarizeInput(tc.input),
          resultSummary: AgentActivitySanitizer.summarizeResult(tc.output),
          error: AgentActivitySanitizer.sanitizeError(tc.error),
          durationMs: tc.durationMs ?? null,
          startedAt: tc.startedAt ? tc.startedAt.toISOString() : null,
          completedAt: tc.completedAt ? tc.completedAt.toISOString() : null,
          timestamp: (tc.startedAt ?? task.createdAt).toISOString(),
        });
      }
    }

    // Any orphaned tool calls not correlated with an execution step
    const correlatedToolIds = new Set(items.map(i => i.id.replace('-tool', '')));
    for (const tc of toolCalls) {
      if (!correlatedToolIds.has(tc.id)) {
        const toolStatus = this.mapToolCallStatus(tc.status);
        items.push({
          id: `${tc.id}-tool-orphan`,
          taskId: task.id,
          sequence: itemSeq++,
          kind: 'TOOL_EXECUTION',
          title: `Tool: ${tc.toolName}`,
          description: `Executing tool ${tc.toolName}`,
          status: tc.status,
          stepId: null,
          toolName: tc.toolName,
          toolStatus,
          inputSummary: AgentActivitySanitizer.summarizeInput(tc.input),
          resultSummary: AgentActivitySanitizer.summarizeResult(tc.output),
          error: AgentActivitySanitizer.sanitizeError(tc.error),
          durationMs: tc.durationMs ?? null,
          startedAt: tc.startedAt ? tc.startedAt.toISOString() : null,
          completedAt: tc.completedAt ? tc.completedAt.toISOString() : null,
          timestamp: (tc.startedAt ?? task.createdAt).toISOString(),
        });
      }
    }

    // Pending or decided approvals
    for (const app of approvals) {
      const decidedAt = app.approvedAt ?? app.rejectedAt;
      items.push({
        id: `${app.id}-approval`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'APPROVAL_WAITING',
        title: `Authorization Required: ${app.toolName}`,
        description: app.reason ?? `Authorization requested for ${app.requestedOperation}`,
        status: app.status,
        stepId: null,
        toolName: app.toolName,
        toolStatus:
          app.status === 'PENDING' ? 'RUNNING' : app.status === 'APPROVED' ? 'SUCCESS' : 'FAILED',
        inputSummary: AgentActivitySanitizer.summarizeInput(app.inputPayload),
        resultSummary: decidedAt
          ? { approvedBy: app.approvedBy, decidedAt: decidedAt.toISOString() }
          : null,
        error: app.status === 'REJECTED' ? 'Authorization rejected by user' : null,
        durationMs: null,
        startedAt: app.createdAt.toISOString(),
        completedAt: decidedAt ? decidedAt.toISOString() : null,
        timestamp: app.createdAt.toISOString(),
      });
    }

    // Final outcome item if task is completed, failed, or cancelled
    if (task.status === 'COMPLETED') {
      items.push({
        id: `${task.id}-completed`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'COMPLETION',
        title: 'Task Completed',
        description: 'All steps completed successfully.',
        status: 'COMPLETED',
        stepId: null,
        toolName: null,
        toolStatus: null,
        inputSummary: null,
        resultSummary: { stepsCompleted: executionSteps.length },
        error: null,
        durationMs: null,
        startedAt: task.completedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        timestamp: (task.completedAt ?? new Date()).toISOString(),
      });
    } else if (task.status === 'FAILED') {
      items.push({
        id: `${task.id}-failed`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'FAILURE',
        title: 'Task Failed',
        description: task.failureReason ?? 'Task encountered an unrecoverable failure.',
        status: 'FAILED',
        stepId: null,
        toolName: null,
        toolStatus: null,
        inputSummary: null,
        resultSummary: null,
        error: AgentActivitySanitizer.sanitizeError(task.failureReason),
        durationMs: null,
        startedAt: task.completedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        timestamp: (task.completedAt ?? new Date()).toISOString(),
      });
    } else if (task.status === 'CANCELLED') {
      items.push({
        id: `${task.id}-cancelled`,
        taskId: task.id,
        sequence: itemSeq++,
        kind: 'CANCELLATION',
        title: 'Task Cancelled',
        description: task.failureReason ?? 'Task was cancelled.',
        status: 'CANCELLED',
        stepId: null,
        toolName: null,
        toolStatus: null,
        inputSummary: null,
        resultSummary: null,
        error: null,
        durationMs: null,
        startedAt: task.completedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        timestamp: (task.completedAt ?? new Date()).toISOString(),
      });
    }

    // Active indicators
    const runningStep = executionSteps.find(s => s.status === 'RUNNING');
    const runningTool = toolCalls.find(tc => tc.status === 'RUNNING');

    const totalSteps = activePlan?.steps.length ?? executionSteps.length;
    const completedSteps = executionSteps.filter(s => s.status === 'COMPLETED').length;

    const duration =
      task.completedAt && task.startedAt
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.startedAt
          ? Date.now() - task.startedAt.getTime()
          : 0;

    return {
      taskId: task.id,
      threadId: task.threadId,
      projectId: task.projectId,
      taskTitle: task.title,
      taskStatus: task.status,
      currentStepSequence: runningStep ? runningStep.sequence : executionSteps.length,
      activeStepTitle: runningStep?.title ?? null,
      activeToolName: runningTool?.toolName ?? runningStep?.toolAction ?? null,
      activeToolStatus: runningTool
        ? this.mapToolCallStatus(runningTool.status)
        : runningStep?.toolAction
          ? 'RUNNING'
          : null,
      items,
      totalSteps,
      completedSteps,
      toolCallsCount: toolCalls.length,
      startedAt: task.startedAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      durationMs: Math.max(0, duration),
    };
  }

  // ============================================================================
  // Helpers & Security
  // ============================================================================

  private mapToolCallStatus(prismaStatus: string): AgentToolExecutionStatus {
    switch (prismaStatus) {
      case 'RUNNING':
        return 'RUNNING';
      case 'COMPLETED':
      case 'SUCCESS':
        return 'SUCCESS';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'PENDING':
      default:
        return 'QUEUED';
    }
  }

  private async assertProjectAccess(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });

    if (!project) {
      throw new AgentActivityUnauthorizedError(
        `User "${userId}" does not have access to project "${projectId}".`,
      );
    }
  }

  /**
   * Resets all in-memory static state (used in unit/certification tests).
   */
  public static clearStateForTest(): void {
    AgentActivityStreamService.taskSequences.clear();
    AgentActivityStreamService.taskEventBuffers.clear();
    AgentActivityStreamService.taskSubscribers.clear();
    AgentActivityStreamService.globalSubscribers.clear();
  }
}
