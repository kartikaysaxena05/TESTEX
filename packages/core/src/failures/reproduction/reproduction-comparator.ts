/**
 * @file packages/core/src/failures/reproduction/reproduction-comparator.ts
 * Authoritative comparison engine between original historical failure and reproduction execution (V6 Phase 76).
 */

import {
  type FailureReproductionOutcome,
  type ReproductionStepComparisonDto,
  type ReproductionAssertionComparisonDto,
} from './failure-reproduction-types.js';

export interface ExecutionComparisonInput {
  readonly originalStatus: string;
  readonly reproductionStatus: string;
  readonly originalFailureSignature?: string | null;
  readonly reproductionFailureSignature?: string | null;
  readonly originalSteps: Array<{
    readonly stepIndex: number;
    readonly actionType: string;
    readonly targetSummary?: string | null;
    readonly status: string;
    readonly durationMs?: number | null;
    readonly errorMessage?: string | null;
  }>;
  readonly reproductionSteps: Array<{
    readonly stepIndex: number;
    readonly actionType: string;
    readonly targetSummary?: string | null;
    readonly status: string;
    readonly durationMs?: number | null;
    readonly errorMessage?: string | null;
  }>;
  readonly originalAssertion?: {
    readonly assertionType?: string | null;
    readonly operator?: string | null;
    readonly expectedValue?: unknown;
    readonly actualValue?: unknown;
    readonly message?: string | null;
  } | null;
  readonly reproductionAssertion?: {
    readonly assertionType?: string | null;
    readonly operator?: string | null;
    readonly expectedValue?: unknown;
    readonly actualValue?: unknown;
    readonly message?: string | null;
  } | null;
}

export interface ExecutionComparisonResult {
  readonly status: FailureReproductionOutcome;
  readonly isSignatureMatch: boolean;
  readonly failedStepIndex?: number | null;
  readonly isFailedStepMatch: boolean;
  readonly stepComparison: ReproductionStepComparisonDto[];
  readonly assertionComparison?: ReproductionAssertionComparisonDto | null;
}

export class ReproductionComparator {
  /**
   * Performs deep, deterministic comparison between original and reproduction executions.
   */
  public compare(input: ExecutionComparisonInput): ExecutionComparisonResult {
    // 1. Check if reproduction passed
    if (input.reproductionStatus === 'PASSED') {
      const stepComp = this.compareSteps(input.originalSteps, input.reproductionSteps);
      return {
        status: 'NOT_REPRODUCED',
        isSignatureMatch: false,
        failedStepIndex: null,
        isFailedStepMatch: false,
        stepComparison: stepComp,
        assertionComparison: null,
      };
    }

    // 2. Check for cancellation
    if (input.reproductionStatus === 'CANCELLED') {
      const stepComp = this.compareSteps(input.originalSteps, input.reproductionSteps);
      return {
        status: 'CANCELLED',
        isSignatureMatch: false,
        failedStepIndex: null,
        isFailedStepMatch: false,
        stepComparison: stepComp,
        assertionComparison: null,
      };
    }

    // 3. Compare Failure Signatures
    const isSignatureMatch =
      Boolean(input.originalFailureSignature) &&
      Boolean(input.reproductionFailureSignature) &&
      input.originalFailureSignature === input.reproductionFailureSignature;

    // 4. Compare Steps
    const stepComparison = this.compareSteps(input.originalSteps, input.reproductionSteps);

    // Find original failed step index
    const origFailedStep = input.originalSteps.find(s => s.status === 'FAILED');
    const reproFailedStep = input.reproductionSteps.find(s => s.status === 'FAILED');

    const origFailedIdx = origFailedStep?.stepIndex ?? null;
    const reproFailedIdx = reproFailedStep?.stepIndex ?? null;

    const isFailedStepMatch =
      origFailedIdx !== null &&
      reproFailedIdx !== null &&
      origFailedIdx === reproFailedIdx &&
      origFailedStep?.actionType?.toUpperCase() === reproFailedStep?.actionType?.toUpperCase();

    // 5. Compare Assertions if present
    let assertionComparison: ReproductionAssertionComparisonDto | null = null;
    if (input.originalAssertion || input.reproductionAssertion) {
      assertionComparison = this.compareAssertions(
        input.originalAssertion,
        input.reproductionAssertion,
      );
    }

    // 6. Determine Reproduction Outcome
    let status: FailureReproductionOutcome = 'INCONCLUSIVE';

    if (input.reproductionStatus === 'AUTOMATION_ERROR') {
      status = 'EXECUTION_ERROR';
    } else if (isSignatureMatch && isFailedStepMatch) {
      status = 'REPRODUCED';
    } else if (isSignatureMatch) {
      status = 'REPRODUCED';
    } else if (isFailedStepMatch && assertionComparison?.isMatch) {
      status = 'REPRODUCED';
    } else if (
      origFailedIdx !== null &&
      reproFailedIdx !== null &&
      origFailedIdx !== reproFailedIdx
    ) {
      // Failed at a completely different step
      status = 'INCONCLUSIVE';
    } else {
      status = 'INCONCLUSIVE';
    }

    return {
      status,
      isSignatureMatch,
      failedStepIndex: reproFailedIdx,
      isFailedStepMatch,
      stepComparison,
      assertionComparison,
    };
  }

  public compareSteps(
    originalSteps: ExecutionComparisonInput['originalSteps'],
    reproductionSteps: ExecutionComparisonInput['reproductionSteps'],
  ): ReproductionStepComparisonDto[] {
    const comparisons: ReproductionStepComparisonDto[] = [];
    const maxLen = Math.max(originalSteps.length, reproductionSteps.length);

    for (let i = 0; i < maxLen; i++) {
      const orig = originalSteps[i];
      const repro = reproductionSteps[i];

      const stepIndex = orig?.stepIndex ?? repro?.stepIndex ?? i;
      const actionType = orig?.actionType ?? repro?.actionType ?? 'UNKNOWN';
      const targetSummary = orig?.targetSummary ?? repro?.targetSummary ?? null;

      const isMatch =
        Boolean(orig) &&
        Boolean(repro) &&
        orig?.actionType?.toUpperCase() === repro?.actionType?.toUpperCase() &&
        orig?.status === repro?.status;

      comparisons.push({
        stepIndex,
        actionType,
        targetSummary,
        isMatch,
        originalStatus: orig?.status ?? 'NOT_RUN',
        reproductionStatus: repro?.status ?? 'NOT_RUN',
        originalDurationMs: orig?.durationMs ?? null,
        reproductionDurationMs: repro?.durationMs ?? null,
        originalErrorMessage: orig?.errorMessage ?? null,
        reproductionErrorMessage: repro?.errorMessage ?? null,
      });
    }

    return comparisons;
  }

  public compareAssertions(
    original: ExecutionComparisonInput['originalAssertion'],
    reproduction: ExecutionComparisonInput['reproductionAssertion'],
  ): ReproductionAssertionComparisonDto {
    if (!original && !reproduction) {
      return {
        assertionType: null,
        operator: null,
        isMatch: true,
        diffSummary: null,
      };
    }

    if (!original || !reproduction) {
      return {
        assertionType: original?.assertionType ?? reproduction?.assertionType ?? null,
        operator: original?.operator ?? reproduction?.operator ?? null,
        isMatch: false,
        originalExpected: original?.expectedValue,
        originalActual: original?.actualValue,
        reproductionExpected: reproduction?.expectedValue,
        reproductionActual: reproduction?.actualValue,
        diffSummary: original
          ? 'Assertion occurred in original but was absent in reproduction.'
          : 'Assertion occurred in reproduction but was absent in original.',
      };
    }

    const typeMatch = original.assertionType === reproduction.assertionType;
    const opMatch = original.operator === reproduction.operator;
    const expMatch =
      JSON.stringify(original.expectedValue) === JSON.stringify(reproduction.expectedValue);
    const actMatch =
      JSON.stringify(original.actualValue) === JSON.stringify(reproduction.actualValue);

    const isMatch = typeMatch && opMatch && expMatch && actMatch;

    let diffSummary: string | null = null;
    if (!isMatch) {
      const diffParts: string[] = [];
      if (!typeMatch) {
        diffParts.push(
          `Type differed ('${original.assertionType}' vs '${reproduction.assertionType}')`,
        );
      }
      if (!opMatch) {
        diffParts.push(`Operator differed ('${original.operator}' vs '${reproduction.operator}')`);
      }
      if (!expMatch) {
        diffParts.push('Expected value differed');
      }
      if (!actMatch) {
        diffParts.push('Actual value mismatch');
      }
      diffSummary = diffParts.join(', ');
    }

    return {
      assertionType: original.assertionType ?? reproduction.assertionType ?? null,
      operator: original.operator ?? reproduction.operator ?? null,
      isMatch,
      originalExpected: original.expectedValue,
      originalActual: original.actualValue,
      reproductionExpected: reproduction.expectedValue,
      reproductionActual: reproduction.actualValue,
      diffSummary,
    };
  }
}
