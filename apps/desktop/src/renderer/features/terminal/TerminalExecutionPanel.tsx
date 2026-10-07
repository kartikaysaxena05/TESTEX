/**
 * @file apps/desktop/src/renderer/features/terminal/TerminalExecutionPanel.tsx
 * Sandboxed Terminal Command execution & approval monitor for V10 Phase 151.
 *
 * Displays:
 * - Executed / proposed terminal command
 * - Working directory within the project
 * - Real-time execution status (QUEUED, RUNNING, COMPLETED, FAILED, WAITING_FOR_APPROVAL, TIMED_OUT, CANCELLED, BLOCKED)
 * - Exit code and duration
 * - Sanitized stdout and stderr output
 * - Secret redaction indicators
 * - Human Approve / Reject gate buttons when WAITING_FOR_APPROVAL
 * - Cancel execution button when RUNNING
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  AgentTerminalExecutionDto,
  TerminalExecutionStatus,
} from '@ai-quality/contracts';

export interface TerminalExecutionPanelProps {
  readonly projectId: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly onExecutionUpdated?: (execution: AgentTerminalExecutionDto) => void;
}

export const TerminalExecutionPanel: React.FC<TerminalExecutionPanelProps> = ({
  projectId,
  taskId,
  executionId: initialExecutionId,
  onExecutionUpdated,
}) => {
  const [execution, setExecution] = useState<AgentTerminalExecutionDto | null>(null);
  const [executions, setExecutions] = useState<readonly AgentTerminalExecutionDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'STDOUT' | 'STDERR' | 'METADATA'>('STDOUT');

  const loadData = useCallback(async () => {
    const bridge = window.desktop?.terminal;
    if (!bridge) {
      setError('Terminal desktop bridge unavailable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (initialExecutionId) {
        const res = await bridge.getExecution({ projectId, executionId: initialExecutionId });
        if (res.ok && res.data) {
          setExecution(res.data);
        }
      } else {
        const listRes = await bridge.listExecutions({ projectId, taskId, limit: 10 });
        if (listRes.ok) {
          setExecutions(listRes.data);
          if (listRes.data.length > 0) {
            setExecution(listRes.data[0]!);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, taskId, initialExecutionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleApprove = async () => {
    const bridge = window.desktop?.terminal;
    if (!bridge || !execution) return;

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.approve({
        projectId,
        executionId: execution.id,
        reason: 'Approved via Terminal Execution Panel',
      });

      if (res.ok) {
        setExecution(res.data);
        setActionMessage('Command approved and executed.');
        onExecutionUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    const bridge = window.desktop?.terminal;
    if (!bridge || !execution) return;

    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejecting the command.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setActionMessage(null);

    try {
      const res = await bridge.reject({
        projectId,
        executionId: execution.id,
        reason: rejectReason.trim(),
      });

      if (res.ok) {
        setExecution(res.data);
        setShowRejectModal(false);
        setRejectReason('');
        setActionMessage('Command execution rejected.');
        onExecutionUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    const bridge = window.desktop?.terminal;
    if (!bridge || !execution) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await bridge.cancel({
        projectId,
        executionId: execution.id,
        reason: 'Cancelled by operator.',
      });

      if (res.ok) {
        setExecution(res.data);
        setActionMessage('Execution cancelled.');
        onExecutionUpdated?.(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: TerminalExecutionStatus) => {
    const statusMap: Record<TerminalExecutionStatus, { bg: string; text: string; label: string }> = {
      QUEUED: { bg: 'bg-zinc-800 text-zinc-300 border-zinc-700', text: 'text-zinc-400', label: 'QUEUED' },
      WAITING_FOR_APPROVAL: {
        bg: 'bg-amber-950/40 text-amber-300 border-amber-800/60',
        text: 'text-amber-400',
        label: 'REQUIRES APPROVAL',
      },
      RUNNING: { bg: 'bg-sky-950/40 text-sky-300 border-sky-800/60 animate-pulse', text: 'text-sky-400', label: 'RUNNING' },
      COMPLETED: {
        bg: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60',
        text: 'text-emerald-400',
        label: 'COMPLETED',
      },
      FAILED: { bg: 'bg-rose-950/40 text-rose-300 border-rose-800/60', text: 'text-rose-400', label: 'FAILED' },
      TIMED_OUT: { bg: 'bg-orange-950/40 text-orange-300 border-orange-800/60', text: 'text-orange-400', label: 'TIMED OUT' },
      CANCELLED: { bg: 'bg-zinc-800 text-zinc-400 border-zinc-700', text: 'text-zinc-400', label: 'CANCELLED' },
      BLOCKED: { bg: 'bg-red-950/60 text-red-300 border-red-800', text: 'text-red-400', label: 'BLOCKED' },
    };

    const style = statusMap[status] ?? {
      bg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      text: 'text-zinc-400',
      label: status,
    };

    return (
      <span
        data-testid="terminal-status-badge"
        className={`px-2.5 py-0.5 text-xs font-mono font-medium rounded-full border ${style.bg}`}
      >
        {style.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div
        className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm animate-pulse"
        data-testid="terminal-loading"
      >
        Loading Terminal command status...
      </div>
    );
  }

  if (!execution) {
    return (
      <div
        className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm"
        data-testid="terminal-empty"
      >
        No active terminal executions recorded.
      </div>
    );
  }

  return (
    <div
      data-testid="terminal-execution-panel"
      className="p-5 rounded-xl bg-zinc-900/95 border border-zinc-800 font-sans text-zinc-100 flex flex-col gap-4 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold tracking-wide flex items-center gap-2">
            <span>Terminal Command Gateway</span>
            <span className="text-xs text-zinc-400 font-mono">({execution.id.slice(0, 8)})</span>
          </h3>
          {getStatusBadge(execution.status)}
        </div>

        <div className="flex items-center gap-2">
          {execution.status === 'WAITING_FOR_APPROVAL' && (
            <>
              <button
                type="button"
                data-testid="terminal-approve-button"
                disabled={isSubmitting}
                onClick={handleApprove}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Approve &amp; Run
              </button>
              <button
                type="button"
                data-testid="terminal-reject-button"
                disabled={isSubmitting}
                onClick={() => setShowRejectModal(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Reject
              </button>
            </>
          )}

          {execution.status === 'RUNNING' && (
            <button
              type="button"
              data-testid="terminal-cancel-button"
              disabled={isSubmitting}
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors"
            >
              Cancel Process
            </button>
          )}
        </div>
      </div>

      {/* Notification banner */}
      {actionMessage && (
        <div className="p-3 text-xs rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
          {actionMessage}
        </div>
      )}
      {error && (
        <div className="p-3 text-xs rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300">
          {error}
        </div>
      )}

      {/* Command Details */}
      <div className="flex flex-col gap-2 bg-black/40 p-3 rounded-lg border border-zinc-800 font-mono text-xs">
        <div className="flex items-center justify-between text-zinc-400 pb-1 border-b border-zinc-800/50">
          <span>
            cwd: <span className="text-zinc-200">{execution.workingDirectory}</span>
          </span>
          <div className="flex items-center gap-3">
            {execution.durationMs !== null && execution.durationMs !== undefined && (
              <span>duration: {execution.durationMs}ms</span>
            )}
            {execution.exitCode !== null && execution.exitCode !== undefined && (
              <span>
                exitCode:{' '}
                <span className={execution.exitCode === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {execution.exitCode}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="pt-1 flex items-center gap-2">
          <span className="text-emerald-400 font-bold">$</span>
          <span className="text-zinc-100 font-medium selection:bg-zinc-700">{execution.command}</span>
        </div>
      </div>

      {/* Output Tabs */}
      <div className="flex border-b border-zinc-800 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('STDOUT')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
            activeTab === 'STDOUT'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Stdout ({execution.stdout.length} chars)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('STDERR')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
            activeTab === 'STDERR'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Stderr ({execution.stderr.length} chars)
        </button>
      </div>

      {/* Console Viewer */}
      <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
        {activeTab === 'STDOUT' && (
          <pre className="text-zinc-200 whitespace-pre-wrap">
            {execution.stdout || <span className="text-zinc-600 italic">(no stdout recorded)</span>}
          </pre>
        )}
        {activeTab === 'STDERR' && (
          <pre className="text-rose-300 whitespace-pre-wrap">
            {execution.stderr || <span className="text-zinc-600 italic">(no stderr recorded)</span>}
          </pre>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 p-5 rounded-xl max-w-md w-full flex flex-col gap-3">
            <h4 className="text-sm font-semibold">Reject Command Execution</h4>
            <p className="text-xs text-zinc-400">
              Provide a reason to inform the autonomous agent why this command was blocked.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Unsafe dependency modification outside testing scope"
              className="w-full h-24 p-2 bg-zinc-950 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded font-medium"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
