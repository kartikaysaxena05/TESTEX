/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementScenariosView.tsx
 * Component displaying candidate Test Scenarios generated from Authoritative Requirements (V4 Phase 49).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { RequirementScenarioGenerationDto, DesktopResult } from '@ai-quality/contracts';
import { Button, Badge, Spinner } from '../../ui/index.js';

interface RequirementScenariosViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly isArchivedProject?: boolean;
}

export function RequirementScenariosView({
  projectId,
  requirementId,
  isArchivedProject = false,
}: RequirementScenariosViewProps): React.JSX.Element {
  const [generation, setGeneration] = useState<RequirementScenarioGenerationDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentScenarios = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bridge = window.desktop?.scenarios;
      if (!bridge?.getCurrent) {
        setGeneration(null);
        return;
      }
      const res = (await bridge.getCurrent({
        projectId,
        requirementId,
      })) as DesktopResult<RequirementScenarioGenerationDto | null>;

      if (res.ok) {
        setGeneration(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, requirementId]);

  useEffect(() => {
    fetchCurrentScenarios();
  }, [fetchCurrentScenarios]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const bridge = window.desktop?.scenarios;
      if (!bridge?.generate) {
        setError('Scenario generation bridge method unavailable.');
        return;
      }
      const res = (await bridge.generate({
        projectId,
        requirementId,
        forceRegenerate: true,
      })) as DesktopResult<RequirementScenarioGenerationDto>;

      if (res.ok) {
        setGeneration(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-neutral-400">
        <Spinner size="sm" />
        <span>Loading candidate test scenarios...</span>
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-center space-y-3">
        <p className="text-xs text-neutral-400">
          No test scenario candidates generated for this requirement yet.
        </p>
        {!isArchivedProject && (
          <Button size="sm" variant="primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <span className="flex items-center gap-1">
                <Spinner size="sm" /> Generating Candidate Scenarios...
              </span>
            ) : (
              'Generate Candidate Scenarios'
            )}
          </Button>
        )}
      </div>
    );
  }

  const isStale = generation.status === 'STALE';
  const isInsufficient = generation.status === 'INSUFFICIENT_INFORMATION';

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Candidate Test Scenarios
          </h4>
          <Badge variant={isStale ? 'warning' : isInsufficient ? 'neutral' : 'success'}>
            {generation.status}
          </Badge>
          <span className="text-xs text-neutral-500">
            {generation.scenarios.length} Candidate{generation.scenarios.length === 1 ? '' : 's'} (v
            {generation.requirementVersionNumber})
          </span>
        </div>
        {!isArchivedProject && (
          <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <span className="flex items-center gap-1">
                <Spinner size="sm" /> Regenerating...
              </span>
            ) : (
              'Regenerate Scenarios'
            )}
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-300">
          {error}
        </div>
      )}

      {isStale && (
        <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded text-xs text-amber-300">
          Requirement was modified after these scenarios were generated. Please regenerate to
          reflect the latest requirement version.
        </div>
      )}

      {/* Warnings & Insufficiency Findings */}
      {generation.warnings.length > 0 && (
        <div className="space-y-2">
          {generation.warnings.map((w, idx) => (
            <div
              key={idx}
              className="p-2.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-neutral-300 flex items-start gap-2"
            >
              <span className="text-amber-400 font-mono text-[10px] mt-0.5">[{w.code}]</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scenarios List */}
      {generation.scenarios.length > 0 ? (
        <div className="space-y-3">
          {generation.scenarios.map((scenario, idx) => (
            <div
              key={scenario.id ?? idx}
              className="p-3.5 bg-neutral-900 border border-neutral-800 rounded-lg space-y-2 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-neutral-800 text-neutral-300 font-mono text-[10px] rounded">
                    {scenario.scenarioKey ?? `SCN-${idx + 1}`}
                  </span>
                  <h5 className="text-xs font-semibold text-neutral-100">{scenario.title}</h5>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {scenario.testLevel && <Badge variant="neutral">{scenario.testLevel}</Badge>}
                  {scenario.testIntent && <Badge variant="info">{scenario.testIntent}</Badge>}
                </div>
              </div>

              {/* Objective */}
              <div className="text-xs text-neutral-300">
                <span className="font-semibold text-neutral-400">Objective: </span>
                {scenario.objective}
              </div>

              {/* Rationale & Aspect */}
              <div className="text-xs text-neutral-400">
                <span className="font-semibold text-neutral-500">Rationale: </span>
                {scenario.rationale}
              </div>

              {/* Assumptions if present */}
              {scenario.assumptions.length > 0 && (
                <div className="p-2 bg-amber-950/20 border border-amber-900/40 rounded text-xs text-amber-300/90 space-y-1">
                  <div className="font-semibold text-[11px]">Assumptions (Review Required):</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {scenario.assumptions.map((a, aIdx) => (
                      <li key={aIdx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Grounding & Evidence Refs */}
              {scenario.sourceEvidenceRefs.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 text-[10px] text-neutral-500">
                  <span>Grounded in:</span>
                  {scenario.sourceEvidenceRefs.map((ref, rIdx) => (
                    <span
                      key={rIdx}
                      className="px-1.5 py-0.2 bg-neutral-950 border border-neutral-800 rounded font-mono text-neutral-400"
                    >
                      {ref}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        !isInsufficient && (
          <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-center text-xs text-neutral-400">
            No test scenario candidates generated.
          </div>
        )
      )}

      {/* Provenance & Metadata Footer */}
      <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-2 border-t border-neutral-850">
        <div>
          Engine:{' '}
          <span className="font-mono text-neutral-400">
            {generation.promptId}@{generation.promptVersion}
          </span>{' '}
          | Model: <span className="font-mono text-neutral-400">{generation.model}</span>
        </div>
        <div>
          Duration: <span className="font-mono text-neutral-400">{generation.durationMs}ms</span> |
          Fingerprint:{' '}
          <span className="font-mono text-neutral-400">
            {generation.inputFingerprint.slice(0, 8)}...
          </span>
        </div>
      </div>
    </div>
  );
}
