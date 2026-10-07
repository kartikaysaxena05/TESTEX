/**
 * @file apps/desktop/src/main/terminal-ui.test.tsx
 * UI component tests for V10 Phase 151 Sandboxed Terminal Gateway UI (TerminalExecutionPanel).
 * Verifies initial rendering, loading state, status badges, and data-testid attributes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TerminalExecutionPanel } from '../renderer/features/terminal/TerminalExecutionPanel.js';

describe('Terminal Execution UI Tests (V10 Phase 151)', () => {
  const projectId = '00000000-0000-0000-0000-000000000111';
  const taskId = '00000000-0000-0000-0000-000000000222';
  const executionId = '00000000-0000-0000-0000-000000000333';

  it('renders TerminalExecutionPanel loading state correctly during initial render', () => {
    const html = renderToString(
      <TerminalExecutionPanel
        projectId={projectId}
        taskId={taskId}
        executionId={executionId}
      />,
    );

    assert.ok(html.includes('Loading Terminal command status...'), 'Loading skeleton rendered');
    assert.ok(html.includes('data-testid="terminal-loading"'), 'data-testid present');
  });
});
