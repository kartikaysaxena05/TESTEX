/**
 * @file packages/core/src/failures/root-cause/root-cause-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 83 Root-Cause Analysis.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

const redactor = new FailureEvidenceRedactor();

export interface RootCauseFingerprintFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly deterministicCategory?: string | null;
  readonly deterministicSubcategory?: string | null;
  readonly domainSeparationDomain?: string | null;
  readonly technicalLocalizationLayer?: string | null;
  readonly technicalCause?: string | null;
  readonly aiAssessmentCategory?: string | null;
  readonly reproductionRate?: number | null;
  readonly flakinessScore?: number | null;
  readonly evidenceArtifactHashes: readonly string[];
  readonly repositoryContextAvailable: boolean;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly modelProvider: string;
  readonly modelName: string;
}

/**
 * Deterministically sorts object keys recursively for canonical JSON serialization.
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
 * Computes an invariant 64-character SHA-256 cryptographic digest across canonical root-cause analysis facts.
 */
export function generateRootCauseFingerprint(facts: RootCauseFingerprintFacts): string {
  const normalizedFacts = {
    projectId: facts.projectId.trim().toLowerCase(),
    failureCaseId: facts.failureCaseId.trim().toLowerCase(),
    testCaseId: facts.testCaseId.trim().toLowerCase(),
    testCaseVersionNumber: facts.testCaseVersionNumber,
    deterministicCategory: facts.deterministicCategory ?? null,
    deterministicSubcategory: facts.deterministicSubcategory ?? null,
    domainSeparationDomain: facts.domainSeparationDomain ?? null,
    technicalLocalizationLayer: facts.technicalLocalizationLayer ?? null,
    technicalCause: facts.technicalCause
      ? redactor.redactText(facts.technicalCause).redacted
      : null,
    aiAssessmentCategory: facts.aiAssessmentCategory ?? null,
    reproductionRate:
      typeof facts.reproductionRate === 'number' ? Number(facts.reproductionRate.toFixed(4)) : null,
    flakinessScore:
      typeof facts.flakinessScore === 'number' ? Number(facts.flakinessScore.toFixed(4)) : null,
    evidenceArtifactHashes: [...facts.evidenceArtifactHashes].sort(),
    repositoryContextAvailable: facts.repositoryContextAvailable,
    promptVersion: facts.promptVersion.trim(),
    schemaVersion: facts.schemaVersion.trim(),
    modelProvider: facts.modelProvider.trim().toLowerCase(),
    modelName: facts.modelName.trim().toLowerCase(),
  };

  const canonicalPayload = JSON.stringify(canonicalizeJson(normalizedFacts));
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}
