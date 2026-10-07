/**
 * @file apps/desktop/src/main/post-fix-ui.test.tsx
 * UI component tests for Post-Fix Jira & Notification Updates (V7 Phase 107).
 * Verifies PostFixSyncCard rendering, status badges, Jira key displays, and button controls via SSR.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PostFixSyncCard } from '../renderer/features/failures/PostFixSyncCard.js';

describe('Post-Fix UI Component Tests (Phase 107)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const reverificationId = '00000000-0000-0000-0000-000000000333';

  it('renders PostFixSyncCard with default states', () => {
    const html = renderToString(
      <PostFixSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationId}
      />,
    );

    assert.ok(html.includes('post-fix-sync-card'));
    assert.ok(html.includes('Post-Fix Jira &amp; Notification Updates'));
    assert.ok(html.includes('Phase 107'));
    assert.ok(html.includes('Update Jira &amp; Notify'));
    assert.ok(html.includes('NOT SYNCED'));
    assert.ok(html.includes('Notify Defect Assignee / QA Owner'));
    assert.ok(html.includes('Force Workflow Transition'));
  });

  it('renders Jira issue key badge when linked', () => {
    const html = renderToString(
      <PostFixSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationId}
        jiraIssueKey="PROJ-999"
      />,
    );

    assert.ok(html.includes('jira-key-badge'));
    assert.ok(html.includes('PROJ-999'));
  });

  it('renders disabled state when reverificationId is missing', () => {
    const html = renderToString(
      <PostFixSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={null}
      />,
    );

    assert.ok(html.includes('disabled=""'));
  });

  it('renders custom note input and toggle options', () => {
    const html = renderToString(
      <PostFixSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationId}
      />,
    );

    assert.ok(html.includes('custom-note-input'));
    assert.ok(html.includes('notify-assignee-toggle'));
    assert.ok(html.includes('force-transition-toggle'));
  });
});
