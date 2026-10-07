/**
 * @file packages/core/src/failures/clustering/representative-failure-selector.ts
 * Deterministic representative failure selection engine for V6 Phase 85.
 *
 * Precedence Rules:
 * 1. Controlled reproduction success (isReproduced === true)
 * 2. Evidence completeness level (COMPLETE > PARTIAL > MINIMAL > NONE)
 * 3. Root-cause analysis presence (hasRootCause === true)
 * 4. Earliest occurrence timestamp (createdAt ascending)
 * 5. Deterministic tie-breaker: Lexicographical order of failureCaseId
 */

import type { FailureComparisonFacts } from './clustering-types.js';

export class RepresentativeFailureSelector {
  /**
   * Deterministically selects the single best representative failure from a set of cluster members.
   */
  public selectRepresentative(members: readonly FailureComparisonFacts[]): FailureComparisonFacts {
    if (members.length === 0) {
      throw new Error('Cannot select representative from an empty member list.');
    }
    if (members.length === 1) {
      return members[0]!;
    }

    const sorted = [...members].sort((a, b) => {
      // Rule 1: Controlled reproduction success
      if (a.isReproduced !== b.isReproduced) {
        return a.isReproduced ? -1 : 1;
      }

      // Rule 2: Evidence completeness score
      const completenessScoreA = this.getCompletenessScore(a.evidenceCompleteness);
      const completenessScoreB = this.getCompletenessScore(b.evidenceCompleteness);
      if (completenessScoreA !== completenessScoreB) {
        return completenessScoreB - completenessScoreA; // descending
      }

      // Rule 3: Root-cause analysis presence
      const hasRootCauseA = Boolean(a.probableLayer && a.probableLayer !== 'UNKNOWN');
      const hasRootCauseB = Boolean(b.probableLayer && b.probableLayer !== 'UNKNOWN');
      if (hasRootCauseA !== hasRootCauseB) {
        return hasRootCauseA ? -1 : 1;
      }

      // Rule 4: Earliest created timestamp
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) {
        return timeA - timeB; // ascending (earliest first)
      }

      // Rule 5: Deterministic lexicographical tie-breaker
      return a.failureCaseId.localeCompare(b.failureCaseId);
    });

    return sorted[0]!;
  }

  private getCompletenessScore(completeness: string | null): number {
    switch (completeness) {
      case 'COMPLETE':
        return 3;
      case 'PARTIAL':
        return 2;
      case 'MINIMAL':
        return 1;
      default:
        return 0;
    }
  }
}
