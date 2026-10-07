/**
 * @file apps/desktop/src/main/patch-proposal-ui.test.tsx
 * UI component tests for Limited AI Patch Generation (V7 Phase 101).
 * Verifies PatchProposalCard rendering, generate controls, boundary notices,
 * and seamless embedding inside DefectReverificationCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PatchProposalCard } from '../renderer/features/failures/PatchProposalCard.js';
import { DefectReverificationCard } from '../renderer/features/failures/DefectReverificationCard.js';

describe('Limited AI Patch Proposal UI Tests (Phase 101)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';

  it('renders PatchProposalCard with generate button, empty state, and Phase 101 boundary notice', () => {
    const html = renderToString(
      <PatchProposalCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('Limited AI Patch Proposal'), 'Title rendered');
    assert.ok(html.includes('Phase 101'), 'Phase 101 tag rendered');
    assert.ok(html.includes('Generate Patch Proposal'), 'Generate button rendered');
    assert.ok(html.includes('Proposal Only Boundary'), 'Boundary notice rendered');
    assert.ok(
      html.includes(
        'Authoritative source files, Git branches, and working tree remain completely unchanged',
      ),
      'Read-only guarantee rendered',
    );
    assert.ok(
      html.includes('No patch proposal generated yet for this defect'),
      'Empty state rendered',
    );
  });

  it('embeds PatchProposalCard inside DefectReverificationCard seamlessly', () => {
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
    assert.ok(html.includes('Limited AI Patch Proposal'), 'Patch proposal card embedded');
    assert.ok(html.includes('Generate Patch Proposal'), 'Generate patch proposal button present');
  });
});
