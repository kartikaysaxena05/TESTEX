/**
 * @file packages/core/src/ai/categorized-tests/categorized-test-validator.ts
 * Grounding validator, deduplication, and sanity engine for Phase 50 Categorized Test Generation.
 */

import type {
  CategoryAssessmentDto,
  CategorizedTestDesignDto,
  TestCategoryMetricsDto,
  TestDesignCategory,
} from '@ai-quality/contracts';
import type { StructuredCategorizedTestOutput } from './categorized-test-prompt-definition.js';
import {
  CATEGORIZED_TEST_LIMITS,
  type CategorizedTestValidationContext,
} from './categorized-test-types.js';

export interface CategorizedValidationResult {
  readonly sanitizedAssessments: CategoryAssessmentDto[];
  readonly sanitizedTestDesigns: CategorizedTestDesignDto[];
  readonly metrics: TestCategoryMetricsDto;
  readonly warnings: { readonly code: string; readonly message: string }[];
  readonly ungroundedEvidenceCount: number;
  readonly duplicateCount: number;
}

export class CategorizedTestValidator {
  /**
   * Normalizes a text string for similarity/duplicate matching.
   */
  public static normalizeForDeduplication(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validates evidence grounding, deduplicates tests, verifies category applicability, and clamps bounds.
   */
  public static validateAndSanitize(
    rawOutput: StructuredCategorizedTestOutput,
    context: CategorizedTestValidationContext,
  ): CategorizedValidationResult {
    const warnings: { code: string; message: string }[] = [...(rawOutput.warnings ?? [])];
    let ungroundedEvidenceCount = 0;
    let duplicateCount = 0;

    const seenSignatures = new Set<string>();
    const sanitizedDesigns: CategorizedTestDesignDto[] = [];
    const scenarioTestCounts = new Map<string, number>();

    for (const rawTest of rawOutput.testDesigns ?? []) {
      // 1. Evidence Grounding Enforcement
      const validRefs = (rawTest.sourceEvidenceRefs ?? []).filter(ref => {
        if (!context.validEvidenceRefIds.has(ref)) {
          ungroundedEvidenceCount++;
          return false;
        }
        return true;
      });

      // Default to requirementKey if all were stripped or empty
      if (validRefs.length === 0) {
        validRefs.push(context.requirementKey);
      }

      // 2. Deduplication check
      const normTitle = this.normalizeForDeduplication(rawTest.title);
      const normObjective = this.normalizeForDeduplication(rawTest.objective);
      const signature = `${rawTest.category}:${normTitle}:${normObjective}`;

      if (seenSignatures.has(signature)) {
        duplicateCount++;
        continue;
      }
      seenSignatures.add(signature);

      // 3. Scenario limit bounding
      const scenarioKey = rawTest.scenarioKey ?? 'DEFAULT';
      const currentCount = scenarioTestCounts.get(scenarioKey) ?? 0;
      if (currentCount >= CATEGORIZED_TEST_LIMITS.MAX_TESTS_PER_SCENARIO) {
        warnings.push({
          code: 'SCENARIO_TEST_LIMIT_EXCEEDED',
          message: `Max test designs (${CATEGORIZED_TEST_LIMITS.MAX_TESTS_PER_SCENARIO}) reached for scenario "${scenarioKey}". Additional tests were clamped.`,
        });
        continue;
      }
      scenarioTestCounts.set(scenarioKey, currentCount + 1);

      // 4. Overall total limit bounding
      if (sanitizedDesigns.length >= CATEGORIZED_TEST_LIMITS.MAX_TOTAL_TESTS) {
        warnings.push({
          code: 'TOTAL_TEST_LIMIT_EXCEEDED',
          message: `Total test designs limit (${CATEGORIZED_TEST_LIMITS.MAX_TOTAL_TESTS}) reached. Additional tests were truncated.`,
        });
        break;
      }

      sanitizedDesigns.push({
        id: crypto.randomUUID(),
        scenarioKey: rawTest.scenarioKey ?? null,
        requirementId: context.requirementId,
        requirementVersionNumber: 1, // bound in service
        category: rawTest.category,
        title: rawTest.title.slice(0, CATEGORIZED_TEST_LIMITS.MAX_TITLE_LENGTH).trim(),
        objective: rawTest.objective.slice(0, CATEGORIZED_TEST_LIMITS.MAX_OBJECTIVE_LENGTH).trim(),
        rationale: rawTest.rationale.slice(0, CATEGORIZED_TEST_LIMITS.MAX_RATIONALE_LENGTH).trim(),
        boundaryIntent: rawTest.boundaryIntent ?? null,
        validationIntent: rawTest.validationIntent ?? null,
        confidence: rawTest.confidence ?? 'HIGH',
        sourceEvidenceRefs: validRefs,
      });
    }

    if (ungroundedEvidenceCount > 0) {
      warnings.push({
        code: 'UNGROUNDED_EVIDENCE_REF_STRIPPED',
        message: `${ungroundedEvidenceCount} citation(s) to ungrounded or non-existent evidence identifiers were stripped.`,
      });
    }

    if (duplicateCount > 0) {
      warnings.push({
        code: 'DUPLICATE_TEST_DESIGN_REMOVED',
        message: `${duplicateCount} duplicate or near-identical test design(s) were removed.`,
      });
    }

    // 5. Category Assessment Normalization
    const allCategories: readonly TestDesignCategory[] = [
      'POSITIVE',
      'NEGATIVE',
      'BOUNDARY',
      'VALIDATION',
    ];
    const assessmentMap = new Map<TestDesignCategory, CategoryAssessmentDto>();

    for (const rawAssessment of rawOutput.categoryAssessments ?? []) {
      assessmentMap.set(rawAssessment.category, {
        category: rawAssessment.category,
        applicability: rawAssessment.applicability,
        rationale: rawAssessment.rationale,
        testCount: sanitizedDesigns.filter(d => d.category === rawAssessment.category).length,
      });
    }

    // Ensure all 4 categories exist
    const sanitizedAssessments: CategoryAssessmentDto[] = allCategories.map(cat => {
      const existing = assessmentMap.get(cat);
      const catCount = sanitizedDesigns.filter(d => d.category === cat).length;

      if (existing) {
        // If boundary has 0 tests and was marked APPLICABLE, correct to NOT_APPLICABLE
        const applicability =
          cat === 'BOUNDARY' && catCount === 0 && existing.applicability === 'APPLICABLE'
            ? 'NOT_APPLICABLE'
            : existing.applicability;

        return {
          ...existing,
          applicability,
          testCount: catCount,
        };
      }

      return {
        category: cat,
        applicability: catCount > 0 ? 'APPLICABLE' : 'NOT_APPLICABLE',
        rationale:
          catCount > 0
            ? `Generated ${catCount} ${cat} test design(s).`
            : `No ${cat} tests evidenced for this requirement.`,
        testCount: catCount,
      };
    });

    // 6. Metrics Calculation
    const positiveCount = sanitizedDesigns.filter(d => d.category === 'POSITIVE').length;
    const negativeCount = sanitizedDesigns.filter(d => d.category === 'NEGATIVE').length;
    const boundaryCount = sanitizedDesigns.filter(d => d.category === 'BOUNDARY').length;
    const validationCount = sanitizedDesigns.filter(d => d.category === 'VALIDATION').length;

    const notApplicableCategories = sanitizedAssessments
      .filter(a => a.applicability === 'NOT_APPLICABLE' || a.testCount === 0)
      .map(a => a.category);

    const metrics: TestCategoryMetricsDto = {
      totalGenerated: sanitizedDesigns.length,
      positiveCount,
      negativeCount,
      boundaryCount,
      validationCount,
      notApplicableCategories,
    };

    return {
      sanitizedAssessments,
      sanitizedTestDesigns: sanitizedDesigns,
      metrics,
      warnings,
      ungroundedEvidenceCount,
      duplicateCount,
    };
  }
}
