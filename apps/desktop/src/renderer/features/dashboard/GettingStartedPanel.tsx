/**
 * @file apps/desktop/src/renderer/features/dashboard/GettingStartedPanel.tsx
 * Getting Started onboarding panel communicating core SQE workflow and quick start actions.
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card.js';
import { Button } from '../../ui/Button.js';

export interface GettingStartedPanelProps {
  readonly onCreateProject: () => void;
  readonly onBrowseProjects: () => void;
  readonly dbDisabled?: boolean;
}

interface WorkflowStep {
  readonly stepNumber: number;
  readonly title: string;
  readonly description: string;
}

const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    stepNumber: 1,
    title: 'Project',
    description: 'Create or select workspace',
  },
  {
    stepNumber: 2,
    title: 'Repository',
    description: 'Attach & index source code',
  },
  {
    stepNumber: 3,
    title: 'Requirements',
    description: 'Ingest & analyze specs',
  },
  {
    stepNumber: 4,
    title: 'AI Tests',
    description: 'Synthesize tests & traces',
  },
];

export function GettingStartedPanel({
  onCreateProject,
  onBrowseProjects,
  dbDisabled = false,
}: GettingStartedPanelProps): React.JSX.Element {
  return (
    <Card variant="default" className="getting-started-panel" data-testid="getting-started-panel">
      <CardHeader>
        <div className="getting-started-header-content">
          <CardTitle level={3} className="getting-started-title">
            Start your quality engineering workspace
          </CardTitle>
          <CardDescription className="getting-started-desc">
            Select an existing project or create a new one to connect source code, analyse
            requirements, generate test intelligence and build traceability.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {/* 4-Step Interactive Pipeline Workflow */}
        <div
          className="workflow-steps-container"
          role="region"
          aria-label="Quality Engineering Workflow"
        >
          {WORKFLOW_STEPS.map((step, idx) => (
            <React.Fragment key={step.stepNumber}>
              <div className="workflow-step-card" data-testid={`workflow-step-${step.stepNumber}`}>
                <div className="workflow-step-badge">{step.stepNumber}</div>
                <div className="workflow-step-info">
                  <span className="workflow-step-title">{step.title}</span>
                  <span className="workflow-step-desc">{step.description}</span>
                </div>
              </div>

              {idx < WORKFLOW_STEPS.length - 1 && (
                <div className="workflow-step-arrow" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
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

        {/* Action CTAs */}
        <div className="getting-started-actions">
          <Button
            variant="primary"
            onClick={onCreateProject}
            disabled={dbDisabled}
            data-testid="create-project-cta"
          >
            Create Project
          </Button>

          <Button variant="secondary" onClick={onBrowseProjects} data-testid="browse-projects-cta">
            Browse Projects
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
