/**
 * @file packages/core/src/reverification/reverification-eligibility-engine.ts
 * Evaluates the 11 factual criteria to determine whether a defect is eligible for reverification.
 */

import type { PrismaClient, ProjectEnvironment } from '@prisma/client';
import { ReverificationSafetyChecker } from './reverification-safety-checker.js';
import type { HistoricalProvenanceResult } from './reverification-types.js';
import type { ReverificationEligibilityDto } from './reverification-types.js';

export interface ReverificationEligibilityEvaluationInput {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly historicalProvenance: HistoricalProvenanceResult;
  readonly targetEnvironment: ProjectEnvironment;
}

export interface ReverificationEligibilityEvaluationResult {
  readonly eligibility: ReverificationEligibilityDto;
  readonly reasons: readonly string[];
  readonly targetEnvironmentId: string;
  readonly originalTestCaseVersionNumber: number;
  readonly selectedTestCaseVersionNumber: number;
  readonly safetyStatus: string;
  readonly isProductionBlocked: boolean;
  readonly details: Record<string, unknown>;
}

export class ReverificationEligibilityEngine {
  private readonly safetyChecker: ReverificationSafetyChecker;

  constructor(private readonly prisma: PrismaClient) {
    this.safetyChecker = new ReverificationSafetyChecker();
  }

  /**
   * Evaluates factual criteria for reverification eligibility without guessing or faking.
   */
  public async evaluateEligibility(
    input: ReverificationEligibilityEvaluationInput,
  ): Promise<ReverificationEligibilityEvaluationResult> {
    const reasons: string[] = [];
    let isBlocked = false;
    let isNotEligible = false;

    const { projectId, failureCaseId, historicalProvenance, targetEnvironment } = input;

    // 1. Verify project exists and is active
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      isBlocked = true;
      reasons.push(`Project '${projectId}' was not found.`);
    } else if (project.status === 'ARCHIVED') {
      isBlocked = true;
      reasons.push('Project is archived; reverification cannot proceed.');
    }

    // 2. Verify failure case exists and has valid execution linkage
    if (!historicalProvenance.failureCaseId) {
      isNotEligible = true;
      reasons.push('Original failure case record does not exist.');
    }

    if (!historicalProvenance.originalExecutionId) {
      isNotEligible = true;
      reasons.push('Original test case execution record is missing.');
    }

    // 3. Verify original test case exists
    if (!historicalProvenance.originalTestCaseId) {
      isNotEligible = true;
      reasons.push('Original test case reference is missing.');
    }

    // 4. Verify historical test version and steps
    if (historicalProvenance.originalSteps.length === 0) {
      isBlocked = true;
      reasons.push(
        `Historical test version ${historicalProvenance.originalTestCaseVersionNumber} has no executable steps recorded.`,
      );
    }

    // 5. Verify target environment exists and is enabled
    if (!targetEnvironment) {
      isBlocked = true;
      reasons.push('Target environment does not exist.');
    } else if (!targetEnvironment.isEnabled) {
      isBlocked = true;
      reasons.push(`Target environment '${targetEnvironment.name}' is currently disabled.`);
    }

    // 6. Verify defect workflow state permits reverification
    const workflowState = await this.prisma.bugWorkflowState.findUnique({
      where: { failureCaseId },
    });

    if (workflowState) {
      if (workflowState.currentStatus === 'WONT_FIX') {
        isNotEligible = true;
        reasons.push('Defect is marked as WONT_FIX and cannot be reverified.');
      } else if (workflowState.currentStatus === 'DUPLICATE') {
        isNotEligible = true;
        reasons.push(
          'Defect is marked as DUPLICATE; reverification should target the canonical defect.',
        );
      }
    }

    // 7. Verify bug report has not been superseded
    if (historicalProvenance.bugReportId) {
      const bugReport = await this.prisma.structuredBugReport.findUnique({
        where: { id: historicalProvenance.bugReportId },
        select: { id: true, isAuthoritative: true, supersededById: true },
      });

      if (bugReport && (!bugReport.isAuthoritative || bugReport.supersededById)) {
        isNotEligible = true;
        reasons.push(
          `Structured bug report has been superseded by revision ${bugReport.supersededById || 'newer'}.`,
        );
      }
    }

    // 8. Evaluate target environment safety
    const safetyResult = this.safetyChecker.evaluateSafety(
      targetEnvironment,
      historicalProvenance.originalSteps,
    );

    if (!safetyResult.isSafe) {
      isBlocked = true;
      reasons.push(
        safetyResult.safetyReason || 'Target environment violates production safety policy.',
      );
    }

    // 9. Check for concurrent executing runs
    const executingReverification = await this.prisma.defectReverification.findFirst({
      where: {
        failureCaseId,
        isAuthoritative: true,
        status: { in: ['EXECUTING', 'PENDING_EXECUTION'] },
      },
    });

    if (executingReverification) {
      isBlocked = true;
      reasons.push(
        `A reverification request (${executingReverification.id}) is already currently in progress for this defect.`,
      );
    }

    // Determine final eligibility status
    let eligibility: ReverificationEligibilityDto = 'ELIGIBLE';
    if (isBlocked) {
      eligibility = 'BLOCKED';
    } else if (isNotEligible) {
      eligibility = 'NOT_ELIGIBLE';
    } else {
      reasons.push('All 11 factual eligibility criteria satisfied.');
    }

    return {
      eligibility,
      reasons,
      targetEnvironmentId: targetEnvironment?.id ?? '',
      originalTestCaseVersionNumber: historicalProvenance.originalTestCaseVersionNumber,
      selectedTestCaseVersionNumber: historicalProvenance.originalTestCaseVersionNumber,
      safetyStatus: safetyResult.safetyStatus,
      isProductionBlocked: targetEnvironment?.isProduction && !safetyResult.isSafe,
      details: {
        safetyReason: safetyResult.safetyReason,
        mutatingStepIndices: safetyResult.mutatingStepIndices,
        policy: safetyResult.policy,
      },
    };
  }
}
