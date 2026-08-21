/**
 * @file apps/desktop/src/renderer/screens/ProjectsScreen.tsx
 * Comprehensive Project & Environment Management Screen.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/Button.js';
import { Table } from '../ui/Table.js';
import { Badge } from '../ui/Badge.js';
import { Tabs, TabList, Tab } from '../ui/Tabs.js';
import { Dialog } from '../ui/Dialog.js';
import { Alert } from '../ui/Alert.js';
import { Spinner } from '../ui/Spinner.js';
import { EmptyState } from '../ui/EmptyState.js';
import { useProject } from '../context/ProjectContext.js';
import { CreateProjectDialog } from './projects/CreateProjectDialog.js';
import { EditProjectDialog } from './projects/EditProjectDialog.js';
import { ProjectEnvironmentsDialog } from './projects/ProjectEnvironmentsDialog.js';
import { formatDate } from '../utils/date.js';
import type { ProjectSummary, DatabaseStatusState } from '@ai-quality/contracts';

export function ProjectsScreen(): React.JSX.Element {
  const { projects, isLoading, error: contextError, refreshProjects } = useProject();

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [dbStatus, setDbStatus] = useState<DatabaseStatusState>('connected');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [envProject, setEnvProject] = useState<ProjectSummary | null>(null);

  // Archive / Restore / Delete Dialogs state
  const [archivingProject, setArchivingProject] = useState<ProjectSummary | null>(null);
  const [restoringProject, setRestoringProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Inspect database health state on mount
  useEffect(() => {
    async function checkDb() {
      if (window.desktop?.database?.getStatus) {
        try {
          const res = await window.desktop.database.getStatus();
          if (res.ok) {
            setDbStatus(res.data.status);
          }
        } catch {
          setDbStatus('unavailable');
        }
      }
    }
    void checkDb();
  }, []);

  const activeProjects = useMemo(() => {
    return projects.filter(p => p.status === 'ACTIVE');
  }, [projects]);

  const archivedProjects = useMemo(() => {
    return projects.filter(p => p.status === 'ARCHIVED');
  }, [projects]);

  const handleArchiveConfirm = async () => {
    if (!archivingProject || !window.desktop?.projects?.archive) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await window.desktop.projects.archive(archivingProject.id);
      if (res.ok) {
        setArchivingProject(null);
        await refreshProjects();
      } else {
        setActionError(res.error.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to archive project.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!restoringProject || !window.desktop?.projects?.restore) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await window.desktop.projects.restore(restoringProject.id);
      if (res.ok) {
        setRestoringProject(null);
        await refreshProjects();
      } else {
        setActionError(res.error.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore project.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingProject || !window.desktop?.projects?.delete) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await window.desktop.projects.delete(deletingProject.id);
      if (res.ok) {
        setDeletingProject(null);
        await refreshProjects();
      } else {
        setActionError(res.error.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to permanently delete project.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 600 }}>Projects</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px' }}>
            Manage software projects, deployment targets, and testing environments.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          disabled={dbStatus !== 'connected'}
        >
          + New Project
        </Button>
      </div>

      {/* Database Status Warnings */}
      {dbStatus === 'unavailable' && (
        <Alert variant="danger" title="Database Unavailable">
          Project data is unavailable because the PostgreSQL connection could not be established.
          Ensure your database server is running.
        </Alert>
      )}

      {dbStatus === 'not-configured' && (
        <Alert variant="warning" title="Database Not Configured">
          DATABASE_URL is not configured in your environment. Configure a PostgreSQL connection
          string to persist projects.
        </Alert>
      )}

      {contextError && (
        <Alert variant="danger" title="Error Loading Projects">
          {contextError}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={tabId => setActiveTab(tabId as 'active' | 'archived')}>
        <TabList>
          <Tab value="active">{`Active (${activeProjects.length})`}</Tab>
          <Tab value="archived">{`Archived (${archivedProjects.length})`}</Tab>
        </TabList>
      </Tabs>

      {/* Content Area */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <Spinner size="md" />
        </div>
      ) : activeTab === 'active' ? (
        activeProjects.length === 0 ? (
          <EmptyState
            title="No Active Projects"
            description="Create your first software testing project to begin requirement analysis and automated test generation."
            action={
              <Button
                variant="primary"
                onClick={() => setIsCreateOpen(true)}
                disabled={dbStatus !== 'connected'}
              >
                Create Project
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Default Environment</th>
                <th>Environments</th>
                <th>Last Updated</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.map(project => (
                <tr key={project.id} data-testid={`project-row-${project.id}`}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {project.name}
                    </div>
                    {project.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                        }}
                      >
                        {project.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {project.defaultEnvironment ? (
                      <Badge variant="success">
                        {project.defaultEnvironment.name} ({project.defaultEnvironment.type})
                      </Badge>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        None
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge variant="neutral">{project.environmentCount} envs</Badge>
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {formatDate(project.updatedAt)}
                  </td>
                  <td>
                    <Badge variant="success">Active</Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingProject(project)}
                        title="Edit project details"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEnvProject(project)}
                        title="Manage environments"
                      >
                        Environments
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchivingProject(project)}
                        title="Archive project"
                      >
                        Archive
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : archivedProjects.length === 0 ? (
        <EmptyState
          title="No Archived Projects"
          description="Archived projects are preserved for historical reference and read-only inspection."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Environments</th>
              <th>Archived Date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {archivedProjects.map(project => (
              <tr key={project.id} data-testid={`archived-project-row-${project.id}`}>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {project.name}
                  </div>
                  {project.description && (
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        marginTop: '2px',
                      }}
                    >
                      {project.description}
                    </div>
                  )}
                </td>
                <td>
                  <Badge variant="neutral">{project.environmentCount} envs</Badge>
                </td>
                <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {formatDate(project.updatedAt)}
                </td>
                <td>
                  <Badge variant="neutral">Archived</Badge>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '6px' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRestoringProject(project)}
                      title="Restore project to active status"
                    >
                      Restore
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeletingProject(project)}
                      title="Permanently delete project"
                    >
                      Delete Permanently
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* Modals & Dialogs */}
      <CreateProjectDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />

      <EditProjectDialog
        project={editingProject}
        isOpen={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
      />

      <ProjectEnvironmentsDialog
        project={envProject}
        isOpen={Boolean(envProject)}
        onClose={() => setEnvProject(null)}
      />

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={Boolean(archivingProject)}
        onClose={() => setArchivingProject(null)}
        title="Archive Project?"
        description={`Archive "${archivingProject?.name ?? ''}"`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => setArchivingProject(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={handleArchiveConfirm}
              loading={actionLoading}
              disabled={actionLoading}
            >
              Archive Project
            </Button>
          </div>
        }
      >
        {actionError && (
          <div style={{ marginBottom: '12px' }}>
            <Alert variant="danger">{actionError}</Alert>
          </div>
        )}
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Archiving moves this project to read-only status and hides it from the active project
          selector. All environments and test configurations remain safely preserved. You can
          restore it at any time.
        </p>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={Boolean(restoringProject)}
        onClose={() => setRestoringProject(null)}
        title="Restore Project?"
        description={`Restore "${restoringProject?.name ?? ''}"`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => setRestoringProject(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRestoreConfirm}
              loading={actionLoading}
              disabled={actionLoading}
            >
              Restore to Active
            </Button>
          </div>
        }
      >
        {actionError && (
          <div style={{ marginBottom: '12px' }}>
            <Alert variant="danger">{actionError}</Alert>
          </div>
        )}
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Restoring this project will return it to active status, re-enable mutations, and make it
          selectable in the active project selector.
        </p>
      </Dialog>

      {/* Delete Permanently Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingProject)}
        onClose={() => setDeletingProject(null)}
        title="Permanently Delete Project?"
        description={`Delete "${deletingProject?.name ?? ''}" permanently`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => setDeletingProject(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={actionLoading}
              disabled={actionLoading}
            >
              Permanently Delete
            </Button>
          </div>
        }
      >
        {actionError && (
          <div style={{ marginBottom: '12px' }}>
            <Alert variant="danger">{actionError}</Alert>
          </div>
        )}
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--color-danger-text)' }}>Warning:</strong> This permanently
          removes <strong>{deletingProject?.name}</strong>, its settings, and all associated
          environments from PostgreSQL. This action <strong>cannot be undone</strong>.
        </p>
      </Dialog>
    </div>
  );
}
