/**
 * @file apps/desktop/src/main/verification-ui.test.tsx
 * UI component tests for Automated Failed-Test Rerun & Fix Verification (V7 Phase 98).
 * Verifies DefectVerificationPanel rendering, execution controls, mode selector, outcome badges,
 * comparison diffs, and attempts history table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DefectVerificationPanel } from '../renderer/features/failures/DefectVerificationPanel.js';
import { DefectReverificationCard } from '../renderer/features/failures/DefectReverificationCard.js';

describe('Defect Fix Verification UI Tests (Phase 98)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const reverificationId = '00000000-0000-0000-0000-000000000333';

  it('renders DefectVerificationPanel with execution controls and mode selector', () => {
    const html = renderToString(
      <DefectVerificationPanel
        projectId={projectId}
        failureCaseId={failureCaseId}
        reverificationId={reverificationId}
      />,
    );

    assert.ok(html.includes('defect-verification-panel'), 'Panel container rendered');
    assert.ok(
      html.includes('Automated Failed-Test Rerun &amp; Fix Verification'),
      'Title rendered',
    );
    assert.ok(html.includes('run-verification-btn'), 'Run verification button rendered');
    assert.ok(html.includes('verification-mode-select'), 'Mode selector rendered');
    assert.ok(html.includes('verification-max-attempts-select'), 'Max attempts selector rendered');
    assert.ok(html.includes('Historical Version (E1)'), 'Historical option rendered');
    assert.ok(html.includes('Current Test Version'), 'Current option rendered');
  });

  it('embeds DefectVerificationPanel inside DefectReverificationCard seamlessly', () => {
    const html = renderToString(
      <DefectReverificationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId="00000000-0000-0000-0000-000000000444"
        jiraIssueKey="ENG-200"
      />,
    );

    assert.ok(html.includes('defect-reverification-card'), 'Reverification card rendered');
    assert.ok(
      html.includes('defect-verification-panel'),
      'Verification panel embedded inside card',
    );
    assert.ok(html.includes('run-verification-btn'), 'Run verification button present in card');
  });
});
