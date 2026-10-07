/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectHeader.tsx
 * Header component displaying selected project identity, status, description, and direct actions.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import type { ProjectDetails } from '@ai-quality/contracts';

export interface ProjectHeaderProps {
  readonly project: ProjectDetails;
  readonly onRefresh?: () => void;
}

export function ProjectHeader({ project, onRefresh }: ProjectHeaderProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <header className="dashboard-header" data-testid="dashboard-header">
      <div className="dashboard-header-info">
        <div className="dashboard-header-title-row">
          <h2 className="dashboard-project-title">{project.name}</h2>
          <Badge
            variant={project.status === 'ACTIVE' ? 'success' : 'neutral'}
            dot={project.status === 'ACTIVE'}
          >
            {project.status}
          </Badge>
        </div>

        <p className="dashboard-project-desc">
          {project.description ? (
            project.description
          ) : (
            <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
              No description provided.
            </span>
          )}
        </p>
      </div>

      <div className="dashboard-header-actions">
        {onRefresh ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            title="Reload project telemetry"
            aria-label="Refresh project telemetry"
            data-testid="header-action-refresh"
          >
            Refresh
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/source')}
          title="Inspect source code and repository structure"
          data-testid="header-action-source"
        >
          Source Code
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/requirements')}
          title="Manage and analyze software requirements"
          data-testid="header-action-requirements"
        >
          Requirements
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/test-cases')}
          title="View test cases and generate automated tests"
          data-testid="header-action-tests"
        >
          Test Cases
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/projects')}
          title="Open project configuration and environments in Projects screen"
          data-testid="header-action-manage"
        >
          Manage Project
        </Button>
      </div>
    </header>
  );
}
