/**
 * @file apps/desktop/src/main/repair-audit-ui.test.tsx
 * UI component tests for Complete Repair & Reverification Audit Trail (V7 Phase 108).
 * Tests RepairAuditTrailCard rendering, controls, actor filters, export triggers via SSR.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RepairAuditTrailCard } from '../renderer/features/failures/RepairAuditTrailCard.js';

describe('Repair Audit Trail UI Component Tests (Phase 108)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';

  it('renders RepairAuditTrailCard with header and badge', () => {
    const html = renderToString(
      <RepairAuditTrailCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('repair-audit-trail-card'));
    assert.ok(html.includes('Complete Repair &amp; Reverification Audit Trail'));
    assert.ok(html.includes('V7 Phase 108'));
    assert.ok(html.includes('Refresh'));
  });

  it('renders actor filter options and search input', () => {
    const html = renderToString(
      <RepairAuditTrailCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('filter-actor-select'));
    assert.ok(html.includes('All Actors'));
    assert.ok(html.includes('Human Decisions (USER)'));
    assert.ok(html.includes('AI Proposals (AI)'));
    assert.ok(html.includes('Test Engine Results'));
    assert.ok(html.includes('Jira Integration Actions'));
    assert.ok(html.includes('Notification Service'));
    assert.ok(html.includes('Repair Engine Actions'));
    assert.ok(html.includes('placeholder="Search events..."'));
  });

  it('renders export triggers for JSON and Markdown', () => {
    const html = renderToString(
      <RepairAuditTrailCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('export-json-button'));
    assert.ok(html.includes('export-markdown-button'));
    assert.ok(html.includes('Export JSON'));
    assert.ok(html.includes('Export Markdown'));
  });
});
