/**
 * @file packages/core/src/localization/ranking/candidate-ranker.ts
 * Deterministic evidence-backed candidate ranking and explanation generator for repository defect localization.
 */

import type {
  CandidateEvidenceItemDto,
  CandidateEvidenceSignalDto,
  RankedDefectCandidateDto,
} from '@ai-quality/contracts';
import {
  DEFECT_LOCALIZATION_BOUNDS,
  EVIDENCE_SIGNAL_WEIGHTS,
  type LocalizationContext,
} from '../defect-localization-types.js';
import type { ValidatedCandidateFact } from './candidate-validator.js';

export interface RankingResult {
  readonly rankedCandidates: readonly RankedDefectCandidateDto[];
  readonly topCandidate: RankedDefectCandidateDto | null;
  readonly candidateFiles: readonly string[];
  readonly supportingEvidence: readonly CandidateEvidenceItemDto[];
  readonly contradictingEvidence: readonly CandidateEvidenceItemDto[];
}

export class CandidateRanker {
  /**
   * Aggregates validated candidate facts, scores them with deterministic signal weights,
   * detects conflicting evidence, and produces ranked candidates with explanations.
   */
  public rank(
    facts: readonly ValidatedCandidateFact[],
    context: LocalizationContext,
  ): RankingResult {
    if (facts.length === 0) {
      return {
        rankedCandidates: [],
        topCandidate: null,
        candidateFiles: [],
        supportingEvidence: [],
        contradictingEvidence: [],
      };
    }

    // Group facts by target file and primary symbol
    const grouped = new Map<string, ValidatedCandidateFact[]>();

    for (const fact of facts) {
      const key = fact.filePath;
      const list = grouped.get(key) ?? [];
      list.push(fact);
      grouped.set(key, list);
    }

    const allSupportingEvidence: CandidateEvidenceItemDto[] = [];
    const allContradictingEvidence: CandidateEvidenceItemDto[] = [];
    const candidates: RankedDefectCandidateDto[] = [];

    for (const [filePath, fileFacts] of grouped.entries()) {
      // Find strongest symbol and candidate type
      const symbolFact = fileFacts.find(f => f.symbolName) ?? fileFacts[0]!;
      const primaryCandidateType = symbolFact.candidateType;
      const symbolName = symbolFact.symbolName ?? null;
      const symbolKind = symbolFact.symbolKind ?? null;
      const startLine = symbolFact.startLine ?? null;
      const endLine = symbolFact.endLine ?? null;

      // Calculate score based on unique signals
      const uniqueSignals = new Map<CandidateEvidenceSignalDto, ValidatedCandidateFact>();
      for (const f of fileFacts) {
        if (!uniqueSignals.has(f.signal)) {
          uniqueSignals.set(f.signal, f);
        }
      }

      let maxSignalWeight = 0;
      for (const signal of uniqueSignals.keys()) {
        const weight = EVIDENCE_SIGNAL_WEIGHTS[signal] ?? 0.2;
        if (weight > maxSignalWeight) {
          maxSignalWeight = weight;
        }
      }

      // Bonus for independent corroborating evidence signals (+0.05 each, capped at 0.99)
      const corroborationBonus = Math.max(0, uniqueSignals.size - 1) * 0.05;
      const rawScore = Math.min(0.99, maxSignalWeight + corroborationBonus);
      const score = Math.round(rawScore * 100) / 100;

      // Determine confidence level
      const confidenceLevel =
        score >= 0.85
          ? 'VERY_HIGH'
          : score >= 0.7
            ? 'HIGH'
            : score >= 0.5
              ? 'MEDIUM'
              : score >= 0.3
                ? 'LOW'
                : 'VERY_LOW';

      // Determine priority status
      const hasStrongSignal = Array.from(uniqueSignals.values()).some(f => f.strength === 'STRONG');
      const priorityStatus =
        score >= 0.75 && hasStrongSignal
          ? 'HIGH_PRIORITY_CANDIDATE'
          : score >= 0.45
            ? 'MEDIUM_PRIORITY_CANDIDATE'
            : 'LOW_PRIORITY_CANDIDATE';

      // Build supporting evidence items
      const candidateSupportingEvidence: CandidateEvidenceItemDto[] = [];
      for (const f of fileFacts.slice(
        0,
        DEFECT_LOCALIZATION_BOUNDS.MAX_SUPPORTING_EVIDENCE_PER_CANDIDATE,
      )) {
        const item: CandidateEvidenceItemDto = {
          signal: f.signal,
          strength: f.strength,
          description: f.description,
          provenance: f.provenance,
          rawReference: f.rawReference,
        };
        candidateSupportingEvidence.push(item);
        allSupportingEvidence.push(item);
      }

      // Check for contradicting / conflicting signals
      const candidateContradictingEvidence: CandidateEvidenceItemDto[] = [];

      // Example contradicting signal: pure UI file when root cause is confirmed DATABASE or BACKEND
      if (
        context.rootCauseAnalysis?.probableLayer === 'DATABASE' &&
        (filePath.endsWith('.tsx') || filePath.endsWith('.css'))
      ) {
        const conflictItem: CandidateEvidenceItemDto = {
          signal: 'ROOT_CAUSE_PROBABLE_LAYER',
          strength: 'STRONG',
          description: `V6 root-cause confirmed DATABASE failure, but candidate '${filePath}' is a presentation-tier file.`,
          provenance: 'FailureRootCauseAnalysis probableLayer: DATABASE',
        };
        candidateContradictingEvidence.push(conflictItem);
        allContradictingEvidence.push(conflictItem);
      }

      // Generate structured explanation
      const explanation = this.buildExplanation(
        filePath,
        symbolName,
        score,
        priorityStatus,
        candidateSupportingEvidence,
        candidateContradictingEvidence,
      );

      candidates.push({
        rank: 1, // updated after sorting
        filePath,
        symbolName,
        symbolKind,
        candidateType: primaryCandidateType,
        score,
        confidenceLevel,
        priorityStatus,
        startLine,
        endLine,
        relevanceExplanation: explanation,
        supportingEvidence: candidateSupportingEvidence,
        contradictingEvidence: candidateContradictingEvidence,
        traceabilityLinks: {
          requirementId: context.requirement?.id ?? null,
          requirementKey: context.requirement?.key ?? null,
          testCaseId: context.testCase?.id ?? null,
          testCaseKey: context.testCase?.key ?? null,
          executionId: context.failureCase.executionId ?? null,
          failedStepIndex: context.failedStep?.stepIndex ?? null,
        },
      });
    }

    // Sort deterministically: score descending, then filePath alphabetically
    candidates.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.filePath.localeCompare(b.filePath);
    });

    // Assign final 1-based ranks
    const boundedCandidates = candidates
      .slice(0, DEFECT_LOCALIZATION_BOUNDS.MAX_CANDIDATE_FILES)
      .map((c, idx) => ({
        ...c,
        rank: idx + 1,
      }));

    const topCandidate = boundedCandidates[0] ?? null;
    const candidateFiles = boundedCandidates.map(c => c.filePath);

    return {
      rankedCandidates: boundedCandidates,
      topCandidate,
      candidateFiles,
      supportingEvidence: allSupportingEvidence,
      contradictingEvidence: allContradictingEvidence,
    };
  }

  private buildExplanation(
    filePath: string,
    symbolName: string | null,
    score: number,
    priority: string,
    supporting: readonly CandidateEvidenceItemDto[],
    contradicting: readonly CandidateEvidenceItemDto[],
  ): string {
    const symbolText = symbolName ? ` -> symbol '${symbolName}'` : '';
    const points = supporting.map(s => `- ${s.description} (${s.provenance})`).join('\n');
    const conflictText =
      contradicting.length > 0
        ? `\nContradicting evidence:\n` + contradicting.map(c => `- ${c.description}`).join('\n')
        : '\nContradicting evidence: none observed.';

    return `Candidate: ${filePath}${symbolText}\nStatus: ${priority} (Evidence Score: ${score})\nSupporting evidence:\n${points}${conflictText}`;
  }
}
