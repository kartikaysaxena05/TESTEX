/**
 * @file packages/core/src/failures/localization/localization-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Failure Evidence Correlation & Technical Cause Localization (V6 Phase 81).
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import type {
  TechnicalLayer,
  LocalizationTargetType,
  CorrelationSignalDto,
} from '@ai-quality/contracts';

const redactor = new FailureEvidenceRedactor();

export interface LocalizationFingerprintFacts {
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly primaryLayer: TechnicalLayer;
  readonly secondaryLayers: readonly TechnicalLayer[];
  readonly primaryTargetType: LocalizationTargetType;
  readonly primaryTargetIdentifier: string;
  readonly matchedFilePath?: string | null;
  readonly matchedSymbolName?: string | null;
  readonly httpEndpoint?: string | null;
  readonly httpMethod?: string | null;
  readonly httpStatusCode?: number | null;
  readonly domSelector?: string | null;
  readonly correlationSignals: readonly CorrelationSignalDto[];
  readonly evidenceReferences: readonly string[];
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
 * Computes an invariant SHA-256 cryptographic digest across canonical localization facts.
 */
export function generateLocalizationFingerprint(facts: LocalizationFingerprintFacts): string {
  const canonicalSignals = [...facts.correlationSignals]
    .map(s => ({
      signalId: s.signalId,
      technicalLayer: s.technicalLayer,
      targetType: s.targetType,
      targetIdentity: redactor.redactText(s.targetIdentity).redacted,
      strength: s.strength,
      sourceEvidenceKey: s.sourceEvidenceKey,
    }))
    .sort((a, b) => a.signalId.localeCompare(b.signalId));

  const canonicalPayload = {
    failureCaseId: facts.failureCaseId,
    testCaseId: facts.testCaseId,
    primaryLayer: facts.primaryLayer,
    secondaryLayers: [...facts.secondaryLayers].sort(),
    primaryTargetType: facts.primaryTargetType,
    primaryTargetIdentifier: redactor.redactText(facts.primaryTargetIdentifier).redacted,
    matchedFilePath: facts.matchedFilePath ?? null,
    matchedSymbolName: facts.matchedSymbolName ?? null,
    httpEndpoint: facts.httpEndpoint ? redactor.redactText(facts.httpEndpoint).redacted : null,
    httpMethod: facts.httpMethod ?? null,
    httpStatusCode: facts.httpStatusCode ?? null,
    domSelector: facts.domSelector ? redactor.redactText(facts.domSelector).redacted : null,
    correlationSignals: canonicalSignals,
    evidenceReferences: [...facts.evidenceReferences].sort(),
  };

  const canonicalJson = JSON.stringify(canonicalizeJson(canonicalPayload));
  return crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
