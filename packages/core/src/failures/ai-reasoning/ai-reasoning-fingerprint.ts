/**
 * @file packages/core/src/failures/ai-reasoning/ai-reasoning-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 82 AI-Assisted Failure Classification & Reasoning.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

const redactor = new FailureEvidenceRedactor();

export interface AiAssessmentFingerprintFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly deterministicCategory?: string | null;
  readonly deterministicSubcategory?: string | null;
  readonly domainSeparationDomain?: string | null;
  readonly technicalLocalizationLayer?: string | null;
  readonly technicalCause?: string | null;
  readonly reproductionRate?: number | null;
  readonly flakinessScore?: number | null;
  readonly evidenceArtifactHashes: readonly string[];
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
 * Computes an invariant 64-character SHA-256 cryptographic digest across canonical AI assessment facts.
 */
export function generateAiAssessmentFingerprint(facts: AiAssessmentFingerprintFacts): string {
  const normalizedFacts = {
    projectId: facts.projectId.trim().toLowerCase(),
    failureCaseId: facts.failureCaseId.trim().toLowerCase(),
    testCaseId: facts.testCaseId.trim().toLowerCase(),
    testCaseVersionNumber: facts.testCaseVersionNumber,
    deterministicCategory: facts.deterministicCategory ?? null,
    deterministicSubcategory: facts.deterministicSubcategory ?? null,
    domainSeparationDomain: facts.domainSeparationDomain ?? null,
    technicalLocalizationLayer: facts.technicalLocalizationLayer ?? null,
    technicalCause: facts.technicalCause ?? null,
    reproductionRate:
      facts.reproductionRate !== undefined && facts.reproductionRate !== null
        ? Number(facts.reproductionRate.toFixed(4))
        : null,
    flakinessScore:
      facts.flakinessScore !== undefined && facts.flakinessScore !== null
        ? Number(facts.flakinessScore.toFixed(4))
        : null,
    evidenceArtifactHashes: [...facts.evidenceArtifactHashes].sort(),
    promptVersion: facts.promptVersion.trim(),
    schemaVersion: facts.schemaVersion.trim(),
    modelProvider: facts.modelProvider.trim().toLowerCase(),
    modelName: facts.modelName.trim().toLowerCase(),
  };

  const canonicalObj = canonicalizeJson(normalizedFacts);
  const canonicalString = JSON.stringify(canonicalObj);

  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}
