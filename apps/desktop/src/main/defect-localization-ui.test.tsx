/**
 * @file apps/desktop/src/main/defect-localization-ui.test.tsx
 * UI component tests for Repository-Aware Defect Localization (V7 Phase 100).
 * Verifies DefectLocalizationCard rendering, localize controls, boundary notices,
 * and seamless embedding inside DefectReverificationCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DefectLocalizationCard } from '../renderer/features/failures/DefectLocalizationCard.js';
import { DefectReverificationCard } from '../renderer/features/failures/DefectReverificationCard.js';

describe('Repository Defect Localization UI Tests (Phase 100)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';

  it('renders DefectLocalizationCard with localize button, empty state, and Phase 100 boundary notice', () => {
    const html = renderToString(
      <DefectLocalizationCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('Repository Defect Localization'), 'Title rendered');
    assert.ok(html.includes('Phase 100'), 'Phase 100 tag rendered');
    assert.ok(html.includes('Localize Defect in Repository'), 'Localize button rendered');
    assert.ok(
      html.includes('No repository defect localization recorded yet'),
      'Empty state rendered',
    );
  });

  it('embeds DefectLocalizationCard inside DefectReverificationCard seamlessly', () => {
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
    assert.ok(html.includes('quick-fix-card'), 'Quick-fix card embedded');
    assert.ok(html.includes('Repository Defect Localization'), 'Defect localization card embedded');
    assert.ok(html.includes('Localize Defect in Repository'), 'Localize defect button present');
  });
});
