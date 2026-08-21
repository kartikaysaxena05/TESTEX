/**
 * @file apps/desktop/src/renderer/features/dashboard/QualityWorkspace.tsx
 * Quality workspace module cards representing future QA areas with honest data availability indicators.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';

interface QualityModuleCardProps {
  readonly title: string;
  readonly path: string;
  readonly description: string;
}

function QualityModuleCard({
  title,
  path,
  description,
}: QualityModuleCardProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <Card variant="default" className="quality-card">
      <CardHeader>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <CardTitle level={4} style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
            {title}
          </CardTitle>
          <Badge variant="neutral">Not available</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="quality-card-status">
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-text-muted)',
            }}
          />
          <span>No data available for this project</span>
        </div>
        <p className="quality-card-note">{description}</p>
      </CardContent>

      <CardFooter>
        <Button variant="ghost" size="sm" onClick={() => navigate(path)}>
          View {title} →
        </Button>
      </CardFooter>
    </Card>
  );
}

export function QualityWorkspace(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <section aria-labelledby="quality-workspace-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3 id="quality-workspace-title" className="dashboard-section-title">
            Quality Engineering Workspace
          </h3>
          <span className="dashboard-section-subtitle">
            Autonomous testing modules and verification pipelines
          </span>
        </div>
      </div>

      <div className="quality-workspace-grid" data-testid="quality-workspace-grid">
        <QualityModuleCard
          title="Requirements"
          path="/requirements"
          description="Software specification analysis, user stories, and acceptance criteria."
        />

        <QualityModuleCard
          title="Test Cases"
          path="/test-cases"
          description="Synthesized test specifications and automated verification scenarios."
        />

        <QualityModuleCard
          title="Test Runs"
          path="/test-runs"
          description="Autonomous browser executions, step recordings, and outcome logs."
        />

        <QualityModuleCard
          title="Defects"
          path="/defects"
          description="Triaged anomalies, root-cause classifications, and defect reports."
        />

        <QualityModuleCard
          title="Reports"
          path="/reports"
          description="Quality metrics, test execution summaries, and release readiness analytics."
        />

        <Card variant="default" className="quality-card traceability-card">
          <CardHeader>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CardTitle level={4} style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                Traceability Matrix
              </CardTitle>
              <Badge variant="neutral">Not available</Badge>
            </div>
          </CardHeader>

          <CardContent>
            <p
              style={{
                margin: '0 0 10px 0',
                fontSize: '13px',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Requirement-to-test and defect coverage matrix will be established once project
              requirements and test artifacts are generated.
            </p>
          </CardContent>

          <CardFooter>
            <Button variant="ghost" size="sm" onClick={() => navigate('/traceability')}>
              Open Traceability Matrix →
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
