/**
 * @file packages/core/src/failures/ai-reasoning/ai-confidence-calibrator.ts
 * Bounded explainable confidence calibration engine for AI failure classification (V6 Phase 82).
 */

import type { AiConfidenceLevel } from '@ai-quality/contracts';
import type {
  AiReasoningSanitizedContext,
  ConfidenceCalibrationFactors,
} from './ai-reasoning-types.js';

export interface CalibrationInputs {
  readonly rawScore: number;
  readonly context: AiReasoningSanitizedContext;
  readonly supportingCount: number;
  readonly contradictingCount: number;
}

export class AiConfidenceCalibrator {
  /**
   * Deterministically calibrates raw AI confidence against empirical evidence metrics.
   */
  public calibrate(inputs: CalibrationInputs): ConfidenceCalibrationFactors {
    const { rawScore, context, supportingCount, contradictingCount } = inputs;
    const basis: string[] = [];

    // 1. Evidence Completeness (0.0 to 1.0)
    let completenessSignals = 0;
    const totalCompletenessFactors = 6;

    if (context.executionDetails.errorMessage || context.sanitizedEvidence.stackTrace) {
      completenessSignals++;
    }
    if (
      context.sanitizedEvidence.consoleErrors.length > 0 ||
      context.sanitizedEvidence.networkFailures.length > 0
    ) {
      completenessSignals++;
    }
    if (context.sanitizedEvidence.domSnippet) {
      completenessSignals++;
    }
    if (context.deterministicClassification) {
      completenessSignals++;
    }
    if (context.domainSeparation) {
      completenessSignals++;
    }
    if (context.technicalLocalization) {
      completenessSignals++;
    }

    const evidenceCompleteness = Number(
      (completenessSignals / totalCompletenessFactors).toFixed(2),
    );
    basis.push(
      `Evidence completeness factor: ${(evidenceCompleteness * 100).toFixed(0)}% (${completenessSignals}/${totalCompletenessFactors} diagnostic sources present).`,
    );

    // 2. Reproduction Consistency (0.0 to 1.0)
    let reproductionConsistency = 0.5; // neutral default if no reproduction runs
    if (context.reproductionFacts) {
      const { isReproducible, reproductionRate, totalRuns } = context.reproductionFacts;
      if (totalRuns > 1) {
        if (isReproducible && reproductionRate >= 0.8) {
          reproductionConsistency = 0.95;
          basis.push(
            `Reproduction consistency: High (${(reproductionRate * 100).toFixed(0)}% failure across ${totalRuns} runs).`,
          );
        } else if (!isReproducible && reproductionRate <= 0.2) {
          reproductionConsistency = 0.3;
          basis.push(
            `Reproduction consistency: Low/Non-reproducible (${(reproductionRate * 100).toFixed(0)}% failure rate).`,
          );
        } else {
          reproductionConsistency = 0.5;
          basis.push(
            `Reproduction consistency: Intermittent/Flaky (${(reproductionRate * 100).toFixed(0)}% failure rate).`,
          );
        }
      } else {
        reproductionConsistency = 0.6;
        basis.push(
          'Reproduction consistency: Single execution run; reproducibility unverified across iterations.',
        );
      }
    } else {
      basis.push('Reproduction consistency: Baseline neutral (no multi-run reproduction record).');
    }

    // 3. Environment Equivalence (0.0 to 1.0)
    let environmentEquivalence = 0.85;
    if (context.executionDetails.browser && context.executionDetails.os) {
      environmentEquivalence = 0.95;
      basis.push(
        `Environment equivalence: Verified standard target environment (${context.executionDetails.browser} / ${context.executionDetails.os}).`,
      );
    } else {
      environmentEquivalence = 0.7;
      basis.push('Environment equivalence: Partial target environment details available.');
    }

    // 4. Contradictory Signals Penalty
    const contradictorySignalsCount = Math.max(0, contradictingCount);
    if (contradictorySignalsCount > 0) {
      basis.push(
        `Contradictory evidence signals detected: ${contradictorySignalsCount} penalty factor(s).`,
      );
    }

    // 5. Compute Weighted Calibrated Score
    const boundedRaw = Math.max(0, Math.min(1, rawScore));
    let calculatedScore =
      boundedRaw * 0.4 +
      evidenceCompleteness * 0.25 +
      reproductionConsistency * 0.2 +
      environmentEquivalence * 0.15 -
      contradictorySignalsCount * 0.1;

    // Boundary constraints:
    // A. If evidence completeness is very low (< 0.4), score cannot exceed 0.65 (cap at MEDIUM)
    if (evidenceCompleteness < 0.4) {
      if (calculatedScore > 0.65) {
        calculatedScore = 0.65;
      }
      basis.push('Confidence capped at MEDIUM due to low evidence completeness (< 40%).');
    }

    // B. If 2 or more contradictory signals exist, score cannot exceed 0.65
    if (contradictorySignalsCount >= 2) {
      if (calculatedScore > 0.65) {
        calculatedScore = 0.65;
      }
      basis.push('Confidence capped at MEDIUM due to multiple contradictory signals.');
    }

    // C. If supporting evidence is 0, score cannot exceed 0.35 (LOW)
    if (supportingCount === 0) {
      calculatedScore = Math.min(calculatedScore, 0.35);
      basis.push('Confidence capped at LOW due to lack of explicit supporting evidence.');
    }

    // Final bounding to [0.05, 0.98]
    const calibratedScore = Number(Math.max(0.05, Math.min(0.98, calculatedScore)).toFixed(2));

    // 6. Map to Calibrated Level
    const calibratedLevel = this.scoreToLevel(calibratedScore);
    basis.push(
      `Final calibrated confidence: ${calibratedLevel} (Score: ${calibratedScore.toFixed(2)}).`,
    );

    return {
      evidenceCompleteness,
      reproductionConsistency,
      environmentEquivalence,
      contradictorySignalsCount,
      rawConfidenceScore: Number(boundedRaw.toFixed(2)),
      calibratedScore,
      calibratedLevel,
      calibrationBasis: Object.freeze(basis),
    };
  }

  /**
   * Maps numerical score to discrete confidence tier.
   */
  public scoreToLevel(score: number): AiConfidenceLevel {
    if (score <= 0.2) return 'VERY_LOW';
    if (score <= 0.4) return 'LOW';
    if (score <= 0.7) return 'MEDIUM';
    if (score <= 0.89) return 'HIGH';
    return 'VERY_HIGH';
  }
}
