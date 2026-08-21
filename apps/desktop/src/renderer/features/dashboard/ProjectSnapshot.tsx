/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectSnapshot.tsx
 * Snapshot cards displaying real database-backed project metadata.
 */

import React, { useMemo } from 'react';
import { Card, CardContent } from '../../ui/Card.js';
import { Badge } from '../../ui/Badge.js';
import { formatDate } from '../../utils/date.js';
import type { ProjectDetails } from '@ai-quality/contracts';

export interface ProjectSnapshotProps {
  readonly project: ProjectDetails;
}

export function ProjectSnapshot({ project }: ProjectSnapshotProps): React.JSX.Element {
  const defaultEnv = useMemo(() => {
    return project.environments.find(e => e.isDefault) ?? null;
  }, [project.environments]);

  return (
    <section aria-labelledby="project-snapshot-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <h3 id="project-snapshot-title" className="dashboard-section-title">
          Project Snapshot
        </h3>
        <span className="dashboard-section-subtitle">Real persistent configuration</span>
      </div>

      <div className="dashboard-snapshot-grid" data-testid="project-snapshot-grid">
        <Card variant="default">
          <CardContent>
            <div className="snapshot-item">
              <span className="snapshot-label">Lifecycle Status</span>
              <div
                className="snapshot-value"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Badge
                  variant={project.status === 'ACTIVE' ? 'success' : 'neutral'}
                  dot={project.status === 'ACTIVE'}
                >
                  {project.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent>
            <div className="snapshot-item">
              <span className="snapshot-label">Environments</span>
              <div className="snapshot-value">
                {project.environments.length === 1
                  ? '1 configured'
                  : `${project.environments.length} configured`}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent>
            <div className="snapshot-item">
              <span className="snapshot-label">Default Environment</span>
              <div
                className="snapshot-value"
                title={defaultEnv ? `${defaultEnv.name} (${defaultEnv.type})` : undefined}
              >
                {defaultEnv ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span>{defaultEnv.name}</span>
                    <Badge variant="neutral">{defaultEnv.type}</Badge>
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                    None configured
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardContent>
            <div className="snapshot-item">
              <span className="snapshot-label">Last Updated</span>
              <div className="snapshot-value" style={{ fontSize: '13px' }}>
                {formatDate(project.updatedAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
