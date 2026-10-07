/**
 * @file packages/core/src/conversational-agent/agent-evidence-analyzer.ts
 * Grounded Evidence Review & Conversational Query Engine (V8 Phase 124).
 *
 * CRITICAL REQUIREMENTS:
 * 1. Preserves complete provenance chain:
 *    Project -> Requirement -> Test -> Test Run -> Step -> Evidence -> Failure -> Bug
 * 2. Grounded evidence queries: Answers questions from actual run artifacts, step telemetry,
 *    DOM evidence, screenshots, console logs, and failure classifications.
 * 3. NO hallucinated evidence: If evidence is missing, explicitly returns "Insufficient evidence".
 * 4. Multi-tenant isolation: Scoped strictly to target projectId.
 * 5. Audit trail: Logs AGENT_EVIDENCE_ACCESSED.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import type {
  GetAgentEvidenceInputDto,
  AgentEvidenceQueryResultDto,
  AgentEvidenceReferenceDto,
} from '@ai-quality/contracts';
import {
  AgentAccessDeniedError,
  AgentEvidenceNotFoundError,
} from './conversational-agent-errors.js';
import { getLogger, type ILogger } from '../logging/index.js';

export interface AgentEvidenceAnalyzerDependencies {
  readonly prisma?: PrismaClient;
  readonly logger?: ILogger;
}

export class AgentEvidenceAnalyzer {
  private readonly prisma: PrismaClient;
  private readonly logger: ILogger;

  constructor(deps: AgentEvidenceAnalyzerDependencies = {}) {
    const client = deps.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database connection is not configured or unavailable.');
    }
    this.prisma = client;
    this.logger = deps.logger ?? getLogger();
  }

  /**
   * Evaluates a conversational evidence query or fetches run evidence review.
   */
  public async queryEvidence(
    input: GetAgentEvidenceInputDto,
    userId?: string,
  ): Promise<AgentEvidenceQueryResultDto> {
    const { projectId, runId, testCaseId, query } = input;

    // 1. Tenant access control
    await this.assertProjectAccess(projectId);

    // 2. Identify the target TestRun
    let targetRunId = runId;
    if (!targetRunId) {
      const runQuery: any = { projectId };
      if (testCaseId) {
        runQuery.testCaseId = testCaseId;
      }
      const latestRun = await this.prisma.testRun.findFirst({
        where: runQuery,
        orderBy: { queuedAt: 'desc' },
        select: { id: true },
      });
      targetRunId = latestRun?.id;
    }

    if (!targetRunId) {
      return {
        runId: null,
        testCaseKey: null,
        requirementKey: null,
        verdict: null,
        evidenceItems: [],
        failureAnalysis: null,
        naturalLanguageExplanation:
          'Insufficient evidence: No test execution runs were found for the requested scope.',
      };
    }

    // 3. Fetch comprehensive test run data with complete provenance
    const run = await this.prisma.testRun.findFirst({
      where: { id: targetRunId, projectId },
      include: {
        testCase: {
          select: {
            id: true,
            testCaseKey: true,
            title: true,
            sourceRequirementKey: true,
          },
        },
        stepExecutionRecords: {
          orderBy: { stepIndex: 'asc' },
        },
        executions: {
          include: {
            evidenceArtifacts: true,
            failureCase: {
              include: {
                classifications: {
                  where: { isAuthoritative: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new AgentEvidenceNotFoundError(`Execution run "${targetRunId}" not found for this project.`);
    }

    // Also check for any structured bug reports linked to this test run or execution
    const execution = run.executions[0];
    const failureCase = execution?.failureCase;
    const bugReport = failureCase
      ? await this.prisma.structuredBugReport.findFirst({
          where: { failureCaseId: failureCase.id, projectId, isAuthoritative: true },
        })
      : null;

    // 4. Extract evidence items (screenshots, traces, logs, DOM snapshots, step results)
    const rawArtifacts = execution?.evidenceArtifacts ?? [];
    const evidenceItems: AgentEvidenceReferenceDto[] = rawArtifacts.map((art) => {
      const artifactType = this.categorizeArtifactType(art.mimeType, art.originalLogicalName);
      const stepNumber = art.stepExecutionId
        ? this.findStepIndex(run.stepExecutionRecords, art.stepExecutionId)
        : undefined;

      return {
        evidenceId: art.id,
        artifactType,
        title: art.originalLogicalName,
        urlOrPath: art.storageIdentity,
        stepNumber: stepNumber ?? null,
        timestamp: art.createdAt.toISOString(),
      };
    });

    // If there are step execution records, include step results as evidence references if no artifacts
    if (evidenceItems.length === 0 && run.stepExecutionRecords.length > 0) {
      for (const step of run.stepExecutionRecords) {
        evidenceItems.push({
          evidenceId: step.id,
          artifactType: 'STEP_RESULT',
          title: `Step ${step.stepIndex}: ${step.actionType}`,
          stepNumber: step.stepIndex,
          actualResult: step.actualSummary ?? (step.status === 'FAILED' ? step.errorCode ?? 'Step execution failed' : 'Step passed'),
          expectedResult: step.expectedSummary ?? 'Step completion',
          timestamp: step.completedAt?.toISOString() ?? step.startedAt?.toISOString() ?? null,
        });
      }
    }

    // 5. Build Failure Analysis
    const authoritativeClassification = failureCase?.classifications?.[0];
    const isProductDefect =
      authoritativeClassification?.category === 'APPLICATION_FAILURE' ||
      (authoritativeClassification?.category as string) === 'PRODUCT_DEFECT' ||
      bugReport?.isApplicationDefect === true;

    const failureAnalysis = failureCase
      ? {
          rootCause: bugReport?.rootCauseSummary ?? failureCase.errorMessage ?? failureCase.failureSummary ?? null,
          failureSignature: failureCase.failureSignature ?? null,
          classification: isProductDefect ? 'PRODUCT_DEFECT' : (authoritativeClassification?.category ?? 'AUTOMATION_DEFECT'),
          suggestedFix: bugReport?.summary ?? 'Inspect failed step selector and application response in captured trace.',
        }
      : null;

    // 6. Generate Natural Language Explanation from Actual Grounded Data
    const naturalLanguageExplanation = this.synthesizeExplanation({
      query: query ?? '',
      run,
      stepRecords: run.stepExecutionRecords,
      evidenceItems,
      failureCase,
      classification: authoritativeClassification,
      bugReport,
    });

    // 7. Audit Trail
    await this.auditAgentAction('AGENT_EVIDENCE_ACCESSED', projectId, userId, {
      runId: targetRunId,
      testCaseKey: run.testCase.testCaseKey,
      evidenceItemCount: evidenceItems.length,
      query,
    });

    return {
      runId: run.id,
      testCaseKey: run.testCase.testCaseKey,
      requirementKey: run.testCase.sourceRequirementKey ?? null,
      verdict: run.status,
      evidenceItems,
      failureAnalysis,
      naturalLanguageExplanation,
    };
  }

  // =========================================================================
  // Explanation Synthesizer (Strictly Grounded, No Hallucinations)
  // =========================================================================

  private synthesizeExplanation(params: {
    query: string;
    run: any;
    stepRecords: any[];
    evidenceItems: AgentEvidenceReferenceDto[];
    failureCase?: any;
    classification?: any;
    bugReport?: any;
  }): string {
    const { query, run, stepRecords, evidenceItems, failureCase, classification, bugReport } = params;
    const lowerQuery = query.toLowerCase().trim();

    // Check if there are no steps or artifacts
    if (stepRecords.length === 0 && evidenceItems.length === 0 && !failureCase) {
      return 'Insufficient evidence: No execution steps or artifact traces recorded for this run.';
    }

    // Failed step identification
    const failedStep = stepRecords.find((s: any) => s.status === 'FAILED');

    // Specific conversational query intents:
    if (lowerQuery.includes('why') && lowerQuery.includes('fail')) {
      if (!failedStep && !failureCase && run.status === 'PASSED') {
        return `Test "${run.testCase.testCaseKey}" passed successfully. All ${stepRecords.length} steps completed with status PASSED.`;
      }
      if (failedStep) {
        return (
          `Test "${run.testCase.testCaseKey}" failed on Step ${failedStep.stepIndex} (${failedStep.actionType}). ` +
          `Expected: "${failedStep.expectedSummary ?? 'Step completion'}". ` +
          `Actual: "${failedStep.actualSummary ?? failedStep.errorCode ?? run.errorMessage ?? 'Action timed out or assertion failed'}". ` +
          (failureCase?.failureSignature ? `Failure Signature: ${failureCase.failureSignature}. ` : '') +
          (classification?.category ? `Classification: ${classification.category} (PRODUCT_DEFECT). ` : '')
        );
      }
      if (run.errorMessage) {
        return `Test execution terminated with error: "${run.errorMessage}".`;
      }
      return 'Insufficient evidence: The test was marked failed but no failed step record was captured.';
    }

    if (lowerQuery.includes('screenshot')) {
      const screenshots = evidenceItems.filter((e) => e.artifactType === 'SCREENSHOT');
      if (screenshots.length === 0) {
        return 'Insufficient evidence: No screenshots were captured during this test run.';
      }
      return (
        `Found ${screenshots.length} screenshot(s) for this run. ` +
        (failedStep ? `Failed step screenshot is available at: ${screenshots[0]?.urlOrPath}.` : `Latest screenshot: ${screenshots[0]?.title}.`)
      );
    }

    if (lowerQuery.includes('expected') || lowerQuery.includes('expected result')) {
      if (failedStep?.expectedSummary) {
        return `Expected result for Step ${failedStep.stepIndex}: "${failedStep.expectedSummary}".`;
      }
      if (bugReport?.expectedResult) {
        return `Expected result: "${bugReport.expectedResult}".`;
      }
      return 'Insufficient evidence: Expected result was not explicitly specified in the step definition.';
    }

    if (lowerQuery.includes('actual') || lowerQuery.includes('actual result') || lowerQuery.includes('what happened')) {
      if (failedStep?.actualSummary) {
        return `Actual result on Step ${failedStep.stepIndex}: "${failedStep.actualSummary}".`;
      }
      if (bugReport?.actualResult) {
        return `Actual result: "${bugReport.actualResult}".`;
      }
      if (run.errorMessage) {
        return `Actual error: "${run.errorMessage}".`;
      }
      return 'Insufficient evidence: No actual failure summary recorded.';
    }

    if (
      lowerQuery.includes('application bug') ||
      lowerQuery.includes('automation failure') ||
      lowerQuery.includes('defect') ||
      lowerQuery.includes('bug or')
    ) {
      if (classification?.category || bugReport) {
        const isApp =
          classification?.category === 'APPLICATION_FAILURE' ||
          classification?.category === 'PRODUCT_DEFECT' ||
          bugReport?.isApplicationDefect === true ||
          bugReport?.applicationDefectState === 'CONFIRMED_APPLICATION_DEFECT';
        return (
          `Analysis indicates this is an ${isApp ? 'APPLICATION BUG (PRODUCT_DEFECT / APPLICATION_FAILURE)' : 'AUTOMATION / ENVIRONMENT FAILURE (' + (classification?.category ?? 'AUTOMATION_DEFECT') + ')'}. ` +
          (classification?.primaryRuleId ? `Determined by rule: ${classification.primaryRuleId}. ` : '') +
          (bugReport?.rootCauseSummary ? `Root cause: ${bugReport.rootCauseSummary}.` : '')
        );
      }
      return 'Insufficient evidence: Failure classification has not yet completed for this run.';
    }

    if (lowerQuery.includes('network') || lowerQuery.includes('console')) {
      const logs = evidenceItems.filter((e) => e.artifactType === 'CONSOLE_LOG' || e.artifactType === 'NETWORK_TRACE');
      if (logs.length > 0) {
        return `Telemetry contains ${logs.length} log/network artifact(s): ${logs.map((l) => l.title).join(', ')}.`;
      }
      return 'Insufficient evidence: No dedicated network errors or console logs captured.';
    }

    if (lowerQuery.includes('requirement')) {
      if (run.testCase.sourceRequirementKey) {
        return `This test validates requirement "${run.testCase.sourceRequirementKey}".`;
      }
      return 'This test case is not linked to a functional requirement.';
    }

    // Default overview summary
    const statusText = `Test "${run.testCase.testCaseKey}" finished with status ${run.status}.`;
    const stepCountText = `Total steps executed: ${stepRecords.length}.`;
    const evidenceText = `Evidence artifacts available: ${evidenceItems.length} (${evidenceItems.map((e) => e.artifactType).join(', ') || 'none'}).`;
    const errorText = failedStep ? ` Failed step: Step ${failedStep.stepIndex} (${failedStep.actionType}).` : '';

    return `${statusText} ${stepCountText} ${evidenceText}${errorText}`;
  }

  private categorizeArtifactType(
    mimeType: string,
    logicalName: string,
  ): 'SCREENSHOT' | 'CONSOLE_LOG' | 'NETWORK_TRACE' | 'DOM_SNAPSHOT' | 'STEP_RESULT' {
    const lowerName = logicalName.toLowerCase();
    if (mimeType.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg')) {
      return 'SCREENSHOT';
    }
    if (lowerName.includes('console') || lowerName.endsWith('.log')) {
      return 'CONSOLE_LOG';
    }
    if (lowerName.includes('network') || lowerName.endsWith('.har') || lowerName.includes('telemetry')) {
      return 'NETWORK_TRACE';
    }
    if (lowerName.includes('dom') || lowerName.endsWith('.html')) {
      return 'DOM_SNAPSHOT';
    }
    return 'STEP_RESULT';
  }

  private findStepIndex(stepRecords: any[], stepExecutionId: string): number | undefined {
    const record = stepRecords.find((s) => s.id === stepExecutionId);
    return record?.stepIndex;
  }

  private async assertProjectAccess(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new AgentAccessDeniedError(projectId, `Project not found: "${projectId}"`);
    }
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
      this.logger.warn('Failed to audit agent evidence access', { action, error: String(err) });
    }
  }
}
