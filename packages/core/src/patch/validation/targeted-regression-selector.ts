/**
 * @file packages/core/src/patch/validation/targeted-regression-selector.ts
 * Intelligent, requirement-aware regression selector for candidate patch validation.
 * Selects a high-confidence, bounded set of regression tests using V4 Requirement-to-Test
 * Traceability and candidate file modifications from defect localization.
 */

import type { PrismaClient } from '@prisma/client';
import {
  VALIDATION_BOUNDS,
  type SelectedRegressionTestCase,
  type TargetedTestSelection,
} from './validation-types.js';

export interface SelectRegressionTestsOptions {
  readonly projectId: string;
  readonly targetTestCaseId: string;
  readonly targetFiles?: readonly string[];
  readonly limit?: number;
}

export class TargetedRegressionSelector {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Selects targeted regression tests for a defect patch based on requirements and affected files.
   */
  public async selectRegressionTests(
    options: SelectRegressionTestsOptions,
  ): Promise<TargetedTestSelection> {
    const {
      projectId,
      targetTestCaseId,
      targetFiles = [],
      limit = VALIDATION_BOUNDS.MAX_REGRESSION_TESTS,
    } = options;

    // 1. Identify requirements linked to the target test case via RequirementTestTrace
    const targetTraces = await this.prisma.requirementTestTrace.findMany({
      where: {
        projectId,
        testCaseId: targetTestCaseId,
        status: 'CURRENT',
      },
      select: { requirementId: true },
    });

    const requirementIds = targetTraces.map(t => t.requirementId);

    // 2. Identify candidate regression test cases sharing the same requirements
    let siblingTestCasesFromRequirements: Array<{ testCaseId: string; requirementId: string }> = [];
    if (requirementIds.length > 0) {
      siblingTestCasesFromRequirements = await this.prisma.requirementTestTrace.findMany({
        where: {
          projectId,
          requirementId: { in: requirementIds },
          testCaseId: { not: targetTestCaseId },
          status: 'CURRENT',
        },
        select: { testCaseId: true, requirementId: true },
      });
    }

    const testCaseScoreMap = new Map<string, { score: number; matchReasons: string[] }>();

    // Add points for shared requirements
    for (const sibling of siblingTestCasesFromRequirements) {
      const existing = testCaseScoreMap.get(sibling.testCaseId) ?? { score: 0, matchReasons: [] };
      existing.score += 50;
      if (!existing.matchReasons.includes('Shares requirement with defect')) {
        existing.matchReasons.push('Shares requirement with defect');
      }
      testCaseScoreMap.set(sibling.testCaseId, existing);
    }

    // 3. Query all project test cases to evaluate file matches and fallbacks
    const candidateTestCases = await this.prisma.testCase.findMany({
      where: {
        projectId,
        id: { not: targetTestCaseId },
        status: { not: 'DEPRECATED' },
      },
      select: {
        id: true,
        testCaseKey: true,
        title: true,
        priority: true,
        type: true,
        description: true,
        createdAt: true,
      },
      take: 100,
    });

    for (const tc of candidateTestCases) {
      const existing = testCaseScoreMap.get(tc.id) ?? { score: 0, matchReasons: [] };

      // Check if description or title references target files
      if (targetFiles.length > 0) {
        for (const file of targetFiles) {
          const basename = file.split('/').pop() ?? file;
          if (
            (tc.title && tc.title.includes(basename)) ||
            (tc.description && tc.description.includes(basename))
          ) {
            existing.score += 40;
            existing.matchReasons.push(`References affected file '${basename}'`);
            break;
          }
        }
      }

      // Priority scoring
      if (tc.priority === 'CRITICAL' || tc.priority === 'HIGH') {
        existing.score += 10;
        existing.matchReasons.push(`High priority test (${tc.priority})`);
      } else {
        existing.score += 2;
        existing.matchReasons.push('Baseline project regression coverage');
      }

      testCaseScoreMap.set(tc.id, existing);
    }

    // 4. Map, sort and cap results
    const ranked: SelectedRegressionTestCase[] = candidateTestCases
      .map(tc => {
        const entry = testCaseScoreMap.get(tc.id) ?? {
          score: 0,
          matchReasons: ['General regression'],
        };
        return {
          testCaseId: tc.id,
          testCaseKey: tc.testCaseKey,
          testCaseTitle: tc.title,
          priority: tc.priority,
          type: tc.type,
          matchReason: entry.matchReasons.join('; '),
          score: entry.score,
        };
      })
      .sort((a, b) => b.score - a.score || a.testCaseKey.localeCompare(b.testCaseKey))
      .slice(0, Math.min(limit, VALIDATION_BOUNDS.MAX_REGRESSION_TESTS));

    return {
      targetTestCaseId,
      regressionTestCases: ranked,
    };
  }
}
