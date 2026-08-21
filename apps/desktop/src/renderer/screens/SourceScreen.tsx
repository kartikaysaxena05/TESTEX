/**
 * @file apps/desktop/src/renderer/screens/SourceScreen.tsx
 * Screen displaying attached source project configuration, Git state, structure, technology, frameworks, classification, secure content preview, and repository index intelligence.
 */

import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext.js';
import {
  useSelectedProjectSource,
  useSelectedProjectGit,
  useSelectedProjectStructure,
  useSelectedProjectTechnology,
  useSelectedProjectFrameworks,
  useSelectedProjectClassification,
  useSelectedProjectIndex,
  useSelectedProjectArchitecture,
  useSelectedProjectRunConfig,
  useSelectedProjectSnapshots,
  useSelectedProjectChanges,
  useSourceFileContent,
  SourceDetailsCard,
  GitDetailsCard,
  TechnologyProfileCard,
  FrameworkProfileCard,
  FileClassificationCard,
  RepositoryIndexCard,
  ApplicationArchitectureCard,
  RunConfigurationCard,
  RepositorySnapshotsCard,
  RepositoryChangesCard,
  RepositoryStructureCard,
  SourceFilePreviewModal,
  DetachSourceDialog,
  ChangeSourceDialog,
} from '../features/sources/index.js';
import { EmptyState, Button } from '../ui/index.js';
import { useNavigate } from 'react-router-dom';

export function SourceScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const { selectedProjectId } = useProject();

  const [isDetachDialogOpen, setIsDetachDialogOpen] = useState<boolean>(false);
  const [isChangeDialogOpen, setIsChangeDialogOpen] = useState<boolean>(false);
  const [isDetaching, setIsDetaching] = useState<boolean>(false);
  const [isChanging, setIsChanging] = useState<boolean>(false);
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);

  const {
    source,
    isLoading: isSourceLoading,
    attachLocalDirectory,
    detachSource,
    refreshMetadata,
  } = useSelectedProjectSource(selectedProjectId);

  const hasSource = source !== null && source.availability === 'AVAILABLE';

  const {
    gitStatus,
    isLoading: isGitLoading,
    refreshGitStatus,
  } = useSelectedProjectGit(selectedProjectId, hasSource);

  const {
    structure,
    isLoading: isStructureLoading,
    refreshStructure,
  } = useSelectedProjectStructure(selectedProjectId, hasSource);

  const {
    technologyProfile,
    isLoading: isTechnologyLoading,
    refreshTechnologyProfile,
  } = useSelectedProjectTechnology(selectedProjectId, hasSource);

  const {
    frameworkProfile,
    isLoading: isFrameworksLoading,
    refreshFrameworkProfile,
  } = useSelectedProjectFrameworks(selectedProjectId, hasSource);

  const {
    classificationProfile,
    isLoading: isClassificationLoading,
    refreshClassificationProfile,
  } = useSelectedProjectClassification(selectedProjectId, hasSource);

  const {
    indexStatus,
    isLoading: isIndexLoading,
    refreshIndex,
  } = useSelectedProjectIndex(selectedProjectId, hasSource);

  const {
    architectureProfile,
    isLoading: isArchitectureLoading,
    refreshArchitecture,
  } = useSelectedProjectArchitecture(selectedProjectId, hasSource);

  const {
    profile: runConfigProfile,
    isLoading: isRunConfigLoading,
    detectRunConfig,
    selectCandidate,
    updateTargetUrl,
  } = useSelectedProjectRunConfig(selectedProjectId, hasSource);

  const {
    snapshots,
    isLoading: isSnapshotsLoading,
    createSnapshot,
    setBaseline,
    deleteSnapshot,
  } = useSelectedProjectSnapshots(selectedProjectId, hasSource);

  const {
    changeSet,
    isLoading: isChangesLoading,
    refreshChanges,
  } = useSelectedProjectChanges(selectedProjectId, hasSource);

  const {
    fileContent: previewContent,
    isLoading: isPreviewLoading,
    error: previewError,
  } = useSourceFileContent(selectedProjectId, previewFilePath);

  if (!selectedProjectId) {
    return (
      <div className="source-screen-empty">
        <EmptyState
          title="No QA Project Selected"
          description="Select or create an active project to connect and manage its local software source code repository."
          action={
            <Button variant="primary" onClick={() => navigate('/projects')}>
              Go to Projects
            </Button>
          }
        />
      </div>
    );
  }

  const handleDetach = async () => {
    setIsDetaching(true);
    try {
      const success = await detachSource();
      if (success) {
        setIsDetachDialogOpen(false);
      }
    } finally {
      setIsDetaching(false);
    }
  };

  const handleChangeFolder = async () => {
    setIsChanging(true);
    try {
      const result = await attachLocalDirectory();
      if (result.success) {
        setIsChangeDialogOpen(false);
      }
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div
      className="source-screen"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
    >
      {source ? (
        <SourceDetailsCard
          source={source}
          isRefreshing={isSourceLoading}
          onRefreshMetadata={refreshMetadata}
          onChangeFolder={() => setIsChangeDialogOpen(true)}
          onDetach={() => setIsDetachDialogOpen(true)}
        />
      ) : (
        <EmptyState
          title="No Source Attached"
          description="Connect a local source repository folder to discover code structure, frameworks, file roles, and automated test opportunities."
          action={
            <Button
              variant="primary"
              onClick={async () => {
                await attachLocalDirectory();
              }}
              disabled={isSourceLoading}
            >
              Attach Local Directory
            </Button>
          }
        />
      )}

      {source && (
        <>
          <GitDetailsCard
            gitStatus={gitStatus}
            isRefreshing={isGitLoading}
            onRefreshGit={refreshGitStatus}
          />

          <TechnologyProfileCard
            profile={technologyProfile}
            isAnalyzing={isTechnologyLoading}
            onRefreshProfile={refreshTechnologyProfile}
          />

          <FrameworkProfileCard
            profile={frameworkProfile}
            isAnalyzing={isFrameworksLoading}
            onRefreshProfile={refreshFrameworkProfile}
          />

          <FileClassificationCard
            profile={classificationProfile}
            isAnalyzing={isClassificationLoading}
            onRefreshProfile={refreshClassificationProfile}
            onPreviewFile={(relPath: string) => setPreviewFilePath(relPath)}
          />

          <RepositoryIndexCard
            status={indexStatus}
            isIndexing={isIndexLoading}
            onRefreshIndex={refreshIndex}
          />

          <ApplicationArchitectureCard
            profile={architectureProfile}
            isAnalyzing={isArchitectureLoading}
            onRefreshProfile={refreshArchitecture}
          />

          <RunConfigurationCard
            profile={runConfigProfile}
            isLoading={isRunConfigLoading}
            onDetect={detectRunConfig}
            onSelectCandidate={selectCandidate}
            onUpdateTargetUrl={updateTargetUrl}
          />

          <RepositorySnapshotsCard
            snapshots={snapshots}
            isLoading={isSnapshotsLoading}
            onCreateSnapshot={createSnapshot}
            onSetBaseline={setBaseline}
            onDeleteSnapshot={deleteSnapshot}
          />

          <RepositoryChangesCard
            changeSet={changeSet}
            isLoading={isChangesLoading}
            onRefreshChanges={refreshChanges}
          />

          <RepositoryStructureCard
            structure={structure}
            isRefreshing={isStructureLoading}
            onRefreshStructure={refreshStructure}
          />
        </>
      )}

      {source && (
        <>
          <DetachSourceDialog
            isOpen={isDetachDialogOpen}
            isSubmitting={isDetaching}
            sourceName={source.displayName}
            onConfirm={handleDetach}
            onCancel={() => setIsDetachDialogOpen(false)}
          />

          <ChangeSourceDialog
            isOpen={isChangeDialogOpen}
            isSubmitting={isChanging}
            currentPath={source.rootPath}
            onConfirm={handleChangeFolder}
            onCancel={() => setIsChangeDialogOpen(false)}
          />

          <SourceFilePreviewModal
            isOpen={Boolean(previewFilePath)}
            relativePath={previewFilePath}
            contentDto={previewContent}
            isLoading={isPreviewLoading}
            error={previewError}
            onClose={() => setPreviewFilePath(null)}
          />
        </>
      )}
    </div>
  );
}
