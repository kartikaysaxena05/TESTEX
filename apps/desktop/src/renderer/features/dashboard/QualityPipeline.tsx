/**
 * @file apps/desktop/src/renderer/features/dashboard/QualityPipeline.tsx
 * Visual representation of the core V1–V4 Quality Engineering pipeline stages.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import type { ProjectQualityData } from './useSelectedProjectDetails.js';
import { formatCount, formatCoveragePercentage, getCoverageState } from './dashboard-metrics.js';

export interface QualityPipelineProps {
  readonly qualityData: ProjectQualityData;
}

interface PipelineStage {
  readonly id: string;
  readonly stepNumber: number;
  readonly name: string;
  readonly path: string;
  readonly statusLabel: string;
  readonly badgeVariant: 'success' | 'warning' | 'neutral';
  readonly subtext: string;
}

export function QualityPipeline({ qualityData }: QualityPipelineProps): React.JSX.Element {
  const navigate = useNavigate();
  const {
    source,
    indexStatus,
    requirementsSummary,
    embeddingStatus,
    testCasesTotal,
    coverageSummary,
  } = qualityData;

  const stages: readonly PipelineStage[] = [
    {
      id: 'repository',
      stepNumber: 1,
      name: 'Repository',
      path: '/source',
      statusLabel: indexStatus?.isIndexed ? 'Indexed' : source ? 'Attached' : 'Not Connected',
      badgeVariant: indexStatus?.isIndexed ? 'success' : source ? 'warning' : 'neutral',
      subtext: indexStatus?.summary
        ? `${formatCount(indexStatus.summary.filesIndexed)} files parsed`
        : source
          ? 'Source ready'
          : 'Attach folder',
    },
    {
      id: 'requirements',
      stepNumber: 2,
      name: 'Requirements',
      path: '/requirements',
      statusLabel: requirementsSummary
        ? `${formatCount(requirementsSummary.totalCount)} Specs`
        : 'Unable to load',
      badgeVariant:
        requirementsSummary && requirementsSummary.totalCount > 0 ? 'success' : 'neutral',
      subtext: requirementsSummary
        ? `${formatCount(requirementsSummary.countsByStatus?.ACTIVE)} active`
        : 'Import requirements',
    },
    {
      id: 'intelligence',
      stepNumber: 3,
      name: 'Intelligence',
      path: '/requirements',
      statusLabel: embeddingStatus?.totalIndexed
        ? `${embeddingStatus.totalIndexed} Vectors`
        : 'Ready',
      badgeVariant: embeddingStatus && embeddingStatus.totalIndexed > 0 ? 'success' : 'neutral',
      subtext: embeddingStatus ? 'Semantic embeddings' : 'Analysis engine',
    },
    {
      id: 'ai-tests',
      stepNumber: 4,
      name: 'AI Tests',
      path: '/test-cases',
      statusLabel:
        testCasesTotal !== null && testCasesTotal > 0
          ? `${formatCount(testCasesTotal)} Tests`
          : testCasesTotal === null
            ? 'Unable to load'
            : 'Pending',
      badgeVariant: testCasesTotal !== null && testCasesTotal > 0 ? 'success' : 'neutral',
      subtext:
        testCasesTotal !== null && testCasesTotal > 0
          ? 'Categorized tests'
          : testCasesTotal === null
            ? 'Test telemetry unavailable'
            : 'Generate from specs',
    },
    {
      id: 'traceability',
      stepNumber: 5,
      name: 'Traceability',
      path: '/traceability',
      statusLabel:
        getCoverageState(coverageSummary) === 'available'
          ? `${formatCoveragePercentage(coverageSummary)} Matrix`
          : getCoverageState(coverageSummary) === 'not-applicable'
            ? 'Not available yet'
            : 'Unable to load',
      badgeVariant:
        getCoverageState(coverageSummary) === 'available' &&
        coverageSummary!.overallCoveragePercentage! >= 80
          ? 'success'
          : getCoverageState(coverageSummary) === 'available'
            ? 'warning'
            : 'neutral',
      subtext:
        getCoverageState(coverageSummary) === 'available'
          ? `${formatCount(coverageSummary!.coveredCount)} covered`
          : getCoverageState(coverageSummary) === 'not-applicable'
            ? 'Add requirements to evaluate'
            : 'Coverage telemetry unavailable',
    },
  ];

  return (
    <section aria-labelledby="quality-pipeline-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3 id="quality-pipeline-title" className="dashboard-section-title">
            Quality Pipeline
          </h3>
          <span className="dashboard-section-subtitle">
            Core V1–V4 requirement-to-test lifecycle progression
          </span>
        </div>
      </div>

      <Card variant="default" className="pipeline-card">
        <CardContent>
          <div
            className="quality-pipeline-stages"
            role="region"
            aria-label="Quality Pipeline Stages"
          >
            {stages.map((stage, idx) => (
              <React.Fragment key={stage.id}>
                <div
                  className="pipeline-stage-node interactive"
                  onClick={() => navigate(stage.path)}
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(stage.path);
                    }
                  }}
                  data-testid={`pipeline-stage-${stage.id}`}
                  role="button"
                  aria-label={`Go to ${stage.name}`}
                >
                  <div className="pipeline-stage-header">
                    <span className="pipeline-stage-num">{stage.stepNumber}</span>
                    <span className="pipeline-stage-name">{stage.name}</span>
                  </div>

                  <div className="pipeline-stage-status">
                    <Badge variant={stage.badgeVariant} dot>
                      {stage.statusLabel}
                    </Badge>
                  </div>

                  <span className="pipeline-stage-subtext">{stage.subtext}</span>
                </div>

                {idx < stages.length - 1 && (
                  <div className="pipeline-stage-connector" aria-hidden="true">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
