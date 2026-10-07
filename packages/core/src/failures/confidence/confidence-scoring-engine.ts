/**
 * @file packages/core/src/failures/confidence/confidence-scoring-engine.ts
 * Multi-domain component-based confidence scoring engine with AI calibration and contradiction penalization.
 */

import type { ConfidenceBand, ConfidenceComponentScoreDto } from '@ai-quality/contracts';
import {
  CONFIDENCE_BOUNDS,
  type ConfidenceEvaluationFacts,
  type ConfidenceScoringResult,
} from './confidence-types.js';
import type { AttributionDraft } from './evidence-attribution-engine.js';

export class ConfidenceScoringEngine {
  /**
   * Computes multi-domain confidence scores, component breakdowns, supporting factors,
   * penalties, contradictions, and determines the semantic confidence band.
   */
  public computeConfidence(
    facts: ConfidenceEvaluationFacts,
    attributions: readonly AttributionDraft[],
  ): ConfidenceScoringResult {
    const supportingFactors: string[] = [];
    const penalties: string[] = [];
    const missingFactors: string[] = [];
    const contradictions: string[] = [];
    const deterministicFacts: string[] = [];
    const aiInferences: string[] = [];

    // Catalog epistemic attributions
    for (const attr of attributions) {
      if (attr.epistemicType === 'FACT') {
        deterministicFacts.push(attr.reason);
      } else if (attr.epistemicType === 'AI_INFERENCE') {
        aiInferences.push(attr.reason);
      }

      if (attr.relationship === 'CONTRADICTS') {
        contradictions.push(attr.reason);
      } else if (attr.relationship === 'MISSING') {
        missingFactors.push(attr.reason);
      } else if (
        attr.relationship === 'SUPPORTS' &&
        (attr.supportStrength === 'DECISIVE' || attr.supportStrength === 'STRONG')
      ) {
        supportingFactors.push(attr.reason);
      }
    }

    // 1. Component Breakdown Evaluations
    const componentBreakdown: ConfidenceComponentScoreDto[] = [];

    // A. Evidence Integrity
    const integrityScore = this.evaluateEvidenceIntegrity(facts, attributions);
    componentBreakdown.push(integrityScore);

    // B. Evidence Completeness
    const completenessScore = this.evaluateEvidenceCompleteness(facts, attributions);
    componentBreakdown.push(completenessScore);

    // C. Reproduction Strength
    const reproScore = this.evaluateReproductionStrength(facts, attributions);
    componentBreakdown.push(reproScore);

    // D. Classification Consistency
    const classConsistencyScore = this.evaluateClassificationConsistency(facts, attributions);
    componentBreakdown.push(classConsistencyScore);

    // E. Root Cause Evidence Support
    const rcSupportScore = this.evaluateRootCauseEvidenceSupport(facts, attributions);
    componentBreakdown.push(rcSupportScore);

    // F. Domain Separation Strength
    const domainScore = this.evaluateDomainSeparationStrength(facts, attributions);
    componentBreakdown.push(domainScore);

    // G. Contradiction Penalties
    const contradictionScore = this.evaluateContradictionComponent(attributions);
    componentBreakdown.push(contradictionScore);

    // 2. Domain Confidences
    // 2a. Classification Confidence
    let classificationConfidence: number | null = null;
    if (facts.deterministicCategory || facts.aiCategory) {
      let baseClass = 0.5;
      if (facts.deterministicCategory) {
        baseClass = Math.max(baseClass, facts.deterministicConfidence ?? 0.85);
      }
      if (facts.aiCategory && facts.aiCalibratedConfidence !== null) {
        if (facts.deterministicCategory && facts.aiCategory === facts.deterministicCategory) {
          baseClass = Math.min(1.0, baseClass + 0.1);
        } else if (
          facts.deterministicCategory &&
          facts.aiCategory !== facts.deterministicCategory
        ) {
          baseClass = Math.max(0.1, baseClass - 0.25);
          penalties.push('AI classification diverges from deterministic rule match (-0.25)');
        } else {
          // AI only
          baseClass = facts.aiCalibratedConfidence;
        }
      }
      if (!facts.decisionIntegrityPassed) {
        baseClass = Math.max(0.1, baseClass * 0.4);
        penalties.push(
          'Decision integrity failure severely discounts classification confidence (*0.4)',
        );
      }
      classificationConfidence = Number(this.clamp(baseClass).toFixed(4));
    }

    // 2b. Reproducibility Confidence
    let reproducibilityConfidence: number | null = null;
    if (facts.reproductionAttempts > 0) {
      let reproConf = facts.isReproduced ? 0.95 : 0.2;
      if (facts.isFlaky) {
        reproConf = Math.min(reproConf, 0.35);
        penalties.push('Flakiness observed: failure does not reproduce deterministically');
      }
      reproducibilityConfidence = Number(this.clamp(reproConf).toFixed(4));
    } else {
      reproducibilityConfidence = null; // UNKNOWN
    }

    // 2c. Root Cause Confidence
    let rootCauseConfidence: number | null = null;
    if (facts.rootCauseStatus && facts.rootCauseStatus !== 'UNANALYZED') {
      let rcConf = 0.4;
      if (facts.localizedFilePath) {
        if (facts.localizedFileExistsInRepo) {
          rcConf += 0.35;
        } else {
          rcConf -= 0.2;
          penalties.push('Localized file path not found in repository (-0.20)');
        }
      }
      if (facts.probableLayer && facts.probableComponent) {
        rcConf += 0.2;
      }
      if (facts.verifiedRepositoryReferences.length > 0) {
        rcConf += 0.1;
      }
      rootCauseConfidence = Number(this.clamp(rcConf).toFixed(4));
    } else {
      rootCauseConfidence = null; // UNKNOWN
    }

    // 2d. Severity Confidence
    let severityConfidence: number | null = null;
    if (facts.severity) {
      const dimRatio = Math.min(1.0, facts.impactDimensions.length / 3);
      severityConfidence = Number(this.clamp(0.6 + 0.4 * dimRatio).toFixed(4));
    }

    // 2e. Duplicate / Cluster Confidence
    let duplicateConfidence: number | null = null;
    if (facts.clusterId) {
      duplicateConfidence = Number(this.clamp(facts.clusterSimilarityScore ?? 0.75).toFixed(4));
    } // null if NOT_APPLICABLE

    // 3. Overall Confidence Calculation
    // Weighted combination of available domain confidences
    const domainWeights = CONFIDENCE_BOUNDS.DEFAULT_DOMAIN_WEIGHTS;
    let weightedSum = 0;
    let totalWeight = 0;

    if (classificationConfidence !== null) {
      weightedSum += classificationConfidence * domainWeights.classification;
      totalWeight += domainWeights.classification;
    }
    if (rootCauseConfidence !== null) {
      weightedSum += rootCauseConfidence * domainWeights.rootCause;
      totalWeight += domainWeights.rootCause;
    }
    if (reproducibilityConfidence !== null) {
      weightedSum += reproducibilityConfidence * domainWeights.reproducibility;
      totalWeight += domainWeights.reproducibility;
    }
    if (severityConfidence !== null) {
      weightedSum += severityConfidence * domainWeights.severity;
      totalWeight += domainWeights.severity;
    }
    if (duplicateConfidence !== null) {
      weightedSum += duplicateConfidence * domainWeights.duplicate;
      totalWeight += domainWeights.duplicate;
    }

    let overall = totalWeight > 0 ? weightedSum / totalWeight : 0.1;

    // Apply global contradiction penalties
    const severeContradictions = attributions.filter(
      a =>
        a.relationship === 'CONTRADICTS' &&
        (a.supportStrength === 'DECISIVE' || a.supportStrength === 'STRONG'),
    ).length;
    if (severeContradictions > 0) {
      const penaltyDeduction =
        severeContradictions * CONFIDENCE_BOUNDS.CONTRADICTION_PENALTY_SEVERE;
      overall -= penaltyDeduction;
      penalties.push(
        `Severe contradictions (${severeContradictions}) deducted ${penaltyDeduction.toFixed(2)} from overall score`,
      );
    }

    // Apply missing mandatory factor penalties
    const missingArtifacts = attributions.filter(a => a.relationship === 'MISSING').length;
    if (missingArtifacts > 0) {
      const missingPenalty = missingArtifacts * CONFIDENCE_BOUNDS.MISSING_MANDATORY_FACTOR_PENALTY;
      overall -= missingPenalty;
      penalties.push(
        `Missing mandatory evidence factors (${missingArtifacts}) deducted ${missingPenalty.toFixed(2)}`,
      );
    }

    overall = this.clamp(overall);
    const overallRounded = Number(overall.toFixed(4));
    const confidenceBand = this.resolveBand(overallRounded);

    return {
      overallConfidence: overallRounded,
      confidenceBand,
      classificationConfidence,
      reproducibilityConfidence,
      rootCauseConfidence,
      severityConfidence,
      duplicateConfidence,
      componentBreakdown,
      supportingFactors: Array.from(new Set(supportingFactors)),
      penalties: Array.from(new Set(penalties)),
      missingFactors: Array.from(new Set(missingFactors)),
      contradictions: Array.from(new Set(contradictions)),
      deterministicFacts: Array.from(new Set(deterministicFacts)),
      aiInferences: Array.from(new Set(aiInferences)),
    };
  }

  /**
   * Evaluates evidence cryptographic integrity.
   */
  private evaluateEvidenceIntegrity(
    facts: ConfidenceEvaluationFacts,
    attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    const isTampered = facts.evidenceIntegrityStatus === 'TAMPERED';
    const isVerified = facts.evidenceIntegrityStatus === 'VERIFIED';
    const score = isTampered ? 0.0 : isVerified ? 1.0 : 0.7;

    return {
      component: 'EVIDENCE_INTEGRITY',
      score: Number(score.toFixed(4)),
      weight: 0.15,
      applicable: true,
      description: isTampered
        ? 'Evidence integrity validation failed: checksum mismatch or tampering detected.'
        : isVerified
          ? 'Evidence cryptographic integrity verified against SHA-256 digests.'
          : 'Evidence integrity is unverified or awaiting validation.',
      supportingCount: attributions.filter(
        a => a.sourceSubsystem === 'PHASE_75_EVIDENCE' && a.relationship === 'SUPPORTS',
      ).length,
      contradictingCount: isTampered ? 1 : 0,
      missingCount: 0,
    };
  }

  /**
   * Evaluates evidence artifact completeness across core telemetry types.
   */
  private evaluateEvidenceCompleteness(
    facts: ConfidenceEvaluationFacts,
    _attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    let presentTypes = 0;
    const totalTypes = 4; // screenshot, dom, console, network

    if (facts.hasScreenshot) presentTypes++;
    if (facts.hasDomSnapshot) presentTypes++;
    if (facts.hasConsoleLogs) presentTypes++;
    if (facts.hasNetworkTrace) presentTypes++;

    const score = presentTypes / totalTypes;
    const missingCount = totalTypes - presentTypes;

    return {
      component: 'EVIDENCE_COMPLETENESS',
      score: Number(score.toFixed(4)),
      weight: 0.15,
      applicable: true,
      description: `${presentTypes} of ${totalTypes} standard evidence types captured (screenshot, DOM, console, network).`,
      supportingCount: presentTypes,
      contradictingCount: 0,
      missingCount,
    };
  }

  /**
   * Evaluates reproduction strength and deterministic repeatability.
   */
  private evaluateReproductionStrength(
    facts: ConfidenceEvaluationFacts,
    _attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    if (facts.reproductionAttempts === 0) {
      return {
        component: 'REPRODUCTION_STRENGTH',
        score: 0.0,
        weight: 0.2,
        applicable: true,
        description: 'Reproduction has not been attempted for this failure case.',
        supportingCount: 0,
        contradictingCount: 0,
        missingCount: 1,
      };
    }

    let score = facts.isReproduced ? 1.0 : 0.2;
    if (facts.isFlaky) {
      score = Math.min(score, 0.4);
    }

    return {
      component: 'REPRODUCTION_STRENGTH',
      score: Number(score.toFixed(4)),
      weight: 0.2,
      applicable: true,
      description: facts.isReproduced
        ? `Deterministic reproduction confirmed (${facts.reproductionSuccessCount}/${facts.reproductionAttempts}).`
        : `Reproduction failed (${facts.reproductionSuccessCount}/${facts.reproductionAttempts} attempts succeeded).`,
      supportingCount: facts.isReproduced ? 1 : 0,
      contradictingCount: facts.isReproduced ? 0 : 1,
      missingCount: 0,
    };
  }

  /**
   * Evaluates consistency between deterministic rules and AI inferences.
   */
  private evaluateClassificationConsistency(
    facts: ConfidenceEvaluationFacts,
    _attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    let score = 0.5;
    let desc = 'Classification pending.';
    let contradictingCount = 0;

    if (facts.deterministicCategory && facts.aiCategory) {
      if (facts.deterministicCategory === facts.aiCategory) {
        score = 1.0;
        desc = `Deterministic rule and AI reasoning consistently classify as '${facts.deterministicCategory}'.`;
      } else {
        score = 0.3;
        contradictingCount = 1;
        desc = `Conflict: deterministic rule indicates '${facts.deterministicCategory}' while AI model inferred '${facts.aiCategory}'.`;
      }
    } else if (facts.deterministicCategory) {
      score = 0.85;
      desc = `Deterministic classification: '${facts.deterministicCategory}' without conflicting AI inference.`;
    } else if (facts.aiCategory) {
      score = facts.aiCalibratedConfidence ?? 0.6;
      desc = `AI classification: '${facts.aiCategory}' (calibrated confidence: ${score.toFixed(2)}).`;
    }

    return {
      component: 'CLASSIFICATION_CONSISTENCY',
      score: Number(score.toFixed(4)),
      weight: 0.2,
      applicable: true,
      description: desc,
      supportingCount: score >= 0.7 ? 1 : 0,
      contradictingCount,
      missingCount: !facts.deterministicCategory && !facts.aiCategory ? 1 : 0,
    };
  }

  /**
   * Evaluates factual support for localized root cause.
   */
  private evaluateRootCauseEvidenceSupport(
    facts: ConfidenceEvaluationFacts,
    _attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    if (!facts.rootCauseStatus || facts.rootCauseStatus === 'UNANALYZED') {
      return {
        component: 'ROOT_CAUSE_EVIDENCE_SUPPORT',
        score: 0.0,
        weight: 0.15,
        applicable: false,
        description: 'Root cause analysis has not been performed.',
        supportingCount: 0,
        contradictingCount: 0,
        missingCount: 1,
      };
    }

    let score = 0.3;
    if (facts.localizedFilePath && facts.localizedFileExistsInRepo) {
      score += 0.4;
    }
    if (facts.probableLayer && facts.probableComponent) {
      score += 0.2;
    }
    if (facts.verifiedRepositoryReferences.length > 0) {
      score += 0.1;
    }

    return {
      component: 'ROOT_CAUSE_EVIDENCE_SUPPORT',
      score: Number(this.clamp(score).toFixed(4)),
      weight: 0.15,
      applicable: true,
      description: facts.localizedFileExistsInRepo
        ? `Root cause grounded in repository file '${facts.localizedFilePath}' (${facts.probableLayer ?? 'Layer N/A'}).`
        : 'Root cause reference could not be grounded in verified repository files.',
      supportingCount: facts.localizedFileExistsInRepo ? 1 : 0,
      contradictingCount: facts.localizedFilePath && !facts.localizedFileExistsInRepo ? 1 : 0,
      missingCount: !facts.localizedFilePath ? 1 : 0,
    };
  }

  /**
   * Evaluates domain separation certainty.
   */
  private evaluateDomainSeparationStrength(
    facts: ConfidenceEvaluationFacts,
    _attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    const hasDomain = Boolean(facts.failureDomain);
    const score = hasDomain ? (facts.domainConfidence ?? 0.8) : 0.2;

    return {
      component: 'DOMAIN_SEPARATION_STRENGTH',
      score: Number(score.toFixed(4)),
      weight: 0.1,
      applicable: hasDomain,
      description: hasDomain
        ? `Domain separated as '${facts.failureDomain}' (confidence ${(score * 100).toFixed(0)}%).`
        : 'Domain separation has not been completed.',
      supportingCount: hasDomain ? 1 : 0,
      contradictingCount: 0,
      missingCount: hasDomain ? 0 : 1,
    };
  }

  /**
   * Evaluates contradiction penalty component.
   */
  private evaluateContradictionComponent(
    attributions: readonly AttributionDraft[],
  ): ConfidenceComponentScoreDto {
    const contradictory = attributions.filter(a => a.relationship === 'CONTRADICTS');
    const penalty = contradictory.length * 0.25;
    const score = Math.max(0.0, 1.0 - penalty);

    return {
      component: 'CONTRADICTION_PENALTIES',
      score: Number(score.toFixed(4)),
      weight: 0.05,
      applicable: true,
      description:
        contradictory.length === 0
          ? 'No contradictory evidence detected.'
          : `${contradictory.length} contradictory evidence items detected.`,
      supportingCount: contradictory.length === 0 ? 1 : 0,
      contradictingCount: contradictory.length,
      missingCount: 0,
    };
  }

  /**
   * Resolves the semantic confidence band from an overall score in [0, 1].
   */
  private resolveBand(score: number): ConfidenceBand {
    if (score >= CONFIDENCE_BOUNDS.BANDS.VERY_HIGH.min) return 'VERY_HIGH';
    if (score >= CONFIDENCE_BOUNDS.BANDS.HIGH.min) return 'HIGH';
    if (score >= CONFIDENCE_BOUNDS.BANDS.MEDIUM.min) return 'MEDIUM';
    if (score >= CONFIDENCE_BOUNDS.BANDS.LOW.min) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Clamps numeric value between 0.0 and 1.0.
   */
  private clamp(val: number): number {
    return Math.max(0.0, Math.min(1.0, val));
  }
}
