/**
 * @file packages/core/src/failures/bug-report/bug-report-generator.ts
 * Synthesizes upstream failure intelligence into a structured bug report payload and markdown document.
 *
 * Core Principles:
 * 1. Historical Traceability: links exact test case version and requirement version that ran.
 * 2. Step Derivation: reconstructs concrete reproduction steps from StepExecutionRecord telemetry.
 * 3. Epistemic Humility: root-cause is labeled strictly as [HYPOTHESIS], never asserted as verified code fact.
 * 4. Non-fabrication: limitations and missing telemetry are explicitly declared in "Limitations & Unknowns".
 * 5. Complete Secret Redaction: sanitizes passwords, bearer tokens, session cookies, database URLs.
 */

import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import { BugReportEligibilityEvaluator } from './bug-report-eligibility-evaluator.js';
import { computeBugReportFingerprint } from './bug-report-fingerprint.js';
import {
  BUG_REPORT_BOUNDS,
  type StructuredBugReportFacts,
  type GeneratedBugReportContent,
  type DerivedReproductionStepDto,
  type ReportEvidenceReferenceDto,
} from './bug-report-types.js';

const redactor = new FailureEvidenceRedactor();

export interface GenerateBugReportOptions {
  readonly reportNumber: string;
  readonly revision: number;
  readonly titleOverride?: string;
  readonly eligibilityEvaluator?: BugReportEligibilityEvaluator;
}

export class BugReportGenerator {
  private readonly eligibilityEvaluator: BugReportEligibilityEvaluator;

  constructor(eligibilityEvaluator?: BugReportEligibilityEvaluator) {
    this.eligibilityEvaluator = eligibilityEvaluator ?? new BugReportEligibilityEvaluator();
  }

  /**
   * Scans failure facts for plaintext secrets, API keys, database credentials, and passwords.
   */
  private collectKnownSecrets(facts: StructuredBugReportFacts): Set<string> {
    const secrets = new Set<string>();

    const scanObject = (obj: unknown) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof v === 'string' && v.length >= 2) {
          if (redactor.isSensitiveKey(k)) {
            secrets.add(v);
          }
          const dbMatch = /:\/\/[^:]+:([^@]+)@/.exec(v);
          if (dbMatch && dbMatch[1]) {
            secrets.add(dbMatch[1]);
          }
        } else if (v && typeof v === 'object') {
          scanObject(v);
        }
      }
    };

    if (facts.testExecution.environmentSnapshotJson) {
      scanObject(facts.testExecution.environmentSnapshotJson);
    }
    if (facts.testExecution.browserConfigJson) {
      scanObject(facts.testExecution.browserConfigJson);
    }
    if (facts.failureCase.metadataJson) {
      scanObject(facts.failureCase.metadataJson);
    }

    const scanText = (text: string | null | undefined) => {
      if (!text || typeof text !== 'string') return;
      const dbMatch = /:\/\/[^:]+:([^@]+)@/.exec(text);
      if (dbMatch && dbMatch[1]) {
        secrets.add(dbMatch[1]);
      }
    };
    scanText(facts.failureCase.title);
    scanText(facts.failureCase.failureSummary);
    scanText(facts.testExecution.errorMessage);

    for (const step of facts.testExecution.stepExecutions || []) {
      if (step.actionDataJson) {
        try {
          const parsed = JSON.parse(step.actionDataJson);
          scanObject(parsed);
        } catch {
          // ignore
        }
      }
      if (
        step.targetSummary &&
        /pass(word)?|secret|token|credential/i.test(step.targetSummary) &&
        step.actualSummary
      ) {
        const typedMatch = /^Typed\s+(.+)$/i.exec(step.actualSummary);
        if (typedMatch && typedMatch[1]) {
          secrets.add(typedMatch[1].trim());
        }
      }
    }

    return secrets;
  }

  /**
   * Sanitizes text using both standard regex redactor and registered known secrets.
   */
  private sanitize(text: string, knownSecrets?: Set<string>): string {
    let result = redactor.redactText(text).redacted;
    if (knownSecrets) {
      for (const s of knownSecrets) {
        if (s && s.length >= 2 && result.includes(s)) {
          result = result.replaceAll(s, '[REDACTED]');
        }
      }
    }
    return result;
  }

  /**
   * Generates structured report content from multi-phase failure facts.
   */
  public generate(
    facts: StructuredBugReportFacts,
    options: GenerateBugReportOptions,
  ): GeneratedBugReportContent {
    const knownSecrets = this.collectKnownSecrets(facts);

    // 1. Evaluate eligibility & defect state
    const eligibility = this.eligibilityEvaluator.evaluateEligibility(facts);

    // 2. Derive Reproduction Steps from StepExecutionRecord telemetry
    const { reproductionSteps, failedStepIndex } = this.deriveReproductionSteps(
      facts,
      knownSecrets,
    );

    // 3. Extract Expected vs Actual Behavior
    const { expectedBehavior, actualBehavior } = this.extractExpectedVsActual(
      facts,
      reproductionSteps,
      failedStepIndex,
      knownSecrets,
    );

    // 4. Extract Preconditions
    const preconditions = this.extractPreconditions(facts);

    // 5. Extract Limitations and Unknowns
    const limitationsAndUnknowns = this.extractLimitations(
      facts,
      eligibility.defectState,
      reproductionSteps,
    );

    // 6. Format Title
    const title = this.formatTitle(
      facts,
      eligibility.defectState,
      options.titleOverride,
      knownSecrets,
    );

    // 7. Format Executive Summary
    const summary = this.formatSummary(
      facts,
      eligibility.defectState,
      eligibility.eligibilityReason,
      knownSecrets,
    );

    // 8. Sanitize Environment Summary
    const environmentSummary = this.buildEnvironmentSummary(facts);

    // 9. Root-cause hypothesis (strictly framed as hypothesis)
    const rootCauseHypothesis = this.formatRootCauseHypothesis(facts);

    // 10. Technical localization
    const probableLayer =
      facts.technicalLocalization?.probableLayer ?? facts.rootCauseAnalysis?.probableLayer ?? null;
    const probableComponent =
      facts.technicalLocalization?.probableComponent ??
      facts.rootCauseAnalysis?.probableComponent ??
      null;

    // 11. Severity & Priority
    const severity = facts.impactAssessment?.assessedSeverity ?? null;
    const priority = facts.impactAssessment?.assessedPriority ?? null;

    // 12. Clustering
    const clusterKey = facts.clusterMembership?.clusterKey ?? null;
    const clusterMemberCount = facts.clusterMembership?.clusterSize ?? null;

    // 13. Calibrated Confidence Score
    const calibratedScore = facts.confidenceAssessment?.calibratedScore ?? null;

    // 14. Evidence References with integrity status
    const evidenceReferences: readonly ReportEvidenceReferenceDto[] = facts.evidenceReferences.map(
      ref => ({
        id: ref.id,
        evidenceType: ref.evidenceType,
        filePath: redactor.redactText(ref.filePath).redacted,
        sha256: ref.sha256,
        byteSize: ref.byteSize,
        mimeType: ref.mimeType,
        integrityStatus: ref.integrityStatus,
        description: ref.description ? redactor.redactText(ref.description).redacted : undefined,
      }),
    );

    // 15. Generate Markdown Report
    const reportMarkdown = this.renderMarkdownReport({
      facts,
      reportNumber: options.reportNumber,
      revision: options.revision,
      title,
      summary,
      defectState: eligibility.defectState,
      isApplicationDefect: eligibility.isApplicationDefect,
      eligibilityReason: eligibility.eligibilityReason,
      preconditions,
      reproductionSteps,
      expectedBehavior,
      actualBehavior,
      failedStepIndex,
      rootCauseHypothesis,
      probableLayer,
      probableComponent,
      severity,
      priority,
      clusterKey,
      clusterMemberCount,
      calibratedScore,
      evidenceReferences,
      limitationsAndUnknowns,
      environmentSummary,
      knownSecrets,
    });

    // 16. Compute SHA-256 Fingerprint
    const reportFingerprint = computeBugReportFingerprint({
      projectId: facts.projectId,
      failureCaseId: facts.failureCaseId,
      reportNumber: options.reportNumber,
      revision: options.revision,
      defectState: eligibility.defectState,
      isApplicationDefect: eligibility.isApplicationDefect,
      title,
      preconditions,
      reproductionSteps,
      expectedBehavior,
      actualBehavior,
      rootCauseHypothesis,
      probableLayer,
      probableComponent,
      severity,
      priority,
      clusterKey,
      calibratedScore,
      evidenceReferences,
      limitationsAndUnknowns,
    });

    return {
      defectState: eligibility.defectState,
      isApplicationDefect: eligibility.isApplicationDefect,
      title,
      summary,
      environmentSummary,
      requirementId: facts.testCase?.sourceRequirementId ?? facts.requirement?.id ?? null,
      requirementKey: facts.testCase?.sourceRequirementKey ?? facts.requirement?.key ?? null,
      requirementVersion:
        facts.testCase?.sourceRequirementVersionNumber ?? facts.requirement?.version ?? null,
      testCaseId: facts.testCase?.id ?? facts.testExecution.testCaseId ?? null,
      testCaseKey: facts.testCase?.key ?? null,
      testCaseVersion: facts.testExecution.testCaseVersionNumber ?? facts.testCase?.version ?? null,
      executionPlanId: facts.testExecution.executableTestPlanId ?? null,
      preconditions,
      reproductionSteps,
      expectedBehavior,
      actualBehavior,
      failedStepIndex,
      rootCauseHypothesis,
      probableLayer,
      probableComponent,
      severity,
      priority,
      clusterKey,
      clusterMemberCount,
      calibratedScore,
      evidenceReferences,
      limitationsAndUnknowns,
      reportMarkdown,
      reportFingerprint,
      generatorVersion: BUG_REPORT_BOUNDS.GENERATOR_VERSION,
    };
  }

  /**
   * Derives concrete reproduction steps from recorded StepExecutionRecord telemetry.
   */
  private deriveReproductionSteps(
    facts: StructuredBugReportFacts,
    knownSecrets?: Set<string>,
  ): {
    reproductionSteps: readonly DerivedReproductionStepDto[];
    failedStepIndex: number | null;
  } {
    const rawSteps = facts.testExecution.stepExecutions || [];
    if (rawSteps.length === 0) {
      return { reproductionSteps: [], failedStepIndex: null };
    }

    const sorted = [...rawSteps].sort((a, b) => a.stepIndex - b.stepIndex);
    let detectedFailedStepIndex: number | null = null;

    const reproductionSteps: DerivedReproductionStepDto[] = sorted.map(step => {
      const isFailed = step.status?.toUpperCase() === 'FAILED';
      if (isFailed && detectedFailedStepIndex === null) {
        detectedFailedStepIndex = step.stepIndex;
      }

      // Generate human-readable description
      let description = `${step.actionType}: ${step.targetSummary || 'Target Element'}`;
      if (step.actionDataJson) {
        try {
          const parsed = JSON.parse(step.actionDataJson);
          const sanitized = redactor.redactObject(parsed);
          const payloadContent = (sanitized as any).redacted ?? sanitized;
          description += ` (with payload: ${JSON.stringify(payloadContent)})`;
        } catch {
          description += ` (${this.sanitize(step.actionDataJson, knownSecrets)})`;
        }
      }

      return {
        stepIndex: step.stepIndex,
        actionType: step.actionType,
        description: this.sanitize(description, knownSecrets),
        targetSummary: step.targetSummary ? this.sanitize(step.targetSummary, knownSecrets) : null,
        actionDataJson: step.actionDataJson
          ? this.sanitize(step.actionDataJson, knownSecrets)
          : null,
        expectedSummary: step.expectedSummary
          ? this.sanitize(step.expectedSummary, knownSecrets)
          : null,
        actualSummary: step.actualSummary ? this.sanitize(step.actualSummary, knownSecrets) : null,
        status: step.status,
        isFailureStep: isFailed,
        errorMessage: step.errorMessage ? this.sanitize(step.errorMessage, knownSecrets) : null,
      };
    });

    return {
      reproductionSteps,
      failedStepIndex: detectedFailedStepIndex,
    };
  }

  /**
   * Extracts expected vs actual behavior facts from execution telemetry.
   */
  private extractExpectedVsActual(
    facts: StructuredBugReportFacts,
    reproductionSteps: readonly DerivedReproductionStepDto[],
    failedStepIndex: number | null,
    knownSecrets?: Set<string>,
  ): { expectedBehavior: string; actualBehavior: string } {
    let expectedBehavior =
      'Test execution completes all steps successfully and satisfies all assertions.';
    let actualBehavior = 'Test execution halted prematurely due to an unhandled failure.';

    // 1. From failed step if available
    if (failedStepIndex !== null) {
      const failedStep = reproductionSteps.find(s => s.stepIndex === failedStepIndex);
      if (failedStep) {
        if (failedStep.expectedSummary) {
          expectedBehavior = failedStep.expectedSummary;
        }
        if (failedStep.actualSummary || failedStep.errorMessage) {
          actualBehavior = failedStep.actualSummary || failedStep.errorMessage!;
        }
      }
    }

    // 2. If test case overallExpectedResult exists, use as primary expected baseline
    if (facts.testCase?.overallExpectedResult) {
      expectedBehavior = facts.testCase.overallExpectedResult;
    }

    // 3. If execution error message exists and actualBehavior is generic, supplement with execution error
    if (facts.testExecution.errorMessage && actualBehavior.includes('halted prematurely')) {
      actualBehavior = facts.testExecution.errorMessage;
    } else if (facts.failureCase.failureSummary && actualBehavior.includes('halted prematurely')) {
      actualBehavior = facts.failureCase.failureSummary;
    }

    return {
      expectedBehavior: this.sanitize(expectedBehavior, knownSecrets),
      actualBehavior: this.sanitize(actualBehavior, knownSecrets),
    };
  }

  /**
   * Extracts and deduplicates preconditions.
   */
  private extractPreconditions(facts: StructuredBugReportFacts): readonly string[] {
    const preconditions: string[] = [];

    if (facts.testCase?.preconditions && facts.testCase.preconditions.length > 0) {
      for (const p of facts.testCase.preconditions) {
        const sanitized = redactor.redactText(p.trim()).redacted;
        if (sanitized && !preconditions.includes(sanitized)) {
          preconditions.push(sanitized);
        }
      }
    }

    if (preconditions.length === 0) {
      preconditions.push('System deployed and reachable in designated test environment');
      preconditions.push('Authenticated session established if required by test case');
    }

    return preconditions.slice(0, BUG_REPORT_BOUNDS.MAX_PRECONDITIONS);
  }

  /**
   * Explicitly notes what telemetry was absent, inconclusive, or constrained.
   */
  private extractLimitations(
    facts: StructuredBugReportFacts,
    defectState: string,
    reproductionSteps: readonly DerivedReproductionStepDto[],
  ): readonly string[] {
    const limitations: string[] = [];

    if (reproductionSteps.length === 0) {
      limitations.push('Step-level telemetry was not captured for this execution run.');
    }

    if (!facts.testCase?.sourceRequirementId && !facts.requirement) {
      limitations.push(
        'Test case has no direct linked requirement; requirement traceability is indirect or unmapped.',
      );
    }

    if (!facts.reproductionSummary || facts.reproductionSummary.attemptCount === 0) {
      limitations.push(
        'Autonomous sandbox reproduction has not been executed for this failure case.',
      );
    } else if (facts.reproductionSummary.status !== 'REPRODUCED') {
      limitations.push(
        `Autonomous reproduction attempted (${facts.reproductionSummary.attemptCount} trials) but status was ${facts.reproductionSummary.status}.`,
      );
    }

    if (facts.rootCauseAnalysis?.rootCauseHypothesis) {
      limitations.push(
        'Root-cause analysis is a probabilistic hypothesis generated from telemetry and heuristics; it does not constitute a verified code fact.',
      );
    } else {
      limitations.push(
        'No formal root-cause analysis hypothesis has been computed yet for this failure.',
      );
    }

    const hasHar = facts.evidenceReferences.some(
      e => e.evidenceType === 'NETWORK_HAR' || e.mimeType.includes('har'),
    );
    if (!hasHar) {
      limitations.push(
        'HTTP network archive (HAR) trace was not available in the ingested evidence bundle.',
      );
    }

    if (
      defectState !== 'CONFIRMED_APPLICATION_DEFECT' &&
      defectState !== 'SUPPORTED_APPLICATION_DEFECT'
    ) {
      limitations.push(
        `This report documents a non-application defect (${defectState}); it must NOT be prioritized as an application bug ticket.`,
      );
    }

    return limitations.slice(0, BUG_REPORT_BOUNDS.MAX_LIMITATIONS);
  }

  /**
   * Formats a collision-free descriptive title.
   */
  private formatTitle(
    facts: StructuredBugReportFacts,
    defectState: string,
    titleOverride?: string,
    knownSecrets?: Set<string>,
  ): string {
    if (titleOverride && titleOverride.trim().length > 0) {
      return this.sanitize(titleOverride.trim(), knownSecrets).slice(
        0,
        BUG_REPORT_BOUNDS.MAX_TITLE_LENGTH,
      );
    }

    const key = facts.testCase?.key || facts.project.key;
    const baseSummary =
      facts.failureCase.failureSummary ||
      facts.testExecution.errorMessage ||
      facts.failureCase.title ||
      'Unexpected execution failure';

    const cleanSummary = this.sanitize(baseSummary.replace(/[\r\n]+/g, ' ').trim(), knownSecrets);

    const formatted = `[${defectState}] ${key}: ${cleanSummary}`;
    return this.sanitize(formatted, knownSecrets).slice(0, BUG_REPORT_BOUNDS.MAX_TITLE_LENGTH);
  }

  /**
   * Formats the executive summary text.
   */
  private formatSummary(
    facts: StructuredBugReportFacts,
    defectState: string,
    eligibilityReason: string,
    knownSecrets?: Set<string>,
  ): string {
    const parts: string[] = [];

    parts.push(`Defect State: **${defectState}** (${eligibilityReason})`);

    if (facts.failureCase.failureSummary) {
      parts.push(this.sanitize(facts.failureCase.failureSummary, knownSecrets));
    } else if (facts.testExecution.errorMessage) {
      parts.push(
        `Failure Message: ${this.sanitize(facts.testExecution.errorMessage, knownSecrets)}`,
      );
    }

    if (facts.impactAssessment) {
      const { assessedSeverity, assessedPriority, businessImpact } = facts.impactAssessment;
      if (assessedSeverity || assessedPriority) {
        parts.push(
          `Impact Assessment: Severity **${assessedSeverity ?? 'UNASSESSED'}**, Priority **${assessedPriority ?? 'UNASSESSED'}**.`,
        );
      }
      if (businessImpact) {
        parts.push(`Business Impact: ${this.sanitize(businessImpact, knownSecrets)}`);
      }
    }

    return this.sanitize(parts.join('\n\n'), knownSecrets).slice(
      0,
      BUG_REPORT_BOUNDS.MAX_SUMMARY_LENGTH,
    );
  }

  /**
   * Builds sanitized environment summary JSON.
   */
  private buildEnvironmentSummary(facts: StructuredBugReportFacts): Record<string, unknown> {
    const rawEnv = facts.testExecution.environmentSnapshotJson || {};
    const rawBrowser = facts.testExecution.browserConfigJson || {};

    const merged = {
      environmentId: facts.testExecution.environmentId ?? 'DEFAULT',
      ...rawEnv,
      ...rawBrowser,
    };

    return redactor.redactObject(merged) as Record<string, unknown>;
  }

  /**
   * Formats root-cause hypothesis with strict epistemic framing.
   */
  private formatRootCauseHypothesis(facts: StructuredBugReportFacts): string | null {
    if (facts.rootCauseAnalysis?.rootCauseHypothesis) {
      const sanitized = redactor.redactText(facts.rootCauseAnalysis.rootCauseHypothesis).redacted;
      const status = facts.rootCauseAnalysis.epistemicStatus || 'HYPOTHESIS';
      return `[${status}] ${sanitized}`;
    }

    if (facts.aiAssessment?.probableRootCause) {
      const sanitized = redactor.redactText(facts.aiAssessment.probableRootCause).redacted;
      return `[AI_INFERENCE] ${sanitized}`;
    }

    if (facts.technicalLocalization?.primaryFailurePoint) {
      const sanitized = redactor.redactText(
        facts.technicalLocalization.primaryFailurePoint,
      ).redacted;
      return `[LOCALIZATION_HEURISTIC] Primary failure localized to ${sanitized}`;
    }

    return null;
  }

  /**
   * Renders the complete report into an auditable GitHub Flavored Markdown document.
   */
  private renderMarkdownReport(data: {
    facts: StructuredBugReportFacts;
    reportNumber: string;
    revision: number;
    title: string;
    summary: string;
    defectState: string;
    isApplicationDefect: boolean;
    eligibilityReason: string;
    preconditions: readonly string[];
    reproductionSteps: readonly DerivedReproductionStepDto[];
    expectedBehavior: string;
    actualBehavior: string;
    failedStepIndex: number | null;
    rootCauseHypothesis: string | null;
    probableLayer: string | null;
    probableComponent: string | null;
    severity: string | null;
    priority: string | null;
    clusterKey: string | null;
    clusterMemberCount: number | null;
    calibratedScore: number | null;
    evidenceReferences: readonly ReportEvidenceReferenceDto[];
    limitationsAndUnknowns: readonly string[];
    environmentSummary: Record<string, unknown>;
    knownSecrets?: Set<string>;
  }): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${data.reportNumber} (Rev ${data.revision}): ${data.title}`);
    lines.push('');
    lines.push(`> **Platform Internal Defect Report**`);
    lines.push(
      `> Project: \`${data.facts.project.name} (${data.facts.project.key})\` | Defect State: **${data.defectState}** | Application Defect: **${data.isApplicationDefect ? 'YES' : 'NO'}**`,
    );
    lines.push('');

    // Metadata Table
    lines.push('## Triage & Classification Overview');
    lines.push('');
    lines.push('| Attribute | Value |');
    lines.push('| :--- | :--- |');
    lines.push(`| **Report Number** | \`${data.reportNumber}\` (Revision ${data.revision}) |`);
    lines.push(`| **Defect State** | \`${data.defectState}\` |`);
    lines.push(
      `| **Is Application Defect** | ${data.isApplicationDefect ? '✅ Yes' : '⚠️ No (Diagnostic Report)'} |`,
    );
    lines.push(
      `| **Assessed Severity** | ${data.severity ? `\`${data.severity}\`` : '*Not assessed*'} |`,
    );
    lines.push(
      `| **Assessed Priority** | ${data.priority ? `\`${data.priority}\`` : '*Not assessed*'} |`,
    );
    lines.push(
      `| **Calibrated Confidence** | ${data.calibratedScore !== null && data.calibratedScore !== undefined ? `\`${(data.calibratedScore * 100).toFixed(1)}%\`` : '*Not evaluated*'} |`,
    );
    lines.push(
      `| **Probable Layer** | ${data.probableLayer ? `\`${data.probableLayer}\`` : '*Unknown*'} |`,
    );
    lines.push(
      `| **Probable Component** | ${data.probableComponent ? `\`${data.probableComponent}\`` : '*Unknown*'} |`,
    );
    lines.push(
      `| **Duplicate Cluster** | ${data.clusterKey ? `\`${data.clusterKey}\` (${data.clusterMemberCount ?? 1} members)` : '*Isolated / Unique*'} |`,
    );
    lines.push(`| **Failure Case ID** | \`${data.facts.failureCaseId}\` |`);
    lines.push(`| **Execution Run ID** | \`${data.facts.testExecution.id}\` |`);
    lines.push('');

    // Executive Summary
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(data.summary);
    lines.push('');

    // Traceability Matrix
    lines.push('## Requirement-to-Test Traceability');
    lines.push('');
    lines.push('| Level | Key / ID | Historical Version | Description |');
    lines.push('| :--- | :--- | :--- | :--- |');
    const reqKey =
      data.facts.testCase?.sourceRequirementKey || data.facts.requirement?.key || 'N/A';
    const reqVer =
      data.facts.testCase?.sourceRequirementVersionNumber ??
      data.facts.requirement?.version ??
      'N/A';
    const reqTitle = redactor.redactText(
      data.facts.requirement?.title || 'Linked Requirement',
    ).redacted;
    lines.push(`| **Requirement** | \`${reqKey}\` | v${reqVer} | ${reqTitle} |`);

    const testKey = data.facts.testCase?.key || 'N/A';
    const testVer =
      data.facts.testExecution.testCaseVersionNumber || data.facts.testCase?.version || 1;
    const testTitle = redactor.redactText(
      data.facts.testCase?.title || data.facts.failureCase.title,
    ).redacted;
    lines.push(`| **Test Case** | \`${testKey}\` | v${testVer} | ${testTitle} |`);

    const planId = data.facts.testExecution.executableTestPlanId || 'N/A';
    lines.push(
      `| **Execution Plan** | \`${planId}\` | Active | Executable test plan executed by runner |`,
    );
    lines.push('');

    // Preconditions
    lines.push('## Preconditions');
    lines.push('');
    for (const p of data.preconditions) {
      lines.push(`- ${p}`);
    }
    lines.push('');

    // Derived Reproduction Steps
    lines.push('## Reproduction Steps');
    lines.push('');
    lines.push('## Step-by-Step Reproduction Procedure');
    lines.push('');
    if (data.reproductionSteps.length > 0) {
      lines.push('| Step # | Action Type | Details / Target | Status | Failure Point |');
      lines.push('| :---: | :--- | :--- | :---: | :---: |');
      for (const step of data.reproductionSteps) {
        const statusBadge =
          step.status === 'PASSED'
            ? '✅ PASSED'
            : step.status === 'FAILED'
              ? '❌ FAILED'
              : `⚪ ${step.status}`;
        const failureMarker = step.isFailureStep ? '⚠️ **FAILED STEP**' : '-';
        lines.push(
          `| ${step.stepIndex} | \`${step.actionType}\` | ${step.description} | ${statusBadge} | ${failureMarker} |`,
        );
      }
      lines.push('');
    } else {
      lines.push('*No step execution records recorded for this execution.*');
      lines.push('');
    }

    // Expected vs Actual
    lines.push('## Expected vs. Actual Behavior');
    lines.push('');
    lines.push(`### Expected Behavior`);
    lines.push(`> ${data.expectedBehavior}`);
    lines.push('');
    lines.push(`### Actual Behavior`);
    lines.push(`> ${data.actualBehavior}`);
    lines.push('');
    if (data.failedStepIndex !== null) {
      lines.push(`Execution halted at **Step ${data.failedStepIndex}**.`);
      lines.push('');
    }

    // Root-Cause Hypothesis
    lines.push('## Root-Cause Hypothesis & Technical Localization');
    lines.push('');
    if (data.rootCauseHypothesis) {
      lines.push(`> [!NOTE]`);
      lines.push(
        `> **Epistemic Classification**: Root-cause analysis represents a probabilistic hypothesis synthesized from execution telemetry, DOM mutations, and failure heuristics. It is NOT an assertion of verified code truth.`,
      );
      lines.push('');
      lines.push(`**Hypothesis**: ${data.rootCauseHypothesis}`);
      lines.push('');
    } else {
      lines.push('*No root-cause hypothesis has been formulated for this failure.*');
      lines.push('');
    }

    if (data.probableLayer || data.probableComponent) {
      lines.push(`- **Probable Architecture Layer**: \`${data.probableLayer ?? 'Unknown'}\``);
      lines.push(`- **Probable Component**: \`${data.probableComponent ?? 'Unknown'}\``);
      lines.push('');
    }

    // Environment Context
    lines.push('## Environment & Runtime Context');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(data.environmentSummary, null, 2));
    lines.push('```');
    lines.push('');

    // Evidence References & Integrity Table
    lines.push('## Evidence Artifacts & Verification');
    lines.push('');
    if (data.evidenceReferences.length > 0) {
      lines.push('| Evidence Type | Path | MIME Type | Size | SHA-256 Digest | Integrity Status |');
      lines.push('| :--- | :--- | :--- | :--- | :--- | :---: |');
      for (const e of data.evidenceReferences) {
        const integrityBadge =
          e.integrityStatus === 'VERIFIED'
            ? '✅ VERIFIED'
            : e.integrityStatus === 'CORRUPT'
              ? '❌ CORRUPT'
              : '⚠️ UNVERIFIED';
        lines.push(
          `| \`${e.evidenceType}\` | \`${e.filePath}\` | \`${e.mimeType}\` | ${(e.byteSize / 1024).toFixed(1)} KB | \`${e.sha256.slice(0, 16)}...\` | ${integrityBadge} |`,
        );
      }
      lines.push('');
    } else {
      lines.push('*No evidence artifacts linked to this report.*');
      lines.push('');
    }

    // Limitations & Unknowns
    lines.push('## Known Limitations & Epistemic Boundaries');
    lines.push('');
    for (const lim of data.limitationsAndUnknowns) {
      lines.push(`- ⚠️ ${lim}`);
    }
    lines.push('');

    return this.sanitize(lines.join('\n'), data.knownSecrets);
  }
}
