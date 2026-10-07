/**
 * @file apps/desktop/src/main/quick-fix-ui.test.tsx
 * UI component tests for AI Quick-Fix Eligibility & Safety Analysis (V7 Phase 99).
 * Verifies QuickFixEligibilityCard rendering, empty state, evaluate controls, boundary disclaimers,
 * and seamless embedding inside DefectReverificationCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QuickFixEligibilityCard } from '../renderer/features/failures/QuickFixEligibilityCard.js';
import { DefectReverificationCard } from '../renderer/features/failures/DefectReverificationCard.js';

describe('AI Quick-Fix Eligibility & Safety UI Tests (Phase 99)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';

  it('renders QuickFixEligibilityCard with evaluate button, empty state, and strict boundary notice', () => {
    const html = renderToString(
      <QuickFixEligibilityCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('quick-fix-card'), 'Card container rendered');
    assert.ok(html.includes('AI Quick-Fix Eligibility &amp; Safety Analysis'), 'Title rendered');
    assert.ok(html.includes('evaluate-quick-fix-btn'), 'Evaluate button rendered');
    assert.ok(html.includes('phase99-boundary-notice'), 'Phase 99 boundary notice rendered');
    assert.ok(html.includes('Strict Boundary:'), 'Strict boundary text rendered');
    assert.ok(html.includes('quick-fix-empty-state'), 'Initial empty state rendered');
  });

  it('embeds QuickFixEligibilityCard inside DefectReverificationCard seamlessly', () => {
    const html = renderToString(
      <DefectReverificationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId="00000000-0000-0000-0000-000000000444"
        jiraIssueKey="ENG-200"
      />,
    );

    assert.ok(html.includes('defect-reverification-card'), 'Reverification card rendered');
    assert.ok(html.includes('defect-verification-panel'), 'Verification panel rendered');
    assert.ok(
      html.includes('quick-fix-card'),
      'Quick-fix card embedded seamlessly inside reverification card',
    );
    assert.ok(html.includes('evaluate-quick-fix-btn'), 'Evaluate quick-fix button present');
  });
});
