/**
 * @file packages/core/src/reverification/reverification-provenance-resolver.ts
 * Resolves exact historical test, execution, requirement, and fix provenance for defect reverification.
 */

import type { PrismaClient } from '@prisma/client';
import {
  ReverificationNotFoundError,
  ReverificationCrossProjectForbiddenError,
  ReverificationHistoricalTestUnavailableError,
} from './reverification-errors.js';
import type {
  HistoricalProvenanceResult,
  FixProvenanceResult,
  ReverificationTriggerTypeDto,
} from './reverification-types.js';

export class ReverificationProvenanceResolver {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolves the immutable historical provenance of a failure case.
   * Preserves exact original test case version, requirement version, and execution baseline.
   */
  public async resolveHistoricalProvenance(
    projectId: string,
    failureCaseId: string,
  ): Promise<HistoricalProvenanceResult> {
    const failureCase = await this.prisma.failureCase.findUnique({
      where: { id: failureCaseId },
      include: {
        testCase: true,
        execution: {
          include: {
            testCaseVersion: true,
            stepExecutions: {
              orderBy: { stepIndex: 'asc' },
            },
          },
        },
        structuredBugReports: {
          where: { isAuthoritative: true },
          take: 1,
        },
        jiraIssueLinks: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!failureCase) {
      throw new ReverificationNotFoundError(failureCaseId);
    }

    if (failureCase.projectId !== projectId) {
      throw new ReverificationCrossProjectForbiddenError(
        `Failure case ${failureCaseId} does not belong to project ${projectId}.`,
      );
    }

    const originalVersionNumber = failureCase.testCaseVersionNumber;
    const testCaseId = failureCase.testCaseId;

    // Resolve the exact historical test case version
    const historicalVersionRecord = await this.prisma.testCaseVersion.findFirst({
      where: {
        testCaseId,
        versionNumber: originalVersionNumber,
      },
    });

    let originalSteps: Array<{
      id: string;
      stepNumber: number;
      action: string;
      expectedResult?: string | null;
    }> = [];

    let originalTestCaseVersionId: string | null = null;
    let requirementId: string | null = null;
    let requirementKey: string | null = null;
    const requirementVersionId: string | null = null;
    let requirementVersionNumber: number | null = null;

    if (historicalVersionRecord) {
      if (historicalVersionRecord.projectId !== projectId) {
        throw new ReverificationCrossProjectForbiddenError(
          `TestCaseVersion ${historicalVersionRecord.id} belongs to a different project.`,
        );
      }
      originalTestCaseVersionId = historicalVersionRecord.id;
      requirementId =
        (historicalVersionRecord as any).sourceRequirementId ??
        (historicalVersionRecord as any).requirementId ??
        null;
      requirementKey = (historicalVersionRecord as any).sourceRequirementKey ?? null;
      requirementVersionNumber =
        (historicalVersionRecord as any).sourceRequirementVersionNumber ?? null;

      const rawSteps =
        (historicalVersionRecord as any).stepsJson ?? (historicalVersionRecord as any).steps;
      if (Array.isArray(rawSteps) && rawSteps.length > 0) {
        originalSteps = rawSteps.map((s: any, idx: number) => ({
          id: s.id || `step-${idx + 1}`,
          stepNumber: s.stepNumber || idx + 1,
          action: s.action || '',
          expectedResult: s.expectedResult || null,
        }));
      }
    } else {
      // Check if the current test case version matches originalVersionNumber
      const currentVer =
        (failureCase.testCase as any).currentVersionNumber ??
        (failureCase.testCase as any).versionNumber;

      if (currentVer === originalVersionNumber) {
        requirementId =
          (failureCase.testCase as any).sourceRequirementId ??
          (failureCase.testCase as any).requirementId ??
          null;
        requirementKey = (failureCase.testCase as any).sourceRequirementKey ?? null;
        requirementVersionNumber =
          (failureCase.testCase as any).sourceRequirementVersionNumber ?? null;

        const testCaseSteps = (failureCase.testCase as any).steps ?? [];
        if (Array.isArray(testCaseSteps) && testCaseSteps.length > 0) {
          originalSteps = testCaseSteps.map((s: any, idx: number) => ({
            id: s.id || `step-${idx + 1}`,
            stepNumber: s.stepNumber || idx + 1,
            action: s.action || '',
            expectedResult: s.expectedResult || null,
          }));
        }
      } else {
        // Version is unresolvable -> throw explicit typed error
        throw new ReverificationHistoricalTestUnavailableError(testCaseId, originalVersionNumber);
      }
    }

    const authoritativeBugReport = failureCase.structuredBugReports[0] ?? null;
    const activeJiraLink = failureCase.jiraIssueLinks[0] ?? null;

    if (authoritativeBugReport) {
      if (authoritativeBugReport.requirementId && !requirementId) {
        requirementId = authoritativeBugReport.requirementId;
      }
      if (authoritativeBugReport.requirementKey && !requirementKey) {
        requirementKey = authoritativeBugReport.requirementKey;
      }
      if (authoritativeBugReport.requirementVersionNumber && requirementVersionNumber === null) {
        requirementVersionNumber = authoritativeBugReport.requirementVersionNumber;
      }
    }

    return {
      failureCaseId: failureCase.id,
      failureAnalysisId: failureCase.currentAnalysisRunId,
      bugReportId: authoritativeBugReport?.id ?? null,
      externalIssueLinkId: activeJiraLink?.id ?? null,
      originalTestRunId: failureCase.testRunId,
      originalExecutionId: failureCase.executionId,
      originalTestCaseId: failureCase.testCaseId,
      originalTestCaseVersionId,
      originalTestCaseVersionNumber: originalVersionNumber,
      originalTitle: failureCase.title,
      originalSteps,
      originalEnvironmentId: failureCase.environmentId,
      requirementId,
      requirementKey,
      requirementVersionId,
      requirementVersionNumber,
      failureSignature: failureCase.failureSignature,
      failedStepIndex: failureCase.stepIndex ?? authoritativeBugReport?.failedStepIndex ?? null,
      failedStepAction: authoritativeBugReport?.failedStepAction ?? null,
      expectedResult:
        authoritativeBugReport?.expectedResult ??
        'Expected all test steps to complete successfully.',
      actualResult:
        authoritativeBugReport?.actualResult ??
        failureCase.errorMessage ??
        'Test execution failed with error.',
      errorMessage: failureCase.errorMessage,
    };
  }

  /**
   * Resolves fix / change provenance truthfully without fabrication.
   * If no commit, branch, or manual fix reference is present, source is UNKNOWN.
   */
  public resolveFixProvenance(params: {
    fixReference?: string | null;
    fixProvenance?: Record<string, unknown> | null;
    triggerType?: ReverificationTriggerTypeDto;
    triggerReference?: string | null;
  }): FixProvenanceResult {
    const raw = params.fixProvenance ?? {};
    const commitSha =
      (raw.commitSha as string) ??
      (raw.sha as string) ??
      (params.fixReference?.startsWith('commit:')
        ? params.fixReference.replace('commit:', '')
        : null);

    const branch =
      (raw.branch as string) ??
      (params.fixReference?.startsWith('branch:')
        ? params.fixReference.replace('branch:', '')
        : null);

    const pullRequestUrl =
      (raw.pullRequestUrl as string) ??
      (raw.prUrl as string) ??
      (params.fixReference?.startsWith('pr:') ? params.fixReference.replace('pr:', '') : null);

    const manualReference =
      params.fixReference ?? (typeof raw.reference === 'string' ? raw.reference : null);

    let source: 'JIRA_STATUS_CHANGE' | 'GIT_COMMIT' | 'MANUAL' | 'UNKNOWN' = 'UNKNOWN';

    if (commitSha) {
      source = 'GIT_COMMIT';
    } else if (
      params.triggerType === 'EXTERNAL_ISSUE_FIXED' ||
      params.triggerType === 'EXTERNAL_ISSUE_RESOLVED'
    ) {
      source = 'JIRA_STATUS_CHANGE';
    } else if (manualReference) {
      source = 'MANUAL';
    }

    const isKnown = Boolean(
      commitSha ||
      branch ||
      pullRequestUrl ||
      manualReference ||
      (params.triggerReference && params.triggerReference.trim().length > 0),
    );

    return {
      fixReference: manualReference || commitSha || params.triggerReference || null,
      commitSha: commitSha || null,
      branch: branch || null,
      pullRequestUrl: pullRequestUrl || null,
      source,
      isKnown,
      rawDetails: raw,
    };
  }
}
