import type { ProjectCoverageSummaryDto } from '@ai-quality/contracts';

export type DashboardMetricState = 'available' | 'not-applicable' | 'unknown';

export function isFiniteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function formatCount(value: unknown): string {
  return isFiniteCount(value) ? String(value) : 'Unable to load';
}

export function getCoverageState(summary: ProjectCoverageSummaryDto | null): DashboardMetricState {
  if (!summary) return 'unknown';
  if (!isFiniteCount(summary.totalRequirements) || summary.totalRequirements === 0) {
    return summary.totalRequirements === 0 ? 'not-applicable' : 'unknown';
  }
  if (
    !isFiniteCount(summary.eligibleRequirements) ||
    !isFiniteCount(summary.coveredCount) ||
    !isFiniteCount(summary.uncoveredCount) ||
    typeof summary.overallCoveragePercentage !== 'number' ||
    !Number.isFinite(summary.overallCoveragePercentage) ||
    summary.overallCoveragePercentage < 0 ||
    summary.overallCoveragePercentage > 100 ||
    summary.coveredCount > summary.eligibleRequirements ||
    summary.uncoveredCount > summary.eligibleRequirements
  ) {
    return 'unknown';
  }
  return 'available';
}

export function getReviewState(
  coverageSummary: ProjectCoverageSummaryDto | null,
  reviewQueueTotal: number | null,
): DashboardMetricState {
  if (!coverageSummary || !isFiniteCount(coverageSummary.staleTests)) return 'unknown';
  if (reviewQueueTotal === null || !isFiniteCount(reviewQueueTotal)) return 'unknown';
  return 'available';
}

export function formatCoveragePercentage(summary: ProjectCoverageSummaryDto | null): string {
  if (getCoverageState(summary) === 'not-applicable') return 'Not available yet';
  if (getCoverageState(summary) !== 'available' || !summary) return 'Unable to load';
  return `${Math.round(summary.overallCoveragePercentage!)}%`;
}
