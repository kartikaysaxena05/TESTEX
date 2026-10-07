/**
 * @file apps/desktop/src/renderer/features/dashboard/RecentProjectsPanel.tsx
 * Recent Projects dashboard panel with interactive selection and synchronization with ProjectContext.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext.js';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { formatDate } from '../../utils/date.js';
import type { ProjectSummary } from '@ai-quality/contracts';

export interface RecentProjectsPanelProps {
  readonly onCreateProject: () => void;
  readonly dbDisabled?: boolean;
}

const MAX_RECENT_PROJECTS = 5;

export function RecentProjectsPanel({
  onCreateProject,
  dbDisabled = false,
}: RecentProjectsPanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const { projects, setSelectedProjectId, isLoading } = useProject();

  // Sort real projects by updatedAt descending and cap at MAX_RECENT_PROJECTS
  const recentProjects = useMemo<readonly ProjectSummary[]>(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_RECENT_PROJECTS);
  }, [projects]);

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
  };

  return (
    <Card variant="default" className="recent-projects-panel" data-testid="recent-projects-panel">
      <CardHeader>
        <div className="recent-projects-header">
          <div>
            <CardTitle level={3} className="recent-projects-title">
              Recent Projects
            </CardTitle>
            <span className="recent-projects-subtitle">
              Select an active project workspace to begin inspection
            </span>
          </div>

          {recentProjects.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/projects')}
              data-testid="view-all-projects-btn"
            >
              View all projects ({projects.length}) →
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="recent-projects-loading" data-testid="recent-projects-loading">
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Loading projects...
            </span>
          </div>
        ) : recentProjects.length === 0 ? (
          <div className="recent-projects-empty" data-testid="recent-projects-empty">
            <div className="recent-projects-empty-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </div>
            <div className="recent-projects-empty-text">
              <span className="recent-projects-empty-title">No projects yet</span>
              <span className="recent-projects-empty-desc">
                Create your first project to begin requirement analysis and automated test
                intelligence.
              </span>
            </div>
            <Button variant="primary" size="sm" onClick={onCreateProject} disabled={dbDisabled}>
              Create Project
            </Button>
          </div>
        ) : (
          <div className="recent-projects-table-wrapper" role="table" aria-label="Recent Projects">
            <div className="recent-projects-table-header" role="row">
              <div className="th-cell th-name" role="columnheader">
                Project
              </div>
              <div className="th-cell th-default-env" role="columnheader">
                Default Target
              </div>
              <div className="th-cell th-envs" role="columnheader">
                Environments
              </div>
              <div className="th-cell th-status" role="columnheader">
                Status
              </div>
              <div className="th-cell th-updated" role="columnheader">
                Last Updated
              </div>
              <div className="th-cell th-action" role="columnheader">
                <span className="sr-only">Action</span>
              </div>
            </div>

            <div className="recent-projects-table-body" role="rowgroup">
              {recentProjects.map(project => (
                <div
                  key={project.id}
                  className="recent-project-row"
                  data-testid={`recent-project-row-${project.id}`}
                  role="row"
                  tabIndex={0}
                  onClick={() => handleSelectProject(project.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectProject(project.id);
                    }
                  }}
                  aria-label={`Select project ${project.name}`}
                >
                  <div className="td-cell td-name" role="cell">
                    <span className="project-row-name">{project.name}</span>
                    {project.description && (
                      <span className="project-row-desc">{project.description}</span>
                    )}
                  </div>

                  <div className="td-cell td-default-env" role="cell">
                    {project.defaultEnvironment ? (
                      <span className="env-pill">
                        <span className="env-name">{project.defaultEnvironment.name}</span>
                        <Badge variant="neutral">{project.defaultEnvironment.type}</Badge>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </div>

                  <div className="td-cell td-envs" role="cell">
                    <span className="envs-count-badge">
                      {project.environmentCount === 1
                        ? '1 env'
                        : `${project.environmentCount} envs`}
                    </span>
                  </div>

                  <div className="td-cell td-status" role="cell">
                    <Badge
                      variant={project.status === 'ACTIVE' ? 'success' : 'neutral'}
                      dot={project.status === 'ACTIVE'}
                    >
                      {project.status === 'ACTIVE' ? 'Active' : 'Archived'}
                    </Badge>
                  </div>

                  <div className="td-cell td-updated" role="cell">
                    <span className="project-updated-text">{formatDate(project.updatedAt)}</span>
                  </div>

                  <div className="td-cell td-action" role="cell">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => {
                        e.stopPropagation();
                        handleSelectProject(project.id);
                      }}
                      title={`Open workspace for ${project.name}`}
                      data-testid={`open-project-btn-${project.id}`}
                    >
                      Open Workspace →
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
