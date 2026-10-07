/**
 * @file packages/core/src/failures/impact/impact-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 84 Severity, Priority & Impact Intelligence.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

const redactor = new FailureEvidenceRedactor();

export interface ImpactFingerprintFacts {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly testCaseId: string;
  readonly testCaseVersionNumber: number;
  readonly severity: string;
  readonly severityRuleId: string;
  readonly priority: string;
  readonly priorityRuleId: string;
  readonly releaseRecommendation: string;
  readonly userImpact: string;
  readonly dataImpact: string;
  readonly securityImpact: string;
  readonly availabilityImpact: string;
  readonly blastRadius: string;
  readonly workaroundStatus: string;
  readonly domain?: string | null;
  readonly technicalLayer?: string | null;
  readonly rootCauseStatus?: string | null;
  readonly rootCauseProbableLayer?: string | null;
  readonly evidenceArtifactHashes: readonly string[];
  readonly severityModelVersion: string;
  readonly priorityModelVersion: string;
  readonly impactModelVersion: string;
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
 * Computes an invariant 64-character SHA-256 cryptographic digest across canonical impact assessment facts.
 */
export function generateImpactFingerprint(facts: ImpactFingerprintFacts): string {
  const normalizedFacts = {
    projectId: facts.projectId.trim().toLowerCase(),
    failureCaseId: facts.failureCaseId.trim().toLowerCase(),
    testCaseId: facts.testCaseId.trim().toLowerCase(),
    testCaseVersionNumber: facts.testCaseVersionNumber,
    severity: facts.severity.trim().toUpperCase(),
    severityRuleId: facts.severityRuleId.trim(),
    priority: facts.priority.trim().toUpperCase(),
    priorityRuleId: facts.priorityRuleId.trim(),
    releaseRecommendation: facts.releaseRecommendation.trim().toUpperCase(),
    userImpact: facts.userImpact.trim().toUpperCase(),
    dataImpact: facts.dataImpact.trim().toUpperCase(),
    securityImpact: facts.securityImpact.trim().toUpperCase(),
    availabilityImpact: facts.availabilityImpact.trim().toUpperCase(),
    blastRadius: facts.blastRadius.trim().toUpperCase(),
    workaroundStatus: facts.workaroundStatus.trim().toUpperCase(),
    domain: facts.domain ?? null,
    technicalLayer: facts.technicalLayer ?? null,
    rootCauseStatus: facts.rootCauseStatus ?? null,
    rootCauseProbableLayer: facts.rootCauseProbableLayer ?? null,
    evidenceArtifactHashes: [...facts.evidenceArtifactHashes].sort(),
    severityModelVersion: facts.severityModelVersion.trim(),
    priorityModelVersion: facts.priorityModelVersion.trim(),
    impactModelVersion: facts.impactModelVersion.trim(),
  };

  const canonicalPayload = JSON.stringify(canonicalizeJson(normalizedFacts));
  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}
