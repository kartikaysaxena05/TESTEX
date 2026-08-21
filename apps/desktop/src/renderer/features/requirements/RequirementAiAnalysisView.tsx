/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementAiAnalysisView.tsx
 * Component displaying grounded LLM requirement analysis, semantic interpretations,
 * actors, constraints, ambiguities, unsafe assumptions, and citations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { RequirementAiAnalysisDto, DesktopResult } from '@ai-quality/contracts';
import { Button, Badge, Spinner } from '../../ui/index.js';

interface RequirementAiAnalysisViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly isArchivedProject?: boolean;
}

export function RequirementAiAnalysisView({
  projectId,
  requirementId,
  isArchivedProject = false,
}: RequirementAiAnalysisViewProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<RequirementAiAnalysisDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bridge = window.desktop?.ai;
      if (!bridge?.getRequirementAnalysis) {
        setAnalysis(null);
        return;
      }
      const res = (await bridge.getRequirementAnalysis({
        projectId,
        requirementId,
      })) as DesktopResult<RequirementAiAnalysisDto | null>;

      if (res.ok) {
        setAnalysis(res.data);
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
    fetchCurrentAnalysis();
  }, [fetchCurrentAnalysis]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const bridge = window.desktop?.ai;
      if (!bridge?.analyzeRequirement) {
        setError('AI analysis bridge method unavailable.');
        return;
      }
      const res = (await bridge.analyzeRequirement({
        projectId,
        requirementId,
        forceRegenerate: true,
      })) as DesktopResult<RequirementAiAnalysisDto>;

      if (res.ok) {
        setAnalysis(res.data);
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
        <span>Loading AI requirement analysis...</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-center space-y-3">
        <p className="text-xs text-neutral-400">
          No AI requirement analysis generated for this requirement yet.
        </p>
        {!isArchivedProject && (
          <Button size="sm" variant="primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating Analysis...' : 'Generate AI Analysis'}
          </Button>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  const structured = analysis.structuredAnalysis;
  const isStale = analysis.status === 'STALE';

  return (
    <div className="space-y-4">
      {/* Header with status and regenerate button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isStale ? 'warning' : 'success'}>
            {`AI Analysis: ${analysis.status}`}
          </Badge>
          <span className="text-xs text-neutral-400 font-mono">
            {`${analysis.providerId} / ${analysis.model}`}
          </span>
          <span className="text-xs text-neutral-500">
            {`v${analysis.requirementVersionNumber}`}
          </span>
        </div>
        {!isArchivedProject && (
          <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Regenerating...' : 'Regenerate'}
          </Button>
        )}
      </div>

      {/* Staleness Banner */}
      {isStale && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-200">
          ⚠️ AI analysis is stale because the requirement was modified after this analysis was
          generated. Regenerate analysis to use the current requirement version.
        </div>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* Semantic Interpretation */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
          Semantic Interpretation
        </h4>
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-md text-xs text-neutral-200 leading-relaxed">
          {structured.summary}
        </div>
      </div>

      {/* Business Intent */}
      {structured.businessIntent && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
            Business Intent
          </h4>
          <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800">
            {structured.businessIntent}
          </p>
        </div>
      )}

      {/* Actors & Modality */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded">
          <span className="text-neutral-400 block mb-1 font-medium">Primary Actor:</span>
          <span className="text-neutral-200 font-semibold">
            {structured.primaryActor ?? 'None specified (Unknown)'}
          </span>
        </div>
        <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded">
          <span className="text-neutral-400 block mb-1 font-medium">Modality / Negation:</span>
          <span className="text-neutral-200 font-semibold">
            {structured.modality} {structured.hasNegation ? '(Prohibition / Negated)' : ''}
          </span>
        </div>
      </div>

      {/* Constraints & Quantitative Rules */}
      {structured.constraints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
            Constraints & Rules
          </h4>
          <ul className="list-disc list-inside space-y-1 text-xs text-neutral-300 bg-neutral-950 p-3 rounded border border-neutral-800">
            {structured.constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing Information & Unsafe Assumptions */}
      {(structured.missingInformation.length > 0 || structured.unsafeAssumptions.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {structured.missingInformation.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                Missing Information
              </h4>
              <ul className="space-y-1 text-xs text-neutral-400 bg-neutral-950 p-2.5 rounded border border-neutral-800">
                {structured.missingInformation.map((m, i) => (
                  <li key={i}>• {m}</li>
                ))}
              </ul>
            </div>
          )}
          {structured.unsafeAssumptions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1">
                Unsafe Assumptions Warning
              </h4>
              <ul className="space-y-1 text-xs text-amber-300/80 bg-neutral-950 p-2.5 rounded border border-neutral-800">
                {structured.unsafeAssumptions.map((u, i) => (
                  <li key={i}>⚠️ {u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Grounding & Evidence Citations */}
      {structured.citations.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
            Grounding Evidence Citations ({analysis.groundingSummary.groundedClaims} Grounded /{' '}
            {analysis.groundingSummary.unsupportedClaims} Unsupported)
          </h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto bg-neutral-950 p-2.5 rounded border border-neutral-800 text-xs">
            {structured.citations.map((cit, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1 border-b border-neutral-900 last:border-0"
              >
                <span className="font-mono text-neutral-300">{cit.claimKey}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={cit.supportType === 'UNSUPPORTED' ? 'danger' : 'neutral'}>
                    {cit.supportType}
                  </Badge>
                  {cit.evidenceId && (
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {cit.evidenceId.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
