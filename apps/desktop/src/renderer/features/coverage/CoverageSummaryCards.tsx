/**
 * @file apps/desktop/src/renderer/features/coverage/CoverageSummaryCards.tsx
 * Visual KPI summaries, progress indicators, and dimension breakdown for Phase 55 coverage intelligence.
 */

import React from 'react';
import type { ProjectCoverageSummaryDto } from '@ai-quality/contracts';
import type { BadgeVariant } from '../../ui/index.js';
import { Card, Badge } from '../../ui/index.js';

interface CoverageSummaryCardsProps {
  readonly summary: ProjectCoverageSummaryDto | null;
  readonly isLoading?: boolean;
}

export function CoverageSummaryCards({
  summary,
  isLoading = false,
}: CoverageSummaryCardsProps): React.JSX.Element {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2 mb-2" />
            <div className="h-8 bg-muted rounded w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  const getCoverageColor = (pct: number): string => {
    if (pct >= 80) return 'text-emerald-500';
    if (pct >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getBadgeVariant = (pct: number): BadgeVariant => {
    if (pct >= 80) return 'success';
    if (pct >= 50) return 'warning';
    return 'danger';
  };

  const hasCoveragePercentage =
    typeof summary.overallCoveragePercentage === 'number' &&
    Number.isFinite(summary.overallCoveragePercentage);

  return (
    <div className="space-y-6 mb-6">
      {/* Top Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Coverage */}
        <Card className="p-5 border-l-4 border-l-primary shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Requirement Coverage
            </span>
            <Badge variant={hasCoveragePercentage ? getBadgeVariant(summary.overallCoveragePercentage!) : 'neutral'}>
              {hasCoveragePercentage ? `${summary.overallCoveragePercentage}%` : 'Not available yet'}
            </Badge>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold tracking-tight ${
                hasCoveragePercentage ? getCoverageColor(summary.overallCoveragePercentage!) : 'text-muted-foreground'
              }`}
            >
              {hasCoveragePercentage ? `${summary.overallCoveragePercentage}%` : 'Not available yet'}
            </span>
            <span className="text-xs text-muted-foreground">
              ({summary.coveredCount}/{summary.eligibleRequirements} fully covered)
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex justify-between">
            <span>With Partial:</span>
            <span className="font-medium">
              {typeof summary.overallWithPartialPercentage === 'number' &&
              Number.isFinite(summary.overallWithPartialPercentage)
                ? `${summary.overallWithPartialPercentage}%`
                : 'Not available yet'}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2 mt-3 overflow-hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-500"
              style={{
                width: hasCoveragePercentage
                  ? `${Math.min(100, Math.max(0, summary.overallCoveragePercentage!))}%`
                  : '0%',
              }}
            />
          </div>
        </Card>

        {/* Requirements Breakdown */}
        <Card className="p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Requirements Breakdown
          </span>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-lg font-bold text-emerald-500">{summary.coveredCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Covered</div>
            </div>
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <div className="text-lg font-bold text-amber-500">{summary.partiallyCoveredCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Partial</div>
            </div>
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20">
              <div className="text-lg font-bold text-rose-500">{summary.uncoveredCount}</div>
              <div className="text-[10px] text-muted-foreground uppercase font-semibold">Uncovered</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground flex justify-between">
            <span>Total in scope:</span>
            <span className="font-semibold">{summary.totalRequirements}</span>
          </div>
        </Card>

        {/* Linked Tests Health */}
        <Card className="p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Linked Tests & Staleness
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight">
              {summary.totalLinkedTests}
            </span>
            <span className="text-xs text-muted-foreground">linked test cases</span>
          </div>
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-emerald-500 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Current & Valid:
              </span>
              <span className="font-semibold">{summary.currentValidTests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-500 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Stale (version lag):
              </span>
              <span className="font-semibold">{summary.staleTests}</span>
            </div>
          </div>
        </Card>

        {/* Orphan Tests & Audit */}
        <Card className="p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Traceability Audit
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-extrabold tracking-tight ${
                summary.orphanTests > 0 ? 'text-amber-500' : 'text-emerald-500'
              }`}
            >
              {summary.orphanTests}
            </span>
            <span className="text-xs text-muted-foreground">orphan tests (untraced)</span>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {summary.orphanTests === 0 ? (
              <span className="text-emerald-600 flex items-center gap-1 font-medium">
                ✓ 100% of test cases traced to requirements
              </span>
            ) : (
              <span className="text-amber-600 font-medium">
                ⚠ Tests exist without linked requirement provenance
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Dimension Breakdown Bar */}
      <Card className="p-5 shadow-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Test Design Dimension Completeness
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {summary.dimensionSummaries.map(dim => (
            <div key={dim.dimension} className="space-y-1.5 p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground">{dim.dimension}</span>
                <span className={`font-semibold ${getCoverageColor(dim.percentage)}`}>
                  {dim.percentage}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, dim.percentage))}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground flex justify-between">
                <span>Met:</span>
                <span>
                  {dim.coveredCount} / {dim.requiredCount} reqs
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
