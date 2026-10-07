/**
 * @file packages/core/src/email/email-templates.ts
 * Reusable, deterministic email templates for Phase 95 notification events.
 * Guarantees strict HTML escaping, plain-text fallback, and secret redaction.
 */

import type { EmailTemplatePayload, RenderedEmail } from './email-types.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class EmailTemplateEngine {
  private static readonly TEMPLATE_VERSION = '1.0.0';

  public static render(payload: EmailTemplatePayload): RenderedEmail {
    let subject = '';
    let headline = '';
    let subheadline = '';

    const bugNum = payload.bugReportNumber ?? 'DEFECT';
    const projName = payload.projectName || 'Quality Platform';

    switch (payload.eventType) {
      case 'CRITICAL_SEVERITY_BUG_CREATED':
        subject = `[CRITICAL] Defect Alert: ${bugNum} — ${payload.bugTitle ?? 'Critical Application Issue'} (${projName})`;
        headline = 'Critical Defect Alert';
        subheadline =
          'A critical severity application defect was detected and requires immediate engineering triage.';
        break;

      case 'HIGH_SEVERITY_BUG_CREATED':
        subject = `[HIGH] Defect Detected: ${bugNum} — ${payload.bugTitle ?? 'High Severity Issue'} (${projName})`;
        headline = 'High Severity Defect Detected';
        subheadline = 'A high severity defect was created during autonomous test execution.';
        break;

      case 'BUG_ASSIGNED':
        subject = `Defect Assigned: ${bugNum} (${projName})`;
        headline = 'Defect Assigned to You';
        subheadline = `You have been assigned as the defect owner for ${bugNum}.`;
        break;

      case 'BUG_REASSIGNED':
        subject = `Defect Reassigned: ${bugNum} (${projName})`;
        headline = 'Defect Ownership Transferred';
        subheadline = `Defect ownership for ${bugNum} has been updated.`;
        break;

      case 'JIRA_ISSUE_CREATED':
        subject = `Jira Issue Created: ${payload.jiraIssueKey ?? bugNum} (${projName})`;
        headline = 'Jira Issue Exported';
        subheadline = `Defect ${bugNum} has been successfully exported to Jira ticket ${payload.jiraIssueKey ?? ''}.`;
        break;

      case 'JIRA_ISSUE_LINKED':
        subject = `Jira Issue Linked: ${payload.jiraIssueKey ?? bugNum} (${projName})`;
        headline = 'Defect Linked to Existing Jira Issue';
        subheadline = `Defect ${bugNum} has been linked to existing Jira ticket ${payload.jiraIssueKey ?? ''}.`;
        break;

      case 'JIRA_ISSUE_CREATION_FAILED':
        subject = `[Action Required] Jira Issue Creation Failed: ${bugNum} (${projName})`;
        headline = 'Jira Synchronization Failed';
        subheadline = `Automatic Jira issue creation for defect ${bugNum} encountered an error.`;
        break;

      case 'TEST_REVERIFICATION_REQUIRED':
        subject = `Test Reverification Required: ${bugNum} (${projName})`;
        headline = 'Test Reverification Required';
        subheadline = `Defect ${bugNum} requires re-execution and verification.`;
        break;

      case 'BUG_CREATED':
      default:
        subject = `New Defect Report: ${bugNum} — ${payload.bugTitle ?? 'Application Issue'} (${projName})`;
        headline = 'New Defect Report Created';
        subheadline = `A new structured bug report has been generated for project ${projName}.`;
        break;
    }

    const htmlBody = this.buildHtml(headline, subheadline, payload);
    const textBody = this.buildText(headline, subheadline, payload);

    // Apply SecretRedactor to ensure no accidental leaked secrets
    return {
      subject: SecretRedactor.redactText(subject),
      htmlBody: SecretRedactor.redactText(htmlBody),
      textBody: SecretRedactor.redactText(textBody),
      templateId: `tpl-${payload.eventType.toLowerCase().replace(/_/g, '-')}`,
      templateVersion: this.TEMPLATE_VERSION,
    };
  }

  private static buildHtml(
    headline: string,
    subheadline: string,
    payload: EmailTemplatePayload,
  ): string {
    const sevColor = this.getSeverityColor(payload.bugSeverity);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(headline)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; line-height: 1.5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 8px; border: 1px solid #334155; overflow: hidden; }
    .header { padding: 24px; border-bottom: 1px solid #334155; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; background-color: ${sevColor.bg}; color: ${sevColor.text}; margin-bottom: 12px; }
    h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #f8fafc; }
    .subhead { margin: 0; color: #94a3b8; font-size: 14px; }
    .content { padding: 24px; }
    .field-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .field-table td { padding: 8px 0; font-size: 14px; vertical-align: top; }
    .field-label { width: 130px; color: #94a3b8; font-weight: 500; }
    .field-value { color: #f1f5f9; font-weight: 400; }
    .summary-box { background-color: #0f172a; border-radius: 6px; border: 1px solid #334155; padding: 14px; font-size: 13px; color: #cbd5e1; margin-bottom: 20px; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .footer { padding: 18px 24px; background-color: #0f172a; border-top: 1px solid #334155; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${payload.bugSeverity ? `<div class="badge">${escapeHtml(payload.bugSeverity)}</div>` : ''}
      <h1>${escapeHtml(headline)}</h1>
      <p class="subhead">${escapeHtml(subheadline)}</p>
    </div>
    <div class="content">
      <table class="field-table">
        <tr>
          <td class="field-label">Project:</td>
          <td class="field-value"><strong>${escapeHtml(payload.projectName)}</strong></td>
        </tr>
        ${payload.bugReportNumber ? `<tr><td class="field-label">Defect Report:</td><td class="field-value"><code>${escapeHtml(payload.bugReportNumber)}</code></td></tr>` : ''}
        ${payload.bugTitle ? `<tr><td class="field-label">Title:</td><td class="field-value">${escapeHtml(payload.bugTitle)}</td></tr>` : ''}
        ${payload.assignedEngineerName ? `<tr><td class="field-label">Assigned To:</td><td class="field-value">${escapeHtml(payload.assignedEngineerName)} (${escapeHtml(payload.assignedEngineerEmail ?? '')})</td></tr>` : ''}
        ${payload.testCaseKey ? `<tr><td class="field-label">Test Case:</td><td class="field-value"><code>${escapeHtml(payload.testCaseKey)}</code> ${escapeHtml(payload.testCaseTitle ?? '')}</td></tr>` : ''}
        ${payload.jiraIssueKey ? `<tr><td class="field-label">Jira Issue:</td><td class="field-value">${payload.jiraIssueUrl ? `<a href="${escapeHtml(payload.jiraIssueUrl)}" style="color: #38bdf8; text-decoration: none; font-weight: 600;">${escapeHtml(payload.jiraIssueKey)}</a>` : `<code>${escapeHtml(payload.jiraIssueKey)}</code>`}</td></tr>` : ''}
        ${payload.reproducibility ? `<tr><td class="field-label">Reproducibility:</td><td class="field-value">${escapeHtml(payload.reproducibility)}</td></tr>` : ''}
      </table>

      ${
        payload.bugSummary || payload.errorMessage
          ? `
        <div style="font-weight: 500; font-size: 13px; color: #94a3b8; margin-bottom: 6px;">Details:</div>
        <div class="summary-box">${escapeHtml(payload.bugSummary ?? payload.errorMessage ?? '')}</div>
      `
          : ''
      }
    </div>
    <div class="footer">
      Generated automatically by AI-Driven Software Quality Engineering Platform.<br>
      Timestamp: ${escapeHtml(payload.timestamp)}
    </div>
  </div>
</body>
</html>`;
  }

  private static buildText(
    headline: string,
    subheadline: string,
    payload: EmailTemplatePayload,
  ): string {
    const lines: string[] = [
      `========================================================================`,
      ` ${headline.toUpperCase()}`,
      `========================================================================`,
      subheadline,
      ``,
      `Project:      ${payload.projectName}`,
    ];

    if (payload.bugReportNumber) {
      lines.push(`Defect:       ${payload.bugReportNumber}`);
    }
    if (payload.bugTitle) {
      lines.push(`Title:        ${payload.bugTitle}`);
    }
    if (payload.bugSeverity) {
      lines.push(`Severity:     ${payload.bugSeverity}`);
    }
    if (payload.assignedEngineerName) {
      lines.push(
        `Assigned To:  ${payload.assignedEngineerName} (${payload.assignedEngineerEmail ?? ''})`,
      );
    }
    if (payload.testCaseKey) {
      lines.push(`Test Case:    ${payload.testCaseKey} ${payload.testCaseTitle ?? ''}`);
    }
    if (payload.jiraIssueKey) {
      lines.push(
        `Jira Issue:   ${payload.jiraIssueKey} ${payload.jiraIssueUrl ? `(${payload.jiraIssueUrl})` : ''}`,
      );
    }
    if (payload.reproducibility) {
      lines.push(`Reproduction: ${payload.reproducibility}`);
    }

    if (payload.bugSummary || payload.errorMessage) {
      lines.push(``);
      lines.push(`Summary:`);
      lines.push(`------------------------------------------------------------------------`);
      lines.push(payload.bugSummary ?? payload.errorMessage ?? '');
    }

    lines.push(``);
    lines.push(`------------------------------------------------------------------------`);
    lines.push(`Generated by AI-Driven Software Quality Engineering Platform`);
    lines.push(`Timestamp: ${payload.timestamp}`);
    lines.push(`========================================================================`);

    return lines.join('\n');
  }

  private static getSeverityColor(sev?: string): { bg: string; text: string } {
    switch (sev?.toUpperCase()) {
      case 'CRITICAL':
        return { bg: '#991b1b', text: '#fecaca' };
      case 'HIGH':
        return { bg: '#c2410c', text: '#ffedd5' };
      case 'MEDIUM':
        return { bg: '#854d0e', text: '#fef9c3' };
      case 'LOW':
      default:
        return { bg: '#334155', text: '#e2e8f0' };
    }
  }
}
