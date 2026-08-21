/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementLinkedTracesView.tsx
 * Forward Traceability view displaying all Test Cases linked to a Requirement with version binding & staleness.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { RequirementTestTraceDto } from '@ai-quality/contracts';
import { Badge, Button } from '../../ui/index.js';

interface RequirementLinkedTracesViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly isArchivedProject?: boolean;
  readonly onSelectTestCase?: (testCaseId: string) => void;
}

export function RequirementLinkedTracesView({
  projectId,
  requirementId,
  isArchivedProject = false,
  onSelectTestCase,
}: RequirementLinkedTracesViewProps): React.JSX.Element {
  const [traces, setTraces] = useState<readonly RequirementTestTraceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const loadTraces = useCallback(async () => {
    if (!window.desktop?.traceability) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.traceability.listByRequirement({
        projectId,
        requirementId,
      });
      if (res.ok) {
        setTraces(res.data.traces);
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    loadTraces();
  }, [loadTraces]);

  const handleDeleteTrace = async (traceId: string) => {
    if (!window.desktop?.traceability || isArchivedProject) return;
    setIsDeleting(traceId);
    try {
      const res = await window.desktop.traceability.deleteTrace({
        projectId,
        traceId,
      });
      if (res.ok) {
        setTraces(prev => prev.filter(t => t.id !== traceId));
      } else {
        setError(res.error.message);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(null);
    }
  };

  const getStatusBadge = (trace: RequirementTestTraceDto) => {
    if (trace.isStale || trace.status === 'STALE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80">
          <span>⚠️ Stale</span>
          {trace.staleReason && (
            <span className="text-[10px] text-amber-400/80">({trace.staleReason})</span>
          )}
        </span>
      );
    }
    if (trace.status === 'REVIEW_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/80">
          🔍 Review Required
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
        ✓ Current
      </span>
    );
  };

  const getOriginBadge = (origin: string) => {
    switch (origin) {
      case 'GENERATED':
        return <Badge variant="info">AI GENERATED</Badge>;
      case 'MANUAL':
        return <Badge variant="neutral">MANUAL</Badge>;
      case 'DERIVED':
        return <Badge variant="warning">DERIVED</Badge>;
      case 'IMPORTED':
        return <Badge variant="neutral">IMPORTED</Badge>;
      default:
        return <Badge variant="neutral">{origin}</Badge>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Linked Test Cases (Forward Traceability)
          </h4>
          <span className="bg-neutral-800 text-neutral-300 text-xs px-2 py-0.5 rounded-full font-mono">
            {traces.length}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={loadTraces} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh Traces'}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-300">
          {error}
        </div>
      )}

      {traces.length === 0 && !isLoading ? (
        <div className="p-4 bg-neutral-950/40 border border-neutral-800/60 rounded-lg text-xs text-neutral-400 text-center">
          No test cases are currently traced back to this requirement.
        </div>
      ) : (
        <div className="space-y-2">
          {traces.map(trace => (
            <div
              key={trace.id}
              className={`p-3 rounded-lg border text-xs transition-colors ${
                trace.isStale
                  ? 'bg-amber-950/10 border-amber-800/40 hover:border-amber-700/60'
                  : 'bg-neutral-950/60 border-neutral-800/80 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/40">
                      {trace.testCaseKey}
                    </span>
                    <span className="font-medium text-neutral-200">{trace.testCaseTitle}</span>
                    {getOriginBadge(trace.origin)}
                    {getStatusBadge(trace)}
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-neutral-400 flex-wrap">
                    <span>
                      Bound to:{' '}
                      <strong className="text-neutral-300">
                        v{trace.requirementVersionNumber}
                      </strong>
                      {trace.currentRequirementVersionNumber !== trace.requirementVersionNumber && (
                        <span className="text-amber-400 ml-1">
                          (Current: v{trace.currentRequirementVersionNumber})
                        </span>
                      )}
                    </span>
                    {trace.scenarioKey && (
                      <span>
                        Scenario:{' '}
                        <span className="font-mono text-indigo-300">{trace.scenarioKey}</span>
                      </span>
                    )}
                    {trace.testCaseType && (
                      <span className="uppercase text-neutral-400">Type: {trace.testCaseType}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {onSelectTestCase && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSelectTestCase(trace.testCaseId)}
                    >
                      View Test
                    </Button>
                  )}
                  {!isArchivedProject && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isDeleting === trace.id}
                      onClick={() => handleDeleteTrace(trace.id)}
                    >
                      {isDeleting === trace.id ? 'Unlinking...' : 'Unlink'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
