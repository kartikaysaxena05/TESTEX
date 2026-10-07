/**
 * @file packages/core/src/failures/confidence/explanation-generator.ts
 * Deterministic human-readable explanation generator with claim-to-evidence validation.
 */

import type { EpistemicType } from '@ai-quality/contracts';
import type {
  ConfidenceEvaluationFacts,
  ConfidenceScoringResult,
  GeneratedExplanation,
} from './confidence-types.js';
import type { AttributionDraft } from './evidence-attribution-engine.js';

export class ExplanationGenerator {
  /**
   * Generates a fully grounded deterministic markdown explanation with claim-to-evidence mapping.
   */
  public generateExplanation(
    facts: ConfidenceEvaluationFacts,
    scoring: ConfidenceScoringResult,
    attributions: readonly AttributionDraft[],
  ): GeneratedExplanation {
    const claimsWithAttributions: Array<{
      claim: string;
      epistemicType: EpistemicType;
      attributedKeys: readonly string[];
    }> = [];

    const lines: string[] = [];

    // Header
    lines.push(`# Confidence & Explainability Assessment`);
    lines.push(
      `**Overall Confidence**: \`${(scoring.overallConfidence * 100).toFixed(1)}%\` — **Band**: \`${scoring.confidenceBand}\``,
    );
    lines.push(
      `*Assessed for Failure Case \`${facts.failureCaseId}\` on Test Case \`${facts.testCaseTitle}\`.*`,
    );
    lines.push('');

    // Domain Confidences Grid
    lines.push(`## Domain Confidence Scores`);
    lines.push(`| Domain | Score | Status |`);
    lines.push(`| :--- | :--- | :--- |`);

    const formatDomain = (val: number | null, name: string) => {
      if (val === null) {
        return `| **${name}** | \`N/A\` | *Unknown / Not Applicable* |`;
      }
      return `| **${name}** | \`${(val * 100).toFixed(1)}%\` | *Evaluated* |`;
    };

    lines.push(formatDomain(scoring.classificationConfidence, 'Classification'));
    lines.push(formatDomain(scoring.rootCauseConfidence, 'Root Cause Analysis'));
    lines.push(formatDomain(scoring.reproducibilityConfidence, 'Reproducibility'));
    lines.push(formatDomain(scoring.severityConfidence, 'Severity & Impact'));
    lines.push(formatDomain(scoring.duplicateConfidence, 'Duplicate / Clustering'));
    lines.push('');

    // Epistemic Classification: Facts
    lines.push(`## Factual Grounding (FACT)`);
    const factAttrs = attributions.filter(a => a.epistemicType === 'FACT');
    if (factAttrs.length > 0) {
      for (const attr of factAttrs) {
        lines.push(
          `- **[${attr.conclusionType}]** ${attr.reason} *(Key: \`${attr.canonicalEvidenceKey}\`)*`,
        );
        claimsWithAttributions.push({
          claim: attr.reason,
          epistemicType: 'FACT',
          attributedKeys: [attr.canonicalEvidenceKey],
        });
      }
    } else {
      lines.push(`- *No verified direct factual telemetry recorded.*`);
    }
    lines.push('');

    // Epistemic Classification: Deterministic Inferences
    lines.push(`## Deterministic Inferences (DETERMINISTIC_INFERENCE)`);
    const detAttrs = attributions.filter(a => a.epistemicType === 'DETERMINISTIC_INFERENCE');
    if (detAttrs.length > 0) {
      for (const attr of detAttrs) {
        lines.push(
          `- **[${attr.conclusionType}]** ${attr.reason} *(Key: \`${attr.canonicalEvidenceKey}\`)*`,
        );
        claimsWithAttributions.push({
          claim: attr.reason,
          epistemicType: 'DETERMINISTIC_INFERENCE',
          attributedKeys: [attr.canonicalEvidenceKey],
        });
      }
    } else {
      lines.push(`- *No deterministic rules triggered.*`);
    }
    lines.push('');

    // Epistemic Classification: AI Inferences
    lines.push(`## AI Reasoning & Calibrated Inferences (AI_INFERENCE)`);
    const aiAttrs = attributions.filter(a => a.epistemicType === 'AI_INFERENCE');
    if (aiAttrs.length > 0) {
      lines.push(
        `> **Calibration Notice**: AI inferences are never accepted as raw truth. Model-reported confidences are mathematically calibrated against verified runtime facts.`,
      );
      for (const attr of aiAttrs) {
        lines.push(
          `- **[${attr.conclusionType}]** ${attr.reason} *(Key: \`${attr.canonicalEvidenceKey}\`)*`,
        );
        claimsWithAttributions.push({
          claim: attr.reason,
          epistemicType: 'AI_INFERENCE',
          attributedKeys: [attr.canonicalEvidenceKey],
        });
      }
    } else {
      lines.push(`- *No AI-assisted hypotheses evaluated.*`);
    }
    lines.push('');

    // Contradictions & Caveats
    lines.push(`## Contradictions & Caveats (CONTRADICTORY)`);
    const contraAttrs = attributions.filter(a => a.epistemicType === 'CONTRADICTORY');
    if (contraAttrs.length > 0) {
      lines.push(
        `> **Warning**: Contradictory evidence was detected, causing explicit penalties to be applied to confidence scores.`,
      );
      for (const attr of contraAttrs) {
        lines.push(
          `- ⚠️ **[${attr.conclusionType}]** ${attr.reason} *(Key: \`${attr.canonicalEvidenceKey}\`)*`,
        );
        claimsWithAttributions.push({
          claim: attr.reason,
          epistemicType: 'CONTRADICTORY',
          attributedKeys: [attr.canonicalEvidenceKey],
        });
      }
    } else {
      lines.push(`- *No contradictions detected across ingested failure evidence.*`);
    }
    lines.push('');

    // Unknowns & Missing Factors
    lines.push(`## Missing Evidence & Unknowns (UNKNOWN)`);
    const unknownAttrs = attributions.filter(a => a.epistemicType === 'UNKNOWN');
    if (unknownAttrs.length > 0) {
      for (const attr of unknownAttrs) {
        lines.push(
          `- ❓ **[${attr.conclusionType}]** ${attr.reason} *(Key: \`${attr.canonicalEvidenceKey}\`)*`,
        );
        claimsWithAttributions.push({
          claim: attr.reason,
          epistemicType: 'UNKNOWN',
          attributedKeys: [attr.canonicalEvidenceKey],
        });
      }
    } else {
      lines.push(`- *Evidence baseline is complete.*`);
    }
    lines.push('');

    // Component Breakdown Table
    lines.push(`## Component Scoring Breakdown`);
    lines.push(`| Component | Score | Weight | Status | Description |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const comp of scoring.componentBreakdown) {
      lines.push(
        `| **${comp.component}** | \`${(comp.score * 100).toFixed(1)}%\` | \`${(comp.weight * 100).toFixed(0)}%\` | ${comp.applicable ? 'Applicable' : 'N/A'} | ${comp.description} |`,
      );
    }

    return {
      markdownExplanation: lines.join('\n'),
      claimsWithAttributions,
    };
  }
}
