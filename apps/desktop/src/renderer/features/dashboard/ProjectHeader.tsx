/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectHeader.tsx
 * Header component displaying selected project identity, status, and description.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import type { ProjectDetails } from '@ai-quality/contracts';

export interface ProjectHeaderProps {
  readonly project: ProjectDetails;
}

export function ProjectHeader({ project }: ProjectHeaderProps): React.JSX.Element {
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
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/projects')}
          title="Open project configuration and environments in Projects screen"
        >
          Manage Project
        </Button>
      </div>
    </header>
  );
}
