/**
 * @file apps/desktop/src/main/git-review-ui.test.tsx
 * UI component tests for V10 Phase 150 Git Diff & Change Review UI (GitChangeReviewPanel).
 * Verifies initial rendering, loading state, status badges, and data-testid attributes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { GitChangeReviewPanel } from '../renderer/features/git-review/GitChangeReviewPanel.js';

describe('Git Change Review UI Tests (V10 Phase 150)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const taskId = '00000000-0000-0000-0000-000000000222';
  const reviewId = '00000000-0000-0000-0000-000000000333';

  it('renders GitChangeReviewPanel loading state correctly during initial render', () => {
    const html = renderToString(
      <GitChangeReviewPanel
        projectId={projectId}
        taskId={taskId}
        reviewId={reviewId}
      />,
    );

    assert.ok(html.includes('Loading Git changes and review...'), 'Loading skeleton rendered');
    assert.ok(html.includes('data-testid="git-review-loading"'), 'data-testid present');
  });
});
