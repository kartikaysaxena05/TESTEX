/**
 * @file apps/desktop/src/renderer/features/dashboard/index.ts
 * Module barrel exports for Project Dashboard feature.
 */

export { ProjectDashboard } from './ProjectDashboard.js';
export { GettingStartedPanel, type GettingStartedPanelProps } from './GettingStartedPanel.js';
export { PlatformHealthPanel } from './PlatformHealthPanel.js';
export { RecentProjectsPanel, type RecentProjectsPanelProps } from './RecentProjectsPanel.js';
export { ProjectHeader, type ProjectHeaderProps } from './ProjectHeader.js';
export { ProjectQualityMetrics, type ProjectQualityMetricsProps } from './ProjectQualityMetrics.js';
export { QualityPipeline, type QualityPipelineProps } from './QualityPipeline.js';
export { NeedsAttentionPanel, type NeedsAttentionPanelProps } from './NeedsAttentionPanel.js';
export { EnvironmentOverview, type EnvironmentOverviewProps } from './EnvironmentOverview.js';
export {
  useSelectedProjectDetails,
  type UseSelectedProjectDetailsResult,
  type ProjectQualityData,
} from './useSelectedProjectDetails.js';
export {
  usePlatformHealth,
  type PlatformHealthState,
  type ServiceHealthItem,
  type HealthBadgeStatus,
} from './usePlatformHealth.js';
