/**
 * @file packages/core/src/audit/audit-trail-exporter.test.ts
 * Export engine, formatting, checksum, and secret redaction tests for Phase 108.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AuditTrailExporter } from './audit-trail-exporter.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type { RepairAuditTimelineDto } from './audit-types.js';

describe('AuditTrailExporter', () => {
  const sampleTimeline: RepairAuditTimelineDto = {
    projectId: '11111111-1111-1111-1111-111111111111',
    failureCaseId: '22222222-2222-2222-2222-222222222222',
    session: {
      id: 'session-1',
      projectId: '11111111-1111-1111-1111-111111111111',
      failureCaseId: '22222222-2222-2222-2222-222222222222',
      sessionKey: 'RS-TEST-01',
      status: 'COMPLETED',
      totalEventsCount: 2,
      startedAt: '2026-09-12T10:00:00.000Z',
      completedAt: '2026-09-12T10:30:00.000Z',
      metadata: {},
      createdAt: '2026-09-12T10:00:00.000Z',
      updatedAt: '2026-09-12T10:30:00.000Z',
      events: [],
    },
    totalEvents: 2,
    generatedAt: '2026-09-12T10:31:00.000Z',
    events: [
      {
        id: 'evt-1',
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
        repairSessionId: 'session-1',
        sequenceNumber: 1,
        eventType: 'FAILURE_CREATED',
        actorType: 'TEST_ENGINE',
        actorId: 'playwright-runner',
        sourceComponent: 'failure-intelligence',
        timestamp: '2026-09-12T10:00:00.000Z',
        previousState: 'PASSED',
        newState: 'FAILED',
        evidenceReferences: [{ type: 'LOG', path: '/var/log/app.log' }],
        repositoryState: {},
        testRunReferences: [{ testRunId: 'tr-1' }],
        jiraReference: {},
        notificationReference: {},
        reason:
          'Payment timeout with Bearer super-secret-api-token-1234567890 and top-secret-password-xyz',
        correlationId: 'corr-1',
        causationId: null,
        idempotencyKey: 'idemp-1',
        schemaVersion: '1.0.0',
        metadata: {},
        createdAt: '2026-09-12T10:00:00.000Z',
      },
      {
        id: 'evt-2',
        projectId: '11111111-1111-1111-1111-111111111111',
        failureCaseId: '22222222-2222-2222-2222-222222222222',
        repairSessionId: 'session-1',
        sequenceNumber: 2,
        eventType: 'PATCH_APPROVED',
        actorType: 'USER',
        actorId: 'reviewer@corp.com',
        sourceComponent: 'patch-approval-service',
        timestamp: '2026-09-12T10:20:00.000Z',
        previousState: 'PENDING_REVIEW',
        newState: 'APPROVED',
        evidenceReferences: [],
        repositoryState: { baseRevision: 'abc123' },
        testRunReferences: [],
        jiraReference: { issueKey: 'PROJ-999' },
        notificationReference: { recipientEmail: 'dev@corp.com' },
        reason: 'Human dev reviewed and approved patch',
        correlationId: 'corr-1',
        causationId: 'val-1',
        idempotencyKey: 'idemp-2',
        schemaVersion: '1.0.0',
        metadata: {},
        createdAt: '2026-09-12T10:20:00.000Z',
      },
    ],
  };

  it('computes deterministic sha256 checksums', () => {
    const text = 'Audit trail certification document content';
    const expected = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    assert.equal(AuditTrailExporter.computeChecksum(text), expected);
  });

  it('exports structured JSON with valid checksum and redacts secrets', () => {
    SecretRedactor.registerSecret('top-secret-password-xyz');

    const result = AuditTrailExporter.exportJson(sampleTimeline);

    assert.equal(result.contentType, 'application/json');
    assert.equal(result.eventCount, 2);
    assert.ok(result.fileName.endsWith('.json'));

    // Checksum verification
    const computedSha = crypto.createHash('sha256').update(result.content, 'utf8').digest('hex');
    assert.equal(result.checksumSha256, computedSha);

    // Secret redaction verification
    assert.ok(!result.content.includes('super-secret-api-token-1234567890'));
    assert.ok(!result.content.includes('top-secret-password-xyz'));
    assert.ok(result.content.includes('***'));

    // JSON parsing check
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.projectId, sampleTimeline.projectId);
    assert.equal(parsed.events.length, 2);
    assert.equal(parsed.events[0].sequenceNumber, 1);
  });

  it('exports forensic Markdown with header, summary table, and redacts secrets', () => {
    const result = AuditTrailExporter.exportMarkdown(sampleTimeline);

    assert.equal(result.contentType, 'text/markdown');
    assert.equal(result.eventCount, 2);
    assert.ok(result.fileName.endsWith('.md'));

    // Checksum verification
    const computedSha = crypto.createHash('sha256').update(result.content, 'utf8').digest('hex');
    assert.equal(result.checksumSha256, computedSha);

    // Markdown content structure verification
    assert.ok(result.content.includes('# Repair & Reverification Forensic Audit Report'));
    assert.ok(result.content.includes('## 1. Executive Summary'));
    assert.ok(result.content.includes('## 2. Chronological Lifecycle Timeline'));
    assert.ok(result.content.includes('FAILURE_CREATED'));
    assert.ok(result.content.includes('PATCH_APPROVED'));
    assert.ok(result.content.includes('TEST_ENGINE'));
    assert.ok(result.content.includes('USER'));
    assert.ok(result.content.includes('PASSED → FAILED'));
    assert.ok(result.content.includes('PENDING_REVIEW → APPROVED'));

    // Secret redaction verification
    assert.ok(!result.content.includes('super-secret-api-token-1234567890'));
    assert.ok(!result.content.includes('top-secret-password-xyz'));
  });
});
