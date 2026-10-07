/**
 * @file packages/core/src/failures/clustering/failure-duplicate-comparator.ts
 * Pairwise failure duplicate comparison engine for V6 Phase 85.
 *
 * Implements:
 * - Strong, Weak, and Contradictory evidence signals
 * - Generic error string false-merge protection
 * - Same page / same severity false-merge protection
 * - Domain separation conflict protection
 * - Output states: EXACT_DUPLICATE, PROBABLE_DUPLICATE, RELATED_FAILURE,
 *   DISTINCT_FAILURE, INCONCLUSIVE, INSUFFICIENT_EVIDENCE
 */

import {
  CLUSTERING_BOUNDS,
  type FailureComparisonFacts,
  type DuplicateComparisonEvaluation,
} from './clustering-types.js';
import type { MatchedSignalItemDto, ContradictorySignalItemDto } from '@ai-quality/contracts';

const GENERIC_ERROR_PATTERNS = [
  /^500\b/i,
  /^internal server error/i,
  /^something went wrong/i,
  /^timeout \d+ms exceeded/i,
  /^timed? ?out/i,
  /^element not found/i,
  /^failed to fetch/i,
  /^network request failed/i,
  /^assertion failed/i,
  /^page crashed/i,
  /^an unexpected error occurred/i,
  /^server error/i,
];

export class FailureDuplicateComparator {
  /**
   * Compares two project-scoped failures and evaluates their duplicate relationship.
   */
  public compare(
    a: FailureComparisonFacts,
    b: FailureComparisonFacts,
  ): DuplicateComparisonEvaluation {
    // 1. Check for insufficient evidence
    if (this.isInsufficientEvidence(a) || this.isInsufficientEvidence(b)) {
      return {
        relationshipType: 'INSUFFICIENT_EVIDENCE',
        relationshipStrength: 'UNKNOWN',
        similarityScore: 0.0,
        matchedSignals: [],
        contradictorySignals: [
          {
            signal: 'INSUFFICIENT_EVIDENCE',
            description:
              'One or both failure cases lack diagnostic telemetry, error messages, or classification facts.',
            severity: 'CRITICAL',
          },
        ],
        explanation:
          'Cannot determine defect relationship because one or both failure cases contain insufficient diagnostic telemetry.',
      };
    }

    const matchedSignals: MatchedSignalItemDto[] = [];
    const contradictorySignals: ContradictorySignalItemDto[] = [];

    // 2. Evaluate Contradictory Signals FIRST (Negative weights / Blockers)
    let domainMismatch = false;
    if (a.failureDomain && b.failureDomain && a.failureDomain !== b.failureDomain) {
      domainMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_FAILURE_DOMAINS',
        description: `Failure domains conflict: "${a.failureDomain}" vs "${b.failureDomain}".`,
        severity: 'CRITICAL',
      });
    }

    let rootCauseLayerMismatch = false;
    if (
      a.probableLayer &&
      b.probableLayer &&
      a.probableLayer !== 'UNKNOWN' &&
      b.probableLayer !== 'MULTI_LAYER' &&
      a.probableLayer !== b.probableLayer
    ) {
      rootCauseLayerMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_ROOT_CAUSE_LAYERS',
        description: `Root-cause layers differ: "${a.probableLayer}" vs "${b.probableLayer}".`,
        severity: 'HIGH',
      });
    }

    let sourceFileMismatch = false;
    if (a.localizedFilePath && b.localizedFilePath && a.localizedFilePath !== b.localizedFilePath) {
      sourceFileMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_SOURCE_FILES',
        description: `Source localization points to distinct files: "${a.localizedFilePath}" vs "${b.localizedFilePath}".`,
        severity: 'HIGH',
      });
    }

    let endpointMismatch = false;
    if (
      a.failingHttpEndpoint &&
      b.failingHttpEndpoint &&
      a.failingHttpEndpoint !== b.failingHttpEndpoint
    ) {
      endpointMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_ENDPOINTS',
        description: `Failed HTTP endpoints differ: "${a.failingHttpEndpoint}" vs "${b.failingHttpEndpoint}".`,
        severity: 'MEDIUM',
      });
    }

    let statusMismatch = false;
    if (
      a.failingHttpEndpoint &&
      b.failingHttpEndpoint &&
      a.failingHttpEndpoint === b.failingHttpEndpoint &&
      a.failingHttpStatus &&
      b.failingHttpStatus &&
      a.failingHttpStatus !== b.failingHttpStatus
    ) {
      statusMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_HTTP_STATUSES',
        description: `Same endpoint returned different HTTP statuses: ${a.failingHttpStatus} vs ${b.failingHttpStatus}.`,
        severity: 'MEDIUM',
      });
    }

    let stepMismatch = false;
    if (
      a.stepAction &&
      b.stepAction &&
      (a.stepAction !== b.stepAction ||
        (a.stepTarget && b.stepTarget && a.stepTarget !== b.stepTarget))
    ) {
      stepMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_FAILED_STEPS',
        description: `Failed test steps differ: "${a.stepAction}:${a.stepTarget}" vs "${b.stepAction}:${b.stepTarget}".`,
        severity: 'LOW',
      });
    }

    let reproductionMismatch = false;
    if (
      a.isReproduced &&
      b.isReproduced &&
      a.reproductionSignature &&
      b.reproductionSignature &&
      a.reproductionSignature !== b.reproductionSignature
    ) {
      reproductionMismatch = true;
      contradictorySignals.push({
        signal: 'DIFFERENT_REPRODUCED_BEHAVIORS',
        description:
          'Both failures were reproduced in controlled environment, but produced different signatures.',
        severity: 'HIGH',
      });
    }

    // Critical Blocker: Different failure domains (e.g. Application Defect vs Automation Script failure)
    if (domainMismatch) {
      return {
        relationshipType: 'DISTINCT_FAILURE',
        relationshipStrength: 'WEAK',
        similarityScore: 0.05,
        matchedSignals,
        contradictorySignals,
        explanation: `Failures belong to fundamentally different domains (${a.failureDomain} vs ${b.failureDomain}) and represent independent issues.`,
      };
    }

    // 3. Evaluate Strong Signals
    let strongSignalScore = 0.0;
    let hasStrongSignal = false;

    // A. Normalized failure signature match
    if (a.failureSignature && b.failureSignature && a.failureSignature === b.failureSignature) {
      matchedSignals.push({
        signal: 'SAME_NORMALIZED_SIGNATURE',
        description: `Identical normalized failure signature: ${a.failureSignature}`,
        weight: 0.4,
      });
      strongSignalScore += 0.4;
      hasStrongSignal = true;
    }

    // B. Controlled reproduction signature match
    if (
      a.isReproduced &&
      b.isReproduced &&
      a.reproductionSignature &&
      b.reproductionSignature &&
      a.reproductionSignature === b.reproductionSignature
    ) {
      matchedSignals.push({
        signal: 'SAME_REPRODUCED_SIGNATURE',
        description: `Identical reproduced failure signature: ${a.reproductionSignature}`,
        weight: 0.35,
      });
      strongSignalScore += 0.35;
      hasStrongSignal = true;
    }

    // C. Same failing endpoint + HTTP status
    if (
      a.failingHttpEndpoint &&
      b.failingHttpEndpoint &&
      a.failingHttpEndpoint === b.failingHttpEndpoint &&
      a.failingHttpStatus &&
      b.failingHttpStatus &&
      a.failingHttpStatus === b.failingHttpStatus
    ) {
      matchedSignals.push({
        signal: 'SAME_ENDPOINT_AND_STATUS',
        description: `Failing HTTP request matched: ${a.failingHttpStatus} ${a.failingHttpEndpoint}`,
        weight: 0.3,
      });
      strongSignalScore += 0.3;
      hasStrongSignal = true;
    }

    // D. Same verified localized source file and symbol
    if (a.localizedFilePath && b.localizedFilePath && a.localizedFilePath === b.localizedFilePath) {
      const sameSymbol =
        a.localizedSymbol && b.localizedSymbol && a.localizedSymbol === b.localizedSymbol;
      const weight = sameSymbol ? 0.35 : 0.2;
      matchedSignals.push({
        signal: sameSymbol ? 'SAME_LOCALIZED_SOURCE_AND_SYMBOL' : 'SAME_LOCALIZED_SOURCE_FILE',
        description: sameSymbol
          ? `Localized to exact same function: ${a.localizedFilePath}#${a.localizedSymbol}`
          : `Localized to same source file: ${a.localizedFilePath}`,
        weight,
      });
      strongSignalScore += weight;
      hasStrongSignal = true;
    }

    // E. Same root-cause layer and probable component
    if (
      a.probableLayer &&
      b.probableLayer &&
      a.probableLayer === b.probableLayer &&
      a.probableLayer !== 'UNKNOWN'
    ) {
      const sameComponent =
        a.probableComponent &&
        b.probableComponent &&
        a.probableComponent.toLowerCase() === b.probableComponent.toLowerCase();
      if (sameComponent) {
        matchedSignals.push({
          signal: 'SAME_ROOT_CAUSE_LAYER_AND_COMPONENT',
          description: `Root-cause analysis pinpointed same layer (${a.probableLayer}) and component (${a.probableComponent})`,
          weight: 0.25,
        });
        strongSignalScore += 0.25;
        hasStrongSignal = true;
      }
    }

    // F. Same failed test step semantics
    if (
      a.stepAction &&
      b.stepAction &&
      a.stepAction === b.stepAction &&
      a.stepTarget &&
      b.stepTarget &&
      a.stepTarget === b.stepTarget
    ) {
      matchedSignals.push({
        signal: 'SAME_FAILED_STEP_ACTION',
        description: `Failed on identical step action: ${a.stepAction} on ${a.stepTarget}`,
        weight: 0.25,
      });
      strongSignalScore += 0.25;
      hasStrongSignal = true;
    }

    // 4. Evaluate Weak Signals (Never sufficient alone)
    let weakSignalScore = 0.0;

    // Requirement linkage
    if (a.requirementId && b.requirementId && a.requirementId === b.requirementId) {
      matchedSignals.push({
        signal: 'SAME_REQUIREMENT',
        description: `Linked to same source requirement (${a.requirementKey || a.requirementId})`,
        weight: 0.05,
      });
      weakSignalScore += 0.05;
    }

    // Test case provenance
    if (a.testCaseId === b.testCaseId) {
      matchedSignals.push({
        signal: 'SAME_TEST_CASE',
        description: `Originated from same test case (${a.testCaseTitle})`,
        weight: 0.05,
      });
      weakSignalScore += 0.05;
    }

    // Environment equivalence
    if (a.environmentId && b.environmentId && a.environmentId === b.environmentId) {
      matchedSignals.push({
        signal: 'SAME_ENVIRONMENT',
        description: `Executed against same target environment (${a.environmentName || a.environmentId})`,
        weight: 0.03,
      });
      weakSignalScore += 0.03;
    }

    // Severity match
    if (a.severity && b.severity && a.severity === b.severity) {
      matchedSignals.push({
        signal: 'SAME_SEVERITY',
        description: `Both evaluated with severity ${a.severity}`,
        weight: 0.02,
      });
      weakSignalScore += 0.02;
    }

    // Error message similarity
    const errorIsGeneric =
      this.isGenericError(a.errorMessage) || this.isGenericError(b.errorMessage);
    if (
      a.errorMessage &&
      b.errorMessage &&
      this.normalizeText(a.errorMessage) === this.normalizeText(b.errorMessage)
    ) {
      if (errorIsGeneric) {
        matchedSignals.push({
          signal: 'SAME_GENERIC_ERROR_MESSAGE',
          description: `Shared generic error message: "${a.errorMessage.slice(0, 80)}"`,
          weight: 0.02,
        });
        weakSignalScore += 0.02;
      } else {
        matchedSignals.push({
          signal: 'SAME_SPECIFIC_ERROR_MESSAGE',
          description: `Identical non-generic error message: "${a.errorMessage.slice(0, 100)}"`,
          weight: 0.15,
        });
        weakSignalScore += 0.15;
      }
    }

    // Cap weak signal contributions so weak signals alone can NEVER exceed 0.20
    weakSignalScore = Math.min(weakSignalScore, 0.2);

    // 5. Calculate Contradiction Penalties
    let contradictionPenalty = 0.0;
    if (rootCauseLayerMismatch) contradictionPenalty += 0.5;
    if (sourceFileMismatch) contradictionPenalty += 0.45;
    if (reproductionMismatch) contradictionPenalty += 0.4;
    if (endpointMismatch) contradictionPenalty += 0.35;
    if (statusMismatch) contradictionPenalty += 0.3;
    if (stepMismatch && !hasStrongSignal) contradictionPenalty += 0.2;

    // 6. Compute Raw Similarity Score
    let rawScore = strongSignalScore + weakSignalScore - contradictionPenalty;
    rawScore = Math.max(0.0, Math.min(1.0, rawScore));

    // Round to 3 decimal places
    const similarityScore = Math.round(rawScore * 1000) / 1000;

    // 7. INVARIANT GUARDS

    // Guard 1: Generic Error Message Protection
    // If NO strong signals matched, and only generic error message / same page / same severity matched:
    if (!hasStrongSignal) {
      const onlyGenericOrWeak = matchedSignals.every(
        s =>
          s.signal === 'SAME_GENERIC_ERROR_MESSAGE' ||
          s.signal === 'SAME_SEVERITY' ||
          s.signal === 'SAME_ENVIRONMENT' ||
          s.signal === 'SAME_REQUIREMENT',
      );
      if (onlyGenericOrWeak || similarityScore < CLUSTERING_BOUNDS.DISTINCT_FAILURE_CEILING) {
        return {
          relationshipType: 'DISTINCT_FAILURE',
          relationshipStrength: 'WEAK',
          similarityScore: Math.min(similarityScore, 0.25),
          matchedSignals,
          contradictorySignals,
          explanation:
            'Failures share generic error text, severity, or requirement context, but lack concrete technical telemetry proving a shared defect. Classified as distinct.',
        };
      }
    }

    // Guard 2: Severe Contradictions override weak/moderate similarity
    if (contradictorySignals.length >= 2 || rootCauseLayerMismatch || sourceFileMismatch) {
      if (strongSignalScore < 0.6) {
        return {
          relationshipType: 'DISTINCT_FAILURE',
          relationshipStrength: 'WEAK',
          similarityScore: Math.min(similarityScore, 0.3),
          matchedSignals,
          contradictorySignals,
          explanation: `Contradictory technical evidence (${contradictorySignals.map(c => c.signal).join(', ')}) outweighs superficial similarities. Failures represent distinct defects.`,
        };
      }
    }

    // Guard 3: Inconclusive conflicting strong signals
    if (hasStrongSignal && (rootCauseLayerMismatch || reproductionMismatch)) {
      return {
        relationshipType: 'INCONCLUSIVE',
        relationshipStrength: 'UNKNOWN',
        similarityScore,
        matchedSignals,
        contradictorySignals,
        explanation:
          'Failures exhibit strong similarity in signatures or endpoints, but diverge sharply in root-cause layer or reproduced behavior. Relationship is inconclusive.',
      };
    }

    // 8. Determine Final Relationship Type & Strength
    if (
      similarityScore >= CLUSTERING_BOUNDS.EXACT_DUPLICATE_THRESHOLD &&
      contradictorySignals.length === 0
    ) {
      return {
        relationshipType: 'EXACT_DUPLICATE',
        relationshipStrength: 'EXACT',
        similarityScore,
        matchedSignals,
        contradictorySignals,
        explanation: `Exact duplicate: verified identical failure signature and technical telemetry across all pipeline stages (${matchedSignals.map(s => s.signal).join(', ')}).`,
      };
    }

    if (
      similarityScore >= CLUSTERING_BOUNDS.PROBABLE_DUPLICATE_THRESHOLD &&
      contradictorySignals.length <= 1
    ) {
      return {
        relationshipType: 'PROBABLE_DUPLICATE',
        relationshipStrength: 'STRONG',
        similarityScore,
        matchedSignals,
        contradictorySignals,
        explanation: `Probable duplicate: strong evidence alignment (${matchedSignals.map(s => s.signal).join(', ')}) indicates the same underlying application defect.`,
      };
    }

    if (similarityScore >= CLUSTERING_BOUNDS.RELATED_FAILURE_THRESHOLD) {
      return {
        relationshipType: 'RELATED_FAILURE',
        relationshipStrength: 'MODERATE',
        similarityScore,
        matchedSignals,
        contradictorySignals,
        explanation: `Related failure: shared technical component or layer (${matchedSignals.map(s => s.signal).join(', ')}), but distinct manifestation or execution path.`,
      };
    }

    return {
      relationshipType: 'DISTINCT_FAILURE',
      relationshipStrength: 'WEAK',
      similarityScore,
      matchedSignals,
      contradictorySignals,
      explanation:
        'Insufficient similarity and absence of shared technical root cause indicate independent defect origins.',
    };
  }

  private isInsufficientEvidence(f: FailureComparisonFacts): boolean {
    const hasEvidence =
      (f.evidenceFingerprints && f.evidenceFingerprints.length > 0) ||
      f.evidenceCompleteness === 'COMPLETE' ||
      f.evidenceCompleteness === 'PARTIAL';
    const hasError = Boolean(f.errorMessage || f.errorCode || f.failureSignature);
    const hasClassification = Boolean(f.failureDomain || f.failureCategory);

    return !hasEvidence && !hasError && !hasClassification;
  }

  private isGenericError(msg: string | null | undefined): boolean {
    if (!msg) return true;
    const trimmed = msg.trim();
    if (trimmed.length < 5) return true;
    return GENERIC_ERROR_PATTERNS.some(pattern => pattern.test(trimmed));
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '') // UUIDs
      .replace(/\b\d{10,13}\b/g, '') // timestamps
      .replace(/\s+/g, ' ')
      .trim();
  }
}
