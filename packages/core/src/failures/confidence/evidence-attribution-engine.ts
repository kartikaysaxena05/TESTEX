/**
 * @file packages/core/src/failures/confidence/evidence-attribution-engine.ts
 * Multi-phase evidence attribution engine with canonical key generation and double-count prevention.
 */

import type {
  ConclusionType,
  AttributionRelationship,
  AttributionSupportStrength,
  SourceSubsystem,
  EpistemicType,
} from '@ai-quality/contracts';
import type { ConfidenceEvaluationFacts } from './confidence-types.js';

export interface AttributionDraft {
  readonly conclusionType: ConclusionType;
  readonly conclusionValue: string;
  readonly evidenceReferenceId: string | null;
  readonly evidenceType: string;
  readonly sourceSubsystem: SourceSubsystem;
  readonly relationship: AttributionRelationship;
  readonly supportStrength: AttributionSupportStrength;
  readonly epistemicType: EpistemicType;
  readonly canonicalEvidenceKey: string;
  readonly reason: string;
}

export class EvidenceAttributionEngine {
  /**
   * Generates a canonical evidence key from its fundamental attributes to prevent double-counting.
   */
  public generateCanonicalKey(
    prefix: string,
    primaryIdentifier: string,
    secondaryIdentifier?: string,
  ): string {
    const cleanPrimary = primaryIdentifier.trim().toLowerCase();
    const cleanSecondary = secondaryIdentifier
      ? `:${secondaryIdentifier.trim().toLowerCase()}`
      : '';
    return `${prefix}:${cleanPrimary}${cleanSecondary}`;
  }

  /**
   * Computes all evidence attributions for the given failure facts, applying double-count protection.
   */
  public extractAttributions(facts: ConfidenceEvaluationFacts): readonly AttributionDraft[] {
    const drafts: AttributionDraft[] = [];

    // 1. Evidence Artifacts (Phase 75)
    for (const ref of facts.evidenceReferences) {
      const canonicalKey = this.generateCanonicalKey(
        'artifact',
        ref.evidenceType,
        ref.sha256.slice(0, 16),
      );

      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: facts.deterministicCategory ?? facts.aiCategory ?? 'UNCLASSIFIED',
        evidenceReferenceId: ref.id,
        evidenceType: ref.evidenceType,
        sourceSubsystem: 'PHASE_75_EVIDENCE',
        relationship: 'SUPPORTS',
        supportStrength: 'STRONG',
        epistemicType: 'FACT',
        canonicalEvidenceKey: canonicalKey,
        reason: `Verified ${ref.evidenceType} artifact (hash ${ref.sha256.slice(0, 8)}, size ${ref.byteSize} bytes) provides factual grounding.`,
      });

      drafts.push({
        conclusionType: 'REPRODUCIBILITY',
        conclusionValue:
          facts.reproductionStatus ?? (facts.isReproduced ? 'REPRODUCED' : 'NOT_REPRODUCED'),
        evidenceReferenceId: ref.id,
        evidenceType: ref.evidenceType,
        sourceSubsystem: 'PHASE_75_EVIDENCE',
        relationship: 'SUPPORTS',
        supportStrength: 'SUPPORTING',
        epistemicType: 'FACT',
        canonicalEvidenceKey: canonicalKey,
        reason: `Execution evidence ${ref.evidenceType} documents the exact runtime failure state.`,
      });
    }

    // Missing mandatory evidence checks
    if (!facts.hasScreenshot) {
      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: 'MISSING_SCREENSHOT',
        evidenceReferenceId: null,
        evidenceType: 'SCREENSHOT',
        sourceSubsystem: 'PHASE_75_EVIDENCE',
        relationship: 'MISSING',
        supportStrength: 'WEAK',
        epistemicType: 'UNKNOWN',
        canonicalEvidenceKey: 'missing:artifact:screenshot',
        reason: 'Visual screenshot artifact is missing from failure evidence.',
      });
    }

    if (!facts.hasConsoleLogs) {
      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: 'MISSING_CONSOLE',
        evidenceReferenceId: null,
        evidenceType: 'CONSOLE_LOGS',
        sourceSubsystem: 'PHASE_75_EVIDENCE',
        relationship: 'MISSING',
        supportStrength: 'WEAK',
        epistemicType: 'UNKNOWN',
        canonicalEvidenceKey: 'missing:artifact:console',
        reason: 'Console log stream is missing from failure evidence.',
      });
    }

    // 2. Failure Reproduction (Phase 76)
    if (facts.reproductionAttempts > 0) {
      const reproKey = this.generateCanonicalKey(
        'repro',
        facts.reproductionStatus ?? 'unknown',
        facts.reproductionSignature ?? 'no_sig',
      );

      if (facts.isReproduced) {
        drafts.push({
          conclusionType: 'REPRODUCIBILITY',
          conclusionValue: facts.reproductionStatus ?? 'REPRODUCED',
          evidenceReferenceId: null,
          evidenceType: 'REPRODUCTION_RUN',
          sourceSubsystem: 'PHASE_76_REPRODUCTION',
          relationship: 'SUPPORTS',
          supportStrength: 'DECISIVE',
          epistemicType: 'FACT',
          canonicalEvidenceKey: reproKey,
          reason: `Deterministic reproduction confirmed (${facts.reproductionSuccessCount}/${facts.reproductionAttempts} attempts succeeded with matching signature).`,
        });
      } else {
        drafts.push({
          conclusionType: 'REPRODUCIBILITY',
          conclusionValue: facts.reproductionStatus ?? 'NOT_REPRODUCED',
          evidenceReferenceId: null,
          evidenceType: 'REPRODUCTION_RUN',
          sourceSubsystem: 'PHASE_76_REPRODUCTION',
          relationship: 'CONTRADICTS',
          supportStrength: 'DECISIVE',
          epistemicType: 'CONTRADICTORY',
          canonicalEvidenceKey: reproKey,
          reason: `Reproduction failed (${facts.reproductionSuccessCount}/${facts.reproductionAttempts} attempts succeeded). Failure could not be re-triggered deterministically.`,
        });
      }
    } else {
      drafts.push({
        conclusionType: 'REPRODUCIBILITY',
        conclusionValue: 'UNATTEMPTED',
        evidenceReferenceId: null,
        evidenceType: 'REPRODUCTION_RUN',
        sourceSubsystem: 'PHASE_76_REPRODUCTION',
        relationship: 'MISSING',
        supportStrength: 'NONE',
        epistemicType: 'UNKNOWN',
        canonicalEvidenceKey: 'missing:reproduction:none',
        reason: 'No reproduction attempts have been executed for this failure case.',
      });
    }

    // 3. Deterministic Classification & Decision Integrity (Phase 77 / 78)
    if (facts.deterministicCategory) {
      const classKey = this.generateCanonicalKey('classification', facts.deterministicCategory);
      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: facts.deterministicCategory,
        evidenceReferenceId: null,
        evidenceType: 'DETERMINISTIC_RULE',
        sourceSubsystem: 'PHASE_77_CLASSIFICATION',
        relationship: 'SUPPORTS',
        supportStrength: 'DECISIVE',
        epistemicType: 'DETERMINISTIC_INFERENCE',
        canonicalEvidenceKey: classKey,
        reason: `Deterministic rule matched category '${facts.deterministicCategory}': ${facts.classificationRationale ?? 'Rule conditions satisfied.'}`,
      });
    }

    if (!facts.decisionIntegrityPassed && facts.integrityViolations.length > 0) {
      for (const violation of facts.integrityViolations) {
        const violKey = this.generateCanonicalKey('integrity_violation', violation);
        drafts.push({
          conclusionType: 'CLASSIFICATION',
          conclusionValue: 'INTEGRITY_VIOLATION',
          evidenceReferenceId: null,
          evidenceType: 'DECISION_INTEGRITY',
          sourceSubsystem: 'PHASE_78_DECISION_INTEGRITY',
          relationship: 'CONTRADICTS',
          supportStrength: 'DECISIVE',
          epistemicType: 'CONTRADICTORY',
          canonicalEvidenceKey: violKey,
          reason: `Decision integrity violation: ${violation}`,
        });
      }
    }

    // 4. Flakiness Detection (Phase 79)
    if (facts.isFlaky) {
      const flakinessKey = this.generateCanonicalKey(
        'flakiness',
        facts.flakinessPattern ?? 'intermittent',
      );
      // Flakiness contradicts deterministic reproducibility
      drafts.push({
        conclusionType: 'REPRODUCIBILITY',
        conclusionValue: facts.flakinessPattern ?? 'FLAKY',
        evidenceReferenceId: null,
        evidenceType: 'FLAKINESS_ANALYSIS',
        sourceSubsystem: 'PHASE_79_FLAKINESS',
        relationship: 'CONTRADICTS',
        supportStrength: 'DECISIVE',
        epistemicType: 'CONTRADICTORY',
        canonicalEvidenceKey: flakinessKey,
        reason: `Flakiness score ${(facts.flakinessScore ?? 1.0).toFixed(2)} detected pattern '${facts.flakinessPattern ?? 'intermittent'}'. Failure does not occur predictably.`,
      });
    }

    // 5. Domain Separation (Phase 80)
    if (facts.failureDomain) {
      const domainKey = this.generateCanonicalKey('domain', facts.failureDomain);
      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: facts.failureDomain,
        evidenceReferenceId: null,
        evidenceType: 'DOMAIN_SEPARATION',
        sourceSubsystem: 'PHASE_80_DOMAIN_SEPARATION',
        relationship: 'SUPPORTS',
        supportStrength: 'STRONG',
        epistemicType: 'DETERMINISTIC_INFERENCE',
        canonicalEvidenceKey: domainKey,
        reason: `Domain classified as '${facts.failureDomain}' with indicators: ${facts.domainIndicators.join(', ') || 'deterministic signals'}.`,
      });
    }

    // 6. Technical Localization & Root Cause (Phase 81 & 83)
    if (facts.localizedFilePath) {
      const codeKey = this.generateCanonicalKey(
        'code_loc',
        facts.localizedFilePath,
        facts.localizedSymbol ?? 'global',
      );
      drafts.push({
        conclusionType: 'ROOT_CAUSE',
        conclusionValue: facts.localizedFilePath,
        evidenceReferenceId: null,
        evidenceType: 'CODE_LOCATION',
        sourceSubsystem: 'PHASE_81_CAUSE_LOCALIZATION',
        relationship: 'SUPPORTS',
        supportStrength: facts.localizedFileExistsInRepo ? 'DECISIVE' : 'WEAK',
        epistemicType: facts.localizedFileExistsInRepo ? 'FACT' : 'CONTRADICTORY',
        canonicalEvidenceKey: codeKey,
        reason: facts.localizedFileExistsInRepo
          ? `Localized symbol '${facts.localizedSymbol ?? ''}' verified in repository file '${facts.localizedFilePath}'.`
          : `Suspect path '${facts.localizedFilePath}' does not exist in repository files (unverified reference).`,
      });
    }

    if (facts.probableLayer || facts.probableComponent) {
      const rcKey = this.generateCanonicalKey(
        'rc_probable',
        facts.probableLayer ?? 'unknown_layer',
        facts.probableComponent ?? 'unknown_component',
      );
      drafts.push({
        conclusionType: 'ROOT_CAUSE',
        conclusionValue: `${facts.probableLayer ?? 'N/A'}:${facts.probableComponent ?? 'N/A'}`,
        evidenceReferenceId: null,
        evidenceType: 'ROOT_CAUSE_ANALYSIS',
        sourceSubsystem: 'PHASE_83_ROOT_CAUSE',
        relationship: 'SUPPORTS',
        supportStrength: 'STRONG',
        epistemicType: 'DETERMINISTIC_INFERENCE',
        canonicalEvidenceKey: rcKey,
        reason: `Probable root cause identified at layer '${facts.probableLayer ?? 'N/A'}' in component '${facts.probableComponent ?? 'N/A'}': ${facts.probableCause ?? 'Identified from stack & telemetry'}.`,
      });
    }

    // 7. AI Reasoning (Phase 82)
    if (facts.aiCategory) {
      const aiKey = this.generateCanonicalKey('ai_reasoning', facts.aiCategory);
      drafts.push({
        conclusionType: 'CLASSIFICATION',
        conclusionValue: facts.aiCategory,
        evidenceReferenceId: null,
        evidenceType: 'AI_REASONING',
        sourceSubsystem: 'PHASE_82_AI_CLASSIFICATION',
        relationship: 'SUPPORTS',
        supportStrength: 'SUPPORTING',
        epistemicType: 'AI_INFERENCE',
        canonicalEvidenceKey: aiKey,
        reason: `AI model inferred category '${facts.aiCategory}' (self-reported: ${(facts.aiSelfReportedConfidence ?? 0.5).toFixed(2)}, calibrated: ${(facts.aiCalibratedConfidence ?? 0.5).toFixed(2)}).`,
      });

      // Check if AI contradicts deterministic classification
      if (facts.deterministicCategory && facts.aiCategory !== facts.deterministicCategory) {
        drafts.push({
          conclusionType: 'CLASSIFICATION',
          conclusionValue: facts.aiCategory,
          evidenceReferenceId: null,
          evidenceType: 'AI_REASONING',
          sourceSubsystem: 'PHASE_82_AI_CLASSIFICATION',
          relationship: 'CONTRADICTS',
          supportStrength: 'DECISIVE',
          epistemicType: 'CONTRADICTORY',
          canonicalEvidenceKey: aiKey,
          reason: `AI category '${facts.aiCategory}' conflicts with deterministic classification '${facts.deterministicCategory}'.`,
        });
      }
    }

    // 8. Impact & Severity (Phase 84)
    if (facts.severity) {
      const impactKey = this.generateCanonicalKey(
        'severity',
        facts.severity,
        facts.priority ?? 'P2',
      );
      drafts.push({
        conclusionType: 'SEVERITY',
        conclusionValue: facts.severity,
        evidenceReferenceId: null,
        evidenceType: 'SEVERITY_ANALYSIS',
        sourceSubsystem: 'PHASE_84_SEVERITY',
        relationship: 'SUPPORTS',
        supportStrength: 'DECISIVE',
        epistemicType: 'DETERMINISTIC_INFERENCE',
        canonicalEvidenceKey: impactKey,
        reason: `Assessed severity '${facts.severity}' and priority '${facts.priority ?? 'P2'}' based on ${facts.impactDimensions.length} evaluated dimensions.`,
      });
    }

    // 9. Defect Clustering (Phase 85)
    if (facts.clusterId) {
      const clusterKey = this.generateCanonicalKey(
        'cluster',
        facts.clusterKey ?? facts.clusterId,
        String(facts.clusterActiveMemberCount),
      );
      drafts.push({
        conclusionType: 'DUPLICATE_CLUSTER',
        conclusionValue: facts.clusterKey ?? facts.clusterId,
        evidenceReferenceId: null,
        evidenceType: 'DEFECT_CLUSTER',
        sourceSubsystem: 'PHASE_85_DUPLICATE_CLUSTER',
        relationship: 'SUPPORTS',
        supportStrength: (facts.clusterSimilarityScore ?? 0) >= 0.8 ? 'DECISIVE' : 'STRONG',
        epistemicType: 'DETERMINISTIC_INFERENCE',
        canonicalEvidenceKey: clusterKey,
        reason: `Member of cluster '${facts.clusterKey ?? facts.clusterId}' with ${facts.clusterActiveMemberCount} failures (similarity ${(facts.clusterSimilarityScore ?? 0).toFixed(2)}).`,
      });
    }

    return this.deduplicateAttributions(drafts);
  }

  /**
   * Double-count protection: ensures only one attribution per (conclusionType, canonicalEvidenceKey),
   * retaining the attribution with the highest epistemic and support strength.
   */
  private deduplicateAttributions(
    drafts: readonly AttributionDraft[],
  ): readonly AttributionDraft[] {
    const strengthRank: Record<AttributionSupportStrength, number> = {
      DECISIVE: 5,
      STRONG: 4,
      SUPPORTING: 3,
      WEAK: 2,
      NONE: 1,
    };

    const map = new Map<string, AttributionDraft>();

    for (const draft of drafts) {
      const key = `${draft.conclusionType}::${draft.canonicalEvidenceKey}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, draft);
      } else {
        const existingRank = strengthRank[existing.supportStrength] ?? 0;
        const newRank = strengthRank[draft.supportStrength] ?? 0;
        if (newRank > existingRank) {
          map.set(key, draft);
        }
      }
    }

    return Array.from(map.values());
  }
}
