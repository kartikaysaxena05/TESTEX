/**
 * @file packages/core/src/qa-report/qa-report-exporter.ts
 * Formats and exports Final QA Reports in structured JSON and executive Markdown formats.
 * Enforces secret redaction, size bounds, and cryptographic SHA-256 integrity sealing.
 */

import crypto from 'node:crypto';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import {
  QA_REPORT_BOUNDS,
  type ExportQaReportResultDto,
  type FinalQaReportDto,
  type IQaReportExporter,
} from './qa-report-types.js';
import { QaReportExportFailedError } from './qa-report-errors.js';

export class QaReportExporter implements IQaReportExporter {
  public async exportReport(params: {
    readonly report: FinalQaReportDto;
    readonly format: 'JSON' | 'MARKDOWN';
  }): Promise<ExportQaReportResultDto> {
    const { report, format } = params;

    let content: string;
    let contentType: string;
    let fileExtension: string;

    if (format === 'JSON') {
      const sanitizedReport = SecretRedactor.redactObject(report);
      content = JSON.stringify(sanitizedReport, null, 2);
      contentType = 'application/json';
      fileExtension = 'json';
    } else {
      content = this.renderMarkdown(report);
      contentType = 'text/markdown';
      fileExtension = 'md';
    }

    const contentBuffer = Buffer.from(content, 'utf8');
    if (contentBuffer.length > QA_REPORT_BOUNDS.MAX_EXPORT_SIZE_BYTES) {
      throw new QaReportExportFailedError(
        `Export payload exceeds maximum allowed size of ${QA_REPORT_BOUNDS.MAX_EXPORT_SIZE_BYTES} bytes.`,
      );
    }

    const checksumSha256 = crypto
      .createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');

    const safeRelease = report.releaseIdentifier.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `qa-report-${safeRelease}-v${report.reportVersion}-${report.reportKey}.${fileExtension}`;

    return {
      fileName,
      contentType,
      content,
      checksumSha256,
      exportedAt: new Date().toISOString(),
      reportKey: report.reportKey,
      releaseIdentifier: report.releaseIdentifier,
      reportVersion: report.reportVersion,
    };
  }

  private renderMarkdown(report: FinalQaReportDto): string {
    const sanitized = SecretRedactor.redactObject(report);
    const lines: string[] = [];

    lines.push('# Final QA & Release Readiness Intelligence Report');
    lines.push('');
    lines.push(`**Report Key:** \`${sanitized.reportKey}\` | **Version:** \`${sanitized.reportVersion}\` | **Status:** \`${sanitized.status}\``);
    lines.push('');

    // Metadata Table
    lines.push('## Release Metadata');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| :--- | :--- |');
    lines.push(`| **Project ID** | \`${sanitized.projectId}\` |`);
    lines.push(`| **Release Identifier** | \`${sanitized.releaseIdentifier}\` |`);
    lines.push(`| **Build Identifier** | ${sanitized.buildIdentifier ? `\`${sanitized.buildIdentifier}\`` : '_None_'} |`);
    lines.push(`| **Commit SHA** | ${sanitized.commitSha ? `\`${sanitized.commitSha}\`` : '_None_'} |`);
    lines.push(`| **Branch** | ${sanitized.branch ? `\`${sanitized.branch}\`` : '_None_'} |`);
    lines.push(`| **Environment** | ${sanitized.environmentName ? `\`${sanitized.environmentName}\`` : '_Default_'} |`);
    lines.push(`| **Policy Engine Version** | \`${sanitized.policyVersion}\` |`);
    lines.push(`| **Readiness Score** | **${sanitized.readinessScore !== null && sanitized.readinessScore !== undefined ? `${sanitized.readinessScore}/100` : 'N/A'}** |`);
    lines.push(`| **Generated At** | ${sanitized.sourceSnapshotTime} |`);
    lines.push(`| **Finalized At** | ${sanitized.finalizedAt ?? '_Draft / Unfinalized_'} |`);
    lines.push('');

    // Verdict Callout
    lines.push('## Release Readiness Verdict');
    lines.push('');
    switch (sanitized.verdict) {
      case 'READY':
        lines.push('> [!NOTE]');
        lines.push('> ### VERDICT: READY FOR RELEASE');
        lines.push(`> ${sanitized.readinessExplanation}`);
        break;
      case 'READY_WITH_RISK':
        lines.push('> [!WARNING]');
        lines.push('> ### VERDICT: READY WITH RESIDUAL RISK');
        lines.push(`> ${sanitized.readinessExplanation}`);
        break;
      case 'NOT_READY':
        lines.push('> [!CAUTION]');
        lines.push('> ### VERDICT: NOT READY FOR RELEASE');
        lines.push(`> ${sanitized.readinessExplanation}`);
        break;
      case 'BLOCKED':
        lines.push('> [!CAUTION]');
        lines.push('> ### VERDICT: RELEASE BLOCKED');
        lines.push(`> ${sanitized.readinessExplanation}`);
        break;
      case 'UNKNOWN':
      default:
        lines.push('> [!IMPORTANT]');
        lines.push('> ### VERDICT: UNKNOWN READINESS STATUS');
        lines.push(`> ${sanitized.readinessExplanation}`);
        break;
    }
    lines.push('');

    // Executive Summary & Overall Recommendation
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(sanitized.executiveSummary);
    lines.push('');
    lines.push('### Overall Recommendation');
    lines.push('');
    lines.push(sanitized.overallRecommendation);
    lines.push('');

    // Release Blockers
    if (sanitized.releaseBlockers.length > 0) {
      lines.push('## Active Release Blockers');
      lines.push('');
      lines.push('| Severity | Rule Code | Blocker Description |');
      lines.push('| :--- | :--- | :--- |');
      for (const blocker of sanitized.releaseBlockers) {
        lines.push(`| **${blocker.severity}** | \`${blocker.ruleCode}\` | ${blocker.description} |`);
      }
      lines.push('');
    }

    // Residual Risks
    if (sanitized.residualRisks.length > 0) {
      lines.push('## Residual Risks & Warnings');
      lines.push('');
      lines.push('| Severity | Risk Code | Title | Mitigation |');
      lines.push('| :--- | :--- | :--- | :--- |');
      for (const risk of sanitized.residualRisks) {
        lines.push(`| **${risk.severity}** | \`${risk.riskCode}\` | ${risk.title} | ${risk.mitigation ?? '_None provided_'} |`);
      }
      lines.push('');
    }

    // Test Execution Metrics
    const te = sanitized.testExecutionSummary;
    lines.push('## Distinct Test Execution vs Retry Metrics');
    lines.push('');
    lines.push('| Metric | Value | Note |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(`| **Total Distinct Logical Tests** | \`${te.totalDistinctTests}\` | Unique test case definitions |`);
    lines.push(`| **Passed Tests** | \`${te.passedCount}\` | Distinct tests in passed state |`);
    lines.push(`| **Failed Tests** | \`${te.failedCount}\` | Distinct tests in failed state |`);
    lines.push(`| **Blocked Tests** | \`${te.blockedCount}\` | Distinct tests blocked |`);
    lines.push(`| **Automation Errors** | \`${te.automationErrorCount}\` | Harness / framework errors |`);
    lines.push(`| **Pass Percentage** | **${te.passPercentage}%** | Distinct pass rate |`);
    lines.push(`| **Total Execution Attempts** | \`${te.totalExecutionAttempts}\` | Includes retries across runs |`);
    lines.push(`| **Retry Attempts** | \`${te.retryCount}\` | Execution retries performed |`);
    lines.push(`| **Passed After Retry** | \`${te.passedAfterRetryCount}\` | Flaky / transient resolutions |`);
    lines.push(`| **Flakiness Rate** | **${sanitized.flakinessSummary.flakinessRate}%** | Rate of retry stabilization |`);
    lines.push('');

    // Requirement Traceability Summary
    const req = sanitized.requirementSummary;
    lines.push('## Requirement Coverage & Verification');
    lines.push('');
    lines.push('| Metric | Count | Percentage |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(`| **Total Requirements** | \`${req.total}\` | 100% |`);
    lines.push(`| **Testable Requirements** | \`${req.testable}\` | - |`);
    lines.push(`| **Covered Requirements** | \`${req.covered}\` | ${req.coveragePercentage}% |`);
    lines.push(`| **Verified Requirements** | \`${req.verified}\` | ${req.verifiedPercentage}% |`);
    lines.push(`| **Uncovered Requirements** | \`${req.uncovered}\` | - |`);
    lines.push(`| **Failing Requirements** | \`${req.failing}\` | - |`);
    lines.push(`| **Blocked Requirements** | \`${req.blocked}\` | - |`);
    lines.push('');

    // Requirement Traceability Matrix
    if (sanitized.traceabilityMatrix.length > 0) {
      lines.push('### Requirement Traceability Matrix');
      lines.push('');
      lines.push('| Requirement Key | Title | Priority | Status | Associated Tests | Verification Status |');
      lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
      for (const item of sanitized.traceabilityMatrix) {
        lines.push(`| **${item.requirementKey}** | ${item.title} | ${item.priority} | ${item.status} | ${item.associatedTestCount} | ${item.verified ? 'VERIFIED' : 'UNVERIFIED'} |`);
      }
      lines.push('');
    }

    // Defect & Reverification Summary
    const def = sanitized.defectSummary;
    const rev = sanitized.reverificationSummary;
    lines.push('## Defect Triage & Reverification Summary');
    lines.push('');
    lines.push('| Category | Metric | Count |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(`| **Defects** | Open Critical (P0) | **${def.openCritical}** |`);
    lines.push(`| **Defects** | Open High (P1) | **${def.openHigh}** |`);
    lines.push(`| **Defects** | Open Medium (P2) | \`${def.openMedium}\` |`);
    lines.push(`| **Defects** | Open Low (P3) | \`${def.openLow}\` |`);
    lines.push(`| **Defects** | Resolved / Closed | \`${def.resolvedOrClosed}\` |`);
    lines.push(`| **Reverifications** | Total Reverifications | \`${rev.totalReverifications}\` |`);
    lines.push(`| **Reverifications** | Verified Fixed | \`${rev.verifiedFixedCount}\` |`);
    lines.push(`| **Reverifications** | Still Failing | **${rev.stillFailingCount}** |`);
    lines.push(`| **Reverifications** | Different Failure | \`${rev.differentFailureCount}\` |`);
    lines.push('');

    // Failure Domain Separation
    const fd = sanitized.failureDomainSummary;
    lines.push('## Failure Domain Classification');
    lines.push('');
    lines.push('| Domain | Count | Description |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(`| **Application Defects** | \`${fd.applicationDefects}\` | Authentic product defects |`);
    lines.push(`| **Automation Failures** | \`${fd.automationFailures}\` | Script / locator / harness bugs |`);
    lines.push(`| **Test Data Failures** | \`${fd.testDataFailures}\` | Missing or corrupted fixtures |`);
    lines.push(`| **Environment Failures** | \`${fd.environmentFailures}\` | Infrastructure / network outage |`);
    lines.push(`| **Blocked** | \`${fd.blockedFailures}\` | Execution prerequisites unmet |`);
    lines.push(`| **Inconclusive / Unknown** | \`${fd.inconclusiveFailures + fd.unknownFailures}\` | Unresolved domain triage |`);
    lines.push('');

    // Health Assessment
    lines.push('## Platform Health Assessment');
    lines.push('');
    lines.push(`- **Environment Health:** \`${sanitized.environmentHealth.status}\` (${sanitized.environmentHealth.issues.join(', ') || 'No known issues'})`);
    lines.push(`- **Automation Harness Health:** \`${sanitized.automationHealth.status}\` (${sanitized.automationHealth.issues.join(', ') || 'No known issues'})`);
    lines.push(`- **Test Data Health:** \`${sanitized.testDataHealth.status}\` (${sanitized.testDataHealth.issues.join(', ') || 'No known issues'})`);
    lines.push('');

    // Cryptographic Seal
    lines.push('---');
    lines.push(`*Report Checksum (SHA-256):* \`${sanitized.checksumSha256}\``);
    lines.push('');

    return lines.join('\n');
  }
}
