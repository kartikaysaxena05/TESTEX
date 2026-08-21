/**
 * @file apps/desktop/src/renderer/features/requirements/RequirementTestDesignView.tsx
 * Component displaying Test Design Intelligence: testing dimensions, recommended techniques,
 * coverage objectives, test levels, risk priorities, constraints, and design questions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { TestDesignPlanDto, DesktopResult } from '@ai-quality/contracts';
import { Button, Badge, Spinner } from '../../ui/index.js';

interface RequirementTestDesignViewProps {
  readonly projectId: string;
  readonly requirementId: string;
  readonly isArchivedProject?: boolean;
}

export function RequirementTestDesignView({
  projectId,
  requirementId,
  isArchivedProject = false,
}: RequirementTestDesignViewProps): React.JSX.Element {
  const [designPlan, setDesignPlan] = useState<TestDesignPlanDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentDesign = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bridge = window.desktop?.testDesign;
      if (!bridge?.getCurrent) {
        setDesignPlan(null);
        return;
      }
      const res = (await bridge.getCurrent({
        projectId,
        requirementId,
      })) as DesktopResult<TestDesignPlanDto | null>;

      if (res.ok) {
        setDesignPlan(res.data);
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
    fetchCurrentDesign();
  }, [fetchCurrentDesign]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const bridge = window.desktop?.testDesign;
      if (!bridge?.analyze) {
        setError('Test design bridge method unavailable.');
        return;
      }
      const res = (await bridge.analyze({
        projectId,
        requirementId,
        forceRegenerate: true,
      })) as DesktopResult<TestDesignPlanDto>;

      if (res.ok) {
        setDesignPlan(res.data);
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
        <span>Loading test design intelligence...</span>
      </div>
    );
  }

  if (!designPlan) {
    return (
      <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-center space-y-3">
        <p className="text-xs text-neutral-400">
          No test design analysis generated for this requirement yet.
        </p>
        {!isArchivedProject && (
          <Button size="sm" variant="primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                <span>Designing Test Strategy...</span>
              </span>
            ) : (
              'Generate Test Design'
            )}
          </Button>
        )}
      </div>
    );
  }

  const d = designPlan.structuredDesign;
  const isStale = designPlan.status === 'STALE';

  return (
    <div className="space-y-4 text-xs">
      {/* Header with Status & Regenerate Button */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-200">Test Design Strategy</span>
          <Badge
            variant={
              designPlan.status === 'CURRENT'
                ? 'success'
                : designPlan.status === 'STALE'
                  ? 'warning'
                  : 'danger'
            }
          >
            {designPlan.status}
          </Badge>
          <Badge variant="neutral">{d.applicability}</Badge>
          <Badge variant="neutral">Automation: {d.automationSuitability}</Badge>
        </div>
        {!isArchivedProject && (
          <Button size="sm" variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Analyzing...' : 'Regenerate'}
          </Button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded text-red-300">
          {error}
        </div>
      )}

      {/* Staleness Banner */}
      {isStale && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded text-amber-300">
          ⚠️ Requirement has changed since this test design was generated. Please regenerate for
          updated guidance.
        </div>
      )}

      {/* Strategy Summary & Applicability */}
      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded space-y-2">
        <div>
          <span className="font-medium text-neutral-300">Applicability Rationale: </span>
          <span className="text-neutral-400">{d.applicabilityRationale}</span>
        </div>
        <div>
          <span className="font-medium text-neutral-300">Automation Assessment: </span>
          <span className="text-neutral-400">{d.automationRationale}</span>
        </div>
      </div>

      {/* Recommended Test Levels */}
      {d.recommendedLevels && d.recommendedLevels.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-medium text-neutral-300">Recommended Test Levels</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {d.recommendedLevels.map((lvl, idx) => (
              <div
                key={idx}
                className="p-2 bg-neutral-900/40 border border-neutral-800 rounded flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">{lvl.level}</span>
                  <Badge
                    variant={
                      lvl.priority === 'HIGH' || lvl.priority === 'CRITICAL' ? 'warning' : 'neutral'
                    }
                  >
                    {lvl.priority}
                  </Badge>
                </div>
                <p className="text-neutral-400 mt-1">{lvl.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Testing Dimensions */}
      {d.recommendedDimensions && d.recommendedDimensions.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-medium text-neutral-300">Applicable Testing Dimensions</div>
          <div className="flex flex-wrap gap-1.5">
            {d.recommendedDimensions.map((dim, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 rounded text-neutral-200 flex items-center gap-1.5"
              >
                <span>{dim.dimension}</span>
                <span className="text-[10px] text-neutral-400">({dim.priority})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Test Design Techniques */}
      {d.recommendedTechniques && d.recommendedTechniques.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-neutral-300">Recommended Test Design Techniques</div>
          <div className="space-y-2">
            {d.recommendedTechniques.map((tech, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-neutral-900/50 border border-neutral-800 rounded space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-400">{tech.technique}</span>
                  <Badge
                    variant={
                      tech.priority === 'HIGH' || tech.priority === 'CRITICAL'
                        ? 'warning'
                        : 'neutral'
                    }
                  >
                    {tech.priority}
                  </Badge>
                </div>
                <p className="text-neutral-300">{tech.rationale}</p>
                {tech.rationaleCodes && tech.rationaleCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tech.rationaleCodes.map((code, cIdx) => (
                      <span
                        key={cIdx}
                        className="text-[10px] font-mono px-1.5 py-0.2 bg-neutral-950 border border-neutral-800 rounded text-neutral-400"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coverage Objectives */}
      {d.coverageObjectives && d.coverageObjectives.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-medium text-neutral-300">Coverage Objectives</div>
          <div className="space-y-1.5">
            {d.coverageObjectives.map((obj, idx) => (
              <div
                key={idx}
                className="p-2 bg-neutral-950/80 border border-neutral-800 rounded flex items-start gap-2"
              >
                <span className="font-mono text-neutral-500">{obj.id}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-300">{obj.category}</span>
                    <Badge variant="neutral">{obj.priority}</Badge>
                  </div>
                  <p className="text-neutral-400 mt-0.5">{obj.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Identified Constraints */}
      {d.identifiedConstraints && d.identifiedConstraints.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-medium text-neutral-300">Identified Testable Constraints</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {d.identifiedConstraints.map((c, idx) => (
              <div key={idx} className="p-2 bg-neutral-900/30 border border-neutral-800 rounded">
                <div className="text-neutral-400 font-mono text-[10px]">{c.constraintType}</div>
                <div className="text-neutral-200 font-medium">{c.parameter}</div>
                <div className="text-emerald-400">
                  {c.value} {c.unit ? `(${c.unit})` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Design Questions for Missing Information / Ambiguities */}
      {d.designQuestions && d.designQuestions.length > 0 && (
        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded space-y-2">
          <div className="font-medium text-amber-300 flex items-center gap-1.5">
            <span>❓ Design Clarification Questions</span>
          </div>
          <div className="space-y-1.5">
            {d.designQuestions.map((q, idx) => (
              <div
                key={idx}
                className="p-2 bg-neutral-950 border border-amber-900/30 rounded text-neutral-300"
              >
                <div className="font-medium text-amber-200">{q.question}</div>
                <div className="text-neutral-400 text-[11px] mt-0.5">Impact: {q.impact}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
