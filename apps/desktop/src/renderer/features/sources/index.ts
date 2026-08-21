/**
 * @file apps/desktop/src/renderer/features/sources/index.ts
 * Barrel export for source intelligence renderer features, hooks, and cards.
 */

export * from './useSelectedProjectSource.js';
export * from './useSelectedProjectGit.js';
export * from './useSelectedProjectStructure.js';
export * from './useSelectedProjectTechnology.js';
export * from './useSelectedProjectFrameworks.js';
export * from './useSelectedProjectClassification.js';
export * from './useSourceFileContent.js';
export * from './useSelectedProjectIndex.js';
export * from './useSelectedProjectArchitecture.js';
export * from './useSelectedProjectRunConfig.js';
export * from './useSelectedProjectSnapshots.js';
export * from './useSelectedProjectChanges.js';

export * from './SourceDetailsCard.js';
export * from './GitDetailsCard.js';
export * from './StructureTreeView.js';
export * from './RepositoryStructureCard.js';
export * from './TechnologyProfileCard.js';
export * from './FrameworkProfileCard.js';
export * from './FileClassificationCard.js';
export * from './SourceFilePreviewModal.js';
export * from './RepositoryIndexCard.js';
export * from './ApplicationArchitectureCard.js';
export * from './RunConfigurationCard.js';
export * from './RepositorySnapshotsCard.js';
export * from './RepositoryChangesCard.js';
export * from './DetachSourceDialog.js';
export * from './ChangeSourceDialog.js';
