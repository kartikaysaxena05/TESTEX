/**
 * @file packages/core/src/failures/flakiness/flakiness-fingerprint.ts
 * Deterministic analysis fingerprint generator for Flakiness Detection (V6 Phase 79).
 */

import { createHash } from 'node:crypto';
import type { CanonicalFlakinessPayload } from './flakiness-types.js';

/**
 * Secret patterns to redact before fingerprint hashing.
 */
const SECRET_PATTERNS = [
  /password\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /bearer\s+[a-zA-Z0-9._~+/-]+=*/gi,
  /token\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /api[-_]?key\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /cookie\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /secret\s*[:=]\s*["']?[^"'\s,}]+/gi,
];

function redactSensitiveData(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output;
}

function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return JSON.stringify(redactSensitiveData(obj));
    }
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }

  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalStringify(v)).join(',') + '}'
  );
}

/**
 * Derives a deterministic SHA-256 fingerprint for a canonical flakiness analysis payload.
 */
export function deriveFlakinessFingerprint(payload: CanonicalFlakinessPayload): string {
  // Sort attempts by attemptId ASC for invariant serialization
  const sortedAttempts = [...payload.attempts].sort((a, b) =>
    a.attemptId.localeCompare(b.attemptId),
  );

  const canonicalPayload = {
    testCaseId: payload.testCaseId,
    testCaseVersionNumber: payload.testCaseVersionNumber,
    flakinessPolicyVersion: payload.flakinessPolicyVersion,
    analysisVersion: payload.analysisVersion,
    attempts: sortedAttempts.map(att => ({
      attemptId: att.attemptId,
      source: att.source,
      status: att.status,
      isEligible: att.isEligible,
      environmentEquivalence: att.environmentEquivalence,
      isSignatureMatch: att.isSignatureMatch,
      isStepMatch: att.isStepMatch,
      normalizedSignature: att.normalizedSignature
        ? redactSensitiveData(att.normalizedSignature.trim())
        : null,
    })),
  };

  const canonicalJson = canonicalStringify(canonicalPayload);
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
