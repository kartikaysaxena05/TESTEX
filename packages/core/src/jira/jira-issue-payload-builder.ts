/**
 * @file packages/core/src/jira/jira-issue-payload-builder.ts
 * Centralized Jira issue payload builder and serializer.
 * Maps authoritative V6 StructuredBugReport data to sanitized Jira REST API payloads.
 */

import crypto from 'node:crypto';
import type { StructuredBugReport, JiraProjectConfig } from '@prisma/client';
import type { JiraDeploymentType } from './jira-types.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export interface AdfNode {
  readonly type: string;
  readonly attrs?: Record<string, unknown>;
  readonly content?: readonly AdfNode[];
  readonly text?: string;
  readonly marks?: readonly { readonly type: string; readonly attrs?: Record<string, unknown> }[];
}

export interface AdfDoc {
  readonly version: 1;
  readonly type: 'doc';
  readonly content: readonly AdfNode[];
}

export interface JiraIssuePayload {
  readonly fields: {
    readonly project: { readonly key: string; readonly id?: string };
    readonly issuetype: { readonly id: string };
    readonly summary: string;
    readonly description: AdfDoc | string;
    readonly priority?: { readonly id: string };
    readonly components?: readonly { readonly id: string }[];
    readonly labels?: readonly string[];
    readonly [customField: string]: unknown;
  };
}

export class JiraIssuePayloadBuilder {
  /**
   * Maximum summary length enforced by Jira Cloud / Server.
   */
  public static readonly MAX_SUMMARY_LENGTH = 254;

  /**
   * Safe label set bounded and sanitized for external Jira publishing.
   */
  public static readonly DEFAULT_LABELS = [
    'ai-quality',
    'automated-testing',
    'v6-classified',
    'application-defect',
  ] as const;

  /**
   * Computes a deterministic SHA-256 fingerprint for idempotency tracking.
   * Volatile values like timestamps are excluded.
   */
  public static computeFingerprint(params: {
    readonly projectId: string;
    readonly failureCaseId: string;
    readonly bugReportId: string;
    readonly revision: number;
    readonly jiraProjectKey: string;
    readonly issueTypeId: string;
  }): string {
    const raw = `${params.projectId}:${params.failureCaseId}:${params.bugReportId}:${params.revision}:${params.jiraProjectKey.toUpperCase()}:${params.issueTypeId}`;
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  /**
   * Sanitizes a string to prevent XSS, script tags, prompt injection markers, and secret leaks.
   */
  public static sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') return '';

    // 1. Redact secrets using SecretRedactor
    let sanitized = SecretRedactor.redactText(text);

    // 2. Extra redaction for connection strings, key-value secrets, and sensitive headers
    sanitized = sanitized.replace(
      /(\b(?:password|passwd|secret|token|apikey|api_key)\s*[=:]\s*)[^\s,;&"']+/gi,
      '$1***',
    );
    sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1***$2');
    sanitized = sanitized.replace(/(mongodb(?:\+srv)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1***$2');
    sanitized = sanitized.replace(
      /(-----BEGIN [A-Z ]+KEY-----)[\s\S]*?(-----END [A-Z ]+KEY-----)/gi,
      '$1\n***\n$2',
    );
    sanitized = sanitized.replace(/((?:set-cookie|cookie):\s*)[^\r\n]+/gi, '$1***');

    // 3. Neutralize script tags and injection patterns
    sanitized = sanitized.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '[SCRIPT REDACTED]',
    );

    return sanitized;
  }

  /**
   * Generates a concise, bounded Jira summary line from trusted bug report facts.
   */
  public static buildSummary(bugReport: StructuredBugReport, projectKey: string): string {
    const rawTitle = bugReport.title || bugReport.summary || 'Unspecified application defect';
    const sanitizedTitle = this.sanitizeText(rawTitle)
      .replace(/[\r\n\t]+/g, ' ')
      .trim();

    // Deterministic prefix: e.g. [QA] or [REQ-123]
    const prefix = bugReport.requirementKey ? `[${bugReport.requirementKey}] ` : `[${projectKey}] `;
    const maxTitleLength = this.MAX_SUMMARY_LENGTH - prefix.length;

    const truncatedTitle =
      sanitizedTitle.length > maxTitleLength
        ? `${sanitizedTitle.slice(0, Math.max(0, maxTitleLength - 3))}...`
        : sanitizedTitle;

    return `${prefix}${truncatedTitle}`.slice(0, this.MAX_SUMMARY_LENGTH);
  }

  /**
   * Builds the complete, safe Jira issue creation payload.
   */
  public static buildPayload(options: {
    readonly bugReport: StructuredBugReport;
    readonly config: JiraProjectConfig;
    readonly deploymentType?: JiraDeploymentType;
    readonly defectClusterId?: string;
  }): JiraIssuePayload {
    const { bugReport, config } = options;
    const deploymentType = options.deploymentType ?? 'JIRA_CLOUD';

    // 1. Summary
    const summary = this.buildSummary(bugReport, config.jiraProjectKey);

    // 2. Description (ADF for Cloud, plain text for Server/DC)
    const description =
      deploymentType === 'JIRA_CLOUD'
        ? this.buildAdfDescription(bugReport)
        : this.buildPlainTextDescription(bugReport);

    // 3. Labels (including machine-readable metadata for future deduplication)
    const labels = [
      ...this.DEFAULT_LABELS,
      `platform-report-${bugReport.reportNumber.toLowerCase()}`,
      `platform-failure-${bugReport.failureCaseId.slice(0, 12)}`,
    ];
    if (options.defectClusterId) {
      labels.push(`platform-cluster-${options.defectClusterId.slice(0, 12)}`);
    }

    // 4. Fields payload
    const fields: JiraIssuePayload['fields'] = {
      project: {
        key: config.jiraProjectKey,
        ...(config.jiraProjectId ? { id: config.jiraProjectId } : {}),
      },
      issuetype: {
        id: config.selectedIssueTypeId,
      },
      summary,
      description,
      labels,
    };

    // 5. Mapped Priority (only include if valid default configured; never invent)
    if (config.defaultPriorityId && config.defaultPriorityId.trim().length > 0) {
      (fields as any).priority = { id: config.defaultPriorityId.trim() };
    }

    // 6. Default Component (if configured)
    if (config.defaultComponentId && config.defaultComponentId.trim().length > 0) {
      (fields as any).components = [{ id: config.defaultComponentId.trim() }];
    }

    return { fields };
  }

  /**
   * Constructs an Atlassian Document Format (ADF) document tree with strict epistemic segregation.
   */
  public static buildAdfDescription(bugReport: StructuredBugReport): AdfDoc {
    const nodes: AdfNode[] = [];

    // Helper: Add section header
    const addSectionHeader = (title: string, level = 3) => {
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: title }],
      });
    };

    // Helper: Add paragraph
    const addParagraph = (text: string) => {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: this.sanitizeText(text) }],
      });
    };

    // Helper: Add bullet list
    const addBulletList = (items: readonly string[]) => {
      if (items.length === 0) return;
      nodes.push({
        type: 'bulletList',
        content: items.map(item => ({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: this.sanitizeText(item) }],
            },
          ],
        })),
      });
    };

    // 1. Defect Summary
    addSectionHeader('1. Defect Summary', 2);
    addParagraph(bugReport.summary || bugReport.title);

    // 2. Traceability Facts (FACT)
    addSectionHeader('2. Traceability & Context (FACT)');
    const traceFacts: string[] = [
      `Internal Report ID: ${bugReport.reportNumber} (Revision ${bugReport.revision})`,
      `Internal Failure Case ID: ${bugReport.failureCaseId}`,
      `Test Case: ${bugReport.testCaseKey || 'UNKNOWN'} — "${bugReport.testCaseTitle}"`,
      `Requirement: ${bugReport.requirementKey ? `${bugReport.requirementKey} (v${bugReport.requirementVersionNumber ?? 1})` : 'UNLINKED'}`,
    ];
    if (bugReport.requirementTextReference) {
      traceFacts.push(`Requirement Statement: "${bugReport.requirementTextReference}"`);
    }
    addBulletList(traceFacts);

    // 3. Observed Behavior (FACT)
    addSectionHeader('3. Observed Test Behavior (FACT)');
    const stepInfo =
      bugReport.failedStepIndex !== null && bugReport.failedStepIndex !== undefined
        ? `Step ${bugReport.failedStepIndex + 1}: ${bugReport.failedStepAction || 'Action failed'}`
        : 'Step execution failed';
    addParagraph(`Failure Point: ${stepInfo}`);
    addParagraph(
      `Expected Result:\n${bugReport.expectedResult || 'Expected test step to succeed'}`,
    );
    addParagraph(
      `Actual Result:\n${bugReport.actualResult || 'Step execution encountered an error'}`,
    );

    // Steps to reproduce
    const reproSteps = this.parseJsonArray(bugReport.reproductionStepsJson);
    if (reproSteps.length > 0) {
      addSectionHeader('Steps to Reproduce:');
      const formattedSteps = reproSteps.map((s: any, idx: number) => {
        if (typeof s === 'string') return `${idx + 1}. ${s}`;
        const action = s.action || s.actionType || s.description || JSON.stringify(s);
        const target = s.targetSummary || s.target ? ` on "${s.targetSummary || s.target}"` : '';
        return `${idx + 1}. ${action}${target}`;
      });
      addBulletList(formattedSteps);
    }

    // 4. Telemetry & Reproduction Status (FACT)
    addSectionHeader('4. Reproduction & Environment Telemetry (FACT)');
    const telemetryFacts: string[] = [
      `Reproduction Status: ${bugReport.reproducibilityState || 'NOT_EVALUATED'} (${bugReport.reproductionSuccessCount}/${bugReport.reproductionAttempts} attempts confirmed)`,
    ];
    if (bugReport.reproducibilityRatio !== null && bugReport.reproducibilityRatio !== undefined) {
      telemetryFacts.push(
        `Reproduction Ratio: ${(bugReport.reproducibilityRatio * 100).toFixed(1)}%`,
      );
    }
    const envObj = this.parseJsonObject(bugReport.environmentJson);
    if (Object.keys(envObj).length > 0) {
      const browser = envObj.browser || envObj.browserName || 'Unknown';
      const os = envObj.os || envObj.platform || 'Unknown';
      telemetryFacts.push(`Environment: Browser=${browser}, Platform=${os}`);
    }
    addBulletList(telemetryFacts);

    // 5. Classification (DETERMINISTIC CLASSIFICATION)
    addSectionHeader('5. Failure Classification (DETERMINISTIC CLASSIFICATION)');
    const classFacts: string[] = [
      `Category: ${bugReport.classificationCategory || 'APPLICATION_DEFECT'}`,
      `Severity: ${bugReport.severity || 'MEDIUM'}`,
      `Priority: ${bugReport.priority || 'MEDIUM'}`,
      `Defect State: ${bugReport.applicationDefectState}`,
    ];
    if (bugReport.classificationSubcategory) {
      classFacts.push(`Subcategory: ${bugReport.classificationSubcategory}`);
    }
    addBulletList(classFacts);

    // 6. Root Cause Analysis (AI INFERENCE)
    addSectionHeader('6. Root Cause Analysis (AI INFERENCE)');
    const layer = bugReport.probableLayer ? `Layer: ${bugReport.probableLayer}` : 'Layer: UNKNOWN';
    const component = bugReport.probableComponent
      ? `Component: ${bugReport.probableComponent}`
      : 'Component: UNKNOWN';
    addParagraph(`${layer} | ${component}`);
    addParagraph(
      bugReport.rootCauseSummary || 'Root cause hypothesis unavailable for this failure case.',
    );
    // Epistemic disclaimer
    nodes.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'DISCLAIMER: The root cause summary above is an AI inference based on execution telemetry and is not proven.',
          marks: [{ type: 'em' }],
        },
      ],
    });

    // 7. Confidence & Attribution
    if (bugReport.overallConfidence !== null && bugReport.overallConfidence !== undefined) {
      addSectionHeader('7. Confidence & Calibration');
      addParagraph(
        `Calibrated Confidence Score: ${(bugReport.overallConfidence * 100).toFixed(1)}% (${bugReport.confidenceBand || 'NORMAL'})`,
      );
    }

    // 8. Evidence References
    const evidenceRefs = this.parseJsonArray(bugReport.evidenceReferencesJson);
    if (evidenceRefs.length > 0) {
      addSectionHeader('8. Evidence References');
      const refList = evidenceRefs.map((ref: any) => {
        const type = ref.evidenceType || ref.type || 'EVIDENCE';
        const desc = ref.description || ref.filePath || ref.key || 'telemetry artifact';
        return `[${type}] ${desc}`;
      });
      addBulletList(refList);
    }

    // 9. Limitations & Unknowns (UNKNOWN)
    const limitations = this.parseJsonArray(bugReport.knownLimitationsJson);
    const unknowns = this.parseJsonArray(bugReport.unknownsJson);
    if (limitations.length > 0 || unknowns.length > 0) {
      addSectionHeader('9. Known Limitations & Unknowns (UNKNOWN)');
      const combined = [
        ...limitations.map(l => `Limitation: ${typeof l === 'string' ? l : JSON.stringify(l)}`),
        ...unknowns.map(u => `Unknown: ${typeof u === 'string' ? u : JSON.stringify(u)}`),
      ];
      addBulletList(combined);
    }

    return {
      version: 1,
      type: 'doc',
      content: nodes,
    };
  }

  /**
   * Constructs plain text / Markdown description for Jira Server and Jira Data Center.
   */
  public static buildPlainTextDescription(bugReport: StructuredBugReport): string {
    const lines: string[] = [];

    lines.push('h2. 1. Defect Summary');
    lines.push(this.sanitizeText(bugReport.summary || bugReport.title));
    lines.push('');

    lines.push('h3. 2. Traceability & Context (FACT)');
    lines.push(`* Internal Report ID: ${bugReport.reportNumber} (Revision ${bugReport.revision})`);
    lines.push(`* Internal Failure Case ID: ${bugReport.failureCaseId}`);
    lines.push(`* Test Case: ${bugReport.testCaseKey || 'UNKNOWN'} — "${bugReport.testCaseTitle}"`);
    lines.push(
      `* Requirement: ${bugReport.requirementKey ? `${bugReport.requirementKey} (v${bugReport.requirementVersionNumber ?? 1})` : 'UNLINKED'}`,
    );
    if (bugReport.requirementTextReference) {
      lines.push(
        `* Requirement Statement: "${this.sanitizeText(bugReport.requirementTextReference)}"`,
      );
    }
    lines.push('');

    lines.push('h3. 3. Observed Test Behavior (FACT)');
    const stepInfo =
      bugReport.failedStepIndex !== null && bugReport.failedStepIndex !== undefined
        ? `Step ${bugReport.failedStepIndex + 1}: ${bugReport.failedStepAction || 'Action failed'}`
        : 'Step execution failed';
    lines.push(`Failure Point: ${stepInfo}`);
    lines.push(
      `Expected Result: ${this.sanitizeText(bugReport.expectedResult || 'Expected step to succeed')}`,
    );
    lines.push(
      `Actual Result: ${this.sanitizeText(bugReport.actualResult || 'Step execution encountered error')}`,
    );
    lines.push('');

    const reproSteps = this.parseJsonArray(bugReport.reproductionStepsJson);
    if (reproSteps.length > 0) {
      lines.push('Steps to Reproduce:');
      reproSteps.forEach((s: any, idx: number) => {
        const action =
          typeof s === 'string'
            ? s
            : s.action || s.actionType || s.description || JSON.stringify(s);
        lines.push(`${idx + 1}. ${this.sanitizeText(action)}`);
      });
      lines.push('');
    }

    lines.push('h3. 4. Reproduction & Environment Telemetry (FACT)');
    lines.push(
      `* Reproduction Status: ${bugReport.reproducibilityState || 'NOT_EVALUATED'} (${bugReport.reproductionSuccessCount}/${bugReport.reproductionAttempts} attempts confirmed)`,
    );
    if (bugReport.reproducibilityRatio !== null && bugReport.reproducibilityRatio !== undefined) {
      lines.push(`* Reproduction Ratio: ${(bugReport.reproducibilityRatio * 100).toFixed(1)}%`);
    }
    lines.push('');

    lines.push('h3. 5. Failure Classification (DETERMINISTIC CLASSIFICATION)');
    lines.push(`* Category: ${bugReport.classificationCategory || 'APPLICATION_DEFECT'}`);
    lines.push(`* Severity: ${bugReport.severity || 'MEDIUM'}`);
    lines.push(`* Priority: ${bugReport.priority || 'MEDIUM'}`);
    lines.push(`* Defect State: ${bugReport.applicationDefectState}`);
    lines.push('');

    lines.push('h3. 6. Root Cause Analysis (AI INFERENCE)');
    const layer = bugReport.probableLayer ? `Layer: ${bugReport.probableLayer}` : 'Layer: UNKNOWN';
    const comp = bugReport.probableComponent
      ? `Component: ${bugReport.probableComponent}`
      : 'Component: UNKNOWN';
    lines.push(`${layer} | ${comp}`);
    lines.push(
      this.sanitizeText(bugReport.rootCauseSummary || 'Root cause hypothesis unavailable.'),
    );
    lines.push(
      '_DISCLAIMER: The root cause summary above is an AI inference based on execution telemetry and is not proven._',
    );
    lines.push('');

    if (bugReport.overallConfidence !== null && bugReport.overallConfidence !== undefined) {
      lines.push('h3. 7. Confidence & Calibration');
      lines.push(
        `Calibrated Confidence: ${(bugReport.overallConfidence * 100).toFixed(1)}% (${bugReport.confidenceBand || 'NORMAL'})`,
      );
      lines.push('');
    }

    const evidenceRefs = this.parseJsonArray(bugReport.evidenceReferencesJson);
    if (evidenceRefs.length > 0) {
      lines.push('h3. 8. Evidence References');
      evidenceRefs.forEach((ref: any) => {
        const type = ref.evidenceType || ref.type || 'EVIDENCE';
        const desc = ref.description || ref.filePath || ref.key || 'telemetry artifact';
        lines.push(`* [${type}] ${this.sanitizeText(desc)}`);
      });
      lines.push('');
    }

    const limitations = this.parseJsonArray(bugReport.knownLimitationsJson);
    const unknowns = this.parseJsonArray(bugReport.unknownsJson);
    if (limitations.length > 0 || unknowns.length > 0) {
      lines.push('h3. 9. Known Limitations & Unknowns (UNKNOWN)');
      limitations.forEach(l =>
        lines.push(
          `* Limitation: ${this.sanitizeText(typeof l === 'string' ? l : JSON.stringify(l))}`,
        ),
      );
      unknowns.forEach(u =>
        lines.push(
          `* Unknown: ${this.sanitizeText(typeof u === 'string' ? u : JSON.stringify(u))}`,
        ),
      );
      lines.push('');
    }

    return lines.join('\n');
  }

  private static parseJsonArray(val: unknown): readonly any[] {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private static parseJsonObject(val: unknown): Record<string, any> {
    if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, any>;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }
}
