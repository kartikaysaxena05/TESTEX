import type {
  GeneratedTestSpecificationDto,
  TestCaseType,
  TestCasePriority,
  TestCaseStatus,
  TestCaseExecutionSuitability,
} from '@ai-quality/contracts';
import { TEST_CASE_BOUNDS } from './test-case-types.js';
import { TestCaseValidationError } from './test-case-errors.js';

export interface MappedTestCaseInput {
  readonly title: string;
  readonly objective: string;
  readonly description?: string | null;
  readonly type: TestCaseType;
  readonly priority: TestCasePriority;
  readonly status: TestCaseStatus;
  readonly executionSuitability: TestCaseExecutionSuitability;
  readonly overallExpectedResult: string;
  readonly assumptions: readonly string[];
  readonly unknowns: readonly {
    readonly name: string;
    readonly reason: string;
    readonly reviewRequired?: boolean;
  }[];
  readonly tags: readonly string[];
  readonly preconditions: readonly {
    readonly sequenceOrder: number;
    readonly category: string;
    readonly description: string;
    readonly isEnforced: boolean;
    readonly confidence: string;
    readonly sourceEvidenceRefs: readonly string[];
    readonly reviewRequired: boolean;
  }[];
  readonly steps: readonly {
    readonly stepNumber: number;
    readonly action: string;
    readonly expectedResult?: string | null;
    readonly testDataSummary?: string | null;
    readonly stateChangeFrom?: string | null;
    readonly stateChangeTo?: string | null;
    readonly stateEntity?: string | null;
    readonly isOptional: boolean;
  }[];
  readonly testData: readonly {
    readonly sequenceOrder: number;
    readonly name: string;
    readonly dataType: string;
    readonly origin: string;
    readonly value?: unknown;
    readonly generator?: string | null;
    readonly constraint?: string | null;
    readonly isSensitive: boolean;
    readonly unknownReason?: string | null;
    readonly confidence: string;
    readonly sourceEvidenceRefs: readonly string[];
    readonly reviewRequired: boolean;
  }[];
}

export class TestCaseMappingService {
  /**
   * Maps a generated test specification into canonical TestCase domain structures.
   */
  mapSpecificationToTestCase(spec: GeneratedTestSpecificationDto): MappedTestCaseInput {
    if (!spec.title || spec.title.trim().length === 0) {
      throw new TestCaseValidationError('Specification title cannot be empty.');
    }

    const title = spec.title.trim().slice(0, TEST_CASE_BOUNDS.MAX_TITLE_LENGTH);
    const type = this.mapCategoryToTestCaseType(spec.category);
    const priority: TestCasePriority = spec.reviewRequired ? 'HIGH' : 'MEDIUM';
    const status: TestCaseStatus = 'GENERATED';
    const executionSuitability: TestCaseExecutionSuitability = 'AUTOMATED';

    const overallExpectedResult = spec.expectedResults
      .map(r => `[${r.category}] ${r.description}`)
      .join('\n');

    const assumptions = (spec.assumptions ?? []).slice(0, TEST_CASE_BOUNDS.MAX_ASSUMPTIONS);
    const unknowns = (spec.unknowns ?? []).slice(0, TEST_CASE_BOUNDS.MAX_UNKNOWNS);

    const tags: string[] = [
      `category:${spec.category.toLowerCase()}`,
      `confidence:${spec.confidence.toLowerCase()}`,
    ];
    if (spec.scenarioKey) {
      tags.push(`scenario:${spec.scenarioKey}`);
    }

    // Map preconditions with strict sequence ordering
    const preconditions = (spec.preconditions ?? [])
      .slice(0, TEST_CASE_BOUNDS.MAX_PRECONDITIONS)
      .map((p, idx) => ({
        sequenceOrder: idx + 1,
        category: p.category,
        description: p.description.slice(0, TEST_CASE_BOUNDS.MAX_PRECONDITION_DESCRIPTION_LENGTH),
        isEnforced: true,
        confidence: p.confidence,
        sourceEvidenceRefs: p.sourceEvidenceRefs ?? [],
        reviewRequired: p.reviewRequired ?? false,
      }));

    // Map test data items
    const testData = (spec.testData ?? [])
      .slice(0, TEST_CASE_BOUNDS.MAX_TEST_DATA_ITEMS)
      .map((d, idx) => ({
        sequenceOrder: idx + 1,
        name: d.name.slice(0, TEST_CASE_BOUNDS.MAX_TEST_DATA_NAME_LENGTH),
        dataType: d.dataType,
        origin: d.origin,
        value: d.value ?? null,
        generator: d.generator ?? null,
        constraint: d.constraint
          ? d.constraint.slice(0, TEST_CASE_BOUNDS.MAX_TEST_DATA_CONSTRAINT_LENGTH)
          : null,
        isSensitive: d.isSensitive ?? false,
        unknownReason: d.unknownReason ?? null,
        confidence: d.confidence,
        sourceEvidenceRefs: d.sourceEvidenceRefs ?? [],
        reviewRequired: d.reviewRequired ?? false,
      }));

    // Synthesize structured execution steps
    const steps = this.synthesizeSteps(spec, preconditions, testData);

    const objective = `Verify ${title} under ${spec.category.toLowerCase()} condition.`;

    return {
      title,
      objective,
      description:
        spec.reviewReasons && spec.reviewReasons.length > 0
          ? `Review reasons: ${spec.reviewReasons.join('; ')}`
          : null,
      type,
      priority,
      status,
      executionSuitability,
      overallExpectedResult,
      assumptions,
      unknowns,
      tags,
      preconditions,
      steps,
      testData,
    };
  }

  private mapCategoryToTestCaseType(category: string): TestCaseType {
    switch (category?.toUpperCase()) {
      case 'POSITIVE':
        return 'POSITIVE';
      case 'NEGATIVE':
        return 'NEGATIVE';
      case 'BOUNDARY':
        return 'BOUNDARY';
      case 'VALIDATION':
        return 'VALIDATION';
      case 'SECURITY':
        return 'SECURITY';
      case 'PERFORMANCE':
        return 'PERFORMANCE';
      case 'ACCESSIBILITY':
        return 'ACCESSIBILITY';
      case 'COMPATIBILITY':
        return 'COMPATIBILITY';
      case 'REGRESSION':
        return 'REGRESSION';
      case 'SMOKE':
        return 'SMOKE';
      case 'EXPLORATORY':
        return 'EXPLORATORY';
      case 'END_TO_END':
        return 'END_TO_END';
      case 'INTEGRATION':
        return 'INTEGRATION';
      case 'UNIT':
        return 'UNIT';
      default:
        return 'OTHER';
    }
  }

  private synthesizeSteps(
    spec: GeneratedTestSpecificationDto,
    preconditions: readonly { sequenceOrder: number; description: string }[],
    testData: readonly { sequenceOrder: number; name: string; dataType: string; value?: unknown }[],
  ): MappedTestCaseInput['steps'] {
    const steps: Array<MappedTestCaseInput['steps'][number]> = [];
    let stepNum = 1;

    // Step 1: Precondition check step (if preconditions exist)
    if (preconditions.length > 0) {
      const summary = preconditions.map(p => p.description).join('; ');
      steps.push({
        stepNumber: stepNum++,
        action: `Verify and establish preconditions: ${summary}`,
        expectedResult: 'All system preconditions and required state are satisfied.',
        testDataSummary: null,
        stateChangeFrom: null,
        stateChangeTo: null,
        stateEntity: null,
        isOptional: false,
      });
    }

    // Step 2: Main action execution
    const dataSummary =
      testData.length > 0
        ? testData
            .map(
              d =>
                `${d.name} (${d.dataType})${d.value !== null && d.value !== undefined ? ` = ${JSON.stringify(d.value)}` : ''}`,
            )
            .join(', ')
        : null;

    steps.push({
      stepNumber: stepNum++,
      action: `Execute scenario action: ${spec.title}`,
      expectedResult:
        spec.expectedResults.length > 0
          ? (spec.expectedResults[0]?.description ?? 'Action completes successfully.')
          : 'Action completes as expected.',
      testDataSummary: dataSummary,
      stateChangeFrom: spec.expectedResults[0]?.stateChange?.from ?? null,
      stateChangeTo: spec.expectedResults[0]?.stateChange?.to ?? null,
      stateEntity: spec.expectedResults[0]?.stateChange?.entity ?? null,
      isOptional: false,
    });

    // Step 3..N: Additional verification steps for remaining expected outcomes
    if (spec.expectedResults.length > 1) {
      for (let i = 1; i < spec.expectedResults.length; i++) {
        const er = spec.expectedResults[i];
        if (!er) continue;
        steps.push({
          stepNumber: stepNum++,
          action: `Verify expected outcome (${er.category}): ${er.description}`,
          expectedResult: er.exactMessageExpected
            ? `Exact message expected: "${er.exactMessageExpected}"`
            : er.description,
          testDataSummary: er.httpStatusExpected ? `HTTP Status ${er.httpStatusExpected}` : null,
          stateChangeFrom: er.stateChange?.from ?? null,
          stateChangeTo: er.stateChange?.to ?? null,
          stateEntity: er.stateChange?.entity ?? null,
          isOptional: false,
        });
      }
    }

    return steps;
  }
}
