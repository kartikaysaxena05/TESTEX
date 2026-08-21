/**
 * @file packages/core/src/ai/test-design/deterministic-rules-engine.ts
 * Pure deterministic rule engine for Test Design Intelligence.
 * Extracts domain characteristics and produces evidence-backed test design recommendations.
 */

import type {
  AutomationSuitability,
  CoverageObjectiveDto,
  GroundingConfidence,
  RequirementInterpretationDto,
  StructuredTestDesignDto,
  TestableConstraintDto,
  TestDesignApplicability,
  TestDesignPriority,
  TestDesignQuestionDto,
  TestDesignRationaleDto,
  TestDesignSourceReferenceDto,
  TestDimension,
  TestDimensionRecommendationDto,
  TestLevel,
  TestLevelRecommendationDto,
  TestRiskFocusDto,
  TestTechniqueRecommendationDto,
} from '@ai-quality/contracts';
import { TEST_DESIGN_REASON_CODES } from './test-design-types.js';

export interface DeterministicRuleEngineInput {
  readonly requirementId: string;
  readonly requirementKey: string;
  readonly title: string;
  readonly statement: string;
  readonly type: string;
  readonly priority: string;
  readonly category?: string | null;
  readonly qualityFindings?: readonly string[];
  readonly outgoingRelationships?: readonly {
    readonly relationshipType: string;
    readonly targetRequirementKey?: string;
    readonly targetRequirementId: string;
  }[];
  readonly repositoryEvidence?: readonly {
    readonly evidenceType: string;
    readonly filePath: string;
    readonly symbolName?: string | null;
  }[];
  readonly aiInterpretation?: RequirementInterpretationDto | null;
}

export class DeterministicRulesEngine {
  /**
   * Evaluates the requirement and produces a deterministic baseline test design.
   */
  public static evaluate(input: DeterministicRuleEngineInput): StructuredTestDesignDto {
    const statement = input.statement.trim();
    const qualityFindings = input.qualityFindings ?? [];
    const outgoingRelationships = input.outgoingRelationships ?? [];
    const repositoryEvidence = input.repositoryEvidence ?? [];
    const aiInterp = input.aiInterpretation;

    const sourceContext: TestDesignSourceReferenceDto[] = [
      {
        id: input.requirementKey,
        sourceType: 'PRIMARY_REQUIREMENT',
        title: input.title,
        authorityTier: 1,
      },
    ];

    const rationale: TestDesignRationaleDto[] = [];
    const designQuestions: TestDesignQuestionDto[] = [];
    const identifiedConstraints: TestableConstraintDto[] = [];
    const coverageObjectives: CoverageObjectiveDto[] = [];
    const recommendedDimensionsMap = new Map<TestDimension, TestDimensionRecommendationDto>();
    const recommendedTechniquesMap = new Map<string, TestTechniqueRecommendationDto>();
    const recommendedLevelsMap = new Map<TestLevel, TestLevelRecommendationDto>();
    const riskFocusAreas: TestRiskFocusDto[] = [];

    // 1. Detect Negation and Modality
    const hasNegation =
      /\b(shall not|must not|cannot|never|prohibited|not allow|not permit)\b/i.test(statement) ||
      aiInterp?.hasNegation === true;

    if (hasNegation) {
      this.addDimension(
        recommendedDimensionsMap,
        'NEGATIVE',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.NEGATIVE_MODALITY_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'NEGATIVE_TESTING',
        'HIGH',
        'Requirement specifies negative constraint/prohibition rule.',
        [TEST_DESIGN_REASON_CODES.NEGATIVE_MODALITY_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push({
        id: `CO-NEG-${coverageObjectives.length + 1}`,
        category: 'ERROR_HANDLING',
        priority: 'HIGH',
        description:
          'Verify prohibition is strictly enforced and disallowed operations fail safely.',
        rationaleCodes: [TEST_DESIGN_REASON_CODES.NEGATIVE_MODALITY_PRESENT],
        evidenceRefs: [input.requirementKey],
      });
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.NEGATIVE_MODALITY_PRESENT,
        description: 'Negative modality detected in requirement statement.',
        source: 'DETERMINISTIC',
      });
    }

    // 2. Detect Quantitative Boundaries and Ranges
    const rangeMatch = statement.match(
      /(?:from|between)\s+(\d+(?:\.\d+)?)\s+(?:to|and)\s+(\d+(?:\.\d+)?)(?:\s+(inclusive|exclusive))?/i,
    );
    const minMatch = statement.match(
      /(?:at least|minimum of|not less than)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z%₹$€£]+)?/i,
    );
    const maxMatch = statement.match(
      /(?:at most|maximum of|not more than|up to)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z%₹$€£]+)?/i,
    );
    const timeMatch = statement.match(
      /(?:within|in less than|timeout of)\s+(\d+(?:\.\d+)?)\s*(ms|milliseconds|seconds|minutes|hours)/i,
    );

    let hasNumericRange = false;
    if (rangeMatch) {
      hasNumericRange = true;
      const lower = rangeMatch[1] ?? '';
      const upper = rangeMatch[2] ?? '';
      const isInclusive = !rangeMatch[3] || rangeMatch[3].toLowerCase() === 'inclusive';
      identifiedConstraints.push({
        id: `TC-${identifiedConstraints.length + 1}`,
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Range Constraint',
        value: `${lower} to ${upper}`,
        lowerBound: lower,
        upperBound: upper,
        isInclusive,
        evidenceRef: input.requirementKey,
      });
    }

    if (minMatch && !hasNumericRange) {
      hasNumericRange = true;
      identifiedConstraints.push({
        id: `TC-${identifiedConstraints.length + 1}`,
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Minimum Bound',
        value: minMatch[1] ?? '',
        unit: minMatch[2] ?? null,
        lowerBound: minMatch[1] ?? '',
        isInclusive: true,
        evidenceRef: input.requirementKey,
      });
    }

    if (maxMatch && !rangeMatch) {
      hasNumericRange = true;
      identifiedConstraints.push({
        id: `TC-${identifiedConstraints.length + 1}`,
        constraintType: 'NUMERIC_RANGE',
        parameter: 'Maximum Bound',
        value: maxMatch[1] ?? '',
        unit: maxMatch[2] ?? null,
        upperBound: maxMatch[1] ?? '',
        isInclusive: true,
        evidenceRef: input.requirementKey,
      });
    }

    if (timeMatch) {
      identifiedConstraints.push({
        id: `TC-${identifiedConstraints.length + 1}`,
        constraintType: 'TIME_LIMIT',
        parameter: 'Execution Time Limit',
        value: timeMatch[1] ?? '',
        unit: timeMatch[2] ?? '',
        upperBound: timeMatch[1] ?? '',
        isInclusive: true,
        evidenceRef: input.requirementKey,
      });
    }

    // Merge Phase 47 quantitative constraints if present
    if (aiInterp?.quantitativeConstraints) {
      for (const qc of aiInterp.quantitativeConstraints) {
        if (!identifiedConstraints.some(c => c.value === qc.value)) {
          identifiedConstraints.push({
            id: `TC-${identifiedConstraints.length + 1}`,
            constraintType: 'NUMERIC_RANGE',
            parameter: qc.parameter,
            value: qc.value,
            unit: qc.unit,
            evidenceRef: input.requirementKey,
          });
          hasNumericRange = true;
        }
      }
    }

    if (hasNumericRange) {
      this.addDimension(
        recommendedDimensionsMap,
        'BOUNDARY',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
        [input.requirementKey],
        'HIGH',
      );
      this.addDimension(
        recommendedDimensionsMap,
        'VALIDATION',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
        [input.requirementKey],
        'HIGH',
      );
      this.addDimension(
        recommendedDimensionsMap,
        'NEGATIVE',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'BOUNDARY_VALUE_ANALYSIS',
        'HIGH',
        'Explicit numeric boundaries/thresholds detected in requirement statement.',
        [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'EQUIVALENCE_PARTITIONING',
        'HIGH',
        'Partition input space into valid and invalid equivalence classes around boundaries.',
        [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'INPUT_VALIDATION',
        'HIGH',
        'Verify input rejection outside allowed numeric ranges.',
        [TEST_DESIGN_REASON_CODES.VALIDATION_LANGUAGE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push(
        {
          id: `CO-BVA-${coverageObjectives.length + 1}`,
          category: 'BOUNDARY_LIMITS',
          priority: 'HIGH',
          description: 'Verify boundary values (minimum, maximum, and immediate boundary limits).',
          rationaleCodes: [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
          evidenceRefs: [input.requirementKey],
        },
        {
          id: `CO-EQP-${coverageObjectives.length + 1}`,
          category: 'BOUNDARY_LIMITS',
          priority: 'HIGH',
          description: 'Verify valid in-range partition and invalid out-of-range partitions.',
          rationaleCodes: [TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE],
          evidenceRefs: [input.requirementKey],
        },
      );
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.EXPLICIT_NUMERIC_RANGE,
        description: 'Quantitative range or threshold identified in requirement statement.',
        source: 'DETERMINISTIC',
      });
    }

    // 3. Detect Role & Permission Restrictions
    const roleMatch =
      /\b(only|restricted to|authorized)\s+([A-Za-z0-9_ -]+)\s+(?:can|may|shall|is authorized to|is permitted to|be able to)\b/i.test(
        statement,
      ) ||
      input.category === 'SECURITY' ||
      input.type === 'SECURITY' ||
      Boolean(aiInterp?.primaryActor && aiInterp.primaryActor !== 'null');

    if (roleMatch) {
      this.addDimension(
        recommendedDimensionsMap,
        'AUTHORIZATION',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.ROLE_RESTRICTION_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      this.addDimension(
        recommendedDimensionsMap,
        'SECURITY',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.SECURITY_CLASSIFICATION],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'ROLE_PERMISSION_TESTING',
        'HIGH',
        'Access control or specific role-based authorization rule identified.',
        [TEST_DESIGN_REASON_CODES.ROLE_RESTRICTION_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push({
        id: `CO-AUTH-${coverageObjectives.length + 1}`,
        category: 'SECURITY_AUTHORIZATION',
        priority: 'HIGH',
        description:
          'Verify authorized roles have access and unauthorized roles are denied access.',
        rationaleCodes: [TEST_DESIGN_REASON_CODES.ROLE_RESTRICTION_PRESENT],
        evidenceRefs: [input.requirementKey],
      });
      riskFocusAreas.push({
        area: 'Access Control & Authorization',
        priority: 'HIGH',
        rationale: 'Privilege escalation or unauthorized access risk on restricted operations.',
        evidenceRefs: [input.requirementKey],
      });
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.ROLE_RESTRICTION_PRESENT,
        description: 'Role-based access control restriction detected.',
        source: 'DETERMINISTIC',
      });
    }

    // 4. Detect State Transition / Lifecycle Language
    const stateMatch =
      /\b(transition|state|status|draft|pending|approved|rejected|cancelled|activated|deactivated)\b/i.test(
        statement,
      );
    if (stateMatch) {
      this.addDimension(
        recommendedDimensionsMap,
        'STATE_TRANSITION',
        'MEDIUM',
        [TEST_DESIGN_REASON_CODES.STATE_MACHINE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'STATE_TRANSITION',
        'HIGH',
        'Lifecycle states or entity status transition rules detected in requirement.',
        [TEST_DESIGN_REASON_CODES.STATE_MACHINE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push({
        id: `CO-ST-${coverageObjectives.length + 1}`,
        category: 'STATE_LIFECYCLE',
        priority: 'HIGH',
        description:
          'Verify allowed entity state transitions and rejection of invalid state transitions.',
        rationaleCodes: [TEST_DESIGN_REASON_CODES.STATE_MACHINE_PRESENT],
        evidenceRefs: [input.requirementKey],
      });
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.STATE_MACHINE_PRESENT,
        description: 'State transition lifecycle keywords detected.',
        source: 'DETERMINISTIC',
      });
    }

    // 5. Detect Multi-Condition Business Rules
    const multiConditionMatch =
      /\b(if|when)\b.*\b(and|or)\b.*\b(then|shall|must)\b/i.test(statement) ||
      (aiInterp?.conditions && aiInterp.conditions.length >= 2) ||
      (aiInterp?.businessRules && aiInterp.businessRules.length >= 2);

    if (multiConditionMatch) {
      this.addDimension(
        recommendedDimensionsMap,
        'BUSINESS_RULE',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.MULTI_CONDITION_RULE],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'DECISION_TABLE',
        'HIGH',
        'Multiple logical conditions and outcomes identified in business rule.',
        [TEST_DESIGN_REASON_CODES.MULTI_CONDITION_RULE],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push({
        id: `CO-DT-${coverageObjectives.length + 1}`,
        category: 'FUNCTIONAL_BEHAVIOR',
        priority: 'HIGH',
        description:
          'Verify all valid and invalid condition combinations in decision table branches.',
        rationaleCodes: [TEST_DESIGN_REASON_CODES.MULTI_CONDITION_RULE],
        evidenceRefs: [input.requirementKey],
      });
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.MULTI_CONDITION_RULE,
        description: 'Multi-condition business rule logic detected.',
        source: 'DETERMINISTIC',
      });
    }

    // 6. Detect Performance / Timing Constraints
    const performanceMatch =
      timeMatch !== null ||
      /\b(response time|latency|throughput|concurrent|load|within\s+\d+\s*(?:ms|seconds|minutes))\b/i.test(
        statement,
      );
    if (performanceMatch) {
      this.addDimension(
        recommendedDimensionsMap,
        'PERFORMANCE',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.PERFORMANCE_THRESHOLD_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      this.addTechnique(
        recommendedTechniquesMap,
        'PERFORMANCE_TESTING',
        'HIGH',
        'Explicit performance threshold or latency limit specified in requirement.',
        [TEST_DESIGN_REASON_CODES.PERFORMANCE_THRESHOLD_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      coverageObjectives.push({
        id: `CO-PERF-${coverageObjectives.length + 1}`,
        category: 'PERFORMANCE_TIMING',
        priority: 'HIGH',
        description: 'Verify execution finishes within stated latency/throughput thresholds.',
        rationaleCodes: [TEST_DESIGN_REASON_CODES.PERFORMANCE_THRESHOLD_PRESENT],
        evidenceRefs: [input.requirementKey],
      });
      rationale.push({
        code: TEST_DESIGN_REASON_CODES.PERFORMANCE_THRESHOLD_PRESENT,
        description: 'Performance constraint threshold detected.',
        source: 'DETERMINISTIC',
      });
    }

    // Always add baseline Functional dimension & Use Case technique if not already present
    this.addDimension(
      recommendedDimensionsMap,
      'FUNCTIONAL',
      'HIGH',
      ['BASE_FUNCTIONAL_RULE'],
      [input.requirementKey],
      'HIGH',
    );
    this.addTechnique(
      recommendedTechniquesMap,
      'USE_CASE_TESTING',
      'MEDIUM',
      'Verify standard end-to-end user goal and expected functional behavior.',
      ['BASE_FUNCTIONAL_RULE'],
      [input.requirementKey],
      'HIGH',
    );

    // 7. Test Levels Determination
    if (performanceMatch) {
      this.addLevel(
        recommendedLevelsMap,
        'API',
        'HIGH',
        'Validate API response latency thresholds.',
        [input.requirementKey],
      );
      this.addLevel(
        recommendedLevelsMap,
        'SYSTEM',
        'HIGH',
        'Validate full system timing under expected conditions.',
        [input.requirementKey],
      );
    } else if (hasNumericRange && !roleMatch && !stateMatch) {
      this.addLevel(
        recommendedLevelsMap,
        'UNIT',
        'HIGH',
        'Pure boundary and calculation validation can be tested rapidly at unit level.',
        [input.requirementKey],
      );
      this.addLevel(
        recommendedLevelsMap,
        'COMPONENT',
        'MEDIUM',
        'Validate input component validation rules.',
        [input.requirementKey],
      );
    } else {
      this.addLevel(
        recommendedLevelsMap,
        'INTEGRATION',
        'HIGH',
        'Verify collaborative behavior across service boundaries.',
        [input.requirementKey],
      );
      this.addLevel(
        recommendedLevelsMap,
        'SYSTEM',
        'HIGH',
        'Verify end-to-end requirement fulfillment in complete system environment.',
        [input.requirementKey],
      );
    }

    // Check repository evidence for level guidance
    if (
      repositoryEvidence.some(e => e.evidenceType === 'ROUTE' || e.evidenceType === 'API_ENDPOINT')
    ) {
      this.addLevel(
        recommendedLevelsMap,
        'API',
        'HIGH',
        'Confirmed repository API route evidence.',
        [input.requirementKey],
      );
      this.addDimension(
        recommendedDimensionsMap,
        'API',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.REPOSITORY_EVIDENCE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
    }
    if (repositoryEvidence.some(e => e.evidenceType === 'DATABASE_MODEL')) {
      this.addDimension(
        recommendedDimensionsMap,
        'DATABASE',
        'MEDIUM',
        [TEST_DESIGN_REASON_CODES.REPOSITORY_EVIDENCE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
      this.addDimension(
        recommendedDimensionsMap,
        'DATA_INTEGRITY',
        'HIGH',
        [TEST_DESIGN_REASON_CODES.REPOSITORY_EVIDENCE_PRESENT],
        [input.requirementKey],
        'HIGH',
      );
    }

    // 8. Dependency Check
    if (outgoingRelationships.length > 0) {
      for (const rel of outgoingRelationships) {
        rationale.push({
          code: TEST_DESIGN_REASON_CODES.DEPENDENT_REQUIREMENTS_PRESENT,
          description: `Confirmed relationship: [${rel.relationshipType}] -> ${rel.targetRequirementKey ?? rel.targetRequirementId}`,
          source: 'DETERMINISTIC',
        });
      }
    }

    // 9. Applicability & Ambiguity Check
    let applicability: TestDesignApplicability = 'APPLICABLE';
    let applicabilityRationale =
      'Requirement contains actionable, testable functional specifications.';

    const isSubjectiveOrVague =
      /\b(load quickly|be fast|appropriate|user friendly|intuitive|good quality|proper experience)\b/i.test(
        statement,
      );

    const hasAmbiguityFindings = qualityFindings.some(
      f =>
        f.includes('AMBIGUOUS') ||
        f.includes('UNDEFINED_TIME_CONSTRAINT') ||
        f.includes('SUBJECTIVE_LANGUAGE') ||
        f.includes('UNVERIFIABLE'),
    );

    if (isSubjectiveOrVague || hasAmbiguityFindings) {
      applicability = 'REQUIRES_CLARIFICATION';
      applicabilityRationale =
        'Requirement contains subjective or non-quantified terminology that requires stakeholder clarification before precise test boundaries can be established.';

      if (
        /\b(load quickly|be fast)\b/i.test(statement) ||
        qualityFindings.some(f => f.includes('UNDEFINED_TIME_CONSTRAINT'))
      ) {
        designQuestions.push({
          id: `DQ-${designQuestions.length + 1}`,
          category: 'PERFORMANCE_CRITERIA',
          question:
            'What exact quantitative latency threshold (e.g. in ms or seconds) defines acceptable performance?',
          impact:
            'Cannot generate definitive pass/fail boundary test cases for performance without a measurable target.',
        });
      } else {
        designQuestions.push({
          id: `DQ-${designQuestions.length + 1}`,
          category: 'REQUIREMENT_CLARIFICATION',
          question:
            'Can the subjective or ambiguous expectations in this requirement be replaced with concrete, verifiable acceptance criteria?',
          impact: 'Subjective criteria cannot be deterministically verified.',
        });
      }
    } else if (statement.length < 15 && !hasNumericRange && !roleMatch) {
      applicability = 'INSUFFICIENT_INFORMATION';
      applicabilityRationale =
        'Requirement text is too brief or lacks sufficient functional context to construct a complete testing strategy.';
      designQuestions.push({
        id: `DQ-${designQuestions.length + 1}`,
        category: 'SPECIFICATION_DETAIL',
        question:
          'What are the explicit actors, trigger conditions, and expected outcomes for this requirement?',
        impact: 'Insufficient detail to construct grounded test design plan.',
      });
    }

    // 10. Automation Suitability
    let automationSuitability: AutomationSuitability = 'HIGH';
    let automationRationale =
      'Functional behavior and constraints are well-defined with clear, deterministic expected outcomes.';

    if (
      applicability === 'REQUIRES_CLARIFICATION' ||
      applicability === 'INSUFFICIENT_INFORMATION'
    ) {
      automationSuitability = 'UNKNOWN';
      automationRationale =
        'Automation suitability cannot be determined until ambiguous or missing criteria are clarified.';
    } else if (input.category === 'USABILITY' || input.type === 'USABILITY') {
      automationSuitability = 'MEDIUM';
      automationRationale =
        'Usability and aesthetic evaluations may require complementary exploratory or human review.';
    }

    return {
      applicability,
      applicabilityRationale,
      automationSuitability,
      automationRationale,
      recommendedLevels: Array.from(recommendedLevelsMap.values()),
      recommendedDimensions: Array.from(recommendedDimensionsMap.values()),
      recommendedTechniques: Array.from(recommendedTechniquesMap.values()),
      coverageObjectives,
      riskFocusAreas,
      identifiedConstraints,
      designQuestions,
      rationale,
      sourceContext,
    };
  }

  private static addDimension(
    map: Map<TestDimension, TestDimensionRecommendationDto>,
    dimension: TestDimension,
    priority: TestDesignPriority,
    rationaleCodes: readonly string[],
    evidenceRefs: readonly string[],
    confidence: GroundingConfidence,
  ): void {
    if (!map.has(dimension)) {
      map.set(dimension, {
        dimension,
        applicable: true,
        priority,
        rationaleCodes: [...rationaleCodes],
        evidenceRefs: [...evidenceRefs],
        confidence,
      });
    }
  }

  private static addTechnique(
    map: Map<string, TestTechniqueRecommendationDto>,
    technique: string,
    priority: TestDesignPriority,
    rationale: string,
    rationaleCodes: readonly string[],
    evidenceRefs: readonly string[],
    confidence: GroundingConfidence,
  ): void {
    if (!map.has(technique)) {
      map.set(technique, {
        technique: technique as any,
        priority,
        rationale,
        rationaleCodes: [...rationaleCodes],
        evidenceRefs: [...evidenceRefs],
        confidence,
      });
    }
  }

  private static addLevel(
    map: Map<TestLevel, TestLevelRecommendationDto>,
    level: TestLevel,
    priority: TestDesignPriority,
    rationale: string,
    evidenceRefs: readonly string[],
  ): void {
    if (!map.has(level)) {
      map.set(level, {
        level,
        priority,
        rationale,
        evidenceRefs: [...evidenceRefs],
      });
    }
  }
}
