/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectDashboard.tsx
 * Orchestrator component for the Project Dashboard.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelectedProjectDetails } from './useSelectedProjectDetails.js';
import { ProjectHeader } from './ProjectHeader.js';
import { ProjectSnapshot } from './ProjectSnapshot.js';
import { EnvironmentOverview } from './EnvironmentOverview.js';
import { QualityWorkspace } from './QualityWorkspace.js';
import { EmptyState } from '../../ui/EmptyState.js';
import { Alert } from '../../ui/Alert.js';
import { Skeleton } from '../../ui/Skeleton.js';
import { Button } from '../../ui/Button.js';

export function ProjectDashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const { selectedProjectId, project, isLoading, error, dbStatus, refresh } =
    useSelectedProjectDetails();

  // 1. Database Connectivity Issues
  if (dbStatus === 'unavailable') {
    return (
      <div style={{ padding: '8px 0' }} data-screen="overview">
        <Alert variant="danger" title="Database Unavailable">
          The PostgreSQL database is currently unreachable. Start your database server to view and
          manage project dashboards.
        </Alert>
      </div>
    );
  }

  if (dbStatus === 'not-configured') {
    return (
      <div style={{ padding: '8px 0' }} data-screen="overview">
        <Alert variant="warning" title="Database Not Configured">
          DATABASE_URL is not configured in your environment. Configure a PostgreSQL connection
          string to persist and load projects.
        </Alert>
      </div>
    );
  }

  // 2. No Selected Project State
  if (!selectedProjectId) {
    return (
      <EmptyState
        screenId="overview"
        title="No Project Selected"
        description="Select a project from the sidebar selector or create a new project to inspect its quality engineering workspace."
        action={
          <Button variant="primary" onClick={() => navigate('/projects')}>
            Go to Projects
          </Button>
        }
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
        }
      />
    );
  }

  // 3. Loading Skeleton State
  if (isLoading && !project) {
    return (
      <div
        className="dashboard-skeleton-container"
        data-testid="dashboard-loading-skeleton"
        data-screen="overview"
      >
        {/* Header Skeleton */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '16px' }}
        >
          <Skeleton width={260} height={28} />
          <Skeleton width={420} height={18} />
        </div>

        {/* Snapshot Skeletons */}
        <div className="dashboard-snapshot-grid">
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>

        {/* Environments Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width={180} height={22} />
          <Skeleton height={120} />
        </div>

        {/* Quality Workspace Skeletons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width={220} height={22} />
          <div className="quality-workspace-grid">
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        </div>
      </div>
    );
  }

  // 4. Project Fetch Error / Missing Project State
  if (error) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}
        data-screen="overview"
      >
        <Alert variant="danger" title="Unable to Load Project Dashboard">
          {error}
        </Alert>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            Go to Projects
          </Button>
        </div>
      </div>
    );
  }

  // 5. Loaded Project Dashboard State
  if (project) {
    return (
      <div className="project-dashboard" data-testid="project-dashboard" data-screen="overview">
        <ProjectHeader project={project} />
        <ProjectSnapshot project={project} />
        <EnvironmentOverview project={project} />
        <QualityWorkspace />
      </div>
    );
  }

  return <div />;
}
