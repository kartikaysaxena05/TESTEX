/**
 * @file packages/core/src/failures/ai-reasoning/ai-context-sanitizer.ts
 * Defensive context sanitization, secret redaction, and prompt injection defense (V6 Phase 82).
 */

import { FailureEvidenceRedactor } from '../evidence/failure-evidence-redactor.js';
import type { AiReasoningSanitizedContext } from './ai-reasoning-types.js';

export interface RawContextInputs {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly caseTitle: string;
  readonly execution?: {
    readonly testName?: string;
    readonly suiteName?: string;
    readonly browser?: string;
    readonly os?: string;
    readonly url?: string;
    readonly status?: string;
    readonly durationMs?: number;
    readonly errorMessage?: string;
    readonly stepIndex?: number;
    readonly actionType?: string;
  } | null;
  readonly deterministicClassification?: {
    readonly category: string;
    readonly subcategory?: string | null;
    readonly confidenceScore: number;
    readonly ruleCitations?: readonly string[];
    readonly ruleEngineVersion?: string;
  } | null;
  readonly domainSeparation?: {
    readonly failureDomain: string;
    readonly boundaryCrossing?: boolean;
    readonly suspectedComponent?: string | null;
    readonly networkResponsibility?: string | null;
    readonly domResponsibility?: string | null;
    readonly confidenceScore?: number;
  } | null;
  readonly technicalLocalization?: {
    readonly primaryLayer?: string;
    readonly primaryTargetType?: string;
    readonly primaryTargetIdentifier?: string;
    readonly matchedFilePath?: string | null;
    readonly matchedSymbolName?: string | null;
    readonly httpEndpoint?: string | null;
    readonly httpMethod?: string | null;
    readonly httpStatusCode?: number | null;
    readonly domSelector?: string | null;
    readonly confidenceScore?: number;
  } | null;
  readonly reproductionFacts?: {
    readonly isReproducible: boolean;
    readonly reproductionRate: number;
    readonly totalRuns: number;
    readonly passedRuns: number;
    readonly failedRuns: number;
  } | null;
  readonly flakinessFacts?: {
    readonly isFlaky: boolean;
    readonly flakinessScore: number;
    readonly flakinessCategory?: string;
  } | null;
  readonly rawEvidence?: {
    readonly consoleErrors?: readonly string[];
    readonly networkFailures?: readonly {
      readonly url: string;
      readonly method: string;
      readonly status?: number;
      readonly error?: string;
    }[];
    readonly domSnippet?: string | null;
    readonly stackTrace?: string | null;
    readonly artifactSummaries?: readonly {
      readonly artifactType: string;
      readonly byteSize: number;
      readonly mimeType: string;
    }[];
  } | null;
}

export class AiContextSanitizer {
  private readonly redactor = new FailureEvidenceRedactor();

  private static readonly MAX_STRING_LENGTH = 4000;
  private static readonly MAX_STACK_TRACE_LENGTH = 3000;
  private static readonly MAX_DOM_SNIPPET_LENGTH = 2500;
  private static readonly MAX_CONSOLE_ERRORS = 15;
  private static readonly MAX_NETWORK_FAILURES = 15;

  /**
   * Sanitizes, redacts secrets, and bounds all evidence inputs into a safe passive data structure.
   */
  public sanitizeContext(raw: RawContextInputs): AiReasoningSanitizedContext {
    const exec = raw.execution;

    const sanitizedExecution = {
      testName: this.sanitizeString(exec?.testName ?? 'Unknown Test', 256),
      suiteName: exec?.suiteName ? this.sanitizeString(exec.suiteName, 256) : undefined,
      browser: this.sanitizeString(exec?.browser ?? 'chromium', 64),
      os: this.sanitizeString(exec?.os ?? 'unknown', 64),
      url: exec?.url ? this.sanitizeString(exec.url, 1024) : undefined,
      status: this.sanitizeString(exec?.status ?? 'FAILED', 64),
      durationMs:
        typeof exec?.durationMs === 'number' && Number.isFinite(exec.durationMs)
          ? exec.durationMs
          : 0,
      errorMessage: exec?.errorMessage ? this.sanitizeString(exec.errorMessage, 1024) : undefined,
      stepIndex: exec?.stepIndex,
      actionType: exec?.actionType ? this.sanitizeString(exec.actionType, 64) : undefined,
    };

    const sanitizedDeterministic = raw.deterministicClassification
      ? {
          category: raw.deterministicClassification.category as any,
          subcategory: raw.deterministicClassification.subcategory as any,
          confidenceScore: Math.max(
            0,
            Math.min(1, raw.deterministicClassification.confidenceScore),
          ),
          ruleCitations: raw.deterministicClassification.ruleCitations?.map(c =>
            this.sanitizeString(c, 256),
          ),
          ruleEngineVersion: raw.deterministicClassification.ruleEngineVersion,
        }
      : undefined;

    const sanitizedDomain = raw.domainSeparation
      ? {
          failureDomain: this.sanitizeString(raw.domainSeparation.failureDomain, 64),
          boundaryCrossing: raw.domainSeparation.boundaryCrossing,
          suspectedComponent: raw.domainSeparation.suspectedComponent
            ? this.sanitizeString(raw.domainSeparation.suspectedComponent, 256)
            : null,
          networkResponsibility: raw.domainSeparation.networkResponsibility
            ? this.sanitizeString(raw.domainSeparation.networkResponsibility, 128)
            : null,
          domResponsibility: raw.domainSeparation.domResponsibility
            ? this.sanitizeString(raw.domainSeparation.domResponsibility, 128)
            : null,
          confidenceScore: raw.domainSeparation.confidenceScore,
        }
      : undefined;

    const sanitizedLocalization = raw.technicalLocalization
      ? {
          primaryLayer: raw.technicalLocalization.primaryLayer
            ? this.sanitizeString(raw.technicalLocalization.primaryLayer, 64)
            : undefined,
          primaryTargetType: raw.technicalLocalization.primaryTargetType
            ? this.sanitizeString(raw.technicalLocalization.primaryTargetType, 64)
            : undefined,
          primaryTargetIdentifier: raw.technicalLocalization.primaryTargetIdentifier
            ? this.sanitizeString(raw.technicalLocalization.primaryTargetIdentifier, 512)
            : undefined,
          matchedFilePath: raw.technicalLocalization.matchedFilePath
            ? this.sanitizeString(raw.technicalLocalization.matchedFilePath, 512)
            : null,
          matchedSymbolName: raw.technicalLocalization.matchedSymbolName
            ? this.sanitizeString(raw.technicalLocalization.matchedSymbolName, 256)
            : null,
          httpEndpoint: raw.technicalLocalization.httpEndpoint
            ? this.sanitizeString(raw.technicalLocalization.httpEndpoint, 1024)
            : null,
          httpMethod: raw.technicalLocalization.httpMethod
            ? this.sanitizeString(raw.technicalLocalization.httpMethod, 16)
            : null,
          httpStatusCode: raw.technicalLocalization.httpStatusCode,
          domSelector: raw.technicalLocalization.domSelector
            ? this.sanitizeString(raw.technicalLocalization.domSelector, 512)
            : null,
          confidenceScore: raw.technicalLocalization.confidenceScore,
        }
      : undefined;

    const reproduction = raw.reproductionFacts
      ? {
          isReproducible: Boolean(raw.reproductionFacts.isReproducible),
          reproductionRate: Math.max(0, Math.min(1, raw.reproductionFacts.reproductionRate)),
          totalRuns: Math.max(0, raw.reproductionFacts.totalRuns),
          passedRuns: Math.max(0, raw.reproductionFacts.passedRuns),
          failedRuns: Math.max(0, raw.reproductionFacts.failedRuns),
        }
      : undefined;

    const flakiness = raw.flakinessFacts
      ? {
          isFlaky: Boolean(raw.flakinessFacts.isFlaky),
          flakinessScore: Math.max(0, Math.min(1, raw.flakinessFacts.flakinessScore)),
          flakinessCategory: raw.flakinessFacts.flakinessCategory
            ? this.sanitizeString(raw.flakinessFacts.flakinessCategory, 64)
            : undefined,
        }
      : undefined;

    const rawEv = raw.rawEvidence;
    const consoleErrors = (rawEv?.consoleErrors ?? [])
      .slice(0, AiContextSanitizer.MAX_CONSOLE_ERRORS)
      .map(line => this.sanitizeString(line, 512));

    const networkFailures = (rawEv?.networkFailures ?? [])
      .slice(0, AiContextSanitizer.MAX_NETWORK_FAILURES)
      .map(net => ({
        url: this.sanitizeString(net.url, 512),
        method: this.sanitizeString(net.method, 16),
        status: net.status,
        error: net.error ? this.sanitizeString(net.error, 256) : undefined,
      }));

    const domSnippet = rawEv?.domSnippet
      ? this.sanitizeString(rawEv.domSnippet, AiContextSanitizer.MAX_DOM_SNIPPET_LENGTH)
      : undefined;

    const stackTrace = rawEv?.stackTrace
      ? this.sanitizeString(rawEv.stackTrace, AiContextSanitizer.MAX_STACK_TRACE_LENGTH)
      : undefined;

    const artifactSummaries = (rawEv?.artifactSummaries ?? []).map(art => ({
      artifactType: this.sanitizeString(art.artifactType, 64),
      byteSize: art.byteSize,
      mimeType: this.sanitizeString(art.mimeType, 64),
    }));

    return {
      projectId: raw.projectId,
      failureCaseId: raw.failureCaseId,
      caseTitle: this.sanitizeString(raw.caseTitle, 256),
      executionDetails: sanitizedExecution,
      deterministicClassification: sanitizedDeterministic,
      domainSeparation: sanitizedDomain,
      technicalLocalization: sanitizedLocalization,
      reproductionFacts: reproduction,
      flakinessFacts: flakiness,
      sanitizedEvidence: {
        consoleErrors,
        networkFailures,
        domSnippet,
        stackTrace,
        artifactSummaries,
      },
    };
  }

  /**
   * Redacts and cleans a raw string, stripping potential prompt-injection delimiters and truncating.
   */
  public sanitizeString(
    text: string,
    maxLength: number = AiContextSanitizer.MAX_STRING_LENGTH,
  ): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // 1. Redact secrets
    const { redacted } = this.redactor.redactText(text);

    // 2. Neutralize adversarial boundary tags
    let cleaned = redacted
      .replace(
        /<\/?(?:system|instruction|user|assistant|prompt_injection|jailbreak)[^>]*>/gi,
        '[STRIPPED_TAG]',
      )
      .replace(/```(?:json|markdown)?/gi, "'''");

    // 3. Truncate to maximum allowed length
    if (cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength) + '... [TRUNCATED]';
    }

    return cleaned.trim();
  }

  /**
   * Formats the sanitized context into structured passive delimiters for prompt injection resistance.
   */
  public buildPassiveEvidenceBlock(context: AiReasoningSanitizedContext): string {
    const lines: string[] = [];

    lines.push('<untrusted_execution_evidence>');
    lines.push(`Case Title: ${context.caseTitle}`);
    lines.push(`Test Name: ${context.executionDetails.testName}`);
    if (context.executionDetails.suiteName) {
      lines.push(`Suite: ${context.executionDetails.suiteName}`);
    }
    lines.push(
      `Browser / OS: ${context.executionDetails.browser} on ${context.executionDetails.os}`,
    );
    if (context.executionDetails.url) {
      lines.push(`URL: ${context.executionDetails.url}`);
    }
    lines.push(
      `Execution Status: ${context.executionDetails.status} (${context.executionDetails.durationMs}ms)`,
    );
    if (context.executionDetails.stepIndex !== undefined) {
      lines.push(
        `Correlated Step Index: ${context.executionDetails.stepIndex} (${context.executionDetails.actionType ?? 'action'})`,
      );
    }
    if (context.executionDetails.errorMessage) {
      lines.push(`Error Message: ${context.executionDetails.errorMessage}`);
    }
    lines.push('</untrusted_execution_evidence>');

    if (context.deterministicClassification) {
      lines.push('<deterministic_baseline_facts>');
      lines.push(`Category: ${context.deterministicClassification.category}`);
      if (context.deterministicClassification.subcategory) {
        lines.push(`Subcategory: ${context.deterministicClassification.subcategory}`);
      }
      lines.push(`Confidence: ${context.deterministicClassification.confidenceScore.toFixed(2)}`);
      if (context.deterministicClassification.ruleCitations?.length) {
        lines.push(
          `Rule Citations: ${context.deterministicClassification.ruleCitations.join(', ')}`,
        );
      }
      lines.push('</deterministic_baseline_facts>');
    }

    if (context.domainSeparation) {
      lines.push('<domain_separation_facts>');
      lines.push(`Failure Domain: ${context.domainSeparation.failureDomain}`);
      if (context.domainSeparation.suspectedComponent) {
        lines.push(`Suspected Component: ${context.domainSeparation.suspectedComponent}`);
      }
      if (context.domainSeparation.networkResponsibility) {
        lines.push(`Network Responsibility: ${context.domainSeparation.networkResponsibility}`);
      }
      if (context.domainSeparation.domResponsibility) {
        lines.push(`DOM Responsibility: ${context.domainSeparation.domResponsibility}`);
      }
      lines.push('</domain_separation_facts>');
    }

    if (context.technicalLocalization) {
      lines.push('<technical_localization_facts>');
      if (context.technicalLocalization.primaryLayer) {
        lines.push(`Primary Layer: ${context.technicalLocalization.primaryLayer}`);
      }
      if (
        context.technicalLocalization.primaryTargetType &&
        context.technicalLocalization.primaryTargetIdentifier
      ) {
        lines.push(
          `Target: ${context.technicalLocalization.primaryTargetType} -> ${context.technicalLocalization.primaryTargetIdentifier}`,
        );
      }
      if (context.technicalLocalization.matchedFilePath) {
        lines.push(`Source File: ${context.technicalLocalization.matchedFilePath}`);
      }
      if (context.technicalLocalization.matchedSymbolName) {
        lines.push(`Source Symbol: ${context.technicalLocalization.matchedSymbolName}`);
      }
      if (context.technicalLocalization.httpEndpoint) {
        lines.push(
          `HTTP Endpoint: ${context.technicalLocalization.httpMethod ?? 'REQ'} ${context.technicalLocalization.httpEndpoint} (${context.technicalLocalization.httpStatusCode ?? 'no status'})`,
        );
      }
      if (context.technicalLocalization.domSelector) {
        lines.push(`DOM Selector: ${context.technicalLocalization.domSelector}`);
      }
      lines.push('</technical_localization_facts>');
    }

    if (context.reproductionFacts) {
      lines.push('<reproduction_facts>');
      lines.push(`Is Reproducible: ${context.reproductionFacts.isReproducible}`);
      lines.push(
        `Reproduction Rate: ${(context.reproductionFacts.reproductionRate * 100).toFixed(1)}% (${context.reproductionFacts.failedRuns}/${context.reproductionFacts.totalRuns} failed)`,
      );
      lines.push('</reproduction_facts>');
    }

    if (context.flakinessFacts) {
      lines.push('<flakiness_facts>');
      lines.push(`Is Flaky: ${context.flakinessFacts.isFlaky}`);
      lines.push(`Flakiness Score: ${context.flakinessFacts.flakinessScore.toFixed(2)}`);
      if (context.flakinessFacts.flakinessCategory) {
        lines.push(`Flakiness Category: ${context.flakinessFacts.flakinessCategory}`);
      }
      lines.push('</flakiness_facts>');
    }

    lines.push('<untrusted_diagnostic_evidence>');
    if (context.sanitizedEvidence.consoleErrors.length > 0) {
      lines.push('Console Errors:');
      for (const err of context.sanitizedEvidence.consoleErrors) {
        lines.push(`  - ${err}`);
      }
    }
    if (context.sanitizedEvidence.networkFailures.length > 0) {
      lines.push('Network Failures:');
      for (const net of context.sanitizedEvidence.networkFailures) {
        lines.push(
          `  - ${net.method} ${net.url} (${net.status ?? 'failed'}): ${net.error ?? 'error'}`,
        );
      }
    }
    if (context.sanitizedEvidence.stackTrace) {
      lines.push(`Stack Trace:\n${context.sanitizedEvidence.stackTrace}`);
    }
    if (context.sanitizedEvidence.domSnippet) {
      lines.push(`DOM Snapshot Excerpt:\n${context.sanitizedEvidence.domSnippet}`);
    }
    lines.push('</untrusted_diagnostic_evidence>');

    return lines.join('\n');
  }
}
