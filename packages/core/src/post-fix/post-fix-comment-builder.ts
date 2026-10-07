/**
 * @file packages/core/src/post-fix/post-fix-comment-builder.ts
 * Builds deterministic, structured, secret-redacted Jira comments for automated verification results.
 */

import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { POST_FIX_BOUNDS, type AuthoritativeVerificationFacts } from './post-fix-types.js';

export class PostFixCommentBuilder {
  /**
   * Sanitizes input text to eliminate secrets and code injection vectors.
   */
  public static sanitize(text: string): string {
    if (!text || typeof text !== 'string') return '';
    let sanitized = SecretRedactor.redactText(text);

    // Redact credential patterns
    sanitized = sanitized.replace(
      /(\b(?:password|passwd|secret|token|apikey|api_key|authorization)\s*[=:]\s*)[^\s,;&"']+/gi,
      '$1[REDACTED_SECRET]',
    );
    sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1[REDACTED_SECRET]$2');
    sanitized = sanitized.replace(/((?:set-cookie|cookie):\s*)[^\r\n]+/gi, '$1[REDACTED_SECRET]');
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT REDACTED]');

    return sanitized.trim();
  }

  /**
   * Generates a deterministic, formatted markdown comment for Jira.
   */
  public static buildComment(params: {
    readonly facts: AuthoritativeVerificationFacts;
    readonly customNote?: string | null;
    readonly actor?: string;
  }): string {
    const { facts, customNote, actor } = params;

    const lines: string[] = [];

    lines.push('h2. Automated Fix Verification');
    lines.push('');
    lines.push(`*Result:* *${facts.outcome}*`);
    lines.push(`*Test Case:* ${this.sanitize(facts.testCaseKey)} (${this.sanitize(facts.testCaseTitle)}) [v${facts.testCaseVersionNumber}]`);

    if (facts.requirementKey) {
      lines.push(`*Requirement:* ${this.sanitize(facts.requirementKey)}`);
    }

    lines.push(`*Environment:* ${this.sanitize(facts.targetEnvironmentName)}`);
    lines.push(`*Original Execution ID:* ${facts.originalExecutionId}`);

    if (facts.verificationExecutionId) {
      lines.push(`*Reverification Execution ID:* ${facts.verificationExecutionId}`);
    }
    if (facts.verificationTestRunId) {
      lines.push(`*Test Run ID:* ${facts.verificationTestRunId}`);
    }

    lines.push(`*Verification Attempt:* #${facts.verificationAttemptNumber}`);
    lines.push(`*Completed At:* ${facts.completedAt.toISOString()}`);
    lines.push('');

    // Before / After Analysis
    lines.push('h3. Verification Analysis');
    switch (facts.outcome) {
      case 'VERIFIED_FIXED':
        lines.push('- *Before Fix:* FAILED');
        lines.push('- *After Fix:* PASSED');
        lines.push('- *Resolution Status:* Defect successfully verified as fixed. Target application behavior matches specification.');
        break;

      case 'STILL_FAILING':
        lines.push('- *Before Fix:* FAILED');
        lines.push('- *After Fix:* FAILED');
        lines.push(
          facts.isSignatureMatch
            ? '- *Failure Signature:* MATCHES original failure (defect still present).'
            : '- *Failure Signature:* DIFFERENT failure encountered during rerun.',
        );
        break;

      case 'REGRESSION_DETECTED':
        lines.push('- *Before Fix:* FAILED');
        lines.push('- *After Fix:* Target defect test PASSED, but REGRESSION DETECTED.');
        if (facts.regressionDetails) {
          lines.push(`- *New Regressions Count:* ${facts.regressionDetails.regressionCount}`);
          lines.push(
            `- *Regressed Test Cases:* ${facts.regressionDetails.regressedTestKeys.map(k => this.sanitize(k)).join(', ')}`,
          );
        }
        break;

      case 'BLOCKED':
        lines.push('- *Status:* BLOCKED');
        lines.push(
          `- *Blocker Reason:* ${this.sanitize(facts.blockerReason || 'Target execution environment unavailable or prerequisite unmet.')}`,
        );
        break;

      case 'INCONCLUSIVE':
        lines.push('- *Status:* INCONCLUSIVE');
        lines.push(
          `- *Details:* Verification rerun timed out or encountered an execution infrastructure uncertainty.`,
        );
        break;

      case 'ROLLED_BACK':
        lines.push('- *Status:* ROLLED_BACK');
        lines.push('- *Details:* Patch was rolled back. Re-execution confirmed the defect reappears as expected.');
        break;

      case 'CANCELLED':
        lines.push('- *Status:* CANCELLED');
        lines.push('- *Details:* Reverification run was cancelled by user.');
        break;
    }

    lines.push('');

    // Evidence References
    if (facts.evidenceReferences.length > 0) {
      lines.push('h3. Evidence & Artifacts');
      const boundedEvidence = facts.evidenceReferences.slice(0, POST_FIX_BOUNDS.MAX_EVIDENCE_REFERENCES);
      for (const ev of boundedEvidence) {
        const uriPart = ev.uri ? ` (${this.sanitize(ev.uri)})` : '';
        lines.push(`- [${this.sanitize(ev.type)}] ${this.sanitize(ev.name)}${uriPart}`);
      }
      lines.push('');
    }

    // Custom Note
    if (customNote && customNote.trim().length > 0) {
      const boundedNote = customNote.slice(0, POST_FIX_BOUNDS.MAX_CUSTOM_NOTE_LENGTH);
      lines.push('h3. Engineering Note');
      lines.push(this.sanitize(boundedNote));
      lines.push('');
    }

    lines.push('----');
    lines.push(`_Verified by AI-Driven Software Quality Engineering Platform (${actor || 'SYSTEM'})_`);

    const result = lines.join('\n');
    return result.slice(0, POST_FIX_BOUNDS.MAX_COMMENT_LENGTH);
  }
}
