/**
 * @file apps/desktop/src/main/patch-approval-ui.test.tsx
 * UI component tests for Human Approval, Reject & Apply Workflow (V7 Phase 104).
 * Verifies PatchApprovalCard rendering, safety invariant notice,
 * and integration within PatchProposalCard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PatchApprovalCard } from '../renderer/features/failures/PatchApprovalCard.js';
import { PatchProposalCard } from '../renderer/features/failures/PatchProposalCard.js';

describe('Patch Approval UI Tests (Phase 104)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const failureCaseId = '00000000-0000-0000-0000-000000000222';
  const patchProposalId = '00000000-0000-0000-0000-000000000333';

  it('renders PatchApprovalCard with initial waiting state', () => {
    const html = renderToString(
      <PatchApprovalCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        patchProposalId={patchProposalId}
      />,
    );

    assert.ok(
      html.includes('Phase 104 — Human Approval, Reject &amp; Apply Workflow') ||
        html.includes('Phase 104 — Human Approval, Reject & Apply Workflow'),
      'Phase 104 header rendered',
    );
    assert.ok(
      html.includes('Awaiting Validation (Phase 103)'),
      'Awaiting validation badge rendered',
    );
    assert.ok(
      html.includes('mandatory human decision gate will be unlocked here for review'),
      'Safety gate explanation rendered',
    );
  });

  it('renders PatchProposalCard with embedded PatchApprovalCard', () => {
    const html = renderToString(
      <PatchProposalCard projectId={projectId} failureCaseId={failureCaseId} />,
    );

    assert.ok(html.includes('Limited AI Patch Proposal'), 'Patch proposal rendered');
    assert.ok(html.includes('Generate Patch Proposal'), 'Generate button present');
  });
});
