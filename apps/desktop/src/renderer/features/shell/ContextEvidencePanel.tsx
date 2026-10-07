/**
 * @file apps/desktop/src/renderer/features/shell/ContextEvidencePanel.tsx
 * Right-side Context and Evidence Panel for the Codex-style product shell.
 * Consumes existing V1–V7 run, evidence, failure, test, and source metadata.
 */

import React from 'react';
import { useWorkspace, type ContextTab } from '../../context/WorkspaceContext.js';
import { Badge } from '../../ui/index.js';
import { NoActiveContextEmptyState } from './ShellEmptyStates.js';

export function ContextEvidencePanel(): React.JSX.Element {
  const {
    isContextPanelCollapsed,
    toggleContextPanel,
    activeContextTab,
    setActiveContextTab,
    contextData,
  } = useWorkspace();

  if (isContextPanelCollapsed) {
    return (
      <aside
        className="codex-context-panel collapsed"
        data-testid="codex-context-panel-collapsed"
        aria-label="Context Panel Collapsed"
      >
        <button
          type="button"
          className="codex-context-expand-btn"
          onClick={toggleContextPanel}
          title="Expand Context Panel"
          aria-label="Expand Context Panel"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="11 19 4 12 11 5" />
            <polyline points="18 19 11 12 18 5" />
          </svg>
        </button>
      </aside>
    );
  }

  const tabs: Array<{ id: ContextTab; label: string }> = [
    { id: 'run', label: 'Run' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'test', label: 'Test' },
    { id: 'failure', label: 'Failure' },
    { id: 'requirement', label: 'Requirement' },
    { id: 'source', label: 'Source' },
  ];

  return (
    <aside
      className="codex-context-panel"
      data-testid="codex-context-panel"
      aria-label="Context and Evidence Panel"
    >
      <div className="codex-context-header">
        <div className="codex-context-tabs" role="tablist" aria-label="Context Views">
          {tabs.map(t => {
            const isSelected = activeContextTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`context-tab-${t.id}`}
                aria-selected={isSelected}
                aria-controls={`context-panel-${t.id}`}
                className={`codex-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setActiveContextTab(t.id)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="codex-icon-btn close-context-btn"
          onClick={toggleContextPanel}
          title="Collapse Panel"
          aria-label="Collapse Panel"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      </div>

      <div
        className="codex-context-body"
        role="tabpanel"
        id={`context-panel-${activeContextTab}`}
        aria-labelledby={`context-tab-${activeContextTab}`}
      >
        {activeContextTab === 'run' && (
          <div className="codex-tab-content" data-testid="context-tab-run-content">
            {contextData.currentRun ? (
              <div className="context-run-details">
                <div className="context-detail-item">
                  <span className="context-label">Run ID:</span>
                  <span className="context-value font-mono">{contextData.currentRun.runId}</span>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Status:</span>
                  <Badge
                    variant={contextData.currentRun.status === 'COMPLETED' ? 'success' : 'warning'}
                  >
                    {contextData.currentRun.status}
                  </Badge>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Tests Passed:</span>
                  <span className="context-value">
                    {contextData.currentRun.passedTests} / {contextData.currentRun.totalTests}
                  </span>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Duration:</span>
                  <span className="context-value">{contextData.currentRun.durationMs}ms</span>
                </div>
              </div>
            ) : (
              <NoActiveContextEmptyState />
            )}
          </div>
        )}

        {activeContextTab === 'evidence' && (
          <div className="codex-tab-content" data-testid="context-tab-evidence-content">
            {contextData.evidence ? (
              <div className="context-evidence-grid">
                <div className="evidence-badge-item">
                  <span className="evidence-count">{contextData.evidence.screenshotsCount}</span>
                  <span className="evidence-label">Screenshots</span>
                </div>
                <div className="evidence-badge-item">
                  <span className="evidence-count">{contextData.evidence.consoleLogsCount}</span>
                  <span className="evidence-label">Console Logs</span>
                </div>
                <div className="evidence-badge-item">
                  <span className="evidence-count">{contextData.evidence.networkLogsCount}</span>
                  <span className="evidence-label">Network Calls</span>
                </div>
                <div className="evidence-badge-item">
                  <span className="evidence-count">
                    {contextData.evidence.hasTrace ? 'Yes' : 'No'}
                  </span>
                  <span className="evidence-label">Trace Available</span>
                </div>
              </div>
            ) : (
              <NoActiveContextEmptyState />
            )}
          </div>
        )}

        {activeContextTab === 'test' && (
          <div className="codex-tab-content" data-testid="context-tab-test-content">
            {contextData.testDetails ? (
              <div className="context-test-details">
                <div className="context-detail-item">
                  <span className="context-label">Test Key:</span>
                  <span className="context-value font-mono">{contextData.testDetails.testKey}</span>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Title:</span>
                  <span className="context-value">{contextData.testDetails.title}</span>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Priority:</span>
                  <Badge variant="neutral">{contextData.testDetails.priority}</Badge>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Steps Count:</span>
                  <span className="context-value">{contextData.testDetails.stepCount}</span>
                </div>
              </div>
            ) : (
              <NoActiveContextEmptyState />
            )}
          </div>
        )}

        {activeContextTab === 'failure' && (
          <div className="codex-tab-content" data-testid="context-tab-failure-content">
            {contextData.failureDetails ? (
              <div className="context-failure-details">
                <div className="context-detail-item">
                  <span className="context-label">Failure Key:</span>
                  <span className="context-value font-mono">
                    {contextData.failureDetails.failureKey}
                  </span>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Domain:</span>
                  <Badge variant="danger">{contextData.failureDetails.domain}</Badge>
                </div>
                <div className="context-detail-item">
                  <span className="context-label">Root Cause:</span>
                  <span className="context-value">{contextData.failureDetails.rootCause}</span>
                </div>
                {contextData.failureDetails.patchStatus && (
                  <div className="context-detail-item">
                    <span className="context-label">Patch:</span>
                    <Badge variant="success">{contextData.failureDetails.patchStatus}</Badge>
                  </div>
                )}
              </div>
            ) : (
              <NoActiveContextEmptyState />
            )}
          </div>
        )}

        {activeContextTab === 'requirement' && (
          <div className="codex-tab-content" data-testid="context-tab-requirement-content">
            <NoActiveContextEmptyState />
          </div>
        )}

        {activeContextTab === 'source' && (
          <div className="codex-tab-content" data-testid="context-tab-source-content">
            {contextData.sourceContext ? (
              <div className="context-source-details">
                <div className="context-detail-item">
                  <span className="context-label">File:</span>
                  <span className="context-value font-mono">
                    {contextData.sourceContext.filePath}
                  </span>
                </div>
                {contextData.sourceContext.symbol && (
                  <div className="context-detail-item">
                    <span className="context-label">Symbol:</span>
                    <span className="context-value font-mono">
                      {contextData.sourceContext.symbol}
                    </span>
                  </div>
                )}
                {contextData.sourceContext.line && (
                  <div className="context-detail-item">
                    <span className="context-label">Line:</span>
                    <span className="context-value font-mono">
                      {contextData.sourceContext.line}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <NoActiveContextEmptyState />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
