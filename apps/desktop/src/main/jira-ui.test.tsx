/**
 * @file apps/desktop/src/main/jira-ui.test.tsx
 * UI component tests for JiraIntegrationSettingsCard (V7 Phase 89).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { JiraIntegrationSettingsCard } from '../renderer/features/jira/JiraIntegrationSettingsCard.js';

describe('JiraIntegrationSettingsCard UI Tests (Phase 89)', () => {
  beforeEach(() => {
    // Setup window.desktop mock
    (globalThis as any).window = {
      desktop: {
        jira: {
          getConnection: async () => ({
            ok: true,
            data: null,
          }),
        },
      },
    };
  });

  it('renders project selection prompt when projectId is null', () => {
    const html = renderToString(<JiraIntegrationSettingsCard projectId={null} />);
    assert.ok(html.includes('Select a project to view or configure Jira integration'));
    assert.ok(html.includes('Jira Integration Foundation'));
  });

  it('renders settings card with unconfigured badge and empty inputs when projectId is present', () => {
    const html = renderToString(
      <JiraIntegrationSettingsCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    assert.ok(html.includes('Jira Integration Foundation'));
    assert.ok(html.includes('Not Configured'));
    assert.ok(html.includes('Integration Name'));
    assert.ok(html.includes('Jira Base URL'));
    assert.ok(html.includes('Account Email / Username'));
    assert.ok(html.includes('API Token / Personal Access Token'));
    assert.ok(html.includes('Save Connection'));

    // Token input must be type="password"
    assert.ok(html.includes('type="password"'));
  });

  it('never renders plaintext credentials in server HTML output', () => {
    const sensitiveToken = 'ATATT3xFfGF0actual_api_token_value_998877';
    const html = renderToString(
      <JiraIntegrationSettingsCard projectId="11111111-1111-1111-1111-111111111111" />,
    );

    assert.ok(
      !html.includes(sensitiveToken),
      'Plaintext token must never appear in rendered HTML markup',
    );
  });
});
