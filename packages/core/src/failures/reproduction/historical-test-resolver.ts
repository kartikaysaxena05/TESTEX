/**
 * @file packages/core/src/failures/reproduction/historical-test-resolver.ts
 * Resolves and verifies exact historical test versions for reproduction attempts (V6 Phase 76).
 */

import type { PrismaClient } from '@prisma/client';
import { type HistoricalTestResolutionResult } from './failure-reproduction-types.js';
import { CrossProjectAccessDeniedError } from '../failure-errors.js';
import { HistoricalTestVersionUnavailableError } from './failure-reproduction-errors.js';

export class HistoricalTestResolver {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resolves the exact historical test version recorded for the failure case.
   * If version was never archived or is missing, throws HistoricalTestVersionUnavailableError.
   * If version exists but has empty steps, returns a truthful non-executable result.
   */
  public async resolveHistoricalTestVersion(
    paramsOrTestCaseId:
      | {
          projectId: string;
          testCaseId: string;
          testCaseVersionNumber: number;
        }
      | string,
    versionNumber?: number,
    projectId?: string,
  ): Promise<HistoricalTestResolutionResult> {
    let targetProjectId = projectId;
    let targetTestCaseId: string;
    let targetVersionNumber: number;

    if (typeof paramsOrTestCaseId === 'object') {
      targetProjectId = paramsOrTestCaseId.projectId;
      targetTestCaseId = paramsOrTestCaseId.testCaseId;
      targetVersionNumber = paramsOrTestCaseId.testCaseVersionNumber;
    } else {
      targetTestCaseId = paramsOrTestCaseId;
      targetVersionNumber = versionNumber!;
    }

    // 1. Try to find specific TestCaseVersion record first
    const versionRecord = await this.prisma.testCaseVersion.findFirst({
      where: {
        testCaseId: targetTestCaseId,
        versionNumber: targetVersionNumber,
      },
    });

    if (versionRecord) {
      if (
        targetProjectId &&
        versionRecord.projectId &&
        versionRecord.projectId !== targetProjectId
      ) {
        throw new CrossProjectAccessDeniedError(
          'TestCaseVersion',
          versionRecord.id,
          targetProjectId,
          versionRecord.projectId,
        );
      }

      const rawSteps = (versionRecord as any).stepsJson ?? (versionRecord as any).steps;
      let resolvedSteps: Array<{
        id: string;
        stepNumber: number;
        action: string;
        expectedResult?: string | null;
      }> = [];

      if (Array.isArray(rawSteps) && rawSteps.length > 0) {
        resolvedSteps = rawSteps.map((s: any, idx: number) => ({
          id: s.id || `step-${idx + 1}`,
          stepNumber: s.stepNumber || idx + 1,
          action: s.action || '',
          expectedResult: s.expectedResult || null,
        }));
      }

      const resolvedTitle = versionRecord.title;
      const requirementId =
        (versionRecord as any).requirementId ?? (versionRecord as any).sourceRequirementId ?? null;
      const requirementVersionNumber =
        (versionRecord as any).requirementVersionNumber ??
        (versionRecord as any).sourceRequirementVersionNumber ??
        null;

      if (resolvedSteps.length === 0) {
        return {
          isExecutable: false,
          blockerReason: `Historical test version ${targetVersionNumber} contains no executable steps.`,
          testCaseId: targetTestCaseId,
          testCaseVersionId: versionRecord.id,
          testCaseVersionNumber: targetVersionNumber,
          requirementId,
          requirementVersionNumber,
          title: resolvedTitle,
          steps: [],
        };
      }

      return {
        isExecutable: true,
        testCaseId: targetTestCaseId,
        testCaseVersionId: versionRecord.id,
        testCaseVersionNumber: targetVersionNumber,
        requirementId,
        requirementVersionNumber,
        title: resolvedTitle,
        steps: resolvedSteps,
      };
    }

    // 2. Fallback to TestCase table if version number matches current active version
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: targetTestCaseId },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        sourceRequirement: true,
      },
    });

    if (!testCase) {
      throw new HistoricalTestVersionUnavailableError(targetTestCaseId, targetVersionNumber);
    }

    if (targetProjectId && testCase.projectId && testCase.projectId !== targetProjectId) {
      throw new CrossProjectAccessDeniedError(
        'TestCase',
        testCase.id,
        targetProjectId,
        testCase.projectId,
      );
    }

    const currentVer = (testCase as any).currentVersionNumber ?? (testCase as any).versionNumber;
    if (currentVer !== targetVersionNumber) {
      throw new HistoricalTestVersionUnavailableError(targetTestCaseId, targetVersionNumber);
    }

    const testCaseSteps = (testCase as any).steps ?? [];
    let resolvedSteps: Array<{
      id: string;
      stepNumber: number;
      action: string;
      expectedResult?: string | null;
    }> = [];

    if (Array.isArray(testCaseSteps) && testCaseSteps.length > 0) {
      resolvedSteps = testCaseSteps.map((s: any, idx: number) => ({
        id: s.id || `step-${idx + 1}`,
        stepNumber: s.stepNumber || idx + 1,
        action: s.action || '',
        expectedResult: s.expectedResult || null,
      }));
    }

    if (resolvedSteps.length === 0) {
      return {
        isExecutable: false,
        blockerReason: `Historical test version ${targetVersionNumber} contains no executable steps.`,
        testCaseId: targetTestCaseId,
        testCaseVersionId: null,
        testCaseVersionNumber: targetVersionNumber,
        requirementId:
          (testCase as any).sourceRequirementId ?? (testCase as any).requirementId ?? null,
        requirementVersionNumber: (testCase as any).sourceRequirementVersionNumber ?? null,
        title: testCase.title,
        steps: [],
      };
    }

    return {
      isExecutable: true,
      testCaseId: targetTestCaseId,
      testCaseVersionId: null,
      testCaseVersionNumber: targetVersionNumber,
      requirementId:
        (testCase as any).sourceRequirementId ?? (testCase as any).requirementId ?? null,
      requirementVersionNumber: (testCase as any).sourceRequirementVersionNumber ?? null,
      title: testCase.title,
      steps: resolvedSteps,
    };
  }
}
