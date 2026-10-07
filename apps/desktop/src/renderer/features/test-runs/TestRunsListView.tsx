/**
 * @file apps/desktop/src/renderer/features/test-runs/TestRunsListView.tsx
 * High-polish test run orchestration dashboard featuring real-time queue telemetry,
 * segmented status filters, search capability, execution records table, and detailed run inspector modal.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TestRunDto, TestRunStatus, TestRunQueueStateDto } from '@ai-quality/contracts';

interface TestRunsListViewProps {
  readonly projectId: string;
}

interface StatusTabConfig {
  readonly id: TestRunStatus | 'ALL';
  readonly label: string;
  readonly dotColor?: string;
}

const STATUS_TABS: readonly StatusTabConfig[] = [
  { id: 'ALL', label: 'All Runs' },
  { id: 'QUEUED', label: 'Queued', dotColor: '#fbbf24' },
  { id: 'PREPARING', label: 'Preparing', dotColor: '#60a5fa' },
  { id: 'RUNNING', label: 'Running', dotColor: '#818cf8' },
  { id: 'PASSED', label: 'Passed', dotColor: '#34d399' },
  { id: 'FAILED', label: 'Failed', dotColor: '#fb7185' },
  { id: 'BLOCKED', label: 'Blocked', dotColor: '#fb923c' },
  { id: 'AUTOMATION_ERROR', label: 'Error', dotColor: '#c084fc' },
  { id: 'CANCELLED', label: 'Cancelled', dotColor: '#94a3b8' },
];

export function TestRunsListView({ projectId }: TestRunsListViewProps): React.JSX.Element {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<readonly TestRunDto[]>([]);
  const [queueState, setQueueState] = useState<TestRunQueueStateDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<TestRunDto | null>(null);
  const [statusFilter, setStatusFilter] = useState<TestRunStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  const activeProjectIdRef = useRef<string>(projectId);
  useEffect(() => {
    activeProjectIdRef.current = projectId;
  }, [projectId]);

  const loadRunsAndQueue = useCallback(async () => {
    if (!window.desktop?.testRuns) {
      setIsLoading(false);
      return;
    }
    try {
      setError(null);
      const [runsRes, queueRes] = await Promise.all([
        window.desktop.testRuns.list({
          projectId,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          limit: 100,
        }),
        window.desktop.testRuns.getQueueState({ projectId }),
      ]);

      if (activeProjectIdRef.current !== projectId) {
        return;
      }

      if (runsRes.ok) {
        setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
      } else {
        setError(runsRes.error.message);
      }

      if (queueRes.ok) {
        setQueueState(queueRes.data);
      }
    } catch (err) {
      if (activeProjectIdRef.current === projectId) {
        setError(err instanceof Error ? err.message : 'Failed to load test execution state.');
      }
    } finally {
      if (activeProjectIdRef.current === projectId) {
        setIsLoading(false);
      }
    }
  }, [projectId, statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    loadRunsAndQueue();
  }, [loadRunsAndQueue]);

  const handleCancelRun = async (runId: string) => {
    if (!window.desktop?.testRuns) return;
    try {
      setCancellingRunId(runId);
      const res = await window.desktop.testRuns.cancel({
        projectId,
        runId,
        reason: 'User cancelled execution from dashboard.',
      });

      if (res.ok) {
        await loadRunsAndQueue();
        if (selectedRun?.id === runId) {
          setSelectedRun(res.data);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel test run.');
    } finally {
      setCancellingRunId(null);
    }
  };

  const isTerminal = (status: TestRunStatus) => {
    return (
      status === 'PASSED' ||
      status === 'FAILED' ||
      status === 'BLOCKED' ||
      status === 'AUTOMATION_ERROR' ||
      status === 'CANCELLED'
    );
  };

  const renderStatusPill = (status: TestRunStatus) => {
    switch (status) {
      case 'QUEUED':
        return <span className="status-pill queued">Queued</span>;
      case 'PREPARING':
        return <span className="status-pill preparing">Preparing</span>;
      case 'RUNNING':
        return (
          <span className="status-pill running">
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            Running
          </span>
        );
      case 'PASSED':
        return <span className="status-pill passed">Passed</span>;
      case 'FAILED':
        return <span className="status-pill failed">Failed</span>;
      case 'BLOCKED':
        return <span className="status-pill blocked">Blocked</span>;
      case 'AUTOMATION_ERROR':
        return <span className="status-pill automation_error">Automation Error</span>;
      case 'CANCELLED':
        return <span className="status-pill cancelled">Cancelled</span>;
    }
  };

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = { ALL: runs.length };
    for (const r of runs) {
      map[r.status] = (map[r.status] || 0) + 1;
    }
    return map;
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;
    const q = searchQuery.toLowerCase().trim();
    return runs.filter(
      r =>
        r.testCaseTitle.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.browserEngine.toLowerCase().includes(q) ||
        (r.environmentName && r.environmentName.toLowerCase().includes(q)) ||
        (r.terminalReason && r.terminalReason.toLowerCase().includes(q))
    );
  }, [runs, searchQuery]);

  const capacityPct = useMemo(() => {
    if (!queueState) return 0;
    const totalActive =
      queueState.queuedCount + queueState.preparingCount + queueState.runningCount;
    return Math.min(100, Math.round((totalActive / Math.max(1, queueState.maxQueueDepth)) * 100));
  }, [queueState]);

  return (
    <div className="test-runs-container">
      {/* 1. Queue State Metric Cards */}
      {queueState && (
        <div className="test-runs-queue-grid">
          {/* Card 1: Queued Runs */}
          <div className="queue-metric-card queued">
            <div className="metric-header">
              <span className="metric-label">Queued Runs</span>
              <div className="metric-icon-wrap">⏱</div>
            </div>
            <div className="metric-value-row">
              <span className="metric-value">{queueState.queuedCount}</span>
              <span className="metric-unit">awaiting slot</span>
            </div>
            <span className="metric-subtitle">Prioritized in FIFO dispatch queue</span>
          </div>

          {/* Card 2: Active / Running */}
          <div className="queue-metric-card active">
            <div className="metric-header">
              <span className="metric-label">Active Workers</span>
              <div className="metric-icon-wrap">
                <span className="pulse-dot" />
              </div>
            </div>
            <div className="metric-value-row">
              <span className="metric-value">
                {queueState.preparingCount + queueState.runningCount}
              </span>
              <span className="metric-unit">/ {queueState.maxConcurrentRuns} max</span>
            </div>
            <span className="metric-subtitle">
              {queueState.runningCount} executing · {queueState.preparingCount} preparing
            </span>
          </div>

          {/* Card 3: Queue Capacity */}
          <div className="queue-metric-card capacity">
            <div className="metric-header">
              <span className="metric-label">Queue Capacity</span>
              <div className="metric-icon-wrap">📊</div>
            </div>
            <div className="metric-value-row">
              <span className="metric-value">
                {queueState.queuedCount + queueState.preparingCount + queueState.runningCount}
              </span>
              <span className="metric-unit">/ {queueState.maxQueueDepth} slots</span>
            </div>
            <div className="capacity-progress-track">
              <div
                className={`capacity-progress-fill ${capacityPct > 80 ? 'high' : ''}`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
          </div>

          {/* Card 4: Dispatcher State */}
          <div
            className={`queue-metric-card ${queueState.isQueueFull ? 'status-full' : 'status'}`}
          >
            <div className="metric-header">
              <span className="metric-label">Engine State</span>
              <div className="metric-icon-wrap">{queueState.isQueueFull ? '⚠️' : '⚡'}</div>
            </div>
            <div className="metric-value-row">
              <span className="metric-value" style={{ fontSize: '1.25rem', marginTop: '0.15rem' }}>
                {queueState.isQueueFull ? 'QUEUE FULL' : 'READY / ACTIVE'}
              </span>
            </div>
            <span className="metric-subtitle">
              {queueState.isQueueFull
                ? 'Backpressure: concurrency limits reached'
                : 'Worker pool operational'}
            </span>
          </div>
        </div>
      )}

      {/* 2. Filter Tabs & Search Bar */}
      <div className="test-runs-toolbar">
        <div className="toolbar-top-row">
          <div className="status-tabs-list" role="tablist">
            {STATUS_TABS.map(tab => {
              const count = statusCounts[tab.id];
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`status-tab-btn ${isActive ? 'active' : ''}`}
                >
                  {tab.dotColor && (
                    <span
                      className="tab-indicator-dot"
                      style={{ backgroundColor: tab.dotColor }}
                    />
                  )}
                  <span>{tab.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="tab-count-chip">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={loadRunsAndQueue}
            disabled={isLoading}
            className="btn btn-secondary btn-sm"
            title="Refresh runs and queue telemetry"
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
              style={{
                animation: isLoading ? 'pulse-glow 1s infinite' : 'none',
                transform: isLoading ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.4s ease',
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="toolbar-search-row">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by test title, run ID, browser, or environment..."
              className="test-runs-search-input"
            />
          </div>

          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.72rem' }}
            >
              Clear Search
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredRuns.length}</strong>{' '}
            of {runs.length} test run{runs.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="error-banner">
          <span className="error-banner-title">Error Loading Test Runs</span>
          <span className="error-banner-msg">{error}</span>
        </div>
      )}

      {/* 3. Empty States & Content Table */}
      {runs.length === 0 && !isLoading ? (
        <div className="test-runs-empty-card">
          <div className="empty-icon-halo">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <div className="empty-text-wrap">
            <h3 className="empty-title">
              {statusFilter === 'ALL'
                ? 'No Autonomous Test Runs Recorded'
                : `No Test Runs in "${statusFilter}" State`}
            </h3>
            <p className="empty-desc">
              {statusFilter === 'ALL'
                ? 'Select canonical test cases to launch deterministic Playwright executions, track real-time queue states, and inspect execution telemetry.'
                : `No test runs currently match the "${statusFilter}" status filter. Trigger an execution from Canonical Test Cases or switch the filter.`}
            </p>
          </div>

          <div className="empty-actions-row">
            {statusFilter !== 'ALL' ? (
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => setStatusFilter('ALL')}
              >
                Reset Filter to All Runs
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => navigate('/test-cases')}
              >
                <span>Launch from Canonical Test Cases</span>
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
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          {statusFilter === 'ALL' && (
            <div className="empty-features-grid">
              <div className="empty-feature-item">
                <span className="empty-feature-title">Deterministic Queue</span>
                <span className="empty-feature-desc">FIFO ordering with strict concurrency</span>
              </div>
              <div className="empty-feature-item">
                <span className="empty-feature-title">Isolated Contexts</span>
                <span className="empty-feature-desc">Zero state leakage between runs</span>
              </div>
              <div className="empty-feature-item">
                <span className="empty-feature-title">Real-Time Cancellation</span>
                <span className="empty-feature-desc">Immediate cleanup of browser workers</span>
              </div>
            </div>
          )}
        </div>
      ) : filteredRuns.length === 0 && !isLoading ? (
        <div className="test-runs-empty-card" style={{ padding: '2.5rem 1.5rem' }}>
          <div className="empty-text-wrap">
            <h3 className="empty-title">No Matching Test Runs</h3>
            <p className="empty-desc">
              No test executions match the search criteria &ldquo;{searchQuery}&rdquo;.
            </p>
          </div>
          <div className="empty-actions-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
            >
              Clear Search Query
            </button>
          </div>
        </div>
      ) : (
        <div className="test-runs-table-wrap">
          <table className="runs-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>Run ID</th>
                <th>Test Case</th>
                <th>Environment</th>
                <th>Browser</th>
                <th>Status</th>
                <th>Queued At</th>
                <th>Duration</th>
                <th style={{ textAlign: 'right', width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map(run => (
                <tr
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  title="Click to view full execution diagnostics"
                >
                  <td>
                    <span className="run-id-badge">{run.id.slice(0, 8)}</span>
                  </td>
                  <td>
                    <div className="test-case-cell">
                      <span className="test-case-title">{run.testCaseTitle}</span>
                      <div className="test-case-meta">
                        <span>v{run.testCaseVersionNumber}</span>
                        <span>·</span>
                        <span title={run.planFingerprint}>
                          FP: {run.planFingerprint.slice(0, 7)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {run.environmentName || 'Default'}
                    </span>
                  </td>
                  <td>
                    <span className="engine-badge">
                      {run.browserEngine}
                      {run.headless ? '' : ' (headed)'}
                    </span>
                  </td>
                  <td>{renderStatusPill(run.status)}</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(run.queuedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </td>
                  <td>
                    <span className="duration-cell">
                      {run.executionDurationMs !== null && run.executionDurationMs !== undefined
                        ? run.executionDurationMs > 1000
                          ? `${(run.executionDurationMs / 1000).toFixed(2)}s`
                          : `${run.executionDurationMs}ms`
                        : isTerminal(run.status)
                          ? '—'
                          : 'Executing...'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedRun(run)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0 0.5rem' }}
                      >
                        Inspect
                      </button>
                      {!isTerminal(run.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancelRun(run.id)}
                          disabled={cancellingRunId === run.id}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.72rem', padding: '0 0.5rem' }}
                        >
                          {cancellingRunId === run.id ? 'Aborting...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Run Inspection Modal */}
      {selectedRun && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedRun(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-title-row">
                  <h2 className="modal-title">{selectedRun.testCaseTitle}</h2>
                  {renderStatusPill(selectedRun.status)}
                </div>
                <span className="modal-subtitle">
                  Run ID: {selectedRun.id} (Version {selectedRun.testCaseVersionNumber})
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedRun(null)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-kv-grid">
                <div className="kv-item">
                  <span className="kv-label">Plan Fingerprint</span>
                  <span className="kv-val mono">{selectedRun.planFingerprint}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Environment</span>
                  <span className="kv-val">{selectedRun.environmentName || 'Default'}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Browser / Mode</span>
                  <span className="kv-val uppercase">
                    {selectedRun.browserEngine} ({selectedRun.headless ? 'Headless' : 'Headed'})
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Execution Duration</span>
                  <span className="kv-val mono">
                    {selectedRun.executionDurationMs !== null &&
                    selectedRun.executionDurationMs !== undefined
                      ? `${selectedRun.executionDurationMs} ms`
                      : 'In Progress'}
                  </span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Queued At</span>
                  <span className="kv-val">{new Date(selectedRun.queuedAt).toLocaleString()}</span>
                </div>
                <div className="kv-item">
                  <span className="kv-label">Started At</span>
                  <span className="kv-val">
                    {selectedRun.startedAt
                      ? new Date(selectedRun.startedAt).toLocaleString()
                      : 'Not yet started'}
                  </span>
                </div>
              </div>

              {selectedRun.terminalReason && (
                <div className="kv-item" style={{ background: 'var(--bg-app)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <span className="kv-label">Terminal Reason</span>
                  <span className="kv-val" style={{ marginTop: '0.2rem' }}>
                    {selectedRun.terminalReason}
                  </span>
                </div>
              )}

              {selectedRun.errorMessage && (
                <div className="error-banner">
                  <span className="error-banner-title">Failure Diagnostic</span>
                  <div className="error-banner-msg">{selectedRun.errorMessage}</div>
                </div>
              )}

              {selectedRun.diagnosticsJson && selectedRun.diagnosticsJson.length > 0 && (
                <div className="diagnostics-block">
                  <span className="diagnostics-title">
                    Execution Trace & Diagnostics ({selectedRun.diagnosticsJson.length} entries)
                  </span>
                  <pre className="diagnostics-pre">
                    {JSON.stringify(selectedRun.diagnosticsJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {!isTerminal(selectedRun.status) && (
                <button
                  type="button"
                  onClick={() => handleCancelRun(selectedRun.id)}
                  disabled={cancellingRunId === selectedRun.id}
                  className="btn btn-danger btn-md"
                >
                  {cancellingRunId === selectedRun.id ? 'Cancelling...' : 'Cancel Execution'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                className="btn btn-secondary btn-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
