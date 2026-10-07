/**
 * @file packages/core/src/agent-tools/playwright/playwright-execution-service.ts
 * Domain service for V10 Phase 147: Playwright Execution Tool.
 *
 * Implements:
 * - Controlled execution of real Playwright browser sessions for an authorized project & test case.
 * - Reuses V5 TestPlanCompiler, BrowserSessionManager, ActionExecutionService, AssertionEngine.
 * - Captures evidence (screenshots, console logs, network events, dom snapshots).
 * - Classifies failures using V6 failure categorization taxonomy.
 * - Enforces strict tenant isolation: user -> project -> task -> test/plan.
 * - Manages task lifecycle and execution step history in AgentThreadService.
 * - Supports cooperative cancellation via AbortSignal.
 */

import crypto from 'node:crypto';
import type { PrismaClient, TestRun } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import {
  type PlaywrightExecuteInputDto,
  type PlaywrightExecuteOutputDto,
  type PlaywrightStepResultDto,
  type PlaywrightEvidenceReferencesDto,
  type PlaywrightFailureClassificationDto,
  type TestCaseDetailDto,
  type StepExecutionResultDto,
  playwrightExecuteInputSchema,
} from '@ai-quality/contracts';
import {
  PlaywrightExecutionToolError,
  PlaywrightExecutionTestCaseNotFoundError,
  PlaywrightExecutionUnauthorizedTargetError,
  PlaywrightExecutionCancelledError,
  PlaywrightExecutionValidationError,
} from './playwright-execution-errors.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../ai-provider/ai-provider-errors.js';
import { TestPlanCompiler } from '../../execution/compiler/test-plan-compiler.js';
import { BrowserSessionManager } from '../../execution/sessions/browser-session-manager.js';
import { ActionExecutionService } from '../../execution/actions/action-execution-service.js';
import { AssertionEngine, getAssertionEngine } from '../../execution/assertions/assertion-engine.js';
import { EvidenceCaptureCoordinator } from '../../execution/evidence/evidence-capture-coordinator.js';
import { getExecutionEvidenceService } from '../../execution/evidence/index.js';
import { ExecutionPersistenceService } from '../../execution/persistence/execution-persistence-service.js';
import { RetryPolicyEngine } from '../../execution/retry/retry-policy-engine.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(str: string): boolean {
  return UUID_REGEX.test(str.trim());
}

export interface PlaywrightExecutionServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly compiler?: TestPlanCompiler;
  readonly sessionManager?: BrowserSessionManager;
  readonly actionService?: ActionExecutionService;
  readonly assertionEngine?: AssertionEngine;
  readonly persistenceService?: ExecutionPersistenceService;
  readonly retryEngine?: RetryPolicyEngine;
  readonly agentThreadService?: AgentThreadService;
}

export class PlaywrightExecutionService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly compiler: TestPlanCompiler;
  private readonly sessionManager: BrowserSessionManager;
  private readonly actionService: ActionExecutionService;
  private readonly assertionEngine: AssertionEngine;
  private readonly persistenceService: ExecutionPersistenceService;
  private readonly retryEngine: RetryPolicyEngine;
  private readonly agentThreadService: AgentThreadService;

  constructor(deps?: PlaywrightExecutionServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.compiler = deps?.compiler ?? new TestPlanCompiler();
    this.sessionManager = deps?.sessionManager ?? new BrowserSessionManager(this.prisma, undefined, undefined, undefined, this.logger);
    this.assertionEngine = deps?.assertionEngine ?? getAssertionEngine();
    this.actionService =
      deps?.actionService ??
      new ActionExecutionService(this.prisma, this.sessionManager, undefined, this.logger, this.assertionEngine);
    this.persistenceService =
      deps?.persistenceService ?? new ExecutionPersistenceService({ prisma: this.prisma, logger: this.logger });
    this.retryEngine = deps?.retryEngine ?? new RetryPolicyEngine(undefined, this.logger);
    this.agentThreadService = deps?.agentThreadService ?? new AgentThreadService({ prisma: this.prisma, logger: this.logger });
  }

  // ============================================================================
  // Project Access Authorization
  // ============================================================================

  public async assertProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<{ id: string; userId: string | null; name: string }> {
    if (!projectId) {
      throw new AiInvalidRequestError('Project ID is required.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true, name: true, deletedAt: true },
    });

    if (!project || project.deletedAt) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && userId && project.userId !== userId) {
      this.logger.warn('playwright_tool.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access project '${projectId}'.`,
      );
    }

    return project;
  }

  // ============================================================================
  // Execution Method
  // ============================================================================

  public async execute(
    rawInput: PlaywrightExecuteInputDto,
    userId: string,
    signal?: AbortSignal,
    onProgress?: (event: string, payload?: Record<string, unknown>) => void,
  ): Promise<PlaywrightExecuteOutputDto> {
    const parsed = playwrightExecuteInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new PlaywrightExecutionValidationError(
        `Invalid input: ${parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      );
    }

    const input = parsed.data;
    const { projectId, testCaseId: testCaseIdOrKey, taskId, targetUrl } = input;

    // 1. Authorize User -> Project
    await this.assertProjectAccess(projectId, userId);

    // 2. Validate Target URL scheme if supplied (Only http and https allowed)
    if (targetUrl) {
      try {
        const parsedUrl = new URL(targetUrl);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          throw new PlaywrightExecutionUnauthorizedTargetError(
            targetUrl,
            `Protocol '${parsedUrl.protocol}' is forbidden. Only http: and https: protocols are permitted.`,
          );
        }
      } catch (err: unknown) {
        if (err instanceof PlaywrightExecutionUnauthorizedTargetError) throw err;
        throw new PlaywrightExecutionUnauthorizedTargetError(targetUrl, 'Invalid URL format.');
      }
    }

    // 3. Resolve TestCase
    const testCase = await this.resolveTestCase(projectId, testCaseIdOrKey);
    if (!testCase) {
      throw new PlaywrightExecutionTestCaseNotFoundError(testCaseIdOrKey, projectId);
    }

    // 4. Validate Task & Thread if taskId is provided
    let toolCallRecordId: string | undefined;
    if (taskId) {
      const task = await this.prisma.agentThreadTask.findFirst({
        where: { id: taskId, projectId },
      });
      if (!task) {
        throw new AiInvalidRequestError(`Task '${taskId}' was not found in project '${projectId}'.`);
      }

      // Record tool call start
      try {
        const tc = await this.agentThreadService.recordToolCall(
          {
            projectId,
            taskId,
            stepId: input.stepId,
            toolName: 'playwright.execute',
            inputPayload: rawInput as unknown as Record<string, unknown>,
          },
          userId,
        );
        toolCallRecordId = tc.id;
      } catch (err) {
        this.logger.warn('playwright_tool.record_tool_call_failed', { error: String(err) });
      }
    }

    onProgress?.('execution.queued', {
      projectId,
      testCaseId: testCase.id,
      taskId,
    });

    if (signal?.aborted) {
      throw new PlaywrightExecutionCancelledError();
    }

    // 5. Compile Plan
    const compilerContext: any = {
      projectId,
      testCaseId: testCase.id,
      testCaseKey: testCase.testCaseKey,
      testCaseTitle: testCase.title,
      testCaseVersionNumber: testCase.versions?.[0]?.versionNumber ?? 1,
      testCaseVersionId: testCase.versions?.[0]?.id ?? crypto.randomUUID(),
      environmentId: input.environmentId,
      environmentBaseUrl: targetUrl,
    };

    const compiledPlan = this.compiler.compile({
      testCase: testCase as unknown as TestCaseDetailDto,
      context: compilerContext,
    });

    // 6. Create durable TestRun and TestCaseExecution records
    const testRunId = crypto.randomUUID();
    const now = new Date();

    const testRun = await this.prisma.testRun.create({
      data: {
        id: testRunId,
        projectId,
        testCaseId: testCase.id,
        testCaseVersionNumber: compilerContext.testCaseVersionNumber,
        testCaseVersionId: compilerContext.testCaseVersionId,
        executableTestPlanId: compiledPlan.id,
        planFingerprint: compiledPlan.planFingerprint,
        status: 'RUNNING',
        startedAt: now,
        queuedAt: now,
        browserEngine: input.browserEngine,
        headless: input.headless,
        timeoutMs: input.timeoutMs,
        testCaseTitle: testCase.title,
        metadataJson: {
          taskId,
          triggeredBy: 'V10_AGENT_RUNTIME',
          userId,
        },
      },
    });

    const execution = await this.persistenceService.createExecution({
      projectId,
      testRunId,
      testCaseId: testCase.id,
      testCaseVersionId: compilerContext.testCaseVersionId,
      testCaseVersionNumber: compilerContext.testCaseVersionNumber,
      executableTestPlanId: compiledPlan.id,
      environmentId: input.environmentId,
      attempt: 1,
      browserEngine: input.browserEngine,
    });

    onProgress?.('browser.starting', {
      testRunId,
      executionId: execution.id,
      browserEngine: input.browserEngine,
    });

    // 7. Setup Evidence Coordinator
    let evidenceCoordinator: EvidenceCaptureCoordinator | undefined;
    try {
      const evidenceService = getExecutionEvidenceService();
      evidenceCoordinator = new EvidenceCaptureCoordinator({
        evidenceService: evidenceService as any,
        logger: this.logger,
      });
    } catch {
      // Evidence service may not be available in standalone test fixtures
    }

    // 8. Launch Browser Session
    let session: any = null;
    const stepResults: PlaywrightStepResultDto[] = [];
    const screenshotPaths: string[] = [];
    let failureClassification: PlaywrightFailureClassificationDto | null = null;
    let overallStatus: 'PASSED' | 'FAILED' | 'CANCELLED' = 'PASSED';
    let summaryMessage = '';
    const tStart = performance.now();

    try {
      session = await this.sessionManager.createSession({
        testRunId,
        projectId,
        environmentId: input.environmentId,
        browserEngine: input.browserEngine,
        headless: input.headless,
        evidenceCoordinator,
        executionId: execution.id,
      });

      onProgress?.('session.ready', {
        testRunId,
        sessionId: session.sessionId,
      });

      // 9. Execute Compiled Plan Steps sequentially
      for (const step of compiledPlan.steps) {
        if (signal?.aborted) {
          overallStatus = 'CANCELLED';
          summaryMessage = 'Execution cancelled via agent signal.';
          break;
        }

        onProgress?.('step.executing', {
          stepId: step.id,
          sequence: step.sequence,
          action: step.action,
        });

        // Persist step start
        let stepRecord: any = null;
        try {
          stepRecord = await this.persistenceService.startStep({
            projectId,
            executionId: execution.id,
            testRunId,
            sourceStepId: isUuid(step.id) ? step.id : null,
            stepIndex: step.sequence,
            actionType: step.action,
            targetSummary: (step as any).target?.description ?? step.action,
          });
        } catch {
          // Persistence error shouldn't crash test execution
        }

        const stepResult = await this.actionService.executeStep(
          {
            projectId,
            testRunId,
            step,
            allowDestructive: input.allowDestructive,
          },
          signal,
        );

        // Persist step completion
        try {
          if (stepRecord) {
            await this.persistenceService.completeStep({
              projectId,
              executionId: execution.id,
              testRunId,
              stepExecutionId: stepRecord.id,
              status: stepResult.status,
              durationMs: stepResult.durationMs,
              errorMessage: stepResult.errorMessage,
              assertionResults: (stepResult.assertionResults as any) ?? [],
            });
          }
        } catch {
          // Ignore step completion persistence error
        }

        const mappedStepResult: PlaywrightStepResultDto = {
          stepId: step.id,
          sequence: step.sequence,
          action: step.action,
          status: stepResult.status as any,
          durationMs: stepResult.durationMs,
          errorMessage: stepResult.errorMessage ?? null,
          assertionCount: stepResult.assertionResults?.length ?? 0,
        };
        stepResults.push(mappedStepResult);

        if (stepResult.status === 'FAILED') {
          this.logger.warn('playwright_tool.step_failed', {
            stepId: step.id,
            sequence: step.sequence,
            action: step.action,
            errorMessage: stepResult.errorMessage,
            actionError: stepResult.actionResult?.errorMessage,
            errorCode: stepResult.actionResult?.errorCode,
          });
          overallStatus = 'FAILED';
          summaryMessage = stepResult.errorMessage ?? `Step ${step.sequence} failed.`;

          // Classify failure
          failureClassification = this.classifyExecutionFailure(
            stepResult.errorMessage,
            stepResult.actionResult?.errorCode,
          );
          break;
        } else if (stepResult.status === 'CANCELLED') {
          overallStatus = 'CANCELLED';
          summaryMessage = 'Step execution cancelled.';
          break;
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (signal?.aborted || err instanceof PlaywrightExecutionCancelledError) {
        overallStatus = 'CANCELLED';
        summaryMessage = 'Execution cancelled.';
      } else {
        overallStatus = 'FAILED';
        summaryMessage = errMsg;
        failureClassification = this.classifyExecutionFailure(errMsg, null);
      }
    } finally {
      // 10. Finalize session and close browser
      if (session) {
        try {
          if (evidenceCoordinator && session.context) {
            const artifact = await evidenceCoordinator.finalizeSessionTrace({
              context: session.context,
              projectId,
              testRunId,
              executionId: execution.id,
              isFailed: overallStatus === 'FAILED',
            });
            if (artifact?.originalLogicalName) {
              screenshotPaths.push(artifact.originalLogicalName);
            }
          }
        } catch (evErr) {
          this.logger.warn('playwright_tool.finalize_evidence_failed', { error: String(evErr) });
        }

        try {
          await this.sessionManager.closeSession(session.sessionId);
        } catch (closeErr) {
          this.logger.warn('playwright_tool.close_session_failed', { error: String(closeErr) });
        }
      }
    }

    const durationMs = Math.round(performance.now() - tStart);
    const passedSteps = stepResults.filter(s => s.status === 'PASSED').length;
    const failedSteps = stepResults.filter(s => s.status === 'FAILED').length;
    const isPassed = overallStatus === 'PASSED';

    if (isPassed && !summaryMessage) {
      summaryMessage = `All ${stepResults.length} test steps executed successfully.`;
    }

    // 11. Complete TestRun & TestCaseExecution in persistence
    try {
      await this.persistenceService.completeExecution({
        projectId,
        executionId: execution.id,
        testRunId,
        status: overallStatus as any,
        durationMs,
        terminalReason: summaryMessage,
        errorMessage: overallStatus === 'FAILED' ? summaryMessage : null,
      });
    } catch {
      // Fallback direct update if persistence service fails
      await this.prisma.testRun.update({
        where: { id: testRunId },
        data: {
          status: overallStatus as any,
          completedAt: new Date(),
          executionDurationMs: durationMs,
          terminalReason: summaryMessage,
        },
      });
    }

    // 12. If taskId is present, record execution step and tool call result in AgentThreadService
    if (taskId && toolCallRecordId) {
      try {
        await this.agentThreadService.updateToolCallResult(
          {
            projectId,
            toolCallId: toolCallRecordId,
            status: isPassed ? 'COMPLETED' : overallStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
            output: {
              status: overallStatus,
              passed: isPassed,
              summary: summaryMessage,
              totalSteps: compiledPlan.steps.length,
              passedSteps,
              failedSteps,
            },
            error: overallStatus === 'FAILED' ? summaryMessage : undefined,
            durationMs,
          },
          userId,
        );

        const step = await this.agentThreadService.addExecutionStep(
          {
            projectId,
            taskId,
            stepType: 'TOOL_EXECUTION',
            title: `Executed Playwright test: ${testCase.title}`,
            metadata: {
              toolName: 'playwright.execute',
              toolInputJson: rawInput,
              toolOutputJson: {
                status: overallStatus,
                summary: summaryMessage,
                durationMs,
              },
            },
          },
          userId,
        );

        await this.agentThreadService.updateExecutionStepStatus(
          {
            projectId,
            stepId: step.id,
            status: isPassed ? 'COMPLETED' : overallStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
            error: overallStatus === 'FAILED' ? summaryMessage : undefined,
          },
          userId,
        );
      } catch (err) {
        this.logger.warn('playwright_tool.record_agent_step_failed', { error: String(err) });
      }
    }

    onProgress?.('execution.completed', {
      testRunId,
      status: overallStatus,
      passed: isPassed,
      durationMs,
    });

    const evidenceRefs: PlaywrightEvidenceReferencesDto = {
      bundleId: null,
      screenshotPaths,
      tracePath: null,
      consoleLogCount: 0,
      networkLogCount: 0,
      domSnapshotCaptured: false,
    };

    return {
      executionId: execution.id,
      testRunId,
      taskId: taskId ?? null,
      projectId,
      testCaseId: testCase.id,
      testCaseKey: testCase.testCaseKey,
      testCaseTitle: testCase.title,
      status: overallStatus,
      passed: isPassed,
      durationMs,
      totalSteps: compiledPlan.steps.length,
      passedSteps,
      failedSteps,
      stepResults,
      failureClassification,
      evidence: evidenceRefs,
      summary: summaryMessage,
    };
  }

  // ============================================================================
  // Failure Classification Helper
  // ============================================================================

  private classifyExecutionFailure(
    errorMessage?: string | null,
    errorCode?: string | null,
  ): PlaywrightFailureClassificationDto {
    const rawCategory = this.retryEngine.classifyFailureCategory(errorMessage, errorCode);

    let category = 'AUTOMATION_FAILURE';
    let subcategory: string | null = null;
    let isAppDefect = false;
    let isAutoFail = false;
    let isEnvFail = false;
    let isTestDataFail = false;

    if (rawCategory === 'ASSERTION_FAILURE') {
      category = 'APPLICATION_FAILURE';
      subcategory = 'ASSERTION_MISMATCH';
      isAppDefect = true;
    } else if (rawCategory === 'TIMEOUT') {
      category = 'ENVIRONMENT_FAILURE';
      subcategory = 'TIMEOUT';
      isEnvFail = true;
    } else if (rawCategory === 'NETWORK_ERROR') {
      category = 'ENVIRONMENT_FAILURE';
      subcategory = 'TARGET_UNREACHABLE';
      isEnvFail = true;
    } else if (rawCategory === 'BROWSER_CRASH' || rawCategory === 'CONTEXT_CLOSED') {
      category = 'AUTOMATION_FAILURE';
      subcategory = 'BROWSER_CRASH';
      isAutoFail = true;
    } else if (/test data|credential|fixture/i.test(errorMessage ?? '')) {
      category = 'TEST_DATA_FAILURE';
      subcategory = 'INVALID_TEST_DATA';
      isTestDataFail = true;
    } else {
      category = 'AUTOMATION_FAILURE';
      subcategory = 'ACTION_EXECUTION_ERROR';
      isAutoFail = true;
    }

    return {
      category,
      subcategory,
      reason: errorMessage || 'Execution failure detected.',
      isApplicationDefect: isAppDefect,
      isAutomationFailure: isAutoFail,
      isEnvironmentFailure: isEnvFail,
      isTestDataFailure: isTestDataFail,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async resolveTestCase(projectId: string, testCaseIdOrKey: string) {
    if (isUuid(testCaseIdOrKey)) {
      const tc = await this.prisma.testCase.findFirst({
        where: { id: testCaseIdOrKey, projectId },
        include: {
          steps: { orderBy: { stepNumber: 'asc' } },
          preconditions: { orderBy: { sequenceOrder: 'asc' } },
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      });
      if (tc) return tc;
    }

    return this.prisma.testCase.findFirst({
      where: { testCaseKey: testCaseIdOrKey, projectId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        preconditions: { orderBy: { sequenceOrder: 'asc' } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
      },
    });
  }
}
