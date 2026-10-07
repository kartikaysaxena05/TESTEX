/**
 * @file packages/core/src/qa-report/qa-report-snapshot-assembler.ts
 * Assembles authoritative domain snapshots across V1–V7 submodules.
 * Enforces strict separation between logical test counts and execution attempt retries,
 * computes factual requirement-to-test traceability, and aggregates failure domains.
 */

import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import {
  type IQaReportSnapshotAssembler,
  type QaReportSnapshot,
  type QaReportRequirementSummaryDto,
  type QaReportTestExecutionSummaryDto,
  type QaReportFailureDomainSummaryDto,
  type QaReportDefectSummaryDto,
  type QaReportReverificationSummaryDto,
  type QaReportRegressionSummaryDto,
  type QaReportFlakinessSummaryDto,
  type QaReportHealthSummaryDto,
  type ReleaseBlockerItemDto,
  type ResidualRiskItemDto,
  type KnownLimitationItemDto,
  type TraceabilityMatrixItemDto,
  type EvidenceReferenceItemDto,
} from './qa-report-types.js';

export class QaReportSnapshotAssembler implements IQaReportSnapshotAssembler {
  private readonly prisma: PrismaClient;

  constructor(options?: { readonly prisma?: PrismaClient }) {
    const client = options?.prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('Database client unavailable for QaReportSnapshotAssembler');
    }
    this.prisma = client;
  }

  public async assembleSnapshot(params: {
    readonly projectId: string;
    readonly environmentId?: string;
  }): Promise<QaReportSnapshot> {
    const { projectId, environmentId } = params;
    const snapshotTime = new Date();

    // 1. Fetch requirements and traces
    const requirements = await this.prisma.requirement.findMany({
      where: { projectId },
      orderBy: { requirementKey: 'asc' },
    });

    const traces = await this.prisma.requirementTestTrace.findMany({
      where: {
        requirement: { projectId },
      },
      include: {
        requirement: true,
        testCase: true,
      },
    });

    // 2. Fetch all test case executions for this project
    const executions = await this.prisma.testCaseExecution.findMany({
      where: {
        projectId,
        ...(environmentId ? { environmentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Group executions by distinct testCaseId to find latest status per logical test
    const latestExecutionByTestCase = new Map<string, (typeof executions)[number]>();
    for (const exec of executions) {
      if (!latestExecutionByTestCase.has(exec.testCaseId)) {
        latestExecutionByTestCase.set(exec.testCaseId, exec);
      }
    }

    // Also get all distinct test cases in project if executions don't cover all
    const allTestCases = await this.prisma.testCase.findMany({
      where: { projectId },
    });

    // Build distinct logical test metrics
    const totalDistinctTests = allTestCases.length > 0 ? allTestCases.length : latestExecutionByTestCase.size;
    let passedCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    let automationErrorCount = 0;
    let cancelledCount = 0;

    for (const exec of latestExecutionByTestCase.values()) {
      switch (exec.status) {
        case 'PASSED':
          passedCount++;
          break;
        case 'FAILED':
          failedCount++;
          break;
        case 'BLOCKED':
          blockedCount++;
          break;
        case 'AUTOMATION_ERROR':
          automationErrorCount++;
          break;
        case 'CANCELLED':
          cancelledCount++;
          break;
        default:
          break;
      }
    }

    const totalExecutionAttempts = executions.length;
    let retryCount = 0;
    let passedAfterRetryCount = 0;
    const flakyTestCaseIds = new Set<string>();

    for (const exec of executions) {
      if (exec.attempt > 1) {
        retryCount++;
      }
      if (exec.passedAfterRetry) {
        passedAfterRetryCount++;
        flakyTestCaseIds.add(exec.testCaseId);
      }
    }

    const passPercentage =
      totalDistinctTests > 0
        ? Math.round((passedCount / totalDistinctTests) * 1000) / 10
        : 0;

    const testExecutionSummary: QaReportTestExecutionSummaryDto = {
      totalDistinctTests,
      totalExecutionAttempts,
      passedCount,
      failedCount,
      blockedCount,
      automationErrorCount,
      cancelledCount,
      passPercentage,
      retryCount,
      passedAfterRetryCount,
    };

    // 4. Build Requirement Summary & Traceability Matrix
    const tracesByReqId = new Map<string, typeof traces>();
    for (const trace of traces) {
      const existing = tracesByReqId.get(trace.requirementId) ?? [];
      existing.push(trace);
      tracesByReqId.set(trace.requirementId, existing);
    }

    let testableRequirements = 0;
    let coveredRequirements = 0;
    let verifiedRequirements = 0;
    let failingRequirements = 0;
    let blockedRequirements = 0;
    const traceabilityMatrix: TraceabilityMatrixItemDto[] = [];

    for (const req of requirements) {
      const isTestable = req.status !== 'ARCHIVED';
      if (isTestable) {
        testableRequirements++;
      }

      const reqTraces = tracesByReqId.get(req.id) ?? [];
      const hasTests = reqTraces.length > 0;
      if (hasTests && isTestable) {
        coveredRequirements++;
      }

      const failingTests: string[] = [];
      let allPassed = hasTests;
      let hasBlocked = false;

      for (const t of reqTraces) {
        const latestExec = latestExecutionByTestCase.get(t.testCaseId);
        if (!latestExec || latestExec.status !== 'PASSED') {
          allPassed = false;
        }
        if (latestExec && (latestExec.status === 'FAILED' || latestExec.status === 'AUTOMATION_ERROR')) {
          failingTests.push(t.testCase.title ?? t.testCaseId);
        }
        if (latestExec && latestExec.status === 'BLOCKED') {
          hasBlocked = true;
        }
      }

      if (hasTests && allPassed && isTestable) {
        verifiedRequirements++;
      }
      if (failingTests.length > 0 && isTestable) {
        failingRequirements++;
      }
      if (hasBlocked && isTestable) {
        blockedRequirements++;
      }

      traceabilityMatrix.push({
        requirementId: req.id,
        requirementKey: req.requirementKey,
        title: req.title,
        priority: req.priority,
        status: req.status,
        associatedTestCount: reqTraces.length,
        verified: hasTests && allPassed,
        failingTests,
      });
    }

    const uncoveredRequirements = Math.max(0, testableRequirements - coveredRequirements);
    const coveragePercentage =
      testableRequirements > 0
        ? Math.round((coveredRequirements / testableRequirements) * 1000) / 10
        : 0;
    const verifiedPercentage =
      testableRequirements > 0
        ? Math.round((verifiedRequirements / testableRequirements) * 1000) / 10
        : 0;

    const requirementSummary: QaReportRequirementSummaryDto = {
      total: requirements.length,
      testable: testableRequirements,
      covered: coveredRequirements,
      verified: verifiedRequirements,
      uncovered: uncoveredRequirements,
      failing: failingRequirements,
      blocked: blockedRequirements,
      coveragePercentage,
      verifiedPercentage,
    };

    // 5. Failure Domains
    const domainSeparations = await this.prisma.failureDomainSeparation.findMany({
      where: { projectId, isAuthoritative: true },
    });

    let appDefects = 0;
    let autoFailures = 0;
    let dataFailures = 0;
    let envFailures = 0;
    let blkFailures = 0;
    let incFailures = 0;
    let unkFailures = 0;

    for (const sep of domainSeparations) {
      switch (sep.domain) {
        case 'APPLICATION_DEFECT_CANDIDATE':
          appDefects++;
          break;
        case 'AUTOMATION_FAILURE':
          autoFailures++;
          break;
        case 'TEST_DATA_FAILURE':
          dataFailures++;
          break;
        case 'ENVIRONMENT_FAILURE':
          envFailures++;
          break;
        case 'BLOCKED':
          blkFailures++;
          break;
        case 'INCONCLUSIVE':
          incFailures++;
          break;
        case 'UNKNOWN':
        default:
          unkFailures++;
          break;
      }
    }

    const failureDomainSummary: QaReportFailureDomainSummaryDto = {
      totalFailures: domainSeparations.length,
      applicationDefects: appDefects,
      automationFailures: autoFailures,
      testDataFailures: dataFailures,
      environmentFailures: envFailures,
      blockedFailures: blkFailures,
      inconclusiveFailures: incFailures,
      unknownFailures: unkFailures,
    };

    // 6. Structured Bug Reports & Workflow States
    const bugReports = await this.prisma.structuredBugReport.findMany({
      where: { projectId, isAuthoritative: true },
    });

    const workflowStates = await this.prisma.bugWorkflowState.findMany({
      where: { projectId },
    });

    const workflowByFailureCase = new Map(workflowStates.map(w => [w.failureCaseId, w]));

    let openCritical = 0;
    let openHigh = 0;
    let openMedium = 0;
    let openLow = 0;
    let resolvedOrClosed = 0;
    let verifiedFixed = 0;
    let reverificationPending = 0;
    let reverificationFailed = 0;

    for (const bug of bugReports) {
      const wf = workflowByFailureCase.get(bug.failureCaseId);
      const isResolved = wf?.currentStatus === 'RESOLVED' || wf?.currentStatus === 'CLOSED';

      if (isResolved) {
        resolvedOrClosed++;
      } else {
        const sev = (bug.severity ?? 'MEDIUM').toUpperCase();
        if (sev === 'CRITICAL') openCritical++;
        else if (sev === 'HIGH') openHigh++;
        else if (sev === 'LOW') openLow++;
        else openMedium++;
      }

      if (wf) {
        if (wf.verificationStatus === 'VERIFIED_FIXED') verifiedFixed++;
        else if (wf.verificationStatus === 'VERIFICATION_PENDING') reverificationPending++;
        else if (wf.verificationStatus === 'REVERIFICATION_FAILED') reverificationFailed++;
      }
    }

    const defectSummary: QaReportDefectSummaryDto = {
      totalDefects: bugReports.length,
      openCritical,
      openHigh,
      openMedium,
      openLow,
      resolvedOrClosed,
      verifiedFixed,
      reverificationPending,
      reverificationFailed,
    };

    // 7. Defect Reverifications
    const reverifications = await this.prisma.defectReverification.findMany({
      where: { projectId, isAuthoritative: true },
    });

    let reverifFixed = 0;
    let reverifStillFailing = 0;
    let reverifDifferentFailure = 0;
    let reverifBlocked = 0;
    let reverifInconclusive = 0;

    for (const rev of reverifications) {
      switch (rev.latestOutcome) {
        case 'VERIFIED_FIXED':
          reverifFixed++;
          break;
        case 'STILL_FAILING':
          reverifStillFailing++;
          break;
        case 'DIFFERENT_FAILURE':
          reverifDifferentFailure++;
          break;
        case 'BLOCKED':
          reverifBlocked++;
          break;
        case 'INCONCLUSIVE':
        case 'CANCELLED':
        case 'EXECUTION_ERROR':
        default:
          reverifInconclusive++;
          break;
      }
    }

    const reverificationSummary: QaReportReverificationSummaryDto = {
      totalReverifications: reverifications.length,
      verifiedFixedCount: reverifFixed,
      stillFailingCount: reverifStillFailing,
      differentFailureCount: reverifDifferentFailure,
      blockedCount: reverifBlocked,
      inconclusiveCount: reverifInconclusive,
    };

    // 8. Regression Summary
    const retestPlans = await this.prisma.retestPlan.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    let totalRegressionTests = 0;
    let passedRegressionTests = 0;
    let failedRegressionTests = 0;
    let untestedRegressionTests = 0;
    let allMandatoryRegressionsPassed = true;

    for (const plan of retestPlans) {
      const tests = Array.isArray(plan.selectedTestsJson)
        ? (plan.selectedTestsJson as Array<{ testCaseId: string; priority?: string }>)
        : [];
      totalRegressionTests += tests.length;

      for (const t of tests) {
        const latest = latestExecutionByTestCase.get(t.testCaseId);
        if (latest?.status === 'PASSED') {
          passedRegressionTests++;
        } else if (latest?.status === 'FAILED' || latest?.status === 'AUTOMATION_ERROR') {
          failedRegressionTests++;
          allMandatoryRegressionsPassed = false;
        } else {
          untestedRegressionTests++;
          allMandatoryRegressionsPassed = false;
        }
      }
    }

    const regressionSummary: QaReportRegressionSummaryDto = {
      totalRetestPlans: retestPlans.length,
      totalRegressionTests,
      passedRegressionTests,
      failedRegressionTests,
      untestedRegressionTests,
      allMandatoryRegressionsPassed,
    };

    // 9. Flakiness Summary
    const flakinessRate =
      totalExecutionAttempts > 0
        ? Math.round((passedAfterRetryCount / totalExecutionAttempts) * 1000) / 10
        : 0;

    const flakinessSummary: QaReportFlakinessSummaryDto = {
      flakyTestsDetected: flakyTestCaseIds.size,
      flakyExecutionAttempts: passedAfterRetryCount,
      flakinessRate,
    };

    // 10. Health Assessment
    const envIssues: string[] = [];
    let envStatus: QaReportHealthSummaryDto['status'] = 'HEALTHY';

    if (environmentId) {
      const env = await this.prisma.projectEnvironment.findUnique({
        where: { id: environmentId },
      });
      if (env?.isProduction && env.productionSafetyPolicy === 'PROHIBITED') {
        envIssues.push('Target environment is production but execution safety policy is PROHIBITED.');
        envStatus = 'DEGRADED';
      }
    }

    if (envFailures > 0) {
      envIssues.push(`${envFailures} failure(s) attributed to environment instability.`);
      envStatus = envFailures > 2 ? 'UNHEALTHY' : 'DEGRADED';
    }

    const environmentHealth: QaReportHealthSummaryDto = {
      status: envStatus,
      issues: envIssues,
      details: { environmentFailures: envFailures },
    };

    const autoIssues: string[] = [];
    let autoStatus: QaReportHealthSummaryDto['status'] = 'HEALTHY';
    if (autoFailures > 0) {
      autoIssues.push(`${autoFailures} failure(s) classified as automation harness or locator issues.`);
      autoStatus = autoFailures > 3 ? 'DEGRADED' : 'HEALTHY';
    }

    const automationHealth: QaReportHealthSummaryDto = {
      status: autoStatus,
      issues: autoIssues,
      details: { automationFailures: autoFailures },
    };

    const dataIssues: string[] = [];
    let dataStatus: QaReportHealthSummaryDto['status'] = 'HEALTHY';
    if (dataFailures > 0) {
      dataIssues.push(`${dataFailures} failure(s) caused by missing or invalid test data fixtures.`);
      dataStatus = dataFailures > 2 ? 'DEGRADED' : 'HEALTHY';
    }

    const testDataHealth: QaReportHealthSummaryDto = {
      status: dataStatus,
      issues: dataIssues,
      details: { testDataFailures: dataFailures },
    };

    // 11. Security findings & evidence references
    const securityFindings: unknown[] = [];
    const evidenceReferences: EvidenceReferenceItemDto[] = [];

    // Collect evidence references from recent test executions
    for (const exec of executions.slice(0, 20)) {
      if (exec.status === 'FAILED' || exec.status === 'AUTOMATION_ERROR') {
        evidenceReferences.push({
          type: 'TEST_EXECUTION_FAILURE',
          id: exec.id,
          title: `Execution Failure: Test Run ${exec.testRunId}`,
          details: {
            testCaseId: exec.testCaseId,
            attempt: exec.attempt,
            errorMessage: exec.errorMessage ? SecretRedactor.redactText(exec.errorMessage) : undefined,
          },
        });
      }
    }

    const releaseBlockers: ReleaseBlockerItemDto[] = [];
    const residualRisks: ResidualRiskItemDto[] = [];
    const knownLimitations: KnownLimitationItemDto[] = [];

    return {
      requirementSummary,
      testExecutionSummary,
      failureDomainSummary,
      defectSummary,
      reverificationSummary,
      regressionSummary,
      flakinessSummary,
      automationHealth,
      environmentHealth,
      testDataHealth,
      securityFindings,
      releaseBlockers,
      residualRisks,
      knownLimitations,
      traceabilityMatrix,
      evidenceReferences: SecretRedactor.redactObject(evidenceReferences),
      snapshotTime,
    };
  }
}
