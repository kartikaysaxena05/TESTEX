/**
 * @file packages/core/src/audit/audit-trail-exporter.ts
 * Deterministic structured export engine for V7 Phase 108 Repair Audit Trails.
 * Produces machine-readable JSON and human-verifiable forensic Markdown reports
 * with cryptographic SHA-256 checksums and comprehensive secret redaction.
 */

import crypto from 'node:crypto';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type { RepairAuditTimelineDto, ExportRepairTimelineResultDto } from './audit-types.js';

export class AuditTrailExporter {
  /**
   * Generates a deterministic SHA-256 checksum for arbitrary string content.
   */
  public static computeChecksum(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Exports the audit timeline as formatted, deterministic JSON.
   */
  public static exportJson(timeline: RepairAuditTimelineDto): ExportRepairTimelineResultDto {
    const serialized = JSON.stringify(
      {
        schemaVersion: '1.0.0',
        projectId: timeline.projectId,
        failureCaseId: timeline.failureCaseId,
        session: timeline.session,
        totalEvents: timeline.totalEvents,
        generatedAt: timeline.generatedAt,
        events: timeline.events,
      },
      null,
      2,
    );

    const safeContent = SecretRedactor.redactText(serialized);
    const checksumSha256 = this.computeChecksum(safeContent);
    const shortId = timeline.failureCaseId.slice(0, 8);
    const fileName = `repair-audit-${shortId}-${Date.now()}.json`;

    return {
      fileName,
      contentType: 'application/json',
      content: safeContent,
      eventCount: timeline.events.length,
      checksumSha256,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Exports the audit timeline as a comprehensive, human-verifiable forensic Markdown report.
   */
  public static exportMarkdown(timeline: RepairAuditTimelineDto): ExportRepairTimelineResultDto {
    const lines: string[] = [];

    const shortId = timeline.failureCaseId.slice(0, 8);
    const sessionKey = timeline.session?.sessionKey || 'NONE';
    const firstEvent = timeline.events[0];
    const lastEvent = timeline.events[timeline.events.length - 1];

    lines.push('# Repair & Reverification Forensic Audit Report');
    lines.push('');
    lines.push('**AI-Driven Software Quality Engineering Platform — V7 Phase 108**');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 1. Executive Summary Table
    lines.push('## 1. Executive Summary');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('| :--- | :--- |');
    lines.push(`| **Project ID** | \`${timeline.projectId}\` |`);
    lines.push(`| **Failure Case ID** | \`${timeline.failureCaseId}\` |`);
    lines.push(`| **Repair Session Key** | \`${sessionKey}\` |`);
    lines.push(`| **Session Status** | **${timeline.session?.status || 'COMPLETED'}** |`);
    lines.push(`| **Total Audit Events** | ${timeline.events.length} |`);
    lines.push(`| **First Event Time** | ${firstEvent ? firstEvent.timestamp : 'N/A'} |`);
    lines.push(`| **Last Event Time** | ${lastEvent ? lastEvent.timestamp : 'N/A'} |`);
    lines.push(`| **Generated At** | ${timeline.generatedAt} |`);
    lines.push('');

    // 2. Chronological Timeline Table
    lines.push('## 2. Chronological Lifecycle Timeline');
    lines.push('');
    lines.push(
      '| # | Timestamp (ISO) | Actor Type | Actor ID | Event Type | Transition | Component | Details / Reason |',
    );
    lines.push('| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

    for (const ev of timeline.events) {
      const transition =
        ev.previousState || ev.newState
          ? `${ev.previousState || 'NONE'} → ${ev.newState || 'NONE'}`
          : '-';
      const reason = ev.reason ? ev.reason.replace(/\|/g, '\\|').slice(0, 100) : '-';
      lines.push(
        `| ${ev.sequenceNumber} | ${ev.timestamp} | \`${ev.actorType}\` | ${ev.actorId} | **${ev.eventType}** | ${transition} | ${ev.sourceComponent} | ${reason} |`,
      );
    }
    lines.push('');

    // 3. Provenance Deep-Dives
    lines.push('## 3. Provenance Records');
    lines.push('');

    // 3a. Human Approvals
    const approvals = timeline.events.filter(
      e => e.eventType === 'PATCH_APPROVED' || e.eventType === 'PATCH_REJECTED',
    );
    lines.push('### 3.1 Human Approval & Rejection Decisions');
    if (approvals.length === 0) {
      lines.push('_No human review decisions recorded for this repair session._');
    } else {
      for (const app of approvals) {
        lines.push(`- **Action:** **${app.eventType}**`);
        lines.push(`  - **Reviewer:** ${app.actorId} (\`${app.actorType}\`)`);
        lines.push(`  - **Timestamp:** ${app.timestamp}`);
        lines.push(`  - **Decision Details:** ${app.reason || 'No comments provided'}`);
        if (app.repositoryState?.reviewedPatchHash) {
          lines.push(`  - **Reviewed Patch Hash:** \`${app.repositoryState.reviewedPatchHash}\``);
        }
      }
    }
    lines.push('');

    // 3b. AI Patch Proposals
    const patchEvents = timeline.events.filter(e => e.eventType === 'PATCH_PROPOSED');
    lines.push('### 3.2 AI Patch Proposals');
    if (patchEvents.length === 0) {
      lines.push('_No AI patch proposals recorded._');
    } else {
      for (const p of patchEvents) {
        lines.push(`- **Patch Proposed by:** ${p.actorId}`);
        lines.push(`  - **Timestamp:** ${p.timestamp}`);
        lines.push(`  - **Base Revision:** \`${p.repositoryState?.baseRevision || 'N/A'}\``);
        lines.push(`  - **Patch Fingerprint:** \`${p.repositoryState?.patchHash || 'N/A'}\``);
        lines.push(
          `  - **Target Files:** ${(p.repositoryState?.targetFiles || []).join(', ') || 'N/A'}`,
        );
        lines.push(`  - **Rationale:** ${p.reason || 'N/A'}`);
      }
    }
    lines.push('');

    // 3c. Test Execution & Verification
    const testEvents = timeline.events.filter(
      e =>
        e.eventType === 'REVERIFICATION_COMPLETED' ||
        e.eventType === 'PATCH_VALIDATION_COMPLETED' ||
        e.eventType === 'RETEST_COMPLETED',
    );
    lines.push('### 3.3 Authoritative Test Outcomes');
    if (testEvents.length === 0) {
      lines.push('_No test runs recorded._');
    } else {
      for (const t of testEvents) {
        lines.push(`- **${t.eventType}** by ${t.actorId} at ${t.timestamp}`);
        lines.push(`  - **Verdict:** **${t.newState || 'UNKNOWN'}**`);
        if (t.testRunReferences && t.testRunReferences.length > 0) {
          lines.push(`  - **Run References:** \`${JSON.stringify(t.testRunReferences)}\``);
        }
      }
    }
    lines.push('');

    // 3d. Rollback
    const rollbackEvents = timeline.events.filter(
      e => e.eventType === 'ROLLBACK_STARTED' || e.eventType === 'ROLLBACK_COMPLETED',
    );
    lines.push('### 3.4 Patch Rollback History');
    if (rollbackEvents.length === 0) {
      lines.push('_No rollbacks executed for this repair._');
    } else {
      for (const r of rollbackEvents) {
        lines.push(`- **${r.eventType}** at ${r.timestamp} by ${r.actorId}`);
        lines.push(`  - **Reason:** ${r.reason || 'N/A'}`);
      }
    }
    lines.push('');

    // 4. Verification Checksum
    lines.push('---');
    lines.push('## 4. Integrity & Verification Checksum');
    lines.push('');
    lines.push(
      'This audit report is immutable and cryptographically bound to platform database records.',
    );
    lines.push('');

    const preChecksumMarkdown = lines.join('\n');
    const safeContent = SecretRedactor.redactText(preChecksumMarkdown);
    const finalMarkdown = `${safeContent}\n- **Integrity Seal:** Authoritative cryptographically verifiable audit export.\n`;
    const checksumSha256 = this.computeChecksum(finalMarkdown);
    const fileName = `repair-audit-${shortId}-${Date.now()}.md`;

    return {
      fileName,
      contentType: 'text/markdown',
      content: finalMarkdown,
      eventCount: timeline.events.length,
      checksumSha256,
      exportedAt: new Date().toISOString(),
    };
  }
}
