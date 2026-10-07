/**
 * @file packages/core/src/failures/confidence/confidence-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 86: Confidence Scoring, Explainability & Evidence Attribution.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

const redactor = new FailureEvidenceRedactor();

export interface ConfidenceFingerprintFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly revision: number;
  readonly overallConfidence: number;
  readonly confidenceBand: string;
  readonly classificationConfidence?: number | null;
  readonly reproducibilityConfidence?: number | null;
  readonly rootCauseConfidence?: number | null;
  readonly severityConfidence?: number | null;
  readonly duplicateConfidence?: number | null;
  readonly componentBreakdown: readonly {
    readonly component: string;
    readonly score: number;
    readonly weight: number;
    readonly applicable: boolean;
  }[];
  readonly attributions: readonly {
    readonly conclusionType: string;
    readonly canonicalEvidenceKey: string;
    readonly relationship: string;
    readonly supportStrength: string;
  }[];
  readonly deterministicFacts: readonly string[];
  readonly aiInferences: readonly string[];
  readonly contradictions: readonly string[];
}

/**
 * Recursively sorts object keys and applies secret redaction to strings.
 */
function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return redactor.redactText(obj).redacted;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }

  return result;
}

/**
 * Generates an invariant 64-character SHA-256 digest for a confidence assessment.
 */
export function generateConfidenceFingerprint(facts: ConfidenceFingerprintFacts): string {
  const canonicalPayload = canonicalizeJson({
    projectId: facts.projectId,
    failureCaseId: facts.failureCaseId,
    revision: facts.revision,
    overallConfidence: Number(facts.overallConfidence.toFixed(4)),
    confidenceBand: facts.confidenceBand,
    classificationConfidence:
      facts.classificationConfidence !== null && facts.classificationConfidence !== undefined
        ? Number(facts.classificationConfidence.toFixed(4))
        : null,
    reproducibilityConfidence:
      facts.reproducibilityConfidence !== null && facts.reproducibilityConfidence !== undefined
        ? Number(facts.reproducibilityConfidence.toFixed(4))
        : null,
    rootCauseConfidence:
      facts.rootCauseConfidence !== null && facts.rootCauseConfidence !== undefined
        ? Number(facts.rootCauseConfidence.toFixed(4))
        : null,
    severityConfidence:
      facts.severityConfidence !== null && facts.severityConfidence !== undefined
        ? Number(facts.severityConfidence.toFixed(4))
        : null,
    duplicateConfidence:
      facts.duplicateConfidence !== null && facts.duplicateConfidence !== undefined
        ? Number(facts.duplicateConfidence.toFixed(4))
        : null,
    componentBreakdown: facts.componentBreakdown
      .map(c => ({
        component: c.component,
        score: Number(c.score.toFixed(4)),
        weight: Number(c.weight.toFixed(4)),
        applicable: c.applicable,
      }))
      .sort((a, b) => a.component.localeCompare(b.component)),
    attributions: facts.attributions
      .map(a => ({
        conclusionType: a.conclusionType,
        canonicalEvidenceKey: a.canonicalEvidenceKey,
        relationship: a.relationship,
        supportStrength: a.supportStrength,
      }))
      .sort((a, b) => {
        const concCmp = a.conclusionType.localeCompare(b.conclusionType);
        if (concCmp !== 0) return concCmp;
        return a.canonicalEvidenceKey.localeCompare(b.canonicalEvidenceKey);
      }),
    deterministicFacts: [...facts.deterministicFacts].sort(),
    aiInferences: [...facts.aiInferences].sort(),
    contradictions: [...facts.contradictions].sort(),
  });

  const serialized = JSON.stringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
