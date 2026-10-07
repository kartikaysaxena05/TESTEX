/**
 * @file apps/desktop/src/renderer/features/ai/AiRuntimeRecoveryCard.tsx
 * Desktop UI Component for V9 Phase 139: Performance, Cancellation & Runtime Recovery.
 *
 * Displays:
 * - Active AI Generation Requests: table showing request ID, provider, model, state, duration, streaming, and Stop/Cancel action.
 * - Runtime Performance Metrics: Latency, connection time, model startup, generation duration, cancellation latency, completion rate, retry count.
 * - Application Restart & Crash Recovery: Action button to inspect and recover orphaned in-flight requests into INTERRUPTED state.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AiActiveRequestDto,
  AiRuntimeMetricsDto,
  RecoverInterruptedRequestsResultDto,
} from '@ai-quality/contracts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  type BadgeVariant,
  Button,
  Alert,
} from '../../ui/index.js';

export interface AiRuntimeRecoveryCardProps {
  readonly projectId?: string | null;
}

export function AiRuntimeRecoveryCard({ projectId }: AiRuntimeRecoveryCardProps): React.JSX.Element {
  const [activeRequests, setActiveRequests] = useState<readonly AiActiveRequestDto[]>([]);
  const [metrics, setMetrics] = useState<AiRuntimeMetricsDto | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<RecoverInterruptedRequestsResultDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'danger' | 'info';
    message: string;
  } | null>(null);

  const fetchActiveAndMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.desktop?.aiLifecycle?.getActiveRequests) {
        const reqRes = await window.desktop.aiLifecycle.getActiveRequests(projectId ?? undefined);
        if (reqRes.ok) {
          setActiveRequests(reqRes.data);
        }
      }
      if (window.desktop?.aiLifecycle?.getMetrics) {
        const metricsRes = await window.desktop.aiLifecycle.getMetrics();
        if (metricsRes.ok) {
          setMetrics(metricsRes.data);
        }
      }
    } catch (err) {
      console.error('[AiRuntimeRecoveryCard] Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchActiveAndMetrics();
    // Poll active requests and metrics every 3 seconds for live responsiveness
    const timer = setInterval(() => {
      void fetchActiveAndMetrics();
    }, 3000);
    return () => clearInterval(timer);
  }, [fetchActiveAndMetrics]);

  const handleCancelRequest = async (requestId: string) => {
    setCancellingRequestId(requestId);
    setFeedback(null);
    try {
      if (window.desktop?.aiGeneration?.cancel) {
        const res = await window.desktop.aiGeneration.cancel({ requestId });
        if (res.ok) {
          setFeedback({
            type: 'info',
            message: `Generation request ${requestId} cancelled successfully.`,
          });
          await fetchActiveAndMetrics();
        } else {
          setFeedback({
            type: 'danger',
            message: !res.ok ? res.error.message : 'Failed to cancel generation request.',
          });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCancellingRequestId(null);
    }
  };

  const handleRecoverInterrupted = async () => {
    setIsRecovering(true);
    setFeedback(null);
    try {
      if (window.desktop?.aiLifecycle?.recoverInterrupted) {
        const res = await window.desktop.aiLifecycle.recoverInterrupted({
          projectId: projectId ?? undefined,
        });
        if (res.ok) {
          setRecoveryResult(res.data);
          setFeedback({
            type: 'success',
            message: `Successfully recovered ${res.data.recoveredCount} orphaned request(s).`,
          });
          await fetchActiveAndMetrics();
        } else {
          setFeedback({
            type: 'danger',
            message: !res.ok ? res.error.message : 'Failed to recover interrupted requests.',
          });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'danger',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRecovering(false);
    }
  };

  const getStateBadgeVariant = (state: string): BadgeVariant => {
    switch (state) {
      case 'RUNNING':
      case 'STREAMING':
        return 'info';
      case 'COMPLETED':
        return 'success';
      case 'QUEUED':
      case 'STARTING':
        return 'warning';
      case 'CANCELLED':
        return 'neutral';
      case 'INTERRUPTED':
      case 'RECOVERY_REQUIRED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <Card variant="default" data-testid="ai-runtime-recovery-card">
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <CardTitle level={2}>AI Runtime Performance & Lifecycle Monitor</CardTitle>
            <CardDescription>
              V9 Phase 139: Monitor active generation requests, cancellation control, stream latency metrics, and crash recovery.
            </CardDescription>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Badge variant="info" dot={true}>
              Active: {activeRequests.length}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchActiveAndMetrics()}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {feedback && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert variant={feedback.type}>
              {feedback.message}
            </Alert>
          </div>
        )}

        {/* Runtime Metrics Overview */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-subtle, #1e2029)', borderRadius: '6px' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
            Generation & Stream Metrics
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tracked Requests</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{metrics?.totalRequestsTracked ?? 0}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active Requests</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{metrics?.activeRequestsCount ?? 0}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Completion Rate</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {metrics ? `${(metrics.requestCompletionRate * 100).toFixed(1)}%` : '100%'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Generation Latency</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {metrics?.generationDurationMs ? `${metrics.generationDurationMs.toFixed(0)} ms` : 'N/A'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Startup Latency</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {metrics?.modelStartupLatencyMs ? `${metrics.modelStartupLatencyMs.toFixed(0)} ms` : 'N/A'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Retries</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {metrics?.retryCount ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Active Requests Table */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
            Active Requests ({activeRequests.length})
          </h4>
          {activeRequests.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No in-flight generation requests currently active.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Request ID</th>
                    <th style={{ padding: '0.5rem' }}>Provider & Model</th>
                    <th style={{ padding: '0.5rem' }}>State</th>
                    <th style={{ padding: '0.5rem' }}>Elapsed</th>
                    <th style={{ padding: '0.5rem' }}>Streaming</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRequests.map((req) => (
                    <tr key={req.requestId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                        {req.requestId.slice(0, 8)}...
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <div><strong>{req.providerId}</strong></div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{req.modelId}</div>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <Badge variant={getStateBadgeVariant(req.state)}>
                          {req.state}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {req.durationMs ? `${req.durationMs}ms` : 'calculating...'}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {req.isStreaming ? 'Yes' : 'No'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={cancellingRequestId === req.requestId}
                          onClick={() => void handleCancelRequest(req.requestId)}
                        >
                          {cancellingRequestId === req.requestId ? 'Cancelling...' : 'Stop Generation'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Application Restart & Crash Recovery */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600 }}>
                Crash & Restart Recovery
              </h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Inspects unfinalized database records from sudden application restarts or crashes, safely transitioning them to INTERRUPTED state without data loss or fabricated responses.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRecoverInterrupted()}
              disabled={isRecovering}
            >
              {isRecovering ? 'Recovering...' : 'Recover Interrupted Requests'}
            </Button>
          </div>

          {recoveryResult && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Found <strong>{recoveryResult.recoveredCount}</strong> unfinalized request(s) transitioned to INTERRUPTED.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
