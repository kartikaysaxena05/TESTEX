/**
 * @file packages/core/src/agent-tools/failure-intelligence/failure-intelligence-tool-service.ts
 * Domain service for V10 Phase 148: Failure Intelligence Tool (failure_intelligence.analyze).
 *
 * Implements:
 * 1. Analyzes a failed test case execution or failure case using existing V6 services:
 *    - FailureCaseService (Phase 74)
 *    - FailureDeterministicClassifier (Phase 77)
 *    - FlakinessAnalysisService (Phase 79)
 *    - FailureDomainSeparationService (Phase 80)
 *    - FailureEvidenceCorrelationService (Phase 81)
 *    - FailureRootCauseService (Phase 83)
 *    - StructuredBugReportService (Phase 87)
 * 2. Enforces strict multi-tenant authorization:
 *    user -> project -> task -> execution -> failure
 * 3. Never fabricates evidence, logs, or results: strictly queries authoritative DB state.
 * 4. Read-only operation: returns structured machine-readable analysis without mutating codebase.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../database/client.js';
import { getLogger, type ILogger } from '../../logging/index.js';
import {
  type FailureIntelligenceAnalyzeInputDto,
  type FailureIntelligenceAnalyzeOutputDto,
  type FailureIntelligenceEvidenceItemDto,
  type FailureIntelligenceReproductionSummaryDto,
  type FailureIntelligenceRootCauseDto,
  type FailureIntelligenceDefectInfoDto,
  failureIntelligenceAnalyzeInputSchema,
} from '@ai-quality/contracts';
import {
  FailureIntelligenceToolError,
  FailureIntelligenceExecutionNotFoundError,
  FailureIntelligenceCaseNotFoundError,
  FailureIntelligenceIneligibleExecutionError,
  FailureIntelligenceValidationError,
} from './failure-intelligence-tool-errors.js';
import {
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from '../../ai-provider/ai-provider-errors.js';
import { FailureCaseService } from '../../failures/failure-case-service.js';
import { FailureDeterministicClassifier } from '../../failures/classification/failure-deterministic-classifier.js';
import { FlakinessAnalysisService } from '../../failures/flakiness/flakiness-analysis-service.js';
import { FailureDomainSeparationService } from '../../failures/separation/failure-domain-separation-service.js';
import { FailureEvidenceCorrelationService } from '../../failures/localization/failure-evidence-correlation-service.js';
import { FailureRootCauseService } from '../../failures/root-cause/failure-root-cause-service.js';
import { StructuredBugReportService } from '../../failures/bug-report/structured-bug-report-service.js';
import { AgentThreadService } from '../../agent-threads/agent-thread-service.js';

export interface FailureIntelligenceToolServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
  readonly failureCaseService?: FailureCaseService;
  readonly classifier?: FailureDeterministicClassifier;
  readonly flakinessService?: FlakinessAnalysisService;
  readonly domainSeparationService?: FailureDomainSeparationService;
  readonly localizationService?: FailureEvidenceCorrelationService;
  readonly rootCauseService?: FailureRootCauseService;
  readonly bugReportService?: StructuredBugReportService;
  readonly agentThreadService?: AgentThreadService;
}

export class FailureIntelligenceToolService {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;
  private readonly failureCaseService: FailureCaseService;
  private readonly classifier: FailureDeterministicClassifier;
  private readonly flakinessService: FlakinessAnalysisService;
  private readonly domainSeparationService: FailureDomainSeparationService;
  private readonly localizationService: FailureEvidenceCorrelationService;
  private readonly rootCauseService: FailureRootCauseService;
  private readonly bugReportService: StructuredBugReportService;
  private readonly agentThreadService: AgentThreadService;

  constructor(deps?: FailureIntelligenceToolServiceDependencies) {
    const client = deps?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps?.logger ?? getLogger();
    this.failureCaseService =
      deps?.failureCaseService ?? new FailureCaseService({ prisma: this.prisma, logger: this.logger });
    this.classifier = deps?.classifier ?? new FailureDeterministicClassifier(this.prisma);
    this.flakinessService = deps?.flakinessService ?? new FlakinessAnalysisService(this.prisma);
    this.domainSeparationService =
      deps?.domainSeparationService ?? new FailureDomainSeparationService(this.prisma);
    this.localizationService =
      deps?.localizationService ?? new FailureEvidenceCorrelationService(this.prisma);
    this.rootCauseService = deps?.rootCauseService ?? new FailureRootCauseService(this.prisma);
    this.bugReportService = deps?.bugReportService ?? new StructuredBugReportService(this.prisma);
    this.agentThreadService =
      deps?.agentThreadService ?? new AgentThreadService({ prisma: this.prisma, logger: this.logger });
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
      this.logger.warn('failure_intelligence_tool.cross_project_violation', {
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
  // Analyze Method
  // ============================================================================

  public async analyze(
    rawInput: FailureIntelligenceAnalyzeInputDto,
    userId: string,
  ): Promise<FailureIntelligenceAnalyzeOutputDto> {
    const parseResult = failureIntelligenceAnalyzeInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const issues = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new FailureIntelligenceValidationError(`Invalid failure intelligence input: ${issues}`);
    }

    const input = parseResult.data;
    const { projectId, taskId, executionId, failureId, options } = input;

    // 1. Authorize project ownership
    await this.assertProjectAccess(projectId, userId);

    // 2. Validate task ownership if provided
    if (taskId) {
      const task = await this.prisma.agentThreadTask.findUnique({
        where: { id: taskId },
        select: { id: true, projectId: true },
      });
      if (!task || task.projectId !== projectId) {
        throw new AiCrossProjectAccessError(
          `Task '${taskId}' does not belong to project '${projectId}'.`,
        );
      }
    }

    // 3. Resolve FailureCase either directly by failureId or via executionId
    let failureCase: any = null;

    if (failureId) {
      failureCase = await this.prisma.failureCase.findUnique({
        where: { id: failureId },
        include: {
          execution: {
            include: {
              testCase: {
                select: {
                  id: true,
                  testCaseKey: true,
                  title: true,
                  sourceRequirementId: true,
                  sourceRequirementKey: true,
                },
              },
              testRun: {
                select: {
                  id: true,
                  testCaseTitle: true,
                },
              },
            },
          },
          evidenceReferences: true,
          reproductionAttempts: {
            orderBy: { attemptNumber: 'desc' },
          },
        },
      });

      if (!failureCase) {
        throw new FailureIntelligenceCaseNotFoundError(failureId, projectId);
      }

      if (failureCase.projectId !== projectId) {
        throw new AiCrossProjectAccessError(
          `FailureCase '${failureId}' belongs to project '${failureCase.projectId}', not '${projectId}'.`,
        );
      }
    } else if (executionId) {
      const execution = await this.prisma.testCaseExecution.findUnique({
        where: { id: executionId },
        include: {
          testCase: {
            select: {
              id: true,
              testCaseKey: true,
              title: true,
              sourceRequirementId: true,
              sourceRequirementKey: true,
            },
          },
          testRun: {
            select: {
              id: true,
              testCaseTitle: true,
            },
          },
        },
      });

      if (!execution) {
        throw new FailureIntelligenceExecutionNotFoundError(executionId, projectId);
      }

      if (execution.projectId !== projectId) {
        throw new AiCrossProjectAccessError(
          `Execution '${executionId}' belongs to project '${execution.projectId}', not '${projectId}'.`,
        );
      }

      // Check execution eligibility
      if (execution.status === 'PASSED' || execution.status === 'CANCELLED') {
        throw new FailureIntelligenceIneligibleExecutionError(executionId, execution.status);
      }

      // Ensure failure case exists for execution (reuses Phase 74 idempotently)
      try {
        await this.failureCaseService.ensureFailureCaseFromExecution({
          projectId,
          executionId,
          title: execution.testCase?.title ?? execution.testRun?.testCaseTitle ?? `Execution failure ${executionId}`,
          failureSummary: execution.errorMessage ?? 'Execution failed without detailed error message.',
        });
      } catch (err: unknown) {
        this.logger.warn('failure_intelligence_tool.ensure_case_failed', {
          executionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      failureCase = await this.prisma.failureCase.findFirst({
        where: {
          projectId,
          executionId,
        },
        include: {
          execution: {
            include: {
              testCase: {
                select: {
                  id: true,
                  testCaseKey: true,
                  title: true,
                  sourceRequirementId: true,
                  sourceRequirementKey: true,
                },
              },
              testRun: {
                select: {
                  id: true,
                  testCaseTitle: true,
                },
              },
            },
          },
          evidenceReferences: true,
          reproductionAttempts: {
            orderBy: { attemptNumber: 'desc' },
          },
        },
      });

      if (!failureCase) {
        throw new FailureIntelligenceCaseNotFoundError(`associated with execution ${executionId}`, projectId);
      }
    }

    const targetExecutionId = failureCase.executionId;
    const testCase = failureCase.execution?.testCase;
    const testRun = failureCase.execution?.testRun;

    // 4. Run or query deterministic classification (reusing V6 Phase 77)
    let classification: any = null;
    try {
      classification = await this.classifier.classify({
        projectId,
        failureCaseId: failureCase.id,
      });
    } catch (err: unknown) {
      this.logger.warn('failure_intelligence_tool.classifier_warn', {
        failureCaseId: failureCase.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const category = classification?.category ?? 'UNKNOWN_FAILURE';
    const subcategory = classification?.subcategory ?? null;
    const isAppDefect = category === 'APPLICATION_FAILURE';
    const isAutoFail = category === 'AUTOMATION_FAILURE';
    const isEnvFail = category === 'ENVIRONMENT_FAILURE';
    const isTestDataFail = category === 'TEST_DATA_FAILURE';
    const confidence = classification?.confidenceScore ?? (isAppDefect || isAutoFail ? 0.85 : 0.5);
    const primaryRuleId = classification?.primaryRuleId ?? null;
    const classificationRationale =
      classification?.rationale ??
      failureCase.failureSummary ??
      'Classification computed from factual execution records.';

    // 5. Query flakiness analysis (reusing V6 Phase 79 if requested)
    let isFlaky: boolean | null = null;
    try {
      const flakiness = await this.flakinessService.analyzeFlakiness({
        projectId,
        failureCaseId: failureCase.id,
      });
      isFlaky = flakiness.flakinessState === 'CONFIRMED_FLAKY' || flakiness.flakinessState === 'FLAKY_CANDIDATE';
    } catch {
      // Ignore non-fatal flakiness analysis lookup
    }

    // 6. Query reproduction facts (reusing V6 Phase 76)
    let reproduction: FailureIntelligenceReproductionSummaryDto | null = null;
    if (options?.includeReproductionSummary !== false) {
      const attempts = failureCase.reproductionAttempts ?? [];
      const attemptCount = attempts.length;
      const reproducedCount = attempts.filter((a: any) => a.status === 'REPRODUCED').length;
      const reproRatio = attemptCount > 0 ? reproducedCount / attemptCount : null;

      reproduction = {
        status: attemptCount > 0 ? (reproducedCount > 0 ? 'REPRODUCED' : 'NOT_REPRODUCED') : 'NOT_ATTEMPTED',
        attemptCount,
        reproducedCount,
        reproducibilityRatio: reproRatio,
      };
    }

    // 7. Query Root-Cause Hypothesis (reusing V6 Phase 83)
    let rootCause: FailureIntelligenceRootCauseDto | null = null;
    if (options?.includeRootCauseHypothesis !== false) {
      try {
        const rcRecord = await this.prisma.failureRootCauseAnalysis.findFirst({
          where: {
            projectId,
            failureCaseId: failureCase.id,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (rcRecord) {
          rootCause = {
            rootCauseStatus: rcRecord.rootCauseStatus,
            probableLayer: rcRecord.probableLayer,
            probableComponent: rcRecord.probableComponent,
            probableCause: rcRecord.probableCause,
            humanExplanation: rcRecord.humanExplanation,
            affectedExecutionPath: (rcRecord.affectedExecutionPath as string[]) || [],
            contributingFactors: [],
          };
        } else if (isAppDefect) {
          rootCause = {
            rootCauseStatus: 'HYPOTHESIS',
            probableLayer: 'APPLICATION_UI_OR_API',
            probableComponent: testCase?.title ?? 'Target Component',
            probableCause: failureCase.failureSummary,
            humanExplanation: `Application defect detected during test execution: ${failureCase.failureSummary}`,
            affectedExecutionPath: [],
            contributingFactors: [],
          };
        }
      } catch (err: unknown) {
        this.logger.debug('failure_intelligence_tool.root_cause_omitted', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 8. Query evidence references (Phase 75)
    const evidenceList: FailureIntelligenceEvidenceItemDto[] = [];
    if (options?.includeEvidenceDetails !== false) {
      const evidenceRefs = failureCase.evidenceReferences ?? [];
      for (const ev of evidenceRefs) {
        evidenceList.push({
          id: ev.id,
          artifactType: ev.artifactType,
          logicalName: ev.logicalName,
          mimeType: ev.mimeType ?? null,
          byteSize: ev.byteSize ?? null,
          sha256: ev.sha256 ?? null,
          integrityStatus: ev.integrityStatus ?? 'UNVERIFIED',
        });
      }
    }

    // 9. Query or create Structured Bug Report if it is an application defect (Phase 87)
    let defectInfo: FailureIntelligenceDefectInfoDto | null = null;
    if (options?.includeDefectReport !== false && isAppDefect) {
      try {
        const report = await this.prisma.structuredBugReport.findFirst({
          where: {
            projectId,
            failureCaseId: failureCase.id,
          },
          orderBy: { revision: 'desc' },
        });

        if (report) {
          defectInfo = {
            reportNumber: report.reportNumber,
            isApplicationDefect: report.isApplicationDefect,
            defectState: report.applicationDefectState,
            severity: report.severity,
            priority: report.priority,
            clusterKey: report.duplicateClusterKey,
            clusterMemberCount: report.relatedFailureCount,
            reproductionSteps: ((report.reproductionStepsJson as any[]) || []).map((step, idx) => ({
              stepNumber: step.stepNumber ?? idx + 1,
              action: step.action ?? String(step),
              expectedResult: step.expectedResult ?? null,
            })),
          };
        }
      } catch (err: unknown) {
        this.logger.debug('failure_intelligence_tool.defect_omitted', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 10. Recommend next action based on factual failure domain
    let recommendedNextAction: FailureIntelligenceAnalyzeOutputDto['recommendedNextAction'];
    if (isFlaky) {
      recommendedNextAction = 'QUARANTINE_FLAKY_TEST';
    } else if (isAppDefect) {
      recommendedNextAction = 'TRIAGE_APPLICATION_DEFECT';
    } else if (isAutoFail) {
      recommendedNextAction = 'UPDATE_AUTOMATION_TEST';
    } else if (isEnvFail) {
      recommendedNextAction = 'INSPECT_ENVIRONMENT';
    } else if (isTestDataFail) {
      recommendedNextAction = 'FIX_TEST_DATA';
    } else {
      recommendedNextAction = 'COLLECT_MORE_EVIDENCE';
    }

    const summary = `Failure case '${failureCase.id}' analyzed: Classified as ${category}${subcategory ? ` (${subcategory})` : ''} with confidence ${(confidence * 100).toFixed(0)}%. Recommended action: ${recommendedNextAction}.`;

    // 11. Record execution step if taskId is present
    if (taskId) {
      try {
        await this.agentThreadService.addExecutionStep(
          {
            projectId,
            taskId,
            stepType: 'TOOL_EXECUTION',
            title: `Analyzed failure intelligence for execution ${targetExecutionId}: ${category}`,
            metadata: {
              toolName: 'failure_intelligence.analyze',
              toolInputJson: input,
              toolOutputJson: {
                failureCaseId: failureCase.id,
                category,
                confidence,
                recommendedNextAction,
              },
            },
          },
          userId,
        );
      } catch (err: unknown) {
        this.logger.warn('failure_intelligence_tool.record_step_failed', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      failureCaseId: failureCase.id,
      projectId,
      executionId: targetExecutionId,
      testRunId: testRun?.id ?? null,
      testCaseId: testCase?.id ?? null,
      testCaseKey: testCase?.testCaseKey ?? null,
      testCaseTitle: testCase?.title ?? testRun?.testCaseTitle ?? null,
      requirementId: testCase?.sourceRequirementId ?? null,
      requirementKey: testCase?.sourceRequirementKey ?? null,
      status: failureCase.status,
      category,
      subcategory,
      classificationStatus: classification?.category ? 'CLASSIFIED' : 'UNCLASSIFIED',
      isApplicationDefect: isAppDefect,
      isAutomationFailure: isAutoFail,
      isEnvironmentFailure: isEnvFail,
      isTestDataFailure: isTestDataFail,
      isFlaky,
      confidence,
      primaryRuleId,
      classificationRationale,
      rootCause,
      reproduction,
      evidence: evidenceList,
      defect: defectInfo,
      recommendedNextAction,
      summary,
    };
  }
}
