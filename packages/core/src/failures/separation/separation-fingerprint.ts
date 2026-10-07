/**
 * @file packages/core/src/failures/separation/separation-fingerprint.ts
 * Deterministic SHA-256 analysis fingerprint generator for Failure Domain Separation (V6 Phase 80).
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import type { FailureDomain } from '@ai-quality/contracts';

const redactor = new FailureEvidenceRedactor();

export interface DomainSeparationFingerprintFacts {
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly domain: FailureDomain;
  readonly domainSubreason?: string | null;
  readonly separationRulesVersion: string;
  readonly matchedRuleIds: readonly string[];
  readonly excludedDomains: readonly FailureDomain[];
  readonly exclusionReasons: Record<string, string>;
  readonly evidenceReferences: readonly string[];
  readonly reproductionStatus?: string | null;
  readonly flakinessState?: string | null;
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
 * Computes an invariant SHA-256 cryptographic digest across canonical separation facts.
 */
export function generateDomainSeparationFingerprint(
  facts: DomainSeparationFingerprintFacts,
): string {
  const canonicalPayload = {
    failureCaseId: facts.failureCaseId,
    testCaseId: facts.testCaseId,
    testCaseVersionNumber: facts.testCaseVersionNumber,
    domain: facts.domain,
    domainSubreason: facts.domainSubreason ?? null,
    separationRulesVersion: facts.separationRulesVersion,
    matchedRuleIds: [...facts.matchedRuleIds].sort(),
    excludedDomains: [...facts.excludedDomains].sort(),
    exclusionReasons: Object.keys(facts.exclusionReasons)
      .sort()
      .reduce<Record<string, string>>((acc, key) => {
        acc[key] = redactor.redactText(facts.exclusionReasons[key] ?? '').redacted;
        return acc;
      }, {}),
    evidenceReferences: [...facts.evidenceReferences].sort(),
    reproductionStatus: facts.reproductionStatus ?? null,
    flakinessState: facts.flakinessState ?? null,
  };

  const canonicalJson = JSON.stringify(canonicalizeJson(canonicalPayload));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
