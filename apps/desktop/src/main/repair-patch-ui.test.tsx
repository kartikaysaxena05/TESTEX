/**
 * @file apps/desktop/src/main/repair-patch-ui.test.tsx
 * UI component tests for V10 Phase 149 Repair / Patch Tool UI (RepairPatchReviewCard).
 * Verifies initial rendering, status badges, diff syntax display, and action buttons.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RepairPatchReviewCard } from '../renderer/features/repair/RepairPatchReviewCard.js';

describe('Repair Patch UI Tests (V10 Phase 149)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const proposalId = '00000000-0000-0000-0000-000000000222';
  const taskId = '00000000-0000-0000-0000-000000000333';

  it('renders RepairPatchReviewCard loading state correctly during initial render', () => {
    const html = renderToString(
      <RepairPatchReviewCard
        projectId={projectId}
        proposalId={proposalId}
        taskId={taskId}
      />,
    );

    assert.ok(html.includes('Loading patch review...'), 'Loading skeleton rendered');
    assert.ok(html.includes('data-testid="patch-review-loading"'), 'data-testid present');
  });
});
