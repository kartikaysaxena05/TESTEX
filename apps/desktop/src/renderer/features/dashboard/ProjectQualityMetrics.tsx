/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectQualityMetrics.tsx
 * High-density metric cards displaying real, database-backed QA metrics for the active project.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import type { ProjectQualityData } from './useSelectedProjectDetails.js';
import {
  formatCoveragePercentage,
  formatCount,
  getCoverageState,
  getReviewState,
} from './dashboard-metrics.js';

export interface ProjectQualityMetricsProps {
  readonly qualityData: ProjectQualityData;
}

export function ProjectQualityMetrics({
  qualityData,
}: ProjectQualityMetricsProps): React.JSX.Element {
  const navigate = useNavigate();
  const {
    requirementsSummary,
    testCasesTotal,
    coverageSummary,
    source,
    indexStatus,
    reviewQueueTotal,
  } = qualityData;

  const activeReqCount = requirementsSummary?.countsByStatus?.ACTIVE;
  const draftReqCount = requirementsSummary?.countsByStatus?.DRAFT;
  const coverageState = getCoverageState(coverageSummary);
  const reviewState = getReviewState(coverageSummary, reviewQueueTotal);

  return (
    <section aria-labelledby="project-metrics-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <h3 id="project-metrics-title" className="dashboard-section-title">
          Quality Metrics
        </h3>
        <span className="dashboard-section-subtitle">Real persistent telemetry</span>
      </div>

      <div className="dashboard-metrics-grid" data-testid="project-metrics-grid">
        {/* 1. Requirements */}
        <Card
          variant="default"
          className="metric-card interactive"
          onClick={() => navigate('/requirements')}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/requirements');
            }
          }}
          aria-label="View Requirements"
        >
          <CardContent>
            <div className="metric-header">
              <span className="metric-label">Requirements</span>
              {requirementsSummary ? (
                <Badge variant="neutral">
                  {requirementsSummary.totalCount === 1
                    ? '1 total'
                    : `${formatCount(requirementsSummary.totalCount)} total`}
                </Badge>
              ) : (
                <Badge variant="neutral">Not available</Badge>
              )}
            </div>

            <div className="metric-body">
              <div className="metric-value">
                {requirementsSummary &&
                formatCount(requirementsSummary.totalCount) !== 'Unable to load' ? (
                  formatCount(requirementsSummary.totalCount)
                ) : (
                  <span className="metric-na">Not available</span>
                )}
              </div>
              <div className="metric-subtext">
                {requirementsSummary
                  ? formatCount(activeReqCount) !== 'Unable to load'
                    ? `${formatCount(activeReqCount)} active${draftReqCount ? `, ${formatCount(draftReqCount)} draft` : ''}`
                    : 'Specification breakdown ready'
                  : 'No requirement telemetry'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Test Cases */}
        <Card
          variant="default"
          className="metric-card interactive"
          onClick={() => navigate('/test-cases')}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/test-cases');
            }
          }}
          aria-label="View Test Cases"
        >
          <CardContent>
            <div className="metric-header">
              <span className="metric-label">Test Cases</span>
              {testCasesTotal !== null && formatCount(testCasesTotal) !== 'Unable to load' ? (
                <Badge variant={testCasesTotal > 0 ? 'success' : 'neutral'}>
                  {testCasesTotal > 0 ? 'Synthesized' : '0 created'}
                </Badge>
              ) : (
                <Badge variant="neutral">Not available</Badge>
              )}
            </div>

            <div className="metric-body">
              <div className="metric-value">
                {testCasesTotal !== null && formatCount(testCasesTotal) !== 'Unable to load' ? (
                  formatCount(testCasesTotal)
                ) : (
                  <span className="metric-na">Not available</span>
                )}
              </div>
              <div className="metric-subtext">
                {testCasesTotal !== null
                  ? testCasesTotal > 0
                    ? 'Automated & categorized tests'
                    : 'Generate from requirements'
                  : 'No test data available'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Traceability Coverage */}
        <Card
          variant="default"
          className="metric-card interactive"
          onClick={() => navigate('/traceability')}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/traceability');
            }
          }}
          aria-label="View Traceability Matrix"
        >
          <CardContent>
            <div className="metric-header">
              <span className="metric-label">Coverage</span>
              {coverageState === 'available' ? (
                <Badge
                  variant={
                    coverageSummary!.overallCoveragePercentage! >= 80
                      ? 'success'
                      : coverageSummary!.overallCoveragePercentage! >= 50
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {formatCoveragePercentage(coverageSummary)}
                </Badge>
              ) : (
                <Badge variant="neutral">
                  {coverageState === 'not-applicable' ? 'Not available yet' : 'Unable to load'}
                </Badge>
              )}
            </div>

            <div className="metric-body">
              <div className="metric-value">
                {coverageState === 'available' ? (
                  formatCoveragePercentage(coverageSummary)
                ) : (
                  <span className="metric-na">{formatCoveragePercentage(coverageSummary)}</span>
                )}
              </div>
              <div className="metric-subtext">
                {coverageState === 'available' && coverageSummary
                  ? `${coverageSummary.coveredCount} covered, ${coverageSummary.uncoveredCount} uncovered`
                  : coverageState === 'not-applicable'
                    ? 'Add requirements to evaluate coverage'
                    : 'Coverage telemetry unavailable'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Test Health & Reviews */}
        <Card
          variant="default"
          className="metric-card interactive"
          onClick={() => navigate('/test-cases')}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/test-cases');
            }
          }}
          aria-label="View Stale and Review Tests"
        >
          <CardContent>
            <div className="metric-header">
              <span className="metric-label">Stale & Reviews</span>
              {reviewState === 'available' ? (
                <Badge
                  variant={
                    coverageSummary!.staleTests > 0 || reviewQueueTotal! > 0 ? 'warning' : 'success'
                  }
                >
                  {coverageSummary!.staleTests > 0 || reviewQueueTotal! > 0 ? 'Attention' : 'Clean'}
                </Badge>
              ) : (
                <Badge variant="neutral">Unable to load</Badge>
              )}
            </div>

            <div className="metric-body">
              <div className="metric-value">
                {reviewState === 'available' ? (
                  coverageSummary!.staleTests
                ) : (
                  <span className="metric-na">Unable to load</span>
                )}
              </div>
              <div className="metric-subtext">
                {reviewState === 'available'
                  ? `${coverageSummary!.staleTests} stale tests, ${reviewQueueTotal!} in review`
                  : 'Stale and review telemetry unavailable'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5. Repository Indexing */}
        <Card
          variant="default"
          className="metric-card interactive"
          onClick={() => navigate('/source')}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/source');
            }
          }}
          aria-label="View Source Repository"
        >
          <CardContent>
            <div className="metric-header">
              <span className="metric-label">Repository Index</span>
              <Badge
                variant={
                  indexStatus?.isIndexed
                    ? 'success'
                    : indexStatus?.isRunning
                      ? 'warning'
                      : source
                        ? 'neutral'
                        : 'neutral'
                }
              >
                {indexStatus?.isIndexed
                  ? 'Indexed'
                  : indexStatus?.isRunning
                    ? 'Indexing'
                    : source
                      ? 'Connected'
                      : 'Unattached'}
              </Badge>
            </div>

            <div className="metric-body">
              <div className="metric-value" style={{ fontSize: '18px' }}>
                {indexStatus?.isIndexed
                  ? 'Indexed'
                  : indexStatus?.isRunning
                    ? 'In Progress'
                    : source
                      ? 'Ready to Index'
                      : 'Not Attached'}
              </div>
              <div className="metric-subtext">
                {indexStatus?.summary
                  ? `${formatCount(indexStatus.summary.filesIndexed)} files, ${formatCount(indexStatus.summary.symbolsIndexed)} symbols`
                  : source
                    ? 'Local folder attached'
                    : 'Attach local repository'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
