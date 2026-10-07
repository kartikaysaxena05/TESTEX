/**
 * @file apps/desktop/src/renderer/features/shell/ShellEmptyStates.tsx
 * Canonical empty state components for the Codex-style product shell.
 * Zero fabricated mock data; purely factual states.
 */

import React from 'react';
import { EmptyState, Button } from '../../ui/index.js';

export interface NoProjectEmptyStateProps {
  readonly onOpenProjects?: () => void;
}

export function NoProjectEmptyState({
  onOpenProjects,
}: NoProjectEmptyStateProps): React.JSX.Element {
  return (
    <div className="shell-empty-state-container" data-testid="no-project-empty-state">
      <div className="codex-empty-workspace-hero">
        <h2 className="empty-hero-title">AI Quality Platform</h2>
        <p className="empty-hero-subtitle">
          No Project Selected — Start by opening a project or creating a new one.
        </p>
        <div className="empty-hero-capabilities">
          <span className="capabilities-heading">You will be able to:</span>
          <ul className="capabilities-list">
            <li>analyze requirements</li>
            <li>generate test cases</li>
            <li>execute browser tests</li>
            <li>investigate failures</li>
            <li>review defects</li>
            <li>produce QA reports</li>
          </ul>
        </div>
        <div className="empty-hero-actions">
          <Button variant="primary" size="md" onClick={onOpenProjects ?? (() => {})}>
            Open Projects Directory
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface NoSessionsEmptyStateProps {
  readonly onCreateSession?: () => void;
}

export function NoSessionsEmptyState({
  onCreateSession,
}: NoSessionsEmptyStateProps): React.JSX.Element {
  return (
    <div className="shell-empty-state-container" data-testid="no-sessions-empty-state">
      <EmptyState
        title="No Active Testing Sessions"
        description="This project currently has no recorded testing sessions. Launch a testing session or execute a test plan to view live activity."
        action={
          onCreateSession ? (
            <Button variant="secondary" size="sm" onClick={onCreateSession}>
              New Testing Session
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export function NoSessionActivityEmptyState(): React.JSX.Element {
  return (
    <div className="shell-empty-state-container" data-testid="no-session-activity-empty-state">
      <EmptyState
        title="Ready for Testing Commands"
        description="No commands or agent activity recorded in this session yet. Ask the AI agent below to analyze requirements, generate test specifications, or execute browser tests."
      />
    </div>
  );
}

export function NoActiveContextEmptyState(): React.JSX.Element {
  return (
    <div className="shell-empty-state-container" data-testid="no-active-context-empty-state">
      <EmptyState
        title="No Context Selected"
        description="Select a test run, requirement, failure case, or source file to inspect execution artifacts, evidence, and code context."
      />
    </div>
  );
}
