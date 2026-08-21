/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementCategorizedTestsView.tsx
 * Component displaying categorized POSITIVE, NEGATIVE, BOUNDARY & VALIDATION Test Designs (V4 Phase 50).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  CategorizedTestGenerationResultDto,
  CategorizedTestDesignDto,
  TestDesignCategory,
  DesktopResult,
} from '@ai-quality/contracts';
import { Button, Badge, Spinner } from '../../ui/index.js';

interface RequirementCategorizedTestsViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly isArchivedProject?: boolean;
}

export function RequirementCategorizedTestsView({
  projectId,
  requirementId,
  isArchivedProject = false,
}: RequirementCategorizedTestsViewProps): React.JSX.Element {
  const [result, setResult] = useState<CategorizedTestGenerationResultDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TestDesignCategory | 'ALL'>('ALL');

  const fetchCurrentTests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bridge = window.desktop?.categorizedTests;
      if (!bridge?.getCurrent) {
        setResult(null);
        return;
      }
      const res = (await bridge.getCurrent({
        projectId,
        requirementId,
      })) as DesktopResult<CategorizedTestGenerationResultDto | null>;

      if (res.ok) {
        setResult(res.data);
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
    fetchCurrentTests();
  }, [fetchCurrentTests]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const bridge = window.desktop?.categorizedTests;
      if (!bridge?.generate) {
        setError('Categorized test generation bridge method unavailable.');
        return;
      }
      const res = (await bridge.generate({
        projectId,
        requirementId,
        forceRegenerate: true,
      })) as DesktopResult<CategorizedTestGenerationResultDto>;

      if (res.ok) {
        setResult(res.data);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const getCategoryBadgeVariant = (
    category: TestDesignCategory,
  ): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (category) {
      case 'POSITIVE':
        return 'success';
      case 'NEGATIVE':
        return 'danger';
      case 'BOUNDARY':
        return 'info';
      case 'VALIDATION':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const filteredTests: readonly CategorizedTestDesignDto[] =
    result?.testDesigns.filter(
      test => selectedCategory === 'ALL' || test.category === selectedCategory,
    ) ?? [];

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-slate-200">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            Categorized Test Designs
            <Badge variant="info">Phase 50</Badge>
          </h3>
          <p className="text-xs text-slate-400">
            Deliberate positive, negative, boundary, and validation test designs grounded in
            requirement evidence.
          </p>
        </div>
        {!isArchivedProject && (
          <Button
            size="sm"
            variant="primary"
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
          >
            {isGenerating ? (
              <span className="flex items-center gap-1.5">
                <Spinner size="sm" /> Generating...
              </span>
            ) : result ? (
              'Regenerate Tests'
            ) : (
              'Generate Categorized Tests'
            )}
          </Button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300">
          <p className="font-semibold">Test Generation Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !result && (
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Spinner size="md" />
          <span className="ml-2 text-xs">Loading categorized tests...</span>
        </div>
      )}

      {/* Empty / Not Generated Yet State */}
      {!isLoading && !result && !error && (
        <div className="rounded border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
          <p className="font-medium text-slate-300">No categorized test designs generated yet</p>
          <p className="mt-1">
            Generate deliberate positive, negative, boundary (if evidenced), and validation test
            designs for this requirement.
          </p>
        </div>
      )}

      {/* Results Content */}
      {result && (
        <div className="space-y-4">
          {/* Metadata banner */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Model: {result.model}</span>
            <span>•</span>
            <span>Duration: {result.durationMs} ms</span>
            <span>•</span>
            <span>Tokens: {result.usage.totalTokens}</span>
            <span>•</span>
            <span>Generated: {new Date(result.createdAt).toLocaleTimeString()}</span>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-1 rounded border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-200">
              <span className="font-semibold">Grounding Notices:</span>
              <ul className="list-inside list-disc space-y-0.5">
                {result.warnings.map((w, idx) => (
                  <li key={idx}>
                    <span className="font-mono text-[10px] text-amber-400">[{w.code}]</span>{' '}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Category Metric Badges / Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 pb-2">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              All ({result.metrics.totalGenerated})
            </button>
            <button
              onClick={() => setSelectedCategory('POSITIVE')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === 'POSITIVE'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Positive ({result.metrics.positiveCount})
            </button>
            <button
              onClick={() => setSelectedCategory('NEGATIVE')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === 'NEGATIVE'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Negative ({result.metrics.negativeCount})
            </button>
            <button
              onClick={() => setSelectedCategory('BOUNDARY')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === 'BOUNDARY'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Boundary ({result.metrics.boundaryCount})
            </button>
            <button
              onClick={() => setSelectedCategory('VALIDATION')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === 'VALIDATION'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Validation ({result.metrics.validationCount})
            </button>
          </div>

          {/* Category Assessments / Truthful Applicability */}
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {result.categoryAssessments.map(a => (
              <div
                key={a.category}
                className="rounded border border-slate-700/60 bg-slate-900/40 p-2 text-slate-300"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">{a.category}</span>
                  <Badge
                    variant={
                      a.applicability === 'APPLICABLE'
                        ? 'success'
                        : a.applicability === 'NOT_APPLICABLE'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {a.applicability}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400" title={a.rationale}>
                  {a.rationale}
                </p>
              </div>
            ))}
          </div>

          {/* Test Cards List */}
          {filteredTests.length === 0 ? (
            <div className="rounded border border-dashed border-slate-700 p-4 text-center text-xs text-slate-400">
              No test designs found in category &quot;{selectedCategory}&quot;.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTests.map((test, index) => (
                <div
                  key={test.id ?? index}
                  className="rounded-md border border-slate-700/80 bg-slate-900/60 p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={getCategoryBadgeVariant(test.category)}>
                        {test.category}
                      </Badge>
                      {test.scenarioKey && (
                        <span className="font-mono text-xs font-semibold text-indigo-400">
                          {test.scenarioKey}
                        </span>
                      )}
                      <h4 className="text-sm font-medium text-slate-100">{test.title}</h4>
                    </div>
                    <Badge variant={test.confidence === 'HIGH' ? 'success' : 'neutral'}>
                      {test.confidence} Confidence
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300">{test.objective}</p>

                  <p className="text-xs text-slate-400 italic">
                    <span className="font-semibold text-slate-300">Rationale:</span>{' '}
                    {test.rationale}
                  </p>

                  {/* Boundary Intent Details */}
                  {test.boundaryIntent && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded bg-sky-950/30 border border-sky-800/40 p-2 text-xs text-sky-200">
                      <span className="font-semibold text-sky-300">Boundary Intent:</span>
                      <Badge variant="info">{test.boundaryIntent.kind}</Badge>
                      {test.boundaryIntent.parameter && (
                        <span>Param: {test.boundaryIntent.parameter}</span>
                      )}
                      {test.boundaryIntent.boundaryValue && (
                        <span>Value: {test.boundaryIntent.boundaryValue}</span>
                      )}
                      {test.boundaryIntent.lowerBound && (
                        <span>Min: {test.boundaryIntent.lowerBound}</span>
                      )}
                      {test.boundaryIntent.upperBound && (
                        <span>Max: {test.boundaryIntent.upperBound}</span>
                      )}
                      {test.boundaryIntent.isInclusive !== null &&
                        test.boundaryIntent.isInclusive !== undefined && (
                          <span>(Inclusive: {String(test.boundaryIntent.isInclusive)})</span>
                        )}
                      {test.boundaryIntent.unit && <span>Unit: {test.boundaryIntent.unit}</span>}
                    </div>
                  )}

                  {/* Validation Intent Details */}
                  {test.validationIntent && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded bg-amber-950/30 border border-amber-800/40 p-2 text-xs text-amber-200">
                      <span className="font-semibold text-amber-300">Validation Rule:</span>
                      {test.validationIntent.rule && <span>{test.validationIntent.rule}</span>}
                      {test.validationIntent.violation && (
                        <span className="text-amber-400">
                          (Violation: {test.validationIntent.violation})
                        </span>
                      )}
                      {test.validationIntent.fieldName && (
                        <span>Field: {test.validationIntent.fieldName}</span>
                      )}
                      {test.validationIntent.condition && (
                        <span className="italic">
                          [Condition: {test.validationIntent.condition}]
                        </span>
                      )}
                    </div>
                  )}

                  {/* Grounding Citations */}
                  {test.sourceEvidenceRefs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                      <span className="font-medium text-slate-300">Evidence:</span>
                      {test.sourceEvidenceRefs.map(ref => (
                        <span
                          key={ref}
                          className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 border border-slate-700"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
