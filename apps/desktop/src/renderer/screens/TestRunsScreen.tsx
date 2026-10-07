import React from 'react';
import { useProject } from '../context/ProjectContext.js';
import { TestRunsListView } from '../features/test-runs/TestRunsListView.js';
import { EmptyState } from '../ui/index.js';

export function TestRunsScreen(): React.JSX.Element {
  const { selectedProjectId } = useProject();

  if (!selectedProjectId) {
    return (
      <EmptyState
        screenId="test-runs"
        title="No Project Selected"
        description="Select a project to inspect test execution queue state, live test runs, and diagnostic results."
      />
    );
  }

  return (
    <div className="test-runs-container">
      <header className="test-runs-header">
        <div className="test-runs-header-left">
          <div className="test-runs-title-row">
            <h1 className="test-runs-title">
              <span>Autonomous Web Test Runs</span>
            </h1>
            <span className="test-runs-badge">
              <span className="pulse-dot green" />
              Playwright Orchestrator
            </span>
          </div>
          <p className="test-runs-description">
            Deterministic execution queue, state machine monitoring, real-time cancellation controls, and deep diagnostic inspection.
          </p>
        </div>
      </header>

      <TestRunsListView projectId={selectedProjectId} />
    </div>
  );
}
