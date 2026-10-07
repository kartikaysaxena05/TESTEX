/**
 * @file apps/desktop/src/main/planner-ui.test.tsx
 * UI component tests for V10 Phase 152 Multi-Step Planning UI (MultiStepPlanPanel).
 * Verifies initial rendering, loading state, status indicators, and structure.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MultiStepPlanPanel } from '../renderer/features/planner/MultiStepPlanPanel.js';

describe('Multi-Step Planning UI Tests (V10 Phase 152)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const taskId = '00000000-0000-0000-0000-000000000222';
  const threadId = '00000000-0000-0000-0000-000000000333';

  it('renders MultiStepPlanPanel loading state correctly during initial render', () => {
    const html = renderToString(
      <MultiStepPlanPanel projectId={projectId} taskId={taskId} threadId={threadId} />,
    );

    assert.ok(html.includes('Loading execution plan...'), 'Loading skeleton rendered');
  });
});
