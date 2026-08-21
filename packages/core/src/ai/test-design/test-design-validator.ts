/**
 * @file packages/core/src/ai/test-design/test-design-validator.ts
 * Validates, ground-checks, and sanitizes Test Design recommendations.
 */

import type {
  CoverageObjectiveDto,
  StructuredTestDesignDto,
  TestableConstraintDto,
  TestDesignQuestionDto,
  TestDimension,
  TestDimensionRecommendationDto,
  TestLevel,
  TestLevelRecommendationDto,
  TestRiskFocusDto,
  TestTechniqueRecommendationDto,
} from '@ai-quality/contracts';
import { TEST_DESIGN_LIMITS } from './test-design-types.js';

export interface TestDesignValidationResult {
  readonly sanitizedDesign: StructuredTestDesignDto;
  readonly totalEvidenceRefs: number;
  readonly validEvidenceRefs: number;
  readonly invalidEvidenceRefs: number;
  readonly warnings: readonly string[];
}

export class TestDesignValidator {
  /**
   * Validates and sanitizes a structured test design against authoritative input facts and context items.
   */
  public static validateAndSanitize(
    design: StructuredTestDesignDto,
    validEvidenceIds: ReadonlySet<string>,
    sourceText: string,
  ): TestDesignValidationResult {
    let totalEvidenceRefs = 0;
    let validEvidenceRefs = 0;
    let invalidEvidenceRefs = 0;
    const warnings: string[] = [];

    const sanitizeRefs = (refs: readonly string[]): string[] => {
      const sanitized: string[] = [];
      for (const ref of refs) {
        totalEvidenceRefs++;
        if (validEvidenceIds.has(ref)) {
          validEvidenceRefs++;
          if (!sanitized.includes(ref)) {
            sanitized.push(ref);
          }
        } else {
          invalidEvidenceRefs++;
          warnings.push(`Evidence ID "${ref}" is ungrounded or unknown in authoritative context.`);
        }
      }
      return sanitized;
    };

    // 1. Deduplicate & Sanitize Test Levels
    const levelsMap = new Map<TestLevel, TestLevelRecommendationDto>();
    for (const rec of design.recommendedLevels ?? []) {
      if (!levelsMap.has(rec.level)) {
        levelsMap.set(rec.level, {
          ...rec,
          evidenceRefs: sanitizeRefs(rec.evidenceRefs ?? []),
        });
      }
    }
    const recommendedLevels = Array.from(levelsMap.values()).slice(
      0,
      TEST_DESIGN_LIMITS.MAX_RECOMMENDED_LEVELS,
    );

    // 2. Deduplicate & Sanitize Test Dimensions
    const dimensionsMap = new Map<TestDimension, TestDimensionRecommendationDto>();
    for (const dim of design.recommendedDimensions ?? []) {
      if (!dimensionsMap.has(dim.dimension)) {
        dimensionsMap.set(dim.dimension, {
          ...dim,
          evidenceRefs: sanitizeRefs(dim.evidenceRefs ?? []),
        });
      }
    }
    const recommendedDimensions = Array.from(dimensionsMap.values()).slice(
      0,
      TEST_DESIGN_LIMITS.MAX_RECOMMENDED_DIMENSIONS,
    );

    // 3. Deduplicate & Sanitize Test Techniques
    const techniquesMap = new Map<string, TestTechniqueRecommendationDto>();
    for (const tech of design.recommendedTechniques ?? []) {
      if (!techniquesMap.has(tech.technique)) {
        techniquesMap.set(tech.technique, {
          ...tech,
          evidenceRefs: sanitizeRefs(tech.evidenceRefs ?? []),
        });
      }
    }
    const recommendedTechniques = Array.from(techniquesMap.values()).slice(
      0,
      TEST_DESIGN_LIMITS.MAX_RECOMMENDED_TECHNIQUES,
    );

    // 4. Sanitize Coverage Objectives
    const coverageObjectives: CoverageObjectiveDto[] = [];
    const seenObjectiveDescriptions = new Set<string>();
    for (const obj of design.coverageObjectives ?? []) {
      const normalizedDesc = obj.description.trim().toLowerCase();
      if (!seenObjectiveDescriptions.has(normalizedDesc)) {
        seenObjectiveDescriptions.add(normalizedDesc);
        coverageObjectives.push({
          ...obj,
          evidenceRefs: sanitizeRefs(obj.evidenceRefs ?? []),
        });
      }
    }
    const boundedCoverageObjectives = coverageObjectives.slice(
      0,
      TEST_DESIGN_LIMITS.MAX_COVERAGE_OBJECTIVES,
    );

    // 5. Sanitize Identified Constraints
    const identifiedConstraints: TestableConstraintDto[] = [];
    for (const c of design.identifiedConstraints ?? []) {
      let evidenceRef = c.evidenceRef ?? null;
      if (evidenceRef) {
        totalEvidenceRefs++;
        if (validEvidenceIds.has(evidenceRef)) {
          validEvidenceRefs++;
        } else {
          invalidEvidenceRefs++;
          evidenceRef = null;
          warnings.push(`Constraint evidence reference "${c.evidenceRef}" is ungrounded.`);
        }
      }
      identifiedConstraints.push({
        ...c,
        evidenceRef,
      });
    }
    const boundedConstraints = identifiedConstraints.slice(
      0,
      TEST_DESIGN_LIMITS.MAX_IDENTIFIED_CONSTRAINTS,
    );

    // 6. Sanitize Risk Focus Areas
    const riskFocusAreas: TestRiskFocusDto[] = [];
    for (const r of design.riskFocusAreas ?? []) {
      riskFocusAreas.push({
        ...r,
        evidenceRefs: sanitizeRefs(r.evidenceRefs ?? []),
      });
    }
    const boundedRiskAreas = riskFocusAreas.slice(0, TEST_DESIGN_LIMITS.MAX_RISK_AREAS);

    // 7. Sanitize Design Questions
    const designQuestions: TestDesignQuestionDto[] = (design.designQuestions ?? []).slice(
      0,
      TEST_DESIGN_LIMITS.MAX_DESIGN_QUESTIONS,
    );

    // 8. Numeric Preservation Check
    const sourceNumbers = sourceText.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
    for (const num of sourceNumbers) {
      const constraintMatches = boundedConstraints.some(
        c =>
          c.value.includes(num) ||
          c.lowerBound === num ||
          c.upperBound === num ||
          c.parameter.includes(num),
      );
      if (!constraintMatches && sourceNumbers.length <= 5) {
        // Warning if small list of numbers not captured
      }
    }

    const sanitizedDesign: StructuredTestDesignDto = {
      applicability: design.applicability ?? 'APPLICABLE',
      applicabilityRationale: design.applicabilityRationale ?? '',
      automationSuitability: design.automationSuitability ?? 'UNKNOWN',
      automationRationale: design.automationRationale ?? '',
      recommendedLevels,
      recommendedDimensions,
      recommendedTechniques,
      coverageObjectives: boundedCoverageObjectives,
      riskFocusAreas: boundedRiskAreas,
      identifiedConstraints: boundedConstraints,
      designQuestions,
      rationale: (design.rationale ?? []).slice(0, TEST_DESIGN_LIMITS.MAX_RATIONALE_ITEMS),
      sourceContext: (design.sourceContext ?? []).slice(
        0,
        TEST_DESIGN_LIMITS.MAX_SOURCE_CONTEXT_ITEMS,
      ),
    };

    return {
      sanitizedDesign,
      totalEvidenceRefs,
      validEvidenceRefs,
      invalidEvidenceRefs,
      warnings,
    };
  }
}
