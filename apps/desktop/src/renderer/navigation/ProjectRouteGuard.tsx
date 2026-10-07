/**
 * @file apps/desktop/src/renderer/navigation/ProjectRouteGuard.tsx
 * Safe Route Guard for deep-linked project and session routes.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Deep Link Safety: Invalid or cross-project deep links must NOT bypass ownership checks.
 * 2. Does not leak secrets, database paths, or cross-tenant project data.
 */

import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext.js';
import { useWorkspace } from '../context/WorkspaceContext.js';
import { EmptyState, Button } from '../ui/index.js';

export function ProjectRouteGuard(): React.JSX.Element {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId?: string }>();
  const navigate = useNavigate();
  const { projects, selectedProjectId, setSelectedProjectId, isLoading } = useProject();
  const { setActiveSessionId } = useWorkspace();

  const isMatched = useMemo(() => {
    if (!projectId) return false;
    return projects.some(p => p.id === projectId);
  }, [projectId, projects]);

  const accessDenied = !isMatched && (projects.length > 0 || !isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (!projectId) return;

    if (isMatched) {
      if (selectedProjectId !== projectId) {
        setSelectedProjectId(projectId);
      }
      if (sessionId) {
        setActiveSessionId(sessionId);
      }
    }
  }, [
    projectId,
    sessionId,
    isMatched,
    selectedProjectId,
    isLoading,
    setSelectedProjectId,
    setActiveSessionId,
  ]);

  if (accessDenied) {
    return (
      <div className="route-guard-denied" data-testid="route-guard-denied">
        <EmptyState
          title="Project Not Accessible"
          description="The requested project identifier does not exist or you do not have permission to access it."
          action={
            <Button variant="primary" size="md" onClick={() => navigate('/projects')}>
              View Available Projects
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="project-route-container" data-testid="project-route-container">
      {/* Routed into overview screen for active project */}
    </div>
  );
}
