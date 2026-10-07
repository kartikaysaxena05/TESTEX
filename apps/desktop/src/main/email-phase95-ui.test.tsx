/**
 * @file apps/desktop/src/main/email-phase95-ui.test.tsx
 * UI component tests for Phase 95 Email Notifications Panel.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EmailNotificationsPanel } from '../renderer/features/jira/EmailNotificationsPanel.js';

describe('EmailNotificationsPanel UI Component Tests', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';

  it('renders email notifications panel with empty state when no notifications', () => {
    // Render with null or empty list
    const html = renderToString(<EmailNotificationsPanel projectId={projectId} />);

    assert.ok(html.includes('data-testid="email-notifications-panel"'));
    assert.ok(html.includes('Email Notifications &amp; Dispatch Audit'));
    assert.ok(html.includes('data-testid="btn-refresh-notifications"'));
    assert.ok(html.includes('data-testid="empty-notifications-message"'));
  });

  it('renders panel header and refresh button properly', () => {
    const html = renderToString(
      <EmailNotificationsPanel
        projectId={projectId}
        bugReportId="00000000-0000-0000-0000-000000000222"
      />,
    );

    assert.ok(html.includes('data-testid="email-notifications-panel"'));
    assert.ok(html.includes('data-testid="btn-refresh-notifications"'));
  });
});
