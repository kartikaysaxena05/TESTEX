/**
 * @file apps/desktop/src/renderer/features/conversational-agent/RunControlsPanel.tsx
 * Real-time run control toolbar, step progression tracker, and engine status for Phase 124.
 */

import React, { useState } from 'react';
import type {
  AgentRunControlAction,
  AgentRunControlResultDto,
  AgentTaskDto,
} from '@ai-quality/contracts';
import { Button, Badge, Spinner } from '../../ui/index.js';

export interface RunControlsPanelProps {
  readonly activeRunId?: string | null;
  readonly runStatus?: AgentRunControlResultDto | null;
  readonly activeTask?: AgentTaskDto | null;
  readonly currentStep?: number;
  readonly totalSteps?: number;
  readonly currentStepDescription?: string;
  readonly browserEngine?: string;
  readonly environment?: string;
  readonly requirementKey?: string | null;
  readonly testCaseKey?: string | null;
  readonly isControlling?: boolean;
  readonly onRunControl: (action: AgentRunControlAction, reason?: string) => Promise<void>;
}

export function RunControlsPanel({
  activeRunId,
  runStatus,
  activeTask,
  currentStep = 1,
  totalSteps = 1,
  currentStepDescription,
  browserEngine = 'Chromium (Headless)',
  environment = 'STAGING',
  requirementKey,
  testCaseKey,
  isControlling = false,
  onRunControl,
}: RunControlsPanelProps): React.JSX.Element {
  const [controlActionInProgress, setControlActionInProgress] = useState<AgentRunControlAction | null>(null);

  const currentStatus = runStatus?.runStatus ?? (activeRunId ? 'RUNNING' : 'IDLE');

  const isRunning = currentStatus === 'RUNNING';
  const isPaused = currentStatus === 'PAUSED';
  const isTerminated = currentStatus === 'COMPLETED' || currentStatus === 'FAILED' || currentStatus === 'CANCELLED';
  const isIdle = currentStatus === 'IDLE';

  const handleAction = async (action: AgentRunControlAction) => {
    setControlActionInProgress(action);
    try {
      await onRunControl(action);
    } finally {
      setControlActionInProgress(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'warning';
      case 'PAUSED':
        return 'neutral';
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
        return 'danger';
      case 'CANCELLED':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const progressPercentage = Math.min(100, Math.max(0, Math.round((currentStep / Math.max(1, totalSteps)) * 100)));

  return (
    <div className="run-controls-panel bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4" data-testid="run-controls-panel">
      {/* 1. RUN STATUS HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Run Control</span>
          {activeRunId && (
            <span className="text-[11px] font-mono text-neutral-500 truncate max-w-[120px]" title={activeRunId}>
              {activeRunId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getStatusBadgeVariant(currentStatus)}>
            {currentStatus}
          </Badge>
          {isRunning && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Active" />}
        </div>
      </div>

      {/* 2. STEP PROGRESSION TRACKER */}
      <div className="space-y-1.5" data-testid="step-progression-tracker">
        <div className="flex justify-between text-xs text-neutral-300">
          <span className="font-medium">
            {`Step ${currentStep} of ${totalSteps}`}
          </span>
          <span className="text-neutral-400 font-mono">{progressPercentage}%</span>
        </div>
        <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              currentStatus === 'FAILED'
                ? 'bg-rose-500'
                : currentStatus === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        {(currentStepDescription || activeTask?.userPrompt) && (
          <div className="text-xs text-neutral-400 pt-1 flex items-center gap-2">
            <span className="truncate">{currentStepDescription ?? activeTask?.userPrompt}</span>
          </div>
        )}
      </div>

      {/* 3. METADATA BADGES */}
      <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
        <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/60 flex items-center gap-1">
          <span className="text-neutral-500">Engine:</span>
          <span>{browserEngine}</span>
        </span>
        <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700/60 flex items-center gap-1">
          <span className="text-neutral-500">Env:</span>
          <span className={environment === 'PRODUCTION' ? 'text-amber-400 font-bold' : ''}>{environment}</span>
        </span>
        {requirementKey && (
          <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
            {requirementKey}
          </span>
        )}
        {testCaseKey && (
          <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
            {testCaseKey}
          </span>
        )}
      </div>

      {/* 4. RUN CONTROL BUTTONS */}
      <div className="pt-2 border-t border-neutral-800 flex flex-wrap gap-2" role="toolbar" aria-label="Run execution controls">
        {/* START BUTTON */}
        {(isIdle || isTerminated) && (
          <Button
            variant="primary"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('START')}
            aria-label="Start test run"
            data-testid="run-control-start-btn"
          >
            {controlActionInProgress === 'START' ? <Spinner size="sm" /> : '▶ Start'}
          </Button>
        )}

        {/* PAUSE BUTTON */}
        {isRunning && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('PAUSE')}
            aria-label="Pause test run"
            data-testid="run-control-pause-btn"
          >
            {controlActionInProgress === 'PAUSE' ? <Spinner size="sm" /> : '⏸ Pause'}
          </Button>
        )}

        {/* RESUME BUTTON */}
        {isPaused && (
          <Button
            variant="primary"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('RESUME')}
            aria-label="Resume test run"
            data-testid="run-control-resume-btn"
          >
            {controlActionInProgress === 'RESUME' ? <Spinner size="sm" /> : '▶ Resume'}
          </Button>
        )}

        {/* CANCEL BUTTON */}
        {(isRunning || isPaused) && (
          <Button
            variant="danger"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('CANCEL')}
            aria-label="Cancel test run"
            data-testid="run-control-cancel-btn"
          >
            {controlActionInProgress === 'CANCEL' ? <Spinner size="sm" /> : '⏹ Cancel'}
          </Button>
        )}

        {/* RETRY BUTTON */}
        {isTerminated && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('RETRY')}
            aria-label="Retry test run"
            data-testid="run-control-retry-btn"
          >
            {controlActionInProgress === 'RETRY' ? <Spinner size="sm" /> : '🔄 Retry'}
          </Button>
        )}

        {/* STOP BUTTON */}
        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isControlling || controlActionInProgress !== null}
            onClick={() => handleAction('STOP')}
            aria-label="Stop test run gracefully"
            data-testid="run-control-stop-btn"
          >
            {controlActionInProgress === 'STOP' ? <Spinner size="sm" /> : '🛑 Stop'}
          </Button>
        )}
      </div>

      {/* 5. RUN STATUS MESSAGE */}
      {runStatus?.message && (
        <div className="text-[11px] text-neutral-400 bg-neutral-950/60 p-2 rounded border border-neutral-800/80">
          {runStatus.message}
        </div>
      )}
    </div>
  );
}
