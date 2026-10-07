/**
 * @file packages/core/src/agent-loop/agent-executor.ts
 * Execution boundary for V10 Phase 153: Agent Execution Loop.
 *
 * Guarantees:
 * 1. Executes actions exclusively through ToolRegistryService (no raw shell or unvetted execution).
 * 2. Enforces input validation against registered tool schemas before invocation.
 * 3. Records every execution step (AgentExecutionStep) and tool call (AgentToolCallRecord) in Prisma.
 * 4. Catches approval requirements (AgentToolApprovalRequiredError) and signals loop pause.
 * 5. Performs cancellation checks before and after tool calls.
 * 6. Captures duration, output, error, and redacts sensitive data.
 */

import {
  type AgentPlanExecutionDto,
  type AgentPlanStepExecutionDto,
  type AgentExecutionStepStatus,
} from '@ai-quality/contracts';
import { AgentThreadService } from '../agent-threads/agent-thread-service.js';
import { AgentPlanService } from '../agent-planning/agent-plan-service.js';
import { ToolRegistryService } from '../agent-tools/agent-tool-registry.js';
import { AgentToolApprovalRequiredError } from '../agent-permissions/agent-permission-errors.js';
import { AgentLoopCancelledError } from './agent-loop-errors.js';
import type { AgentState } from './agent-state.js';
import { ApprovalService } from '../agent-approval/approval-service.js';
import { ApprovalActionModifiedError } from '../agent-approval/agent-approval-errors.js';
import { FileReviewService } from '../file-review/file-review-service.js';
import { getPrismaClient } from '../database/client.js';
import type { PrismaClient } from '@prisma/client';

export interface StepExecutionContext {
  readonly projectId: string;
  readonly threadId: string;
  readonly taskId: string;
  readonly userId: string;
  readonly plan: AgentPlanExecutionDto;
  readonly step: AgentPlanStepExecutionDto;
  readonly state: AgentState;
  readonly signal?: AbortSignal;
}

export interface StepExecutionResult {
  readonly success: boolean;
  readonly output?: unknown;
  readonly error?: string;
  readonly requiresApproval?: boolean;
  readonly approvalId?: string;
  readonly cancelled?: boolean;
}

export interface IAgentExecutor {
  executeStep(context: StepExecutionContext): Promise<StepExecutionResult>;
}

export class AgentExecutor implements IAgentExecutor {
  private readonly prisma?: PrismaClient;
  private readonly fileReviewService?: FileReviewService;

  constructor(
    private readonly threadService: AgentThreadService,
    private readonly planService: AgentPlanService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly approvalService?: ApprovalService,
    prisma?: PrismaClient,
    fileReviewService?: FileReviewService,
  ) {
    this.prisma = prisma ?? getPrismaClient() ?? undefined;
    this.fileReviewService =
      fileReviewService ??
      (this.prisma
        ? new FileReviewService({ prisma: this.prisma, approvalService: this.approvalService })
        : undefined);
  }

  public async executeStep(context: StepExecutionContext): Promise<StepExecutionResult> {
    const { projectId, threadId, taskId, userId, plan, step, state, signal } = context;

    // 1. Initial cancellation check
    if (signal?.aborted || state.isCancellationRequested()) {
      throw new AgentLoopCancelledError(
        taskId,
        state.getCancellationReason() ?? 'Cancelled before step start',
      );
    }

    // 2. Safety limits assertion
    state.assertSafetyLimits();

    // 3. Persist ExecutionStep in database (status: RUNNING)
    const dbStep = await this.threadService.addExecutionStep(
      {
        projectId,
        taskId,
        stepType: step.toolAction,
        title: step.title,
        inputReference: step.id,
        metadata: {
          objective: step.objective,
          structuredInput: step.structuredInput ?? {},
        },
      },
      userId,
    );

    // 4. Update plan step status to RUNNING
    await this.planService.setStepStatus(
      {
        projectId,
        planId: plan.id,
        stepId: step.id,
        status: 'RUNNING',
      },
      userId,
    );

    state.recordStepStarted(step.id, step.toolAction);

    // 5. Pre-tool cancellation check
    if (signal?.aborted || state.isCancellationRequested()) {
      await this.markStepCancelled(projectId, plan.id, step.id, dbStep.id, userId);
      throw new AgentLoopCancelledError(
        taskId,
        state.getCancellationReason() ?? 'Cancelled before tool execution',
      );
    }

    // 5.5 Phase 155 Human Approval Policy Gate
    if (
      this.approvalService &&
      this.prisma &&
      (this.prisma as any).approvalRequest &&
      step.toolAction &&
      this.toolRegistry.hasTool(step.toolAction)
    ) {
      const toolDef = await this.toolRegistry
        .getTool({ projectId, toolId: step.toolAction }, userId)
        .catch(() => null);
      const policyEngine = this.approvalService.getPolicyEngine();
      const inputObj = (step.structuredInput ?? {}) as Record<string, unknown>;
      const affectedFiles = (
        (inputObj.targetFiles as string[] | undefined) ??
        (inputObj.filePath ? [String(inputObj.filePath)] : [])
      ).filter(Boolean);

      const requestedActionStr = step.title || step.toolAction;
      const policyResult = policyEngine.evaluate({
        toolName: step.toolAction,
        requestedAction: requestedActionStr,
        input: inputObj,
        affectedFiles,
        affectedTools: [step.toolAction],
        declaredLevel: toolDef?.permissionLevel,
      });

      if (policyResult.decision === 'DENY') {
        const denyReason = `Operation is denied by approval security policy: ${policyResult.reason}`;
        await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, denyReason, userId);
        state.recordStepFailed(step.id, denyReason);
        return { success: false, error: denyReason };
      }

      if (policyResult.decision === 'REQUIRE_APPROVAL') {
        // Check if an APPROVED request exists with matching actionHash
        const approvedReq = await this.prisma.approvalRequest.findFirst({
          where: {
            taskId,
            status: 'APPROVED',
            actionHash: policyResult.actionHash,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!approvedReq) {
          // Check for tamper
          const tampered = await this.prisma.approvalRequest.findFirst({
            where: {
              taskId,
              status: 'APPROVED',
              requestedAction: requestedActionStr,
            },
          });
          if (tampered && tampered.actionHash !== policyResult.actionHash) {
            throw new ApprovalActionModifiedError(
              tampered.id,
              tampered.actionHash,
              policyResult.actionHash,
            );
          }

          // Check if request was rejected by user
          const rejectedReq = await this.prisma.approvalRequest.findFirst({
            where: {
              taskId,
              status: 'REJECTED',
              actionHash: policyResult.actionHash,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (rejectedReq) {
            const rejectReason = `Operation was rejected by user: ${rejectedReq.responseReason ?? 'Rejected by human operator'}`;
            await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, rejectReason, userId);
            state.recordStepFailed(step.id, rejectReason);
            return { success: false, error: rejectReason };
          }

          // Check if request expired
          const expiredReq = await this.prisma.approvalRequest.findFirst({
            where: {
              taskId,
              status: 'EXPIRED',
              actionHash: policyResult.actionHash,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (expiredReq) {
            const expireReason = `Approval request expired before authorization: ${expiredReq.responseReason ?? 'Expired'}`;
            await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, expireReason, userId);
            state.recordStepFailed(step.id, expireReason);
            return { success: false, error: expireReason };
          }

          // Check if request was cancelled
          const cancelledReq = await this.prisma.approvalRequest.findFirst({
            where: {
              taskId,
              status: 'CANCELLED',
              actionHash: policyResult.actionHash,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (cancelledReq) {
            const cancelReason = `Approval request was cancelled: ${cancelledReq.responseReason ?? 'Cancelled'}`;
            await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, cancelReason, userId);
            state.recordStepFailed(step.id, cancelReason);
            return { success: false, error: cancelReason };
          }

          // Check for existing PENDING request
          const existingPending = await this.prisma.approvalRequest.findFirst({
            where: {
              taskId,
              status: 'PENDING',
              actionHash: policyResult.actionHash,
            },
          });

          const activePending =
            existingPending ??
            (await this.approvalService.createRequest(
              {
                projectId,
                threadId,
                taskId,
                executionStepId: dbStep.id,
                approvalType: policyResult.approvalType,
                title: policyResult.title,
                description: policyResult.description,
                riskLevel: policyResult.riskLevel,
                requestedAction: requestedActionStr,
                requestedInput: inputObj,
                affectedFiles: [...policyResult.affectedFiles],
                affectedTools: [...policyResult.affectedTools],
              },
              userId,
            ));

          // V10 Phase 156: Auto-create FileDiffReview for proposed patch or file modifications
          if (
            this.fileReviewService &&
            this.prisma &&
            (policyResult.approvalType === 'CODE_PATCH' ||
              policyResult.approvalType === 'FILE_WRITE' ||
              typeof inputObj.diff === 'string' ||
              typeof inputObj.patch === 'string')
          ) {
            try {
              const existingReview = await this.prisma.fileDiffReview.findFirst({
                where: { approvalRequestId: activePending.id },
              });
              if (!existingReview) {
                let diffText = '';
                if (typeof inputObj.diff === 'string' && inputObj.diff.trim()) {
                  diffText = inputObj.diff;
                } else if (typeof inputObj.patch === 'string' && inputObj.patch.trim()) {
                  diffText = inputObj.patch;
                } else if (typeof inputObj.filePath === 'string') {
                  const fp = String(inputObj.filePath);
                  const content = String(inputObj.content ?? inputObj.replacementContent ?? '');
                  const lines = content ? content.split(/\r?\n/).length : 0;
                  diffText =
                    `--- a/${fp}\n+++ b/${fp}\n@@ -0,0 +1,${lines} @@\n` +
                    (content ? content.split(/\r?\n/).map(l => `+${l}`).join('\n') : '');
                } else {
                  diffText = `--- a/change\n+++ b/change\n@@ -1,1 +1,1 @@\n-${step.toolAction}\n+${JSON.stringify(inputObj)}`;
                }

                await this.fileReviewService.createReview(
                  {
                    projectId,
                    threadId,
                    taskId,
                    approvalRequestId: activePending.id,
                    title: policyResult.title,
                    description: policyResult.description,
                    affectedFiles: [...policyResult.affectedFiles],
                    originalDiff: diffText,
                  },
                  userId,
                );
              }
            } catch {
              // Best-effort auto-creation of review
            }
          }

          state.pendingApprovalId = activePending.id;
          state.status = 'WAITING_FOR_APPROVAL';

          await this.planService.setStepStatus(
            {
              projectId,
              planId: plan.id,
              stepId: step.id,
              status: 'PENDING',
              errorInfo: `Operation requires human approval (approvalId: ${activePending.id})`,
            },
            userId,
          );

          await this.threadService.updateExecutionStepStatus(
            {
              projectId,
              stepId: dbStep.id,
              status: 'WAITING_FOR_APPROVAL' as unknown as AgentExecutionStepStatus,
              error: `Waiting for human approval (ID: ${activePending.id})`,
            },
            userId,
          );

          return {
            success: false,
            requiresApproval: true,
            approvalId: activePending.id,
          };
        }
      }
    }

    // 6. Check if step requires invoking a registered Tool
    const hasRegisteredTool = this.toolRegistry.hasTool(step.toolAction);

    if (hasRegisteredTool) {
      // Record Tool Call in database (status: PENDING)
      const toolCall = await this.threadService.recordToolCall(
        {
          projectId,
          taskId,
          stepId: dbStep.id,
          toolName: step.toolAction,
          inputPayload: (step.structuredInput ?? {}) as Record<string, unknown>,
          status: 'PENDING',
        },
        userId,
      );

      try {
        // Assert safety limits right before invocation
        state.assertSafetyLimits();

        // Invoke through Tool Registry
        const result = await this.toolRegistry.invoke(
          {
            projectId,
            toolId: step.toolAction,
            input: (step.structuredInput ?? {}) as Record<string, unknown>,
          },
          {
            projectId,
            userId,
            threadId,
            taskId,
            signal,
          },
        );

        // Update Tool Call in database
        await this.threadService.updateToolCallResult(
          {
            projectId,
            toolCallId: toolCall.id,
            status: result.success ? 'COMPLETED' : 'FAILED',
            output: result.output,
            error: result.error ?? undefined,
            durationMs: result.durationMs,
          },
          userId,
        );

        if (!result.success) {
          const errMessage = result.error ?? `Tool "${step.toolAction}" failed`;
          await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, errMessage, userId);
          state.recordToolCallFailure(step.id, step.toolAction, errMessage, result.durationMs);
          state.recordStepFailed(step.id, errMessage);
          return { success: false, error: errMessage };
        }

        // Tool succeeded
        state.recordToolCallSuccess(step.id, step.toolAction, result.output, result.durationMs);

        await this.threadService.updateExecutionStepStatus(
          {
            projectId,
            stepId: dbStep.id,
            status: 'COMPLETED',
            outputReference:
              typeof result.output === 'object'
                ? JSON.stringify(result.output).slice(0, 500)
                : String(result.output),
          },
          userId,
        );

        await this.planService.setStepStatus(
          {
            projectId,
            planId: plan.id,
            stepId: step.id,
            status: 'COMPLETED',
            resultReference: `tool:${step.toolAction}`,
          },
          userId,
        );

        state.recordStepCompleted(step.id);
        return { success: true, output: result.output };
      } catch (err: unknown) {
        if (err instanceof AgentToolApprovalRequiredError) {
          // Pause execution on human approval requirement
          state.pendingApprovalId = err.approvalId;
          state.status = 'WAITING_FOR_APPROVAL';

          await this.planService.setStepStatus(
            {
              projectId,
              planId: plan.id,
              stepId: step.id,
              status: 'PENDING',
              errorInfo: `Operation requires human approval (approvalId: ${err.approvalId})`,
            },
            userId,
          );

          await this.threadService.updateExecutionStepStatus(
            {
              projectId,
              stepId: dbStep.id,
              status: 'WAITING_FOR_APPROVAL' as unknown as AgentExecutionStepStatus,
              error: `Waiting for human approval (ID: ${err.approvalId})`,
            },
            userId,
          );

          return {
            success: false,
            requiresApproval: true,
            approvalId: err.approvalId,
          };
        }

        if (signal?.aborted || state.isCancellationRequested()) {
          await this.markStepCancelled(projectId, plan.id, step.id, dbStep.id, userId);
          throw new AgentLoopCancelledError(
            taskId,
            state.getCancellationReason() ?? 'Cancelled during tool execution',
          );
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        await this.threadService
          .updateToolCallResult(
            {
              projectId,
              toolCallId: toolCall.id,
              status: 'FAILED',
              error: errorMessage,
            },
            userId,
          )
          .catch(() => {});

        await this.markStepFailed(projectId, plan.id, step.id, dbStep.id, errorMessage, userId);
        state.recordToolCallFailure(step.id, step.toolAction, errorMessage, 0);
        state.recordStepFailed(step.id, errorMessage);
        return { success: false, error: errorMessage };
      }
    } else {
      // Internal or reasoning step (no external tool registered)
      // Execute as internal synthetic step
      const stepOutput = {
        action: step.toolAction,
        objective: step.objective,
        status: 'COMPLETED',
      };

      await this.threadService.updateExecutionStepStatus(
        {
          projectId,
          stepId: dbStep.id,
          status: 'COMPLETED',
          outputReference: `Action "${step.toolAction}" evaluated`,
        },
        userId,
      );

      await this.planService.setStepStatus(
        {
          projectId,
          planId: plan.id,
          stepId: step.id,
          status: 'COMPLETED',
          resultReference: `synthetic:${step.toolAction}`,
        },
        userId,
      );

      state.recordStepCompleted(step.id);
      return { success: true, output: stepOutput };
    }
  }

  private async markStepFailed(
    projectId: string,
    planId: string,
    stepId: string,
    dbStepId: string,
    error: string,
    userId: string,
  ): Promise<void> {
    await this.threadService
      .updateExecutionStepStatus(
        {
          projectId,
          stepId: dbStepId,
          status: 'FAILED',
          error,
        },
        userId,
      )
      .catch(() => {});

    await this.planService
      .setStepStatus(
        {
          projectId,
          planId,
          stepId,
          status: 'FAILED',
          errorInfo: error,
        },
        userId,
      )
      .catch(() => {});
  }

  private async markStepCancelled(
    projectId: string,
    planId: string,
    stepId: string,
    dbStepId: string,
    userId: string,
  ): Promise<void> {
    await this.threadService
      .updateExecutionStepStatus(
        {
          projectId,
          stepId: dbStepId,
          status: 'CANCELLED',
        },
        userId,
      )
      .catch(() => {});

    await this.planService
      .setStepStatus(
        {
          projectId,
          planId,
          stepId,
          status: 'CANCELLED',
        },
        userId,
      )
      .catch(() => {});
  }
}
