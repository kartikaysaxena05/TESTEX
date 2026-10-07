/**
 * @file apps/desktop/src/renderer/features/dashboard/NeedsAttentionPanel.tsx
 * Actionable attention panel highlighting genuine QA conditions and alerts without invented data.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import type { ProjectDetails } from '@ai-quality/contracts';
import type { ProjectQualityData } from './useSelectedProjectDetails.js';
import { getCoverageState, getReviewState } from './dashboard-metrics.js';

export interface NeedsAttentionPanelProps {
  readonly project: ProjectDetails;
  readonly qualityData: ProjectQualityData;
}

interface AttentionItem {
  readonly id: string;
  readonly severity: 'warning' | 'info';
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly actionPath: string;
}

export function NeedsAttentionPanel({
  project,
  qualityData,
}: NeedsAttentionPanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const { coverageSummary, source, indexStatus, reviewQueueTotal } = qualityData;
  const coverageState = getCoverageState(coverageSummary);
  const reviewState = getReviewState(coverageSummary, reviewQueueTotal);

  const items: AttentionItem[] = [];

  // 1. Stale tests needing review
  if (reviewState === 'available' && coverageSummary!.staleTests > 0) {
    items.push({
      id: 'stale-tests',
      severity: 'warning',
      title: `${coverageSummary!.staleTests} stale test ${coverageSummary!.staleTests === 1 ? 'case' : 'cases'}`,
      description:
        'Requirement updates have invalidated linked test specifications. Review or regenerate tests.',
      actionLabel: 'Review Stale Tests',
      actionPath: '/test-cases',
    });
  }

  // 2. Uncovered requirements
  if (coverageState === 'available' && coverageSummary!.uncoveredCount > 0) {
    items.push({
      id: 'uncovered-reqs',
      severity: 'warning',
      title: `${coverageSummary!.uncoveredCount} uncovered ${coverageSummary!.uncoveredCount === 1 ? 'requirement' : 'requirements'}`,
      description:
        'Eligible requirements without verified test traces were detected in the matrix.',
      actionLabel: 'Open Matrix',
      actionPath: '/traceability',
    });
  }

  // 3. Pending test reviews in review queue
  if (reviewState === 'available' && reviewQueueTotal! > 0) {
    items.push({
      id: 'test-reviews',
      severity: 'info',
      title: `${reviewQueueTotal} test version ${reviewQueueTotal === 1 ? 'review' : 'reviews'} pending`,
      description: 'Newly generated or edited test cases are awaiting acceptance.',
      actionLabel: 'Open Review Queue',
      actionPath: '/test-cases',
    });
  }

  // 4. Repository not attached
  if (!source) {
    items.push({
      id: 'no-source',
      severity: 'info',
      title: 'No source repository connected',
      description:
        'Attach a local source code folder to enable AST symbol indexing and repository evidence matching.',
      actionLabel: 'Connect Repository',
      actionPath: '/source',
    });
  } else if (indexStatus && !indexStatus.isIndexed && !indexStatus.isRunning) {
    // 5. Attached but not indexed
    items.push({
      id: 'unindexed-source',
      severity: 'info',
      title: 'Repository index pending',
      description: 'Source code is attached but symbol index has not been parsed.',
      actionLabel: 'Index Repository',
      actionPath: '/source',
    });
  }

  // 6. Zero environments configured
  if (project.environments.length === 0) {
    items.push({
      id: 'no-environments',
      severity: 'info',
      title: 'No test environments configured',
      description: 'Configure target URLs and environment types for automated test runs.',
      actionLabel: 'Add Environment',
      actionPath: '/projects',
    });
  }

  const telemetryUnavailable = coverageState === 'unknown' || reviewState === 'unknown';

  return (
    <section aria-labelledby="attention-panel-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 id="attention-panel-title" className="dashboard-section-title">
            Needs Attention
          </h3>
          {items.length > 0 ? (
            <Badge variant="warning">{items.length} actionable</Badge>
          ) : telemetryUnavailable ? (
            <Badge variant="neutral">Unable to verify</Badge>
          ) : (
            <Badge variant="success" dot>
              Nominal
            </Badge>
          )}
        </div>
        <span className="dashboard-section-subtitle">Real quality alerts & recommendations</span>
      </div>

      <Card variant="default" className="attention-card" data-testid="needs-attention-card">
        <CardHeader>
          <div className="attention-card-header">
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {items.length > 0
                ? 'Action Required'
                : telemetryUnavailable
                  ? 'Unable to verify status'
                  : 'Status Clean'}
            </span>
          </div>
        </CardHeader>

        <CardContent>
          {items.length === 0 ? (
            <div className="attention-nominal-state" data-testid="attention-nominal-state">
              <div className="nominal-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={telemetryUnavailable ? 'var(--color-text-muted)' : 'var(--color-success)'}
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="nominal-text">
                <span className="nominal-title">
                  {telemetryUnavailable
                    ? 'Attention status unavailable'
                    : 'Nothing requires attention'}
                </span>
                <span className="nominal-desc">
                  {telemetryUnavailable
                    ? 'Some quality telemetry could not be loaded. Retry from the Overview refresh control.'
                    : 'All loaded requirements, test cases, and repository configurations are up to date.'}
                </span>
              </div>
            </div>
          ) : (
            <div className="attention-items-list" role="list">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`attention-item-row severity-${item.severity}`}
                  data-testid={`attention-item-${item.id}`}
                  role="listitem"
                >
                  <div className="attention-item-content">
                    <div className="attention-item-title-row">
                      <Badge variant={item.severity === 'warning' ? 'warning' : 'neutral'} dot>
                        {item.severity === 'warning' ? 'Action' : 'Notice'}
                      </Badge>
                      <span className="attention-item-title">{item.title}</span>
                    </div>
                    <p className="attention-item-desc">{item.description}</p>
                  </div>

                  <div className="attention-item-action">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(item.actionPath)}
                      title={item.actionLabel}
                    >
                      {item.actionLabel} →
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
