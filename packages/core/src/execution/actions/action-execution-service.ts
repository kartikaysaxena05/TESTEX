/**
 * @file packages/core/src/execution/actions/action-execution-service.ts
 * Authoritative Action Execution Service orchestrating safe, deterministic browser actions.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  type ActionResultDto,
  type StepExecutionResultDto,
  type ExecuteActionInputDto,
  type ExecuteStepInputDto,
  executeActionInputSchema,
  executeStepInputSchema,
  type ExecutablePlanStepDto,
} from '@ai-quality/contracts';
import type { ILogger } from '../../logging/index.js';
import type { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import { ActionHandlerRegistry } from './action-handler-registry.js';
import { type ActionExecutionContext, type StepExecutionSequenceOptions } from './action-types.js';
import { CrossRunExecutionError, DestructiveActionProhibitedError } from './action-errors.js';
import { BrowserSessionNotFoundError } from '../sessions/session-errors.js';
import { AssertionEngine, getAssertionEngine } from '../assertions/assertion-engine.js';
import type { AssertionResultDto } from '@ai-quality/contracts';

export class ActionExecutionService {
  private readonly prisma: PrismaClient;
  private readonly sessionManager: BrowserSessionManager;
  private readonly registry: ActionHandlerRegistry;
  private readonly assertionEngine: AssertionEngine;
  private readonly logger?: ILogger;

  constructor(
    prisma: PrismaClient,
    sessionManager: BrowserSessionManager,
    registry?: ActionHandlerRegistry,
    logger?: ILogger,
    assertionEngine?: AssertionEngine,
  ) {
    this.prisma = prisma;
    this.sessionManager = sessionManager;
    this.registry = registry ?? new ActionHandlerRegistry();
    this.logger = logger;
    this.assertionEngine = assertionEngine ?? getAssertionEngine();
  }

  /**
   * Executes a single browser action against the designated test run's browser session.
   */
  public async executeAction(
    input: ExecuteActionInputDto,
    abortSignal?: AbortSignal,
  ): Promise<ActionResultDto> {
    const validated = executeActionInputSchema.parse(input);

    // 1. Validate Project and Run Ownership in Database
    const testRun = await this.prisma.testRun.findUnique({
      where: { id: validated.testRunId },
      include: {
        environment: true,
      },
    });

    if (!testRun) {
      throw new CrossRunExecutionError(
        `TestRun '${validated.testRunId}' was not found in the database.`,
      );
    }

    if (testRun.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Cross-project execution blocked: TestRun '${validated.testRunId}' belongs to project '${testRun.projectId}', not '${validated.projectId}'.`,
      );
    }

    // 2. Retrieve Active Browser Execution Session
    const session =
      this.sessionManager.getSessionByRunId(validated.testRunId) ??
      this.sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
      null;

    if (!session) {
      throw new BrowserSessionNotFoundError(validated.testRunId);
    }

    if (session.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Session project mismatch: Session is scoped to project '${session.projectId}', not '${validated.projectId}'.`,
      );
    }

    // 3. Resolve Action Handler
    const actionType = validated.action.action;
    const handler = this.registry.getHandler(actionType);

    // 4. Validate Safety / Risk Policy
    const isProduction = testRun.environment?.isProduction ?? false;
    if (isProduction && handler.riskLevel === 'DESTRUCTIVE' && !validated.allowDestructive) {
      throw new DestructiveActionProhibitedError(
        actionType,
        testRun.environment?.name ?? 'Production',
      );
    }

    // 5. Construct Runtime Context
    const context: ActionExecutionContext = {
      projectId: validated.projectId,
      testRunId: validated.testRunId,
      stepId: validated.stepId ?? validated.action.id,
      session,
      context: session.context,
      page: session.page,
      baseUrl: testRun.environment?.baseUrl ?? null,
      environment: testRun.environment
        ? {
            id: testRun.environment.id,
            projectId: testRun.environment.projectId,
            targetApplicationId: testRun.environment.targetApplicationId,
            name: testRun.environment.name,
            type: testRun.environment.type as any,
            baseUrl: testRun.environment.baseUrl,
            isDefault: testRun.environment.isDefault,
            isEnabled: testRun.environment.isEnabled,
            isProduction: testRun.environment.isProduction,
            productionSafetyPolicy: testRun.environment.productionSafetyPolicy as any,
            browserEngine: testRun.environment.browserEngine as any,
            headless: testRun.environment.headless,
            viewportWidth: testRun.environment.viewportWidth,
            viewportHeight: testRun.environment.viewportHeight,
            locale: testRun.environment.locale,
            timezoneId: testRun.environment.timezoneId,
            colorScheme: testRun.environment.colorScheme as any,
            ignoreHttpsErrors: testRun.environment.ignoreHttpsErrors,
            permissions: testRun.environment.permissions,
            extraHeaders: testRun.environment.extraHeaders as any,
            variables: testRun.environment.variables as any,
            secretReferences: testRun.environment.secretReferences as any,
            notes: testRun.environment.notes,
            createdAt: testRun.environment.createdAt.toISOString(),
            updatedAt: testRun.environment.updatedAt.toISOString(),
          }
        : null,
      abortSignal,
      allowDestructive: validated.allowDestructive,
    };

    this.logger?.info('action_execution.started', {
      testRunId: validated.testRunId,
      projectId: validated.projectId,
      stepId: context.stepId,
      actionType,
      riskLevel: handler.riskLevel,
    });

    const result = await handler.execute(validated.action, context);

    this.logger?.info('action_execution.completed', {
      testRunId: validated.testRunId,
      actionId: result.actionId,
      actionType: result.actionType,
      status: result.status,
      durationMs: result.durationMs,
      errorCode: result.errorCode,
    });

    return result;
  }

  /**
   * Executes a step and wraps the result in StepExecutionResultDto.
   */
  public async executeStep(
    input: ExecuteStepInputDto,
    abortSignal?: AbortSignal,
  ): Promise<StepExecutionResultDto> {
    const validated = executeStepInputSchema.parse(input);

    const actionResult = await this.executeAction(
      {
        projectId: validated.projectId,
        testRunId: validated.testRunId,
        stepId: validated.step.id,
        action: validated.step,
        allowDestructive: validated.allowDestructive,
      },
      abortSignal,
    );

    let status = actionResult.status;
    let durationMs = actionResult.durationMs;
    let errorMessage = actionResult.errorMessage;
    const assertionResults: AssertionResultDto[] = [];

    // If action succeeded and step contains required assertions, evaluate them deterministically
    if (
      actionResult.status === 'PASSED' &&
      validated.step.assertions &&
      validated.step.assertions.length > 0
    ) {
      const session =
        this.sessionManager.getSessionByRunId(validated.testRunId) ??
        this.sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
        null;

      if (session) {
        const evalResult = await this.assertionEngine.evaluateStepAssertions(
          validated.step.id,
          validated.step.assertions,
          {
            projectId: validated.projectId,
            testRunId: validated.testRunId,
            stepId: validated.step.id,
            page: session.page,
            browserContext: session.context,
            session,
            abortSignal,
          },
        );

        assertionResults.push(...evalResult.results);
        durationMs += evalResult.durationMs;

        if (evalResult.status === 'FAILED') {
          status = 'FAILED';
          errorMessage = evalResult.errorMessage || 'One or more step assertions failed.';
        } else if (evalResult.status === 'ERROR') {
          status = 'FAILED';
          errorMessage = evalResult.errorMessage || 'Step assertion encountered an error.';
        } else if (evalResult.status === 'CANCELLED') {
          status = 'CANCELLED';
          errorMessage = evalResult.errorMessage || 'Step assertions were cancelled.';
        }
      }
    }

    // If step failed (action failed or assertion failed), capture failure evidence via coordinator if present
    if (status === 'FAILED') {
      const session =
        this.sessionManager.getSessionByRunId(validated.testRunId) ??
        this.sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
        null;

      if (session?.evidenceCoordinator && session.page) {
        try {
          await session.evidenceCoordinator.captureFailureEvidence({
            page: session.page,
            projectId: validated.projectId,
            testRunId: validated.testRunId,
            executionId: validated.testRunId,
            stepIndex: validated.step.sequence,
            errorSummary: errorMessage ?? actionResult.errorMessage ?? 'Step execution failed.',
          });
        } catch {
          // Evidence capture error must never mask step failure
        }
      }
    }

    return {
      stepId: validated.step.id,
      sequence: validated.step.sequence,
      actionResult,
      status,
      durationMs,
      errorMessage,
      assertionResults,
    };
  }

  /**
   * Executes a sequential list of plan steps in exact sequence with stop-on-failure policy.
   */
  public async executePlanSteps(
    projectId: string,
    testRunId: string,
    steps: readonly ExecutablePlanStepDto[],
    options?: StepExecutionSequenceOptions,
  ): Promise<readonly StepExecutionResultDto[]> {
    const stopOnFailure = options?.stopOnFailure ?? true;
    const sortedSteps = [...steps].sort((a, b) => a.sequence - b.sequence);
    const results: StepExecutionResultDto[] = [];

    for (const step of sortedSteps) {
      // 1. Check abort signal before starting step
      if (options?.abortSignal?.aborted) {
        const cancelledResult: ActionResultDto = {
          actionId: crypto.randomUUID(),
          stepId: step.id,
          testRunId,
          projectId,
          actionType: step.action,
          status: 'CANCELLED',
          riskLevel: 'READ_ONLY',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
          forceUsed: false,
          errorMessage: 'Step execution cancelled by user request.',
          errorCode: 'ACTION_CANCELLED',
        };

        results.push({
          stepId: step.id,
          sequence: step.sequence,
          actionResult: cancelledResult,
          status: 'CANCELLED',
          durationMs: 0,
          errorMessage: 'Execution was cancelled.',
        });
        break;
      }

      // 2. Execute step
      const stepResult = await this.executeStep(
        {
          projectId,
          testRunId,
          step,
          allowDestructive: options?.allowDestructive,
        },
        options?.abortSignal,
      );

      results.push(stepResult);

      // 3. Stop on failure if required and step is not optional
      if (stepResult.status === 'FAILED' && stopOnFailure && !step.isOptional) {
        this.logger?.warn('action_execution.sequence_stopped_on_failure', {
          projectId,
          testRunId,
          failedStepSequence: step.sequence,
          remainingStepsSkipped: sortedSteps.length - results.length,
        });
        break;
      }
    }

    return results;
  }
}
