/**
 * @file packages/core/src/post-fix/post-fix-notification-formatter.ts
 * Formats deterministic, secret-redacted notification messages for post-fix verification events.
 */

import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type { AuthoritativeVerificationFacts } from './post-fix-types.js';

export interface FormattedNotification {
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody: string;
}

export class PostFixNotificationFormatter {
  public static format(params: {
    readonly facts: AuthoritativeVerificationFacts;
    readonly bugKey: string;
    readonly projectName: string;
  }): FormattedNotification {
    const { facts, bugKey, projectName } = params;

    let headline = '';
    let summaryText = '';

    switch (facts.outcome) {
      case 'VERIFIED_FIXED':
        headline = `${bugKey} has passed automated reverification.`;
        summaryText = `Automated fix verification succeeded for defect ${bugKey} in project ${projectName}. The application now behaves according to specification.`;
        break;

      case 'STILL_FAILING':
        headline = `${bugKey} still fails after the attempted fix.`;
        summaryText = `Automated reverification rerun for defect ${bugKey} failed. The original failure signature was detected or a new error occurred.`;
        break;

      case 'REGRESSION_DETECTED':
        headline = `${bugKey} original failure is resolved, but regression tests detected new failures.`;
        summaryText = `The targeted fix for defect ${bugKey} resolved the primary defect, but automated regression testing detected new failures in dependent test cases.`;
        break;

      case 'BLOCKED':
        headline = `${bugKey} could not be reverified because the target environment was unavailable.`;
        summaryText = `Reverification for defect ${bugKey} is currently blocked: ${facts.blockerReason || 'target environment or prerequisites unavailable'}.`;
        break;

      case 'INCONCLUSIVE':
        headline = `${bugKey} reverification was inconclusive due to execution uncertainty.`;
        summaryText = `Automated reverification for defect ${bugKey} could not produce an authoritative verdict due to environment timeout or infrastructure error.`;
        break;

      case 'ROLLED_BACK':
        headline = `${bugKey} patch rollback completed; defect verified as reappearing.`;
        summaryText = `Patch for defect ${bugKey} was surgically rolled back. Retesting confirmed the defect re-occurs as expected.`;
        break;

      case 'CANCELLED':
      default:
        headline = `${bugKey} reverification was cancelled.`;
        summaryText = `Reverification for defect ${bugKey} was cancelled prior to completing automated execution.`;
        break;
    }

    const subject = `[${facts.outcome}] ${headline} (${projectName})`;

    const textLines = [
      headline,
      '',
      summaryText,
      '',
      `Test Case: ${facts.testCaseKey} - ${facts.testCaseTitle}`,
      facts.requirementKey ? `Requirement: ${facts.requirementKey}` : '',
      `Environment: ${facts.targetEnvironmentName}`,
      `Execution ID: ${facts.originalExecutionId}`,
      facts.verificationExecutionId ? `Verification ID: ${facts.verificationExecutionId}` : '',
      `Timestamp: ${facts.completedAt.toISOString()}`,
      '',
      'AI-Driven Software Quality Engineering Platform',
    ].filter(Boolean);

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 16px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-top: 0;">${headline}</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #334155;">${summaryText}</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 16px 0; font-size: 13px;">
          <p style="margin: 4px 0;"><strong>Test Case:</strong> ${facts.testCaseKey} (${facts.testCaseTitle})</p>
          ${facts.requirementKey ? `<p style="margin: 4px 0;"><strong>Requirement:</strong> ${facts.requirementKey}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Environment:</strong> ${facts.targetEnvironmentName}</p>
          <p style="margin: 4px 0;"><strong>Outcome:</strong> <span style="font-weight: 600; color: #2563eb;">${facts.outcome}</span></p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${facts.completedAt.toISOString()}</p>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
          Generated automatically by AI-Driven Software Quality Engineering Platform
        </p>
      </div>
    `.trim();

    return {
      subject: SecretRedactor.redactText(subject),
      textBody: SecretRedactor.redactText(textLines.join('\n')),
      htmlBody: SecretRedactor.redactText(htmlBody),
    };
  }
}
