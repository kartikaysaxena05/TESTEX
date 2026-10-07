/**
 * @file apps/desktop/src/renderer/features/shell/MainAgentWorkspace.tsx
 * Center flexible workspace for the Codex-style product shell.
 * Hosts testing activities, progress indicators, or active routed quality screens.
 */

import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext.js';
import { useWorkspace } from '../../context/WorkspaceContext.js';
import { ScreenErrorBoundary } from '../../components/ScreenErrorBoundary.js';
import { Spinner, Badge } from '../../ui/index.js';
import { NoProjectEmptyState, NoSessionsEmptyState } from './ShellEmptyStates.js';

export function MainAgentWorkspace(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedProjectId, selectedProject, isLoadingDetails } = useProject();
  const { sessions, activeSession, createSession } = useWorkspace();

  // If loading project details during project switch, show safe loading indicator
  if (isLoadingDetails) {
    return (
      <div className="codex-workspace-loading" data-testid="codex-workspace-loading" role="status">
        <Spinner size="md" />
        <span>Loading project context...</span>
      </div>
    );
  }

  // If no project is selected and user is on default overview or workspace
  if (
    !selectedProjectId &&
    (location.pathname === '/' ||
      location.pathname === '/overview' ||
      location.pathname === '/workspace')
  ) {
    return <NoProjectEmptyState onOpenProjects={() => navigate('/projects')} />;
  }

  // If route is specific (e.g. /projects, /requirements, /defects, etc.), render routed screen
  const isDedicatedScreen =
    location.pathname !== '/' &&
    location.pathname !== '/overview' &&
    location.pathname !== '/workspace';

  if (isDedicatedScreen) {
    return (
      <div className="codex-routed-screen-container" data-testid="codex-routed-screen">
        <ScreenErrorBoundary
          key={location.pathname}
          onNavigateOverview={() => navigate('/workspace')}
        >
          <Outlet />
        </ScreenErrorBoundary>
      </div>
    );
  }

  const { sessionMessages } = useWorkspace();

  // Otherwise render the Codex Agent & Testing Activity Workspace
  return (
    <div className="codex-agent-activity-view" data-testid="codex-agent-activity-view">
      <div className="codex-workspace-hero">
        <div className="hero-left">
          <h2 className="hero-title">{selectedProject?.name ?? 'Workspace'}</h2>
          <span className="hero-subtitle">Autonomous Testing & Quality Workspace</span>
        </div>
        <div className="hero-actions">
          <Badge variant="success" dot>
            Engine V1–V7 Ready
          </Badge>
        </div>
      </div>

      <div className="codex-activity-stream" data-testid="codex-activity-stream">
        {sessions.length === 0 ? (
          <NoSessionsEmptyState
            onCreateSession={() => void createSession('Exploratory Testing Session')}
          />
        ) : sessionMessages.length === 0 ? (
          <div className="codex-session-activity-card">
            <div className="session-card-header">
              <span className="session-card-title">
                {activeSession?.title ?? 'Active Testing Session'}
              </span>
              <Badge variant={activeSession?.status === 'RUNNING' ? 'warning' : 'neutral'}>
                {activeSession?.status ?? 'IDLE'}
              </Badge>
            </div>
            <div className="session-card-body">
              <p className="session-card-desc">
                Engineering pipeline connected. Use the command composer below to run testing
                commands, or use the navigation sidebar to inspect requirements, execute browser
                tests, and triage defects.
              </p>
            </div>
          </div>
        ) : (
          <div className="codex-messages-timeline" role="log" aria-label="Command and Agent History">
            {sessionMessages.map(msg => (
              <div
                key={msg.id}
                className={`codex-message-bubble ${msg.role}`}
                data-testid={`activity-message-${msg.role}`}
              >
                <div className="message-header">
                  <span className="message-author">
                    {msg.role === 'user' ? 'You' : msg.role === 'tool' ? 'System / Tool' : 'AI Testing Agent'}
                  </span>
                  {msg.mode && <span className="message-mode-badge">{msg.mode}</span>}
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="message-content">
                  {/* Strict plain text rendering to prevent XSS */}
                  <span className="message-text">{msg.content}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Screen outlet for sub-routes if nested */}
      <ScreenErrorBoundary
        key={location.pathname}
        onNavigateOverview={() => navigate('/workspace')}
      >
        <Outlet />
      </ScreenErrorBoundary>
    </div>
  );
}
