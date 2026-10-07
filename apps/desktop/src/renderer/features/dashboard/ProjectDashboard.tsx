/**
 * @file apps/desktop/src/renderer/features/dashboard/ProjectDashboard.tsx
 * Orchestrator component for the SQE Platform Overview Dashboard.
 * Supports both NO PROJECT SELECTED (getting-started dashboard) and PROJECT SELECTED (quality metrics & pipeline).
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelectedProjectDetails } from './useSelectedProjectDetails.js';
import { GettingStartedPanel } from './GettingStartedPanel.js';
import { PlatformHealthPanel } from './PlatformHealthPanel.js';
import { RecentProjectsPanel } from './RecentProjectsPanel.js';
import { ProjectHeader } from './ProjectHeader.js';
import { ProjectQualityMetrics } from './ProjectQualityMetrics.js';
import { QualityPipeline } from './QualityPipeline.js';
import { NeedsAttentionPanel } from './NeedsAttentionPanel.js';
import { EnvironmentOverview } from './EnvironmentOverview.js';
import { CreateProjectDialog } from '../../screens/projects/CreateProjectDialog.js';
import { EmptyProjectSourceSelection } from '../projects/EmptyProjectSourceSelection.js';
import { Alert } from '../../ui/Alert.js';
import { Skeleton } from '../../ui/Skeleton.js';
import { Button } from '../../ui/Button.js';

export function ProjectDashboard(): React.JSX.Element {
  const navigate = useNavigate();
  const { selectedProjectId, project, qualityData, isLoading, error, dbStatus, refresh } =
    useSelectedProjectDetails();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 1. Database Connectivity Issues
  if (dbStatus === 'unavailable') {
    return (
      <div className="overview-container" data-screen="overview">
        <Alert variant="danger" title="Database Unavailable">
          The PostgreSQL database is currently unreachable. Start your database server to view and
          manage project dashboards.
        </Alert>
      </div>
    );
  }

  if (dbStatus === 'not-configured') {
    return (
      <div className="overview-container" data-screen="overview">
        <Alert variant="warning" title="Database Not Configured">
          DATABASE_URL is not configured in your environment. Configure a PostgreSQL connection
          string to persist and load projects.
        </Alert>
      </div>
    );
  }

  // 2. STATE 1 — No Selected Project State (Getting Started Dashboard)
  if (!selectedProjectId) {
    return (
      <div
        className="overview-container no-project-overview"
        data-testid="no-project-overview"
        data-screen="overview"
      >
        {/* Top Grid: Getting Started (2/3) + Platform Health (1/3) */}
        <div className="no-project-top-grid">
          <GettingStartedPanel
            onCreateProject={() => setIsCreateOpen(true)}
            onBrowseProjects={() => navigate('/projects')}
            dbDisabled={dbStatus !== 'connected'}
          />
          <PlatformHealthPanel />
        </div>

        {/* Lower Section: Recent Projects Panel */}
        <RecentProjectsPanel
          onCreateProject={() => setIsCreateOpen(true)}
          dbDisabled={dbStatus !== 'connected'}
        />

        {/* Embedded Create Project Dialog */}
        <CreateProjectDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      </div>
    );
  }

  // 3. Loading Skeleton State
  if (isLoading && !project) {
    return (
      <div
        className="overview-container dashboard-skeleton-container"
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

        {/* Metrics Grid Skeletons */}
        <div className="dashboard-metrics-grid">
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </div>

        {/* Pipeline Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width={180} height={22} />
          <Skeleton height={110} />
        </div>

        {/* Needs Attention Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width={200} height={22} />
          <Skeleton height={90} />
        </div>

        {/* Environments Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width={180} height={22} />
          <Skeleton height={120} />
        </div>
      </div>
    );
  }

  // 4. Project Fetch Error / Missing Project State
  if (error) {
    return (
      <div
        className="overview-container"
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
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

  // 5. STATE 2 — Loaded Project Dashboard State
  if (project) {
    const hasSource = Boolean(
      qualityData.source ||
      (project.websiteTargets && project.websiteTargets.length > 0) ||
      project.activeWebsiteTarget ||
      project.sourceState === 'WEBSITE_CONFIGURED' ||
      (project.repositoryConnections && project.repositoryConnections.length > 0) ||
      project.activeRepositoryConnection ||
      project.sourceState === 'REPOSITORY_CONFIGURED' ||
      project.localFolder ||
      project.sourceState === 'LOCAL_FOLDER_CONFIGURED' ||
      project.sourceState === 'BOTH_CONFIGURED' ||
      project.sourceState === 'MULTIPLE_CONFIGURED'
    );

    if (!hasSource) {
      return (
        <div
          className="overview-container project-dashboard"
          data-testid="project-dashboard"
          data-screen="overview"
        >
          <ProjectHeader project={project} onRefresh={() => void refresh()} />
          <EmptyProjectSourceSelection
            project={project}
            onWebsiteAdded={() => void refresh()}
            onRepositoryConnected={() => void refresh()}
            onLocalFolderConnected={() => void refresh()}
            onTargetEnvironmentConfigured={() => void refresh()}
          />
        </div>
      );
    }

    return (
      <div
        className="overview-container project-dashboard"
        data-testid="project-dashboard"
        data-screen="overview"
      >
        <ProjectHeader project={project} onRefresh={() => void refresh()} />
        <ProjectQualityMetrics qualityData={qualityData} />
        <QualityPipeline qualityData={qualityData} />
        <NeedsAttentionPanel project={project} qualityData={qualityData} />
        <EnvironmentOverview project={project} onRefresh={() => void refresh()} />
      </div>
    );
  }

  return <div />;
}
