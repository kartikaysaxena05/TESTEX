/**
 * @file packages/core/src/conversational-agent/conversational-agent-service.ts
 * Unified Conversational AI Testing Agent Service (V8 Phase 124).
 *
 * CRITICAL ARCHITECTURAL ROLE:
 * Integrates:
 * 1. Conversational Agent Sessions (AgentSessionService)
 * 2. Structured Task Planning & Ambiguity Handling (AgentPlanningService)
 * 3. Controlled Application Tool Execution (AgentToolExecutor)
 * 4. Run Controls & Step Progress Telemetry (AgentRunController)
 * 5. Grounded Evidence Review & Provenance (AgentEvidenceAnalyzer)
 *
 * PRIVACY & SECURITY:
 * - NO arbitrary shell/filesystem/database access.
 * - Strict multi-tenant isolation via projectId.
 * - Destructive action gating: PRODUCTION or destructive operations require explicit user approval.
 * - Concise streaming activity messages: NO private reasoning or hidden chain-of-thought exposed.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { AgentSessionService } from './agent-session-service.js';
import { AgentPlanningService } from './agent-planning-service.js';
import { AgentToolExecutor } from './agent-tool-executor.js';
import { AgentRunController } from './agent-run-controller.js';
import { AgentEvidenceAnalyzer } from './agent-evidence-analyzer.js';
import type {
  AgentSessionDto,
  AgentMessageDto,
  AgentTaskDto,
  AgentActivityDto,
  AgentMessageResponseDto,
  ApproveAgentActionInputDto,
  AgentActionApprovalResultDto,
  AgentRunControlInputDto,
  AgentRunControlResultDto,
  GetAgentEvidenceInputDto,
  AgentEvidenceQueryResultDto,
  CreateAgentSessionInputDto,
  GetAgentSessionInputDto,
  ListAgentSessionsInputDto,
  SendAgentMessageInputDto,
  AgentPlanDto,
  AgentPlanStepDto,
} from '@ai-quality/contracts';
import {
  AgentInvalidRequestError,
  AgentSessionNotFoundError,
  AgentAccessDeniedError,
} from './conversational-agent-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface ConversationalAgentServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly sessionService?: AgentSessionService;
  readonly planningService?: AgentPlanningService;
  readonly toolExecutor?: AgentToolExecutor;
  readonly runController?: AgentRunController;
  readonly evidenceAnalyzer?: AgentEvidenceAnalyzer;
  readonly logger?: ILogger;
}

export class ConversationalAgentService {
  private readonly prisma: PrismaClient;
  private readonly sessionService: AgentSessionService;
  private readonly planningService: AgentPlanningService;
  private readonly toolExecutor: AgentToolExecutor;
  private readonly runController: AgentRunController;
  private readonly evidenceAnalyzer: AgentEvidenceAnalyzer;
  private readonly logger: ILogger;

  constructor(deps: ConversationalAgentServiceDependencies = {}) {
    const client = deps.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.sessionService = deps.sessionService ?? new AgentSessionService({ prisma: this.prisma });
    this.planningService = deps.planningService ?? new AgentPlanningService({ prisma: this.prisma });
    this.toolExecutor = deps.toolExecutor ?? new AgentToolExecutor({ prisma: this.prisma });
    this.runController = deps.runController ?? new AgentRunController({ prisma: this.prisma });
    this.evidenceAnalyzer = deps.evidenceAnalyzer ?? new AgentEvidenceAnalyzer({ prisma: this.prisma });
    this.logger = deps.logger ?? getLogger();
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  public async createSession(
    input: CreateAgentSessionInputDto,
    userId: string,
  ): Promise<AgentSessionDto> {
    return this.sessionService.createSession(input, userId);
  }

  public async getSession(
    input: GetAgentSessionInputDto,
    userId?: string,
  ): Promise<AgentSessionDto> {
    return this.sessionService.getSession(input, userId);
  }

  public async listSessions(
    input: ListAgentSessionsInputDto,
    userId?: string,
  ): Promise<readonly AgentSessionDto[]> {
    return this.sessionService.listSessions(input, userId);
  }

  public async deleteSession(
    sessionId: string,
    projectId: string,
    userId?: string,
  ): Promise<void> {
    return this.sessionService.deleteSession(sessionId, projectId, userId);
  }

  // =========================================================================
  // Conversational Interaction & Task Execution
  // =========================================================================

  /**
   * Processes a natural language testing request in an ongoing conversation session.
   */
  public async handleUserMessage(
    input: SendAgentMessageInputDto,
    userId: string,
    onActivity?: (activity: AgentActivityDto) => void,
  ): Promise<AgentMessageResponseDto> {
    const { sessionId, projectId, content } = input;
    const activities: AgentActivityDto[] = [];

    const emitActivity = (type: AgentActivityDto['type'], message: string, details?: Record<string, unknown>) => {
      const activity: AgentActivityDto = {
        type,
        message,
        timestamp: new Date().toISOString(),
        details: details ?? null,
      };
      activities.push(activity);
      if (onActivity) {
        try {
          onActivity(activity);
        } catch {
          // Ignore subscriber error
        }
      }
    };

    // 1. Validate session exists and belongs to project
    await this.sessionService.getSession({ sessionId, projectId }, userId);

    // 2. Persist User Message
    const userMessage = await this.sessionService.addMessage(sessionId, 'USER', content);

    // 3. Activity: Understanding request
    emitActivity('THINKING', 'Understanding testing request and resolving context...');
    await this.sessionService.updateSessionStatus(sessionId, 'THINKING');

    // 4. Planning: Generate structured task plan
    emitActivity('PLANNING', 'Synthesizing structured task plan and verifying security constraints...');
    await this.sessionService.updateSessionStatus(sessionId, 'PLANNING');

    const planResult = await this.planningService.generatePlan({
      projectId,
      prompt: content,
      userId,
      sessionId,
    });

    const { plan, requiresApproval, requiresClarification } = planResult;

    // 5. Handle Ambiguous Requests
    if (requiresClarification) {
      await this.sessionService.updateSessionStatus(sessionId, 'WAITING', 'NOT_REQUIRED');
      const task = await this.sessionService.createTask(sessionId, projectId, content, plan, 'NOT_REQUIRED', userId);

      const responseContent =
        `${planResult.clarificationMessage ?? 'Your request requires clarification.'}\n\n` +
        (planResult.suggestedOptions
          ? planResult.suggestedOptions.map((opt: string, i: number) => `${i + 1}. ${opt}`).join('\n')
          : '');

      const agentMessage = await this.sessionService.addMessage(sessionId, 'ASSISTANT', responseContent, {
        plan,
      });

      emitActivity('COMPLETED', 'Awaiting clarification from user.');
      return {
        userMessage,
        agentMessage,
        task,
        activities,
        sessionStatus: 'WAITING',
      };
    }

    // 6. Handle Destructive / Production Safe Mode Operations requiring approval
    if (requiresApproval) {
      await this.sessionService.updateSessionStatus(sessionId, 'WAITING', 'PENDING');
      const task = await this.sessionService.createTask(sessionId, projectId, content, plan, 'PENDING', userId);

      const responseContent =
        `I have prepared an execution plan: "${plan.summary}".\n\n` +
        `⚠️ APPROVAL REQUIRED: ${plan.approvalReason ?? 'This action involves sensitive or production environments.'}\n` +
        `Please approve or reject this plan to proceed.`;

      const agentMessage = await this.sessionService.addMessage(sessionId, 'ASSISTANT', responseContent, {
        plan,
      });

      emitActivity('COMPLETED', 'Execution plan generated. Awaiting user approval.');
      return {
        userMessage,
        agentMessage,
        task,
        activities,
        sessionStatus: 'WAITING',
      };
    }

    // 7. Non-destructive or approved request: Execute Plan Steps
    await this.sessionService.updateSessionStatus(sessionId, 'RUNNING', 'NOT_REQUIRED');
    const task = await this.sessionService.createTask(sessionId, projectId, content, plan, 'NOT_REQUIRED', userId);

    const executionResults = await this.executePlanSteps(
      sessionId,
      projectId,
      plan,
      userId,
      emitActivity,
    );

    // 8. Synthesize Final Agent Response
    const finalContent = this.synthesizePlanResponse(plan, executionResults);
    const agentMessage = await this.sessionService.addMessage(sessionId, 'ASSISTANT', finalContent, {
      plan: executionResults.updatedPlan,
      toolCalls: executionResults.toolCalls,
      toolResults: executionResults.toolResults,
      evidenceRefs: executionResults.evidenceRefs,
      runId: executionResults.runId,
    });

    const isSuccess = executionResults.success;
    const finalStatus = isSuccess ? 'COMPLETED' : 'FAILED';

    await this.sessionService.updateSessionStatus(sessionId, finalStatus, 'NOT_REQUIRED', executionResults.runId);
    await this.sessionService.updateTaskStatus(
      task.id,
      finalStatus,
      finalContent,
      executionResults.errorMessage,
      executionResults.runId,
    );

    emitActivity(
      isSuccess ? 'COMPLETED' : 'ERROR',
      isSuccess ? 'Testing agent workflow finished successfully.' : `Workflow encountered an issue: ${executionResults.errorMessage}`,
    );

    await this.auditAgentAction('AGENT_RESULT_GENERATED', projectId, userId, {
      sessionId,
      taskId: task.id,
      status: finalStatus,
      runId: executionResults.runId,
    });

    return {
      userMessage,
      agentMessage,
      task: {
        ...task,
        status: finalStatus,
        resultSummary: finalContent,
        activeRunId: executionResults.runId,
      },
      activities,
      sessionStatus: finalStatus,
    };
  }

  // =========================================================================
  // Approval Workflow
  // =========================================================================

  public async handleApproval(
    input: ApproveAgentActionInputDto,
    userId: string,
  ): Promise<AgentActionApprovalResultDto> {
    const { sessionId, projectId, approved, reason } = input;

    const session = await this.sessionService.getSession({ sessionId, projectId }, userId);
    const task = session.currentTask;

    if (!task || task.status !== 'AWAITING_APPROVAL' || !task.plan) {
      throw new AgentInvalidRequestError('No pending testing task is awaiting approval in this session.');
    }

    if (!approved) {
      // User rejected
      await this.sessionService.updateSessionStatus(sessionId, 'CANCELLED', 'REJECTED');
      await this.sessionService.updateTaskStatus(task.id, 'CANCELLED', 'Rejected by user', reason, null, 'REJECTED');

      const messageContent = `Plan execution cancelled: User rejected the plan${reason ? ` (${reason})` : ''}.`;
      const agentMsg = await this.sessionService.addMessage(sessionId, 'ASSISTANT', messageContent);

      await this.auditAgentAction('AGENT_TOOL_REJECTED', projectId, userId, {
        sessionId,
        taskId: task.id,
        reason,
      });

      return {
        sessionId,
        approvalState: 'REJECTED',
        status: 'CANCELLED',
        message: messageContent,
        agentMessage: agentMsg,
      };
    }

    // User approved
    await this.sessionService.updateSessionStatus(sessionId, 'RUNNING', 'APPROVED');
    await this.sessionService.updateTaskStatus(task.id, 'IN_PROGRESS', undefined, undefined, undefined, 'APPROVED');

    await this.auditAgentAction('AGENT_TOOL_APPROVED', projectId, userId, {
      sessionId,
      taskId: task.id,
      reason,
    });

    // Execute approved plan
    const executionResults = await this.executePlanSteps(
      sessionId,
      projectId,
      task.plan,
      userId,
      () => {},
      true, // isApproved = true
    );

    const finalContent = this.synthesizePlanResponse(task.plan, executionResults);
    const agentMsg = await this.sessionService.addMessage(sessionId, 'ASSISTANT', finalContent, {
      plan: executionResults.updatedPlan,
      toolCalls: executionResults.toolCalls,
      toolResults: executionResults.toolResults,
      evidenceRefs: executionResults.evidenceRefs,
      runId: executionResults.runId,
    });

    const finalStatus = executionResults.success ? 'COMPLETED' : 'FAILED';
    await this.sessionService.updateSessionStatus(sessionId, finalStatus, 'APPROVED', executionResults.runId);
    await this.sessionService.updateTaskStatus(
      task.id,
      finalStatus,
      finalContent,
      executionResults.errorMessage,
      executionResults.runId,
      'APPROVED',
    );

    return {
      sessionId,
      approvalState: 'APPROVED',
      status: finalStatus,
      message: finalContent,
      agentMessage: agentMsg,
    };
  }

  // =========================================================================
  // Run Controls & Evidence Review
  // =========================================================================

  public async handleRunControl(
    input: AgentRunControlInputDto,
    userId?: string,
  ): Promise<AgentRunControlResultDto> {
    const result = await this.runController.executeControl(input, userId);

    // If run was cancelled or started, synchronize session status
    if (input.action === 'CANCEL' && result.success) {
      await this.sessionService.updateSessionStatus(input.sessionId, 'CANCELLED');
    }

    return result;
  }

  public async queryEvidence(
    input: GetAgentEvidenceInputDto,
    userId?: string,
  ): Promise<AgentEvidenceQueryResultDto> {
    return this.evidenceAnalyzer.queryEvidence(input, userId);
  }

  // =========================================================================
  // Plan Execution Loop
  // =========================================================================

  private async executePlanSteps(
    sessionId: string,
    projectId: string,
    plan: AgentPlanDto,
    userId?: string,
    emitActivity: (type: AgentActivityDto['type'], message: string, details?: Record<string, unknown>) => void = () => {},
    isApproved = false,
  ): Promise<{
    success: boolean;
    toolCalls: any[];
    toolResults: any[];
    evidenceRefs: any[];
    runId: string | null;
    updatedPlan: AgentPlanDto;
    errorMessage?: string;
  }> {
    const toolCalls: any[] = [];
    const toolResults: any[] = [];
    const evidenceRefs: any[] = [];
    const updatedSteps: AgentPlanStepDto[] = [];
    let detectedRunId: string | null = null;
    let overallSuccess = true;
    let errorMessage: string | undefined;

    for (const step of plan.steps) {
      const toolName = step.targetTool ?? 'project_context';
      emitActivity('TOOL_CALLING', `Executing: ${step.description}...`, {
        toolName,
        stepIndex: step.stepIndex,
      });

      try {
        const response = await this.toolExecutor.executeTool({
          toolName,
          arguments: {},
          projectId,
          userId,
          sessionId,
          isApproved,
        });

        toolCalls.push({ toolName, arguments: {} });
        toolResults.push({ toolName, output: response.output, success: response.success });

        if (response.output && typeof response.output === 'object') {
          const out = response.output as any;
          if (out.runId) {
            detectedRunId = out.runId;
          }
          if (Array.isArray(out.artifacts)) {
            for (const art of out.artifacts) {
              evidenceRefs.push({
                evidenceId: art.id,
                artifactType: art.type ?? 'OTHER',
                title: art.name,
                urlOrPath: art.uri,
                timestamp: art.timestamp,
              });
            }
          }
        }

        updatedSteps.push({ ...step, status: 'COMPLETED' });
        emitActivity('EXECUTING', `Step ${step.stepIndex} completed: ${step.description}`);
      } catch (err) {
        this.logger.error('Plan step execution failure', {
          step: step.stepIndex,
          toolName,
          error: String(err),
        });

        updatedSteps.push({ ...step, status: 'FAILED' });
        overallSuccess = false;
        errorMessage = (err as Error).message;
        emitActivity('ERROR', `Step ${step.stepIndex} failed: ${errorMessage}`);
        break; // Stop sequential execution on error
      }
    }

    const updatedPlan: AgentPlanDto = {
      ...plan,
      steps: updatedSteps.concat(plan.steps.slice(updatedSteps.length)),
    };

    return {
      success: overallSuccess,
      toolCalls,
      toolResults,
      evidenceRefs,
      runId: detectedRunId,
      updatedPlan,
      errorMessage,
    };
  }

  private synthesizePlanResponse(
    plan: AgentPlanDto,
    results: {
      success: boolean;
      toolResults: any[];
      runId: string | null;
      errorMessage?: string;
    },
  ): string {
    if (!results.success) {
      return (
        `The requested operation could not be completed successfully.\n\n` +
        `Failure: ${results.errorMessage ?? 'One of the plan steps failed.'}\n` +
        `Plan: "${plan.summary}".`
      );
    }

    let summary = `Completed plan: "${plan.summary}".\n\n`;

    if (results.runId) {
      summary += `Automated Playwright test run initiated (Run ID: ${results.runId}).\n`;
      summary += `Real-time run controls and evidence review are active in the side panel.\n\n`;
    }

    // Highlights from tool outputs
    for (const res of results.toolResults) {
      if (res.toolName === 'release_status' && res.output) {
        summary += `Release Gate: ${res.output.releaseGate} (Readiness Score: ${res.output.readinessScore}%).\n`;
      } else if (res.toolName === 'requirements_search' && res.output) {
        summary += `Located ${res.output.count} matching requirement(s).\n`;
      } else if (res.toolName === 'test_search' && res.output) {
        summary += `Found ${res.output.count} relevant test case(s).\n`;
      }
    }

    return summary.trim();
  }

  private async auditAgentAction(
    action: any,
    projectId: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (userId) {
        await this.prisma.authAuditEvent.create({
          data: {
            userId,
            action,
            metadata: { projectId, ...metadata } as any,
          },
        });
      }
    } catch (err) {
      this.logger.warn('Failed to audit agent action', { action, error: String(err) });
    }
  }
}
