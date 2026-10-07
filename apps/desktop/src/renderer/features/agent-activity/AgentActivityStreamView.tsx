/**
 * @file apps/desktop/src/renderer/features/agent-activity/AgentActivityStreamView.tsx
 * Codex-style Live Streaming Activity and Tool Progress View for V10 Phase 154.
 *
 * Visualizes:
 * - Real-time task execution activity without manual refresh.
 * - Prominent current activity header with running step and active tool indicators.
 * - Ordered chronological timeline (Planning, Analysis, Tool Execution, Approval, Outcome).
 * - Compact tool progress cards with expandable sanitized inputs/results/errors.
 * - Smart auto-scroll with pause-on-scroll-up and resume button.
 * - Bounded rendering for high-volume execution histories.
 */

import React, { useState } from 'react';
import type { AgentActivityItemDto } from '@ai-quality/contracts';
import {
  useAgentActivityStream,
  type UseAgentActivityStreamResult,
} from './useAgentActivityStream.js';
import { ToolProgressCard } from './ToolProgressCard.js';
import { Badge, Button, Spinner, Alert } from '../../ui/index.js';

export interface AgentActivityStreamViewProps {
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly hookOverride?: UseAgentActivityStreamResult;
  readonly className?: string;
}

function getItemBadgeVariant(
  kind: AgentActivityItemDto['kind'],
): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  switch (kind) {
    case 'COMPLETION':
      return 'success';
    case 'FAILURE':
      return 'danger';
    case 'APPROVAL_WAITING':
    case 'CANCELLATION':
      return 'warning';
    case 'TOOL_EXECUTION':
    case 'TOOL_RESULT':
      return 'info';
    case 'PLANNING':
    case 'ANALYSIS':
    default:
      return 'neutral';
  }
}

export const AgentActivityStreamView: React.FC<AgentActivityStreamViewProps> = ({
  projectId,
  taskId,
  hookOverride,
  className = '',
}) => {
  const defaultHook = useAgentActivityStream({ projectId, taskId });
  const {
    timeline,
    isLoading,
    isSubscribed,
    error,
    autoScroll,
    isUserScrolledUp,
    scrollContainerRef,
    setAutoScroll,
    resumeAutoScroll,
    handleScroll,
    refresh,
  } = hookOverride ?? defaultHook;

  // Track expanded state for timeline step rows
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  const toggleItemExpansion = (id: string) => {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (!projectId || !taskId) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-neutral-500 text-sm">
        Select a task to monitor real-time agent activity.
      </div>
    );
  }

  if (isLoading && !timeline) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-3 text-neutral-400">
        <Spinner size="md" />
        <span className="text-xs">Loading activity timeline...</span>
      </div>
    );
  }

  const isRunning = timeline?.taskStatus === 'RUNNING' || timeline?.taskStatus === 'PLANNING';
  const isApprovalWaiting = timeline?.taskStatus === 'WAITING_FOR_APPROVAL';

  return (
    <div
      className={`flex flex-col h-full bg-neutral-950/40 border border-neutral-800 rounded-lg overflow-hidden ${className}`}
      data-testid="agent-activity-stream-view"
    >
      {/* 1. Header Bar: Current Activity & Status */}
      <div className="p-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            {isRunning && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
              </span>
            )}
            <span className="text-xs font-semibold text-neutral-200 truncate">
              {timeline?.taskTitle ?? 'Task Execution Activity'}
            </span>
          </div>

          {timeline && (
            <Badge
              variant={
                timeline.taskStatus === 'COMPLETED'
                  ? 'success'
                  : timeline.taskStatus === 'FAILED'
                    ? 'danger'
                    : timeline.taskStatus === 'WAITING_FOR_APPROVAL'
                      ? 'warning'
                      : isRunning
                        ? 'info'
                        : 'neutral'
              }
              className="text-[10px] uppercase font-mono tracking-wider"
              data-testid="task-status-badge"
            >
              {timeline.taskStatus}
            </Badge>
          )}

          {isSubscribed && (
            <span className="text-[10px] text-emerald-400 font-mono hidden sm:inline">• LIVE</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {timeline && (
            <span className="text-[11px] text-neutral-400 font-mono">
              {timeline.durationMs > 0 ? `${(timeline.durationMs / 1000).toFixed(1)}s` : '0s'}
            </span>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] h-7 px-2 ${autoScroll ? 'text-cyan-400' : 'text-neutral-500'}`}
            title="Toggle automatic scrolling"
            data-testid="toggle-autoscroll-btn"
          >
            Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => refresh()}
            className="text-[10px] h-7 px-2"
            title="Refresh activity timeline"
            data-testid="refresh-timeline-btn"
          >
            Sync
          </Button>
        </div>
      </div>

      {/* 2. Prominent Active Activity Banner (if actively executing or waiting) */}
      {(isRunning || isApprovalWaiting) && (
        <div
          className={`p-2.5 border-b text-xs flex items-center justify-between gap-3 ${
            isApprovalWaiting
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              : 'bg-cyan-950/25 border-cyan-800/40 text-cyan-200'
          }`}
          data-testid="active-activity-banner"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold uppercase text-[10px] tracking-wider font-mono">
              {isApprovalWaiting ? 'Paused' : 'Current Activity'}:
            </span>
            <span className="truncate text-xs font-mono">
              {isApprovalWaiting
                ? `Waiting for human authorization (${timeline?.activeToolName ?? 'Operation'})`
                : timeline?.activeStepTitle && timeline?.activeToolName
                  ? `${timeline.activeStepTitle} — Executing ${timeline.activeToolName}...`
                  : timeline?.activeToolName
                    ? `Executing ${timeline.activeToolName}...`
                    : timeline?.activeStepTitle
                      ? `Step: ${timeline.activeStepTitle}`
                      : 'Planning next action...'}
            </span>
          </div>

          {timeline?.activeToolStatus && (
            <Badge
              variant={timeline.activeToolStatus === 'RUNNING' ? 'info' : 'neutral'}
              className="text-[10px] font-mono"
            >
              {timeline.activeToolStatus}
            </Badge>
          )}
        </div>
      )}

      {/* 3. Error Notification Banner */}
      {error && (
        <div className="p-2 border-b border-red-900/50 bg-red-950/30">
          <Alert variant="danger" className="text-xs py-1 px-2">
            {error}
          </Alert>
        </div>
      )}

      {/* 4. Scrollable Chronological Timeline Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 relative"
        data-testid="activity-scroll-container"
      >
        {!timeline?.items || timeline.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-500 text-xs">
            <span>No activity recorded yet for this task.</span>
            <span className="text-[10px] text-neutral-600 mt-1">
              Events will stream here automatically when the agent executes.
            </span>
          </div>
        ) : (
          timeline.items.map(item => {
            const isTool = item.kind === 'TOOL_EXECUTION';
            const isCompletedStep = item.kind === 'ANALYSIS' && item.status === 'COMPLETED';
            const isExpanded = expandedItemIds.has(item.id);

            if (isTool && item.toolName) {
              return (
                <div key={item.id} className="pl-4 border-l-2 border-neutral-800">
                  <ToolProgressCard
                    toolName={item.toolName}
                    status={item.toolStatus ?? 'SUCCESS'}
                    durationMs={item.durationMs}
                    inputSummary={item.inputSummary}
                    resultSummary={item.resultSummary}
                    error={item.error}
                  />
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`rounded-lg border text-xs transition-colors ${
                  item.kind === 'COMPLETION'
                    ? 'border-emerald-800/40 bg-emerald-950/15'
                    : item.kind === 'FAILURE'
                      ? 'border-red-900/40 bg-red-950/20'
                      : item.kind === 'APPROVAL_WAITING'
                        ? 'border-amber-700/40 bg-amber-950/20'
                        : item.status === 'RUNNING'
                          ? 'border-cyan-500/50 bg-neutral-900/80'
                          : 'border-neutral-800/80 bg-neutral-900/40'
                }`}
                data-testid={`timeline-item-${item.id}`}
              >
                {/* Item Header */}
                <div
                  className="flex items-center justify-between p-2.5 cursor-pointer select-none"
                  onClick={() => toggleItemExpansion(item.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={getItemBadgeVariant(item.kind)} className="text-[10px]">
                      {item.kind}
                    </Badge>
                    <span className="font-medium text-neutral-200 truncate">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.durationMs !== null && item.durationMs !== undefined && (
                      <span className="text-[10px] text-neutral-500 font-mono">
                        {item.durationMs}ms
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] text-neutral-500">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Collapsible details for step / analysis */}
                {(!isCompletedStep || isExpanded) && (
                  <div className="p-2.5 pt-0 border-t border-neutral-800/40 mt-1 space-y-1.5 text-neutral-400">
                    {item.description && (
                      <p className="text-[11px] leading-relaxed">{item.description}</p>
                    )}

                    {item.error && (
                      <div className="p-2 bg-red-950/40 border border-red-900/50 rounded text-red-300 font-mono text-[10px]">
                        {item.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* 5. Floating "Resume Auto-Scroll" Button */}
        {isUserScrolledUp && (
          <div className="sticky bottom-2 flex justify-center pointer-events-none">
            <Button
              size="sm"
              variant="primary"
              onClick={resumeAutoScroll}
              className="pointer-events-auto shadow-lg text-[10px] px-3 py-1 bg-cyan-600 hover:bg-cyan-500"
              data-testid="resume-autoscroll-btn"
            >
              ↓ Resume auto-scroll
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
