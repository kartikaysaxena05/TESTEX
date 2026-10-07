/**
 * @file packages/core/src/failures/bug-report/bug-report-fingerprint.ts
 * Deterministic SHA-256 fingerprint generator for Phase 87: Structured Bug Report Generation.
 */

import crypto from 'node:crypto';
import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import type {
  ApplicationDefectStateDto,
  DerivedReproductionStepDto,
  ReportEvidenceReferenceDto,
} from './bug-report-types.js';

const redactor = new FailureEvidenceRedactor();

export interface BugReportFingerprintPayload {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly reportNumber: string;
  readonly revision: number;
  readonly defectState: ApplicationDefectStateDto;
  readonly isApplicationDefect: boolean;
  readonly title: string;
  readonly preconditions: readonly string[];
  readonly reproductionSteps: readonly DerivedReproductionStepDto[];
  readonly expectedBehavior: string;
  readonly actualBehavior: string;
  readonly rootCauseHypothesis?: string | null;
  readonly probableLayer?: string | null;
  readonly probableComponent?: string | null;
  readonly severity?: string | null;
  readonly priority?: string | null;
  readonly clusterKey?: string | null;
  readonly calibratedScore?: number | null;
  readonly evidenceReferences: readonly ReportEvidenceReferenceDto[];
  readonly limitationsAndUnknowns: readonly string[];
}

/**
 * Recursively sorts object keys and redacts sensitive tokens from strings.
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
 * Computes a collision-resistant deterministic SHA-256 fingerprint for a bug report.
 */
export function computeBugReportFingerprint(payload: BugReportFingerprintPayload): string {
  const canonical = canonicalizeJson({
    projectId: payload.projectId,
    failureCaseId: payload.failureCaseId,
    reportNumber: payload.reportNumber,
    revision: payload.revision,
    defectState: payload.defectState,
    isApplicationDefect: payload.isApplicationDefect,
    title: payload.title,
    preconditions: payload.preconditions,
    reproductionSteps: payload.reproductionSteps.map(step => ({
      stepIndex: step.stepIndex,
      actionType: step.actionType,
      description: step.description,
      status: step.status,
      isFailureStep: step.isFailureStep,
      errorMessage: step.errorMessage ?? null,
    })),
    expectedBehavior: payload.expectedBehavior,
    actualBehavior: payload.actualBehavior,
    rootCauseHypothesis: payload.rootCauseHypothesis ?? null,
    probableLayer: payload.probableLayer ?? null,
    probableComponent: payload.probableComponent ?? null,
    severity: payload.severity ?? null,
    priority: payload.priority ?? null,
    clusterKey: payload.clusterKey ?? null,
    calibratedScore:
      payload.calibratedScore !== null && payload.calibratedScore !== undefined
        ? Number(payload.calibratedScore.toFixed(4))
        : null,
    evidenceReferences: payload.evidenceReferences.map(e => ({
      id: e.id,
      evidenceType: e.evidenceType,
      sha256: e.sha256,
      integrityStatus: e.integrityStatus,
    })),
    limitationsAndUnknowns: payload.limitationsAndUnknowns,
  });

  const serialized = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
