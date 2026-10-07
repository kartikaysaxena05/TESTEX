/**
 * @file packages/core/src/failures/evidence/failure-evidence-normalizer.ts
 * Authoritative evidence normalization engine for V6 Failure Intelligence (V6 Phase 75).
 */

import {
  FAILURE_EVIDENCE_BOUNDS,
  type EvidenceCompletenessStatus,
  type EvidenceIntegrityStatus,
  type EvidenceAvailabilityState,
  type NormalizedFailedStepDto,
  type NormalizedExpectedActualDto,
  type NormalizedConsoleMessageDto,
  type NormalizedNetworkRecordDto,
  type NormalizedDomEvidenceDto,
  type NormalizedRetryRecordDto,
  type NormalizedHealingRecordDto,
  type NormalizedEnvironmentDto,
  type FailureEvidencePackageDto,
  type FailureEvidenceReferenceDto,
} from './failure-evidence-types.js';
import { FailureEvidenceRedactor } from './failure-evidence-redactor.js';
import { FailureSignatureGenerator } from './failure-signature-generator.js';

export interface RawEvidenceNormalizationInput {
  readonly failureCase: {
    readonly id: string;
    readonly projectId: string;
    readonly executionId: string;
    readonly testRunId: string;
    readonly testCaseId: string;
    readonly testCaseVersionNumber: number;
    readonly triggeringExecutionStatus: any;
    readonly title: string;
    readonly failureSummary?: string | null;
    readonly errorCode?: string | null;
    readonly errorMessage?: string | null;
    readonly environmentId?: string | null;
    readonly metadataJson?: any;
    readonly testCase?: {
      readonly id: string;
      readonly testCaseKey?: string | null;
      readonly sourceRequirementId?: string | null;
      readonly sourceRequirementKey?: string | null;
    } | null;
  };
  readonly execution: {
    readonly id: string;
    readonly projectId: string;
    readonly testRunId: string;
    readonly attempt: number;
    readonly status: any;
    readonly browserEngine: string;
    readonly durationMs?: number | null;
    readonly startedAt?: Date | string | null;
    readonly completedAt?: Date | string | null;
    readonly errorCode?: string | null;
    readonly errorMessage?: string | null;
    readonly terminalReason?: string | null;
    readonly environmentSnapshotJson?: any;
    readonly metadataJson?: any;
    readonly testRun?: {
      readonly id: string;
      readonly environment?: {
        readonly name?: string | null;
        readonly baseUrl?: string | null;
        readonly browser?: string | null;
        readonly browserEngine?: string | null;
        readonly viewportWidth?: number | null;
        readonly viewportHeight?: number | null;
      } | null;
    } | null;
    readonly stepExecutions: Array<{
      readonly id: string;
      readonly stepIndex: number;
      readonly attempt: number;
      readonly actionType: string;
      readonly status: any;
      readonly targetSummary?: string | null;
      readonly expectedSummary?: string | null;
      readonly actualSummary?: string | null;
      readonly errorCode?: string | null;
      readonly errorMessage?: string | null;
      readonly durationMs?: number | null;
      readonly startedAt?: Date | string | null;
      readonly completedAt?: Date | string | null;
      readonly healingStatus?: string | null;
      readonly healedTargetJson?: any;
      readonly actionDataJson?: any;
    }>;
    readonly assertionExecutionRecords: Array<{
      readonly id: string;
      readonly stepExecutionId: string;
      readonly assertionType: string;
      readonly operator: string;
      readonly status: string;
      readonly isHard: boolean;
      readonly targetSummary?: string | null;
      readonly expectedValueJson?: any;
      readonly actualValueJson?: any;
      readonly message?: string | null;
      readonly errorCode?: string | null;
      readonly errorMessage?: string | null;
      readonly durationMs?: number | null;
    }>;
    readonly locatorHealingAttempts: Array<{
      readonly id: string;
      readonly originalSelector: string;
      readonly failureReason: string;
      readonly healingResult: string;
      readonly candidateCount: number;
      readonly selectedCandidateJson?: any;
      readonly selectedScore?: number | null;
      readonly confidenceThreshold: number;
    }>;
  };
  readonly siblingExecutions: Array<{
    readonly id: string;
    readonly attempt: number;
    readonly status: any;
    readonly durationMs?: number | null;
    readonly errorCode?: string | null;
    readonly errorMessage?: string | null;
    readonly startedAt?: Date | string | null;
    readonly completedAt?: Date | string | null;
  }>;
  readonly evidenceReferences: readonly FailureEvidenceReferenceDto[];
}

export class FailureEvidenceNormalizer {
  private readonly redactor: FailureEvidenceRedactor;
  private readonly signatureGenerator: FailureSignatureGenerator;

  constructor(redactor?: FailureEvidenceRedactor, signatureGenerator?: FailureSignatureGenerator) {
    this.redactor = redactor ?? new FailureEvidenceRedactor();
    this.signatureGenerator = signatureGenerator ?? new FailureSignatureGenerator();
  }

  /**
   * Normalizes raw execution and evidence reference data into a canonical FailureEvidencePackageDto.
   */
  public normalize(input: RawEvidenceNormalizationInput): FailureEvidencePackageDto {
    const { failureCase, execution, siblingExecutions, evidenceReferences } = input;

    // 1. Normalize Failed Step
    const failedStep = this.normalizeFailedStep(execution);

    // 2. Normalize Expected vs Actual
    const expectedVsActual = this.normalizeExpectedVsActual(execution, failedStep);

    // 3. Normalize Screenshots
    const screenshots = evidenceReferences.filter(r => r.artifactType === 'SCREENSHOT');

    // 4. Normalize Console Messages
    const { messages: consoleMessages, availability: consoleAvailability } =
      this.normalizeConsoleEvidence(evidenceReferences);

    // 5. Normalize Network Records
    const { records: networkRecords, availability: networkAvailability } =
      this.normalizeNetworkEvidence(evidenceReferences);

    // 6. Normalize Trace Reference
    const traceReference =
      evidenceReferences.find(r => r.artifactType === 'PLAYWRIGHT_TRACE') ?? null;
    const traceAvailability: EvidenceAvailabilityState = traceReference
      ? 'CAPTURED_AVAILABLE'
      : 'NOT_CAPTURED';

    // 7. Normalize DOM Evidence
    const { domEvidence, availability: domAvailability } =
      this.normalizeDomEvidence(evidenceReferences);

    // 8. Normalize Retries
    const retryHistory = this.normalizeRetryHistory(siblingExecutions, execution);

    // 9. Normalize Healing
    const healingRecords = this.normalizeHealingRecords(execution.locatorHealingAttempts);

    // 10. Normalize Environment
    const environment = this.normalizeEnvironment(execution);

    // 11. Compute Deterministic Failure Signature
    const failureSignature = this.signatureGenerator.generateSignature({
      actionType: failedStep?.actionType ?? null,
      targetSummary: failedStep?.targetSummary ?? null,
      errorCode: failureCase.errorCode ?? failedStep?.errorCode ?? execution.errorCode ?? null,
      errorMessage:
        failureCase.errorMessage ?? failedStep?.errorMessage ?? execution.errorMessage ?? null,
      assertionType: expectedVsActual?.assertionType ?? null,
      browserEngine: execution.browserEngine,
    });

    // 12. Aggregate Integrity Status
    const { overallIntegrity, integrityDetails } = this.aggregateIntegrity(evidenceReferences);

    // 13. Compute Truthful Completeness
    const completeness = this.computeCompleteness({
      hasFailedStep: Boolean(failedStep),
      hasExpectedActual: Boolean(expectedVsActual),
      hasScreenshots: screenshots.length > 0,
      consoleAvailability,
      networkAvailability,
      traceAvailability,
      domAvailability,
      hasEnvironment: Boolean(environment.baseUrl || environment.environmentName),
    });

    return {
      packageVersion: FAILURE_EVIDENCE_BOUNDS.NORMALIZER_VERSION,
      failureCaseId: failureCase.id,
      projectId: failureCase.projectId,
      executionId: failureCase.executionId,
      testRunId: failureCase.testRunId,
      testCaseId: failureCase.testCaseId,
      testCaseVersionNumber: failureCase.testCaseVersionNumber,
      requirementId: failureCase.testCase?.sourceRequirementId ?? null,
      requirementKey: failureCase.testCase?.sourceRequirementKey ?? null,
      failureSignature,
      triggeringStatus: failureCase.triggeringExecutionStatus,
      failedStep,
      expectedVsActual,
      screenshots: [...screenshots],
      consoleMessages,
      consoleAvailability,
      networkRecords,
      networkAvailability,
      traceReference,
      traceAvailability,
      domEvidence,
      domAvailability,
      retryHistory,
      healingRecords,
      environment,
      completeness,
      integrityStatus: overallIntegrity,
      integrityDetails,
      generatedAt: new Date().toISOString(),
    };
  }

  private normalizeFailedStep(
    execution: RawEvidenceNormalizationInput['execution'],
  ): NormalizedFailedStepDto | null {
    // Look for explicit failed step or first non-passed step
    const step =
      execution.stepExecutions.find(
        s => s.status === 'FAILED' || s.status === 'AUTOMATION_ERROR' || s.status === 'BLOCKED',
      ) ??
      execution.stepExecutions[execution.stepExecutions.length - 1] ??
      null;

    if (!step) {
      return null;
    }

    const { redacted: redactedError } = this.redactor.redactText(step.errorMessage || '');
    const { redacted: redactedExpected } = this.redactor.redactText(step.expectedSummary || '');
    const { redacted: redactedActual } = this.redactor.redactText(step.actualSummary || '');

    return {
      stepIndex: step.stepIndex,
      stepIdentity: step.id,
      actionType: step.actionType,
      targetSummary: step.targetSummary ?? null,
      expectedSummary: redactedExpected || null,
      actualSummary: redactedActual || null,
      errorCode: step.errorCode ?? null,
      errorMessage: redactedError || null,
      durationMs: step.durationMs ?? null,
      startedAt: step.startedAt ? new Date(step.startedAt).toISOString() : null,
      completedAt: step.completedAt ? new Date(step.completedAt).toISOString() : null,
      attempt: step.attempt,
      healingUsed: step.healingStatus === 'HEALED',
      healedTarget: step.healedTargetJson ? JSON.stringify(step.healedTargetJson) : null,
    };
  }

  private normalizeExpectedVsActual(
    execution: RawEvidenceNormalizationInput['execution'],
    failedStep: NormalizedFailedStepDto | null,
  ): NormalizedExpectedActualDto | null {
    // 1. Look in assertion execution records
    if (failedStep && execution.assertionExecutionRecords.length > 0) {
      const assertion = execution.assertionExecutionRecords.find(
        a => a.stepExecutionId === failedStep.stepIdentity,
      );
      if (assertion) {
        const { redacted: redactedMsg } = this.redactor.redactText(
          assertion.message || assertion.errorMessage || '',
        );
        const { redacted: expectedRedacted } = this.redactor.redactObject(
          assertion.expectedValueJson,
        );
        const { redacted: actualRedacted } = this.redactor.redactObject(assertion.actualValueJson);

        return {
          assertionType: assertion.assertionType,
          operator: assertion.operator,
          expectedValue: expectedRedacted,
          actualValue: actualRedacted,
          message: redactedMsg || null,
          target: assertion.targetSummary ?? null,
          isHard: assertion.isHard,
        };
      }
    }

    // 2. Fallback to failed step summaries
    if (failedStep && (failedStep.expectedSummary || failedStep.actualSummary)) {
      return {
        assertionType: 'STEP_OUTCOME',
        operator: 'EQUALS',
        expectedValue: failedStep.expectedSummary,
        actualValue: failedStep.actualSummary,
        message: failedStep.errorMessage ?? null,
        target: failedStep.targetSummary ?? null,
        isHard: true,
      };
    }

    return null;
  }

  private normalizeConsoleEvidence(references: readonly FailureEvidenceReferenceDto[]): {
    messages: NormalizedConsoleMessageDto[];
    availability: EvidenceAvailabilityState;
  } {
    const consoleRef = references.find(r => r.artifactType === 'CONSOLE_LOG');
    if (!consoleRef) {
      return { messages: [], availability: 'NOT_CAPTURED' };
    }

    const rawMessages = (consoleRef.metadataJson as any)?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return { messages: [], availability: 'CAPTURED_EMPTY' };
    }

    const normalized: NormalizedConsoleMessageDto[] = [];
    for (const msg of rawMessages.slice(0, FAILURE_EVIDENCE_BOUNDS.MAX_CONSOLE_MESSAGES)) {
      const rawText = typeof msg === 'string' ? msg : msg.message || JSON.stringify(msg);
      const { redacted, isRedacted } = this.redactor.redactText(rawText);

      const rawLevel = (msg.level || 'log').toLowerCase();
      const level = ['log', 'info', 'warn', 'warning', 'error', 'debug'].includes(rawLevel)
        ? rawLevel === 'warn'
          ? 'warn'
          : rawLevel
        : 'log';

      normalized.push({
        timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
        level: level as any,
        message: redacted,
        source: msg.source ?? null,
        url: msg.url ? this.redactor.redactUrl(msg.url).redacted : null,
        lineNumber: typeof msg.lineNumber === 'number' ? msg.lineNumber : null,
        columnNumber: typeof msg.columnNumber === 'number' ? msg.columnNumber : null,
        isRedacted,
      });
    }

    return { messages: normalized, availability: 'CAPTURED_AVAILABLE' };
  }

  private normalizeNetworkEvidence(references: readonly FailureEvidenceReferenceDto[]): {
    records: NormalizedNetworkRecordDto[];
    availability: EvidenceAvailabilityState;
  } {
    const netRefs = references.filter(
      r =>
        r.artifactType === 'NETWORK_LOG' ||
        r.artifactType === 'NETWORK_REQUEST' ||
        r.artifactType === 'NETWORK_RESPONSE',
    );

    if (netRefs.length === 0) {
      return { records: [], availability: 'NOT_CAPTURED' };
    }

    const records: NormalizedNetworkRecordDto[] = [];

    for (const ref of netRefs) {
      const rawRecords =
        (ref.metadataJson as any)?.records ||
        (ref.metadataJson as any)?.requests ||
        (ref.metadataJson as any)?.entries;

      if (Array.isArray(rawRecords)) {
        for (const item of rawRecords) {
          if (records.length >= FAILURE_EVIDENCE_BOUNDS.MAX_NETWORK_RECORDS) break;

          const rawUrl = item.url || item.requestUrl || '';
          const { redacted: redactedUrl, isRedacted: urlRedacted } =
            this.redactor.redactUrl(rawUrl);

          const { redacted: reqHeaders, isRedacted: reqHeadersRedacted } =
            this.redactor.redactHeaders(item.requestHeaders || item.headers);
          const { redacted: resHeaders, isRedacted: resHeadersRedacted } =
            this.redactor.redactHeaders(item.responseHeaders);

          const statusCode =
            typeof item.statusCode === 'number'
              ? item.statusCode
              : typeof item.status === 'number'
                ? item.status
                : null;

          const isFailed = Boolean(
            item.failed || item.isFailed || (statusCode && statusCode >= 400),
          );

          records.push({
            method: (item.method || 'GET').toUpperCase(),
            url: redactedUrl,
            resourceType: item.resourceType ?? null,
            statusCode,
            requestTimestamp: item.requestTimestamp
              ? new Date(item.requestTimestamp).toISOString()
              : item.timestamp
                ? new Date(item.timestamp).toISOString()
                : null,
            responseTimestamp: item.responseTimestamp
              ? new Date(item.responseTimestamp).toISOString()
              : null,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
            failureReason: item.failureReason ?? item.error ?? null,
            isFailed,
            requestHeaders: reqHeaders,
            responseHeaders: resHeaders,
            isRedacted: urlRedacted || reqHeadersRedacted || resHeadersRedacted,
          });
        }
      }
    }

    if (records.length === 0) {
      return { records: [], availability: 'CAPTURED_EMPTY' };
    }

    return { records, availability: 'CAPTURED_AVAILABLE' };
  }

  private normalizeDomEvidence(references: readonly FailureEvidenceReferenceDto[]): {
    domEvidence: NormalizedDomEvidenceDto | null;
    availability: EvidenceAvailabilityState;
  } {
    const domRef = references.find(r => r.artifactType === 'DOM_SNAPSHOT');
    if (!domRef) {
      return { domEvidence: null, availability: 'NOT_CAPTURED' };
    }

    const meta = domRef.metadataJson as any;
    if (!meta || Object.keys(meta).length === 0) {
      return { domEvidence: null, availability: 'CAPTURED_EMPTY' };
    }

    const rawHtml = meta.htmlFragment || meta.html || '';
    const boundedHtml = rawHtml.slice(0, FAILURE_EVIDENCE_BOUNDS.MAX_DOM_HTML_CHARS);

    return {
      domEvidence: {
        elementRole: meta.elementRole ?? meta.role ?? null,
        elementName: meta.elementName ?? meta.name ?? null,
        locator: meta.locator ?? meta.selector ?? null,
        isVisible: typeof meta.isVisible === 'boolean' ? meta.isVisible : null,
        isEnabled: typeof meta.isEnabled === 'boolean' ? meta.isEnabled : null,
        htmlFragment: boundedHtml || null,
        boundingBox: meta.boundingBox ?? null,
      },
      availability: 'CAPTURED_AVAILABLE',
    };
  }

  private normalizeRetryHistory(
    siblingExecutions: RawEvidenceNormalizationInput['siblingExecutions'],
    currentExecution: RawEvidenceNormalizationInput['execution'],
  ): NormalizedRetryRecordDto[] {
    const allExecs = [...siblingExecutions];
    if (!allExecs.some(e => e.id === currentExecution.id)) {
      allExecs.push({
        id: currentExecution.id,
        attempt: currentExecution.attempt,
        status: currentExecution.status,
        durationMs: currentExecution.durationMs,
        errorCode: currentExecution.errorCode,
        errorMessage: currentExecution.errorMessage,
        startedAt: currentExecution.startedAt,
        completedAt: currentExecution.completedAt,
      });
    }

    allExecs.sort((a, b) => a.attempt - b.attempt);

    return allExecs.slice(0, FAILURE_EVIDENCE_BOUNDS.MAX_RETRY_RECORDS).map(e => ({
      attempt: e.attempt,
      status: e.status,
      durationMs: e.durationMs ?? null,
      errorCode: e.errorCode ?? null,
      errorMessage: e.errorMessage ? this.redactor.redactText(e.errorMessage).redacted : null,
      startedAt: e.startedAt ? new Date(e.startedAt).toISOString() : null,
      completedAt: e.completedAt ? new Date(e.completedAt).toISOString() : null,
    }));
  }

  private normalizeHealingRecords(
    healingAttempts: RawEvidenceNormalizationInput['execution']['locatorHealingAttempts'],
  ): NormalizedHealingRecordDto[] {
    if (!Array.isArray(healingAttempts) || healingAttempts.length === 0) {
      return [];
    }

    return healingAttempts.slice(0, FAILURE_EVIDENCE_BOUNDS.MAX_HEALING_RECORDS).map(h => ({
      originalSelector: h.originalSelector,
      failureReason: h.failureReason,
      healingResult: h.healingResult,
      candidateCount: h.candidateCount,
      selectedCandidate: h.selectedCandidateJson
        ? typeof h.selectedCandidateJson === 'string'
          ? h.selectedCandidateJson
          : JSON.stringify(h.selectedCandidateJson)
        : null,
      selectedScore: h.selectedScore ?? null,
      confidenceThreshold: h.confidenceThreshold,
    }));
  }

  private normalizeEnvironment(
    execution: RawEvidenceNormalizationInput['execution'],
  ): NormalizedEnvironmentDto {
    const envMeta = execution.testRun?.environment;
    const snapMeta = execution.environmentSnapshotJson as any;

    return {
      environmentName: envMeta?.name ?? snapMeta?.environmentName ?? null,
      baseUrl: envMeta?.baseUrl ?? snapMeta?.baseUrl ?? null,
      browserEngine: execution.browserEngine || envMeta?.browser || 'chromium',
      browserVersion: snapMeta?.browserVersion ?? null,
      viewport:
        envMeta?.viewportWidth && envMeta?.viewportHeight
          ? { width: envMeta.viewportWidth, height: envMeta.viewportHeight }
          : (snapMeta?.viewport ?? null),
      operatingSystem: snapMeta?.operatingSystem ?? snapMeta?.os ?? null,
      locale: snapMeta?.locale ?? null,
      timezone: snapMeta?.timezone ?? null,
    };
  }

  private aggregateIntegrity(references: readonly FailureEvidenceReferenceDto[]): {
    overallIntegrity: EvidenceIntegrityStatus;
    integrityDetails: string | null;
  } {
    if (references.length === 0) {
      return { overallIntegrity: 'UNVERIFIED', integrityDetails: 'No evidence artifacts linked' };
    }

    const hasCorrupt = references.some(r => r.integrityStatus === 'CORRUPT');
    if (hasCorrupt) {
      return {
        overallIntegrity: 'CORRUPT',
        integrityDetails: 'One or more evidence artifacts are corrupt',
      };
    }

    const hasMismatch = references.some(r => r.integrityStatus === 'MISMATCH');
    if (hasMismatch) {
      return {
        overallIntegrity: 'MISMATCH',
        integrityDetails: 'Cryptographic SHA-256 mismatch detected in evidence artifact',
      };
    }

    const hasMissing = references.some(r => r.integrityStatus === 'MISSING');
    if (hasMissing) {
      return {
        overallIntegrity: 'MISSING',
        integrityDetails: 'One or more referenced evidence files are missing from storage',
      };
    }

    const allVerified = references.every(r => r.integrityStatus === 'VERIFIED');
    if (allVerified) {
      return { overallIntegrity: 'VERIFIED', integrityDetails: null };
    }

    return {
      overallIntegrity: 'UNVERIFIED',
      integrityDetails: 'Evidence items have not been fully verified',
    };
  }

  private computeCompleteness(checks: {
    hasFailedStep: boolean;
    hasExpectedActual: boolean;
    hasScreenshots: boolean;
    consoleAvailability: EvidenceAvailabilityState;
    networkAvailability: EvidenceAvailabilityState;
    traceAvailability: EvidenceAvailabilityState;
    domAvailability: EvidenceAvailabilityState;
    hasEnvironment: boolean;
  }): EvidenceCompletenessStatus {
    const hasDiagnosticLogs =
      checks.consoleAvailability === 'CAPTURED_AVAILABLE' ||
      checks.consoleAvailability === 'CAPTURED_EMPTY' ||
      checks.networkAvailability === 'CAPTURED_AVAILABLE' ||
      checks.networkAvailability === 'CAPTURED_EMPTY';

    if (
      checks.hasFailedStep &&
      checks.hasExpectedActual &&
      checks.hasScreenshots &&
      hasDiagnosticLogs &&
      checks.hasEnvironment
    ) {
      return 'COMPLETE';
    }

    if (checks.hasFailedStep && (checks.hasExpectedActual || checks.hasScreenshots)) {
      return 'PARTIAL';
    }

    if (checks.hasFailedStep || checks.hasScreenshots) {
      return 'MINIMAL';
    }

    return 'INSUFFICIENT';
  }
}
