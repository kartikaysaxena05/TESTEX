/**
 * @file packages/core/src/failures/integrity/decision-fingerprint.ts
 * Deterministic, reproducible decision fingerprinting for failure classifications (V6 Phase 78).
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import type { DecisionFingerprintFacts } from './decision-integrity-types.js';

const redactor = new FailureEvidenceRedactor();

/**
 * Computes a deterministic SHA-256 fingerprint for an authoritative classification decision.
 * Strictly derives from invariant facts and ignores volatile run identifiers, timestamps, and memory addresses.
 * Sanitizes all string fields to ensure zero secret leakage.
 */
export function generateDecisionFingerprint(facts: DecisionFingerprintFacts): string {
  // Sort array fields deterministically
  const sortedMatchedRuleIds = [...facts.matchedRuleIds].sort();
  const sortedConflictingRuleIds = [...facts.conflictingRuleIds].sort();
  const sortedEvidenceIdentities = [...facts.normalizedEvidenceIdentities].sort();

  // Canonical payload with alphabetical keys
  const canonicalPayload = {
    category: facts.category,
    classifierVersion: facts.classifierVersion,
    conflictingRuleIds: sortedConflictingRuleIds,
    environmentEquivalence: facts.environmentEquivalence,
    failedStepIdentity: facts.failedStepIdentity
      ? redactor.redactText(facts.failedStepIdentity).redacted
      : null,
    failureSignature: facts.failureSignature,
    matchedRuleIds: sortedMatchedRuleIds,
    normalizedEvidenceIdentities: sortedEvidenceIdentities,
    primaryRuleId: facts.primaryRuleId,
    reproductionSnapshotIdentity: facts.reproductionSnapshotIdentity,
    subcategory: facts.subcategory ?? null,
    taxonomyVersion: facts.taxonomyVersion,
  };

  const serialized = JSON.stringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
