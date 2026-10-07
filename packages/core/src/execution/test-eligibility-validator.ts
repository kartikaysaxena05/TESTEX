/**
 * @file packages/core/src/execution/test-eligibility-validator.ts
 * Enforces V4 governance, approval lifecycle gating, and requirement version staleness checks.
 */

import type { PrismaClient } from '@prisma/client';
import {
  validateTestEligibilityInputSchema,
  type TestEligibilityDto,
  type ValidateTestEligibilityInputDto,
} from '@ai-quality/contracts';
import { ExecutionProjectMismatchError, ExecutionRequestInvalidError } from './execution-errors.js';
import type { ILogger } from '../logging/index.js';

export class TestEligibilityValidator {
  private readonly prisma: PrismaClient;
  private readonly logger?: ILogger;

  constructor(prisma: PrismaClient, logger?: ILogger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Validates whether a test case is eligible for autonomous execution.
   */
  public async validateEligibility(
    input: ValidateTestEligibilityInputDto,
  ): Promise<TestEligibilityDto> {
    const parseResult = validateTestEligibilityInputSchema.safeParse(input);
    if (!parseResult.success) {
      throw new ExecutionRequestInvalidError('Invalid test eligibility validation input', {
        errors: parseResult.error.errors,
      });
    }

    const { projectId, testCaseId } = parseResult.data;

    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: {
        sourceRequirement: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
              select: { versionNumber: true },
            },
          },
        },
        validations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, isStale: true },
        },
      },
    });

    if (!testCase) {
      return {
        testCaseId,
        testCaseKey: 'UNKNOWN',
        title: 'Unknown Test Case',
        status: 'NOT_FOUND',
        isEligible: false,
        reviewStatus: 'DRAFT',
        currentVersionNumber: 1,
        approvedVersionNumber: null,
        isRequirementStale: false,
        sourceRequirementVersionNumber: null,
        currentRequirementVersionNumber: null,
        reasons: ['Test case does not exist in the database.'],
      };
    }

    // Strict multi-tenant project boundary enforcement
    if (testCase.projectId !== projectId) {
      throw new ExecutionProjectMismatchError(testCaseId, projectId, testCase.projectId);
    }

    const currentReqVersion = testCase.sourceRequirement?.versions[0]?.versionNumber ?? 1;
    const isRequirementStale =
      testCase.sourceRequirement !== null &&
      testCase.sourceRequirementVersionNumber !== null &&
      testCase.sourceRequirementVersionNumber !== undefined &&
      testCase.sourceRequirementVersionNumber < currentReqVersion;

    // 1. Check suitability
    if (testCase.executionSuitability === 'MANUAL') {
      return {
        testCaseId: testCase.id,
        testCaseKey: testCase.testCaseKey,
        title: testCase.title,
        status: 'UNSUPPORTED_SUITABILITY',
        isEligible: false,
        reviewStatus: testCase.reviewStatus as any,
        currentVersionNumber: testCase.currentVersionNumber,
        approvedVersionNumber: testCase.approvedVersionNumber,
        isRequirementStale,
        sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
        currentRequirementVersionNumber: currentReqVersion,
        reasons: ['Test case is designated for MANUAL execution only.'],
      };
    }

    // 2. Check review rejection
    if (testCase.reviewStatus === 'REJECTED') {
      return {
        testCaseId: testCase.id,
        testCaseKey: testCase.testCaseKey,
        title: testCase.title,
        status: 'REJECTED',
        isEligible: false,
        reviewStatus: 'REJECTED',
        currentVersionNumber: testCase.currentVersionNumber,
        approvedVersionNumber: testCase.approvedVersionNumber,
        isRequirementStale,
        sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
        currentRequirementVersionNumber: currentReqVersion,
        reasons: [
          `Test case has been REJECTED in review${testCase.latestReviewComment ? `: ${testCase.latestReviewComment}` : '.'}`,
        ],
      };
    }

    // 3. Check approval requirement
    if (testCase.reviewStatus !== 'APPROVED') {
      return {
        testCaseId: testCase.id,
        testCaseKey: testCase.testCaseKey,
        title: testCase.title,
        status: 'NOT_APPROVED',
        isEligible: false,
        reviewStatus: testCase.reviewStatus as any,
        currentVersionNumber: testCase.currentVersionNumber,
        approvedVersionNumber: testCase.approvedVersionNumber,
        isRequirementStale,
        sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
        currentRequirementVersionNumber: currentReqVersion,
        reasons: [
          `Test case is in '${testCase.reviewStatus}' status and has not been approved for execution.`,
        ],
      };
    }

    // 4. Check staleness against source requirement
    if (isRequirementStale) {
      return {
        testCaseId: testCase.id,
        testCaseKey: testCase.testCaseKey,
        title: testCase.title,
        status: 'STALE',
        isEligible: false,
        reviewStatus: 'APPROVED',
        currentVersionNumber: testCase.currentVersionNumber,
        approvedVersionNumber: testCase.approvedVersionNumber,
        isRequirementStale: true,
        sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
        currentRequirementVersionNumber: currentReqVersion,
        reasons: [
          `Test case is STALE: derived from Requirement v${testCase.sourceRequirementVersionNumber}, but Requirement has advanced to v${currentReqVersion}.`,
        ],
      };
    }

    // 5. Eligible
    return {
      testCaseId: testCase.id,
      testCaseKey: testCase.testCaseKey,
      title: testCase.title,
      status: 'ELIGIBLE',
      isEligible: true,
      reviewStatus: 'APPROVED',
      currentVersionNumber: testCase.currentVersionNumber,
      approvedVersionNumber: testCase.approvedVersionNumber,
      isRequirementStale: false,
      sourceRequirementVersionNumber: testCase.sourceRequirementVersionNumber,
      currentRequirementVersionNumber: currentReqVersion,
      reasons: ['Test case is approved, up to date with requirements, and eligible for execution.'],
    };
  }
}
