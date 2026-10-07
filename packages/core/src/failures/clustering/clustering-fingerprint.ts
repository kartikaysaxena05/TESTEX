/**
 * @file packages/core/src/failures/clustering/clustering-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 85 Duplicate Failure Detection & Defect Clustering.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';

const redactor = new FailureEvidenceRedactor();

export interface DefectClusterFingerprintFacts {
  readonly projectId: string;
  readonly clusterKey: string;
  readonly representativeFailureId: string;
  readonly activeMemberFailureIds: readonly string[];
  readonly probableLayer?: string | null;
  readonly probableComponent?: string | null;
  readonly severitySummary?: string | null;
  readonly prioritySummary?: string | null;
  readonly affectedRequirements?: readonly string[];
  readonly affectedRoutes?: readonly string[];
  readonly affectedBuilds?: readonly string[];
  readonly version: number;
}

/**
 * Deterministically sorts object keys recursively for canonical JSON serialization with secret redaction.
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
 * Generates an invariant 64-character SHA-256 digest for a defect cluster.
 */
export function generateClusterFingerprint(facts: DefectClusterFingerprintFacts): string {
  const canonicalPayload = canonicalizeJson({
    projectId: facts.projectId,
    clusterKey: facts.clusterKey,
    representativeFailureId: facts.representativeFailureId,
    activeMemberFailureIds: [...facts.activeMemberFailureIds].sort(),
    probableLayer: facts.probableLayer ?? null,
    probableComponent: facts.probableComponent ?? null,
    severitySummary: facts.severitySummary ?? null,
    prioritySummary: facts.prioritySummary ?? null,
    affectedRequirements: [...(facts.affectedRequirements ?? [])].sort(),
    affectedRoutes: [...(facts.affectedRoutes ?? [])].sort(),
    affectedBuilds: [...(facts.affectedBuilds ?? [])].sort(),
    version: facts.version,
  });

  const serialized = JSON.stringify(canonicalPayload);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
