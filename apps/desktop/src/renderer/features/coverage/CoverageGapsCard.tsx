/**
 * @file apps/desktop/src/renderer/features/coverage/CoverageGapsCard.tsx
 * Prioritized coverage gaps widget highlighting requirements that urgently need tests or updates.
 */

import React from 'react';
import type { CoverageGapDto } from '@ai-quality/contracts';
import type { BadgeVariant } from '../../ui/index.js';
import { Card, Badge } from '../../ui/index.js';

interface CoverageGapsCardProps {
  readonly gaps: readonly CoverageGapDto[];
  readonly onSelectRequirement?: (requirementId: string) => void;
}

export function CoverageGapsCard({
  gaps,
  onSelectRequirement,
}: CoverageGapsCardProps): React.JSX.Element {
  if (gaps.length === 0) {
    return (
      <Card className="p-5 bg-emerald-500/5 border border-emerald-500/20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-full font-bold">✓</div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              No Critical Coverage Gaps Detected
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              All active requirements meet their required test-design dimensions with eligible, non-stale tests.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const getCategoryBadge = (category: string): { label: string; variant: BadgeVariant } => {
    switch (category) {
      case 'NO_TESTS':
        return { label: 'No Tests Linked', variant: 'danger' };
      case 'ALL_TESTS_STALE':
        return { label: 'All Tests Stale', variant: 'warning' };
      case 'ALL_TESTS_REJECTED':
        return { label: 'Validation Rejected', variant: 'danger' };
      case 'MISSING_DIMENSION':
        return { label: 'Missing Dimension', variant: 'warning' };
      default:
        return { label: category, variant: 'neutral' };
    }
  };

  return (
    <Card className="p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <span>Prioritized Coverage Gaps</span>
            <Badge variant="danger">{gaps.length}</Badge>
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Requirements requiring test generation, dimension completion, or version re-linking
          </p>
        </div>
      </div>

      <div className="divide-y border rounded-lg overflow-hidden bg-card">
        {gaps.slice(0, 5).map(gap => {
          const catInfo = getCategoryBadge(gap.category);
          return (
            <div
              key={gap.requirementId}
              onClick={() => onSelectRequirement?.(gap.requirementId)}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">
                    {gap.requirementKey}
                  </span>
                  <Badge variant="neutral" className="text-[10px]">
                    {gap.priority}
                  </Badge>
                  <Badge variant={catInfo.variant} className="text-[10px]">
                    {catInfo.label}
                  </Badge>
                </div>
                <div className="text-xs font-medium text-foreground">{gap.requirementTitle}</div>
                <div className="text-[11px] text-muted-foreground">{gap.description}</div>
              </div>

              {gap.missingDimensions.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground mr-1">Missing:</span>
                  {gap.missingDimensions.map(d => (
                    <span
                      key={d}
                      className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded text-[10px] font-semibold"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
