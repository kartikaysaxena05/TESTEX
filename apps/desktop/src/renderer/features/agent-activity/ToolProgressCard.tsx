/**
 * @file apps/desktop/src/renderer/features/agent-activity/ToolProgressCard.tsx
 * Compact Codex-style Tool Progress Card for V10 Phase 154.
 *
 * Displays tool execution status, duration, safe inputs, results, and sanitized errors.
 * Never displays plaintext secrets, tokens, or credentials.
 */

import React, { useState } from 'react';
import type { AgentToolExecutionStatus } from '@ai-quality/contracts';
import { Badge, Button } from '../../ui/index.js';

export interface ToolProgressCardProps {
  readonly toolName: string;
  readonly status: AgentToolExecutionStatus;
  readonly durationMs?: number | null;
  readonly inputSummary?: Record<string, unknown> | null;
  readonly resultSummary?: unknown;
  readonly error?: string | null;
  readonly defaultExpanded?: boolean;
  readonly className?: string;
}

function getStatusBadge(status: AgentToolExecutionStatus): {
  variant: 'neutral' | 'info' | 'success' | 'danger' | 'warning';
  label: string;
} {
  switch (status) {
    case 'RUNNING':
      return { variant: 'info', label: 'RUNNING' };
    case 'SUCCESS':
      return { variant: 'success', label: 'SUCCESS' };
    case 'FAILED':
      return { variant: 'danger', label: 'FAILED' };
    case 'CANCELLED':
      return { variant: 'warning', label: 'CANCELLED' };
    case 'QUEUED':
    default:
      return { variant: 'neutral', label: 'QUEUED' };
  }
}

export const ToolProgressCard: React.FC<ToolProgressCardProps> = ({
  toolName,
  status,
  durationMs,
  inputSummary,
  resultSummary,
  error,
  defaultExpanded,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded ?? (status === 'RUNNING' || status === 'FAILED'),
  );
  const badge = getStatusBadge(status);

  const hasInputs = Boolean(inputSummary && Object.keys(inputSummary).length > 0);
  const hasResult = resultSummary !== null && resultSummary !== undefined;
  const hasError = Boolean(error);
  const isExpandable = hasInputs || hasResult || hasError;

  return (
    <div
      className={`rounded-lg border text-xs transition-colors ${
        status === 'RUNNING'
          ? 'border-cyan-500/50 bg-cyan-950/20'
          : status === 'FAILED'
            ? 'border-red-900/40 bg-red-950/10'
            : status === 'SUCCESS'
              ? 'border-emerald-900/30 bg-neutral-900/70'
              : 'border-neutral-800 bg-neutral-900/40'
      } ${className}`}
      data-testid={`tool-progress-card-${toolName}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between p-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold text-cyan-300 truncate">{toolName}</span>
          <Badge variant={badge.variant} className="text-[10px] uppercase font-mono">
            {status === 'RUNNING' && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping mr-1" />
            )}
            {badge.label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {durationMs !== null && durationMs !== undefined && (
            <span className="text-[10px] text-neutral-400 font-mono">{`${durationMs}ms`}</span>
          )}

          {isExpandable && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] text-neutral-400 hover:text-neutral-200"
              onClick={() => setIsExpanded(prev => !prev)}
              data-testid={`expand-tool-${toolName}`}
            >
              {isExpanded ? 'Collapse' : 'Details'}
            </Button>
          )}
        </div>
      </div>

      {/* Expandable Details Area */}
      {isExpanded && (
        <div className="p-2.5 pt-0 border-t border-neutral-800/60 mt-1 space-y-2">
          {/* Safe Input Summary */}
          {hasInputs && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Inputs (Sanitized)
              </div>
              <pre
                className="text-[11px] font-mono bg-neutral-950/90 text-neutral-300 p-2 rounded border border-neutral-800/80 max-h-32 overflow-y-auto"
                data-testid="tool-inputs-preview"
              >
                {JSON.stringify(inputSummary, null, 2)}
              </pre>
            </div>
          )}

          {/* Result Summary */}
          {hasResult && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                Result Summary
              </div>
              <pre
                className="text-[11px] font-mono bg-neutral-950/90 text-emerald-300 p-2 rounded border border-neutral-800/80 max-h-40 overflow-y-auto whitespace-pre-wrap"
                data-testid="tool-result-preview"
              >
                {typeof resultSummary === 'string'
                  ? resultSummary
                  : JSON.stringify(resultSummary, null, 2)}
              </pre>
            </div>
          )}

          {/* Sanitized Error Alert */}
          {hasError && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1">
                Error Details
              </div>
              <div
                className="text-[11px] font-mono text-red-300 bg-red-950/40 p-2 rounded border border-red-900/60 break-words"
                data-testid="tool-error-preview"
              >
                {error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
