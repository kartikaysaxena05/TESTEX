/**
 * @file apps/desktop/src/renderer/features/dashboard/EnvironmentOverview.tsx
 * Environment overview section displaying target testing configurations.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '../../ui/Table.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { Card, CardContent } from '../../ui/Card.js';
import type { ProjectDetails, ProjectEnvironmentDto } from '@ai-quality/contracts';

export interface EnvironmentOverviewProps {
  readonly project: ProjectDetails;
}

export function EnvironmentOverview({ project }: EnvironmentOverviewProps): React.JSX.Element {
  const navigate = useNavigate();

  // Deterministic ordering: default environment first, then sorted by name ascending
  const sortedEnvironments = useMemo<readonly ProjectEnvironmentDto[]>(() => {
    return [...project.environments].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [project.environments]);

  return (
    <section aria-labelledby="env-overview-title" className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3 id="env-overview-title" className="dashboard-section-title">
            Environment Overview
          </h3>
          <span className="dashboard-section-subtitle">
            Deployment targets and test execution addresses
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/projects')}
          title="Configure environments in Projects screen"
        >
          Manage Environments
        </Button>
      </div>

      {sortedEnvironments.length === 0 ? (
        <Card variant="default">
          <CardContent>
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <p
                style={{
                  margin: '0 0 12px 0',
                  color: 'var(--color-text-secondary)',
                  fontSize: '14px',
                }}
              >
                No environments configured for this project.
              </p>
              <Button variant="secondary" size="sm" onClick={() => navigate('/projects')}>
                Configure First Environment
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Environment Name</th>
              <th>Type</th>
              <th>Base URL</th>
              <th style={{ textAlign: 'right' }}>Default Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedEnvironments.map(env => (
              <tr key={env.id} data-testid={`dashboard-env-row-${env.id}`}>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {env.name}
                  </span>
                </td>
                <td>
                  <Badge variant={env.type === 'PRODUCTION' ? 'warning' : 'neutral'}>
                    {env.type}
                  </Badge>
                </td>
                <td>
                  {env.baseUrl ? (
                    <span className="env-url-text" title={env.baseUrl}>
                      {env.baseUrl}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {env.isDefault ? (
                    <Badge variant="success">Default Target</Badge>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
