/**
 * @file apps/desktop/src/renderer/features/dashboard/index.ts
 * Module barrel exports for Project Dashboard feature.
 */

export { ProjectDashboard } from './ProjectDashboard.js';
export { ProjectHeader, type ProjectHeaderProps } from './ProjectHeader.js';
export { ProjectSnapshot, type ProjectSnapshotProps } from './ProjectSnapshot.js';
export { EnvironmentOverview, type EnvironmentOverviewProps } from './EnvironmentOverview.js';
export { QualityWorkspace } from './QualityWorkspace.js';
export {
  useSelectedProjectDetails,
  type UseSelectedProjectDetailsResult,
} from './useSelectedProjectDetails.js';
