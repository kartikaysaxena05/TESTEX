/**
 * @file apps/desktop/src/renderer/context/ProjectContext.tsx
 * Session-local project selection and active projects state provider.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ProjectSummary, ProjectDetails } from '@ai-quality/contracts';

interface ProjectContextValue {
  readonly projects: readonly ProjectSummary[];
  readonly activeProjects: readonly ProjectSummary[];
  readonly selectedProjectId: string | null;
  readonly selectedProject: ProjectSummary | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshProjects: () => Promise<void>;
  readonly setSelectedProjectId: (id: string | null) => void;
  readonly selectProjectOnCreate: (project: ProjectDetails) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export interface ProjectProviderProps {
  readonly children: React.ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps): React.JSX.Element {
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    if (!window.desktop?.projects?.list) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await window.desktop.projects.list({ status: 'ALL' });
      if (result.ok) {
        setProjects(result.data);
        setError(null);

        // If the selected project was archived or deleted, reset selection
        if (selectedProjectId) {
          const matchingActive = result.data.find(
            p => p.id === selectedProjectId && p.status === 'ACTIVE',
          );
          if (!matchingActive) {
            setSelectedProjectId(null);
          }
        }
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Failed to fetch projects.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const activeProjects = useMemo(() => {
    return projects.filter(p => p.status === 'ACTIVE');
  }, [projects]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return activeProjects.find(p => p.id === selectedProjectId) ?? null;
  }, [activeProjects, selectedProjectId]);

  const selectProjectOnCreate = useCallback((project: ProjectDetails) => {
    setSelectedProjectId(project.id);
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjects,
      selectedProjectId,
      selectedProject,
      isLoading,
      error,
      refreshProjects,
      setSelectedProjectId,
      selectProjectOnCreate,
    }),
    [
      projects,
      activeProjects,
      selectedProjectId,
      selectedProject,
      isLoading,
      error,
      refreshProjects,
      selectProjectOnCreate,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
