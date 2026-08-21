/**
 * @file apps/desktop/src/renderer/screens/projects/ProjectEnvironmentsDialog.tsx
 * Dialog modal for managing deployment and test environments for a project.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { Table } from '../../ui/Table.js';
import { Badge } from '../../ui/Badge.js';
import { Button } from '../../ui/Button.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Select } from '../../ui/Select.js';
import { Alert } from '../../ui/Alert.js';
import { Spinner } from '../../ui/Spinner.js';
import { EmptyState } from '../../ui/EmptyState.js';
import { useProject } from '../../context/ProjectContext.js';
import type {
  ProjectSummary,
  ProjectDetails,
  ProjectEnvironmentDto,
  EnvironmentType,
} from '@ai-quality/contracts';

export interface ProjectEnvironmentsDialogProps {
  readonly project: ProjectSummary | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const ENVIRONMENT_TYPES: readonly { readonly value: EnvironmentType; readonly label: string }[] = [
  { value: 'DEVELOPMENT', label: 'Development' },
  { value: 'LOCAL', label: 'Local' },
  { value: 'TEST', label: 'Test / QA' },
  { value: 'STAGING', label: 'Staging' },
  { value: 'PRODUCTION', label: 'Production' },
  { value: 'CUSTOM', label: 'Custom' },
];

export function ProjectEnvironmentsDialog({
  project,
  isOpen,
  onClose,
}: ProjectEnvironmentsDialogProps): React.JSX.Element {
  const { refreshProjects } = useProject();

  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State for Add / Edit
  const [isAdding, setIsAdding] = useState(false);
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [envName, setEnvName] = useState('');
  const [envType, setEnvType] = useState<EnvironmentType>('DEVELOPMENT');
  const [envBaseUrl, setEnvBaseUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingEnv, setDeletingEnv] = useState<ProjectEnvironmentDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!project?.id || !window.desktop?.projects?.get) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await window.desktop.projects.get(project.id);
      if (res.ok) {
        setDetails(res.data);
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to load project details.');
    } finally {
      setIsLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (isOpen && project) {
      void fetchDetails();
      setIsAdding(false);
      setEditingEnvId(null);
      setErrorMessage(null);
      setFormError(null);
    }
  }, [isOpen, project, fetchDetails]);

  const resetForm = () => {
    setIsAdding(false);
    setEditingEnvId(null);
    setEnvName('');
    setEnvType('DEVELOPMENT');
    setEnvBaseUrl('');
    setFormError(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (env: ProjectEnvironmentDto) => {
    resetForm();
    setEditingEnvId(env.id);
    setEnvName(env.name);
    setEnvType(env.type);
    setEnvBaseUrl(env.baseUrl ?? '');
  };

  const handleSaveEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || isSubmitting) return;

    const trimmedName = envName.trim();
    if (!trimmedName) {
      setFormError('Environment name is required.');
      return;
    }
    if (trimmedName.length > 80) {
      setFormError('Environment name must be 80 characters or fewer.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      if (editingEnvId) {
        if (!window.desktop?.projects?.environments?.update) {
          throw new Error('Environment updates are not supported.');
        }
        const res = await window.desktop.projects.environments.update({
          projectId: project.id,
          environmentId: editingEnvId,
          name: trimmedName,
          type: envType,
          baseUrl: envBaseUrl.trim() || null,
        });
        if (!res.ok) {
          setFormError(res.error.message);
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!window.desktop?.projects?.environments?.create) {
          throw new Error('Environment creation is not supported.');
        }
        const res = await window.desktop.projects.environments.create({
          projectId: project.id,
          name: trimmedName,
          type: envType,
          baseUrl: envBaseUrl.trim() || null,
        });
        if (!res.ok) {
          setFormError(res.error.message);
          setIsSubmitting(false);
          return;
        }
      }

      resetForm();
      await fetchDetails();
      await refreshProjects();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (envId: string) => {
    if (!project || !window.desktop?.projects?.environments?.setDefault) return;
    try {
      const res = await window.desktop.projects.environments.setDefault({
        projectId: project.id,
        environmentId: envId,
      });
      if (res.ok) {
        await fetchDetails();
        await refreshProjects();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to set default environment.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!project || !deletingEnv || !window.desktop?.projects?.environments?.delete) return;
    setIsDeleting(true);
    try {
      const res = await window.desktop.projects.environments.delete({
        projectId: project.id,
        environmentId: deletingEnv.id,
      });
      if (res.ok) {
        setDeletingEnv(null);
        await fetchDetails();
        await refreshProjects();
      } else {
        setErrorMessage(res.error.message);
      }
    } catch {
      setErrorMessage('Failed to delete environment.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen && Boolean(project)}
        onClose={onClose}
        title={`Environments: ${project?.name ?? ''}`}
        description="Configure target URLs and endpoints for automated testing."
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            {!isAdding && !editingEnvId ? (
              <Button variant="secondary" size="sm" onClick={handleStartAdd}>
                + Add Environment
              </Button>
            ) : (
              <div />
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        }
      >
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger" title="Environment Error">
              {errorMessage}
            </Alert>
          </div>
        )}

        {(isAdding || editingEnvId) && (
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '6px',
              marginBottom: '20px',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
              {editingEnvId ? 'Edit Environment' : 'New Environment'}
            </h4>

            {formError && (
              <div style={{ marginBottom: '12px' }}>
                <Alert variant="danger">{formError}</Alert>
              </div>
            )}

            <form onSubmit={handleSaveEnvironment} noValidate>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <FormField
                  label="Environment Name"
                  htmlFor="env-name-input"
                  required
                  description="Max 80 chars."
                >
                  <Input
                    id="env-name-input"
                    value={envName}
                    onChange={e => setEnvName(e.target.value)}
                    placeholder="e.g. Local Dev, QA Server"
                    disabled={isSubmitting}
                    autoFocus
                  />
                </FormField>

                <FormField label="Type" htmlFor="env-type-select" required>
                  <Select
                    id="env-type-select"
                    value={envType}
                    onChange={e => setEnvType(e.target.value as EnvironmentType)}
                    disabled={isSubmitting}
                  >
                    {ENVIRONMENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <FormField
                label="Base URL"
                htmlFor="env-baseurl-input"
                description="Target application address (e.g. http://localhost:3000 or https://staging.example.com). No credentials."
              >
                <Input
                  id="env-baseurl-input"
                  value={envBaseUrl}
                  onChange={e => setEnvBaseUrl(e.target.value)}
                  placeholder="https://app.staging.example.com"
                  disabled={isSubmitting}
                />
              </FormField>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '12px',
                }}
              >
                <Button variant="ghost" size="sm" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {editingEnvId ? 'Save Changes' : 'Create Environment'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Spinner size="md" />
          </div>
        ) : details?.environments.length === 0 ? (
          <EmptyState
            title="No Environments Configured"
            description="Add an environment such as Local Dev or Staging to configure target test URLs."
            action={
              !isAdding && !editingEnvId ? (
                <Button variant="primary" size="sm" onClick={handleStartAdd}>
                  Add First Environment
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Base URL</th>
                <th>Default</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {details?.environments.map(env => (
                <tr key={env.id}>
                  <td style={{ fontWeight: 500 }}>{env.name}</td>
                  <td>
                    <Badge variant={env.type === 'PRODUCTION' ? 'danger' : 'neutral'}>
                      {env.type}
                    </Badge>
                  </td>
                  <td
                    style={{
                      color: env.baseUrl ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    {env.baseUrl || '—'}
                  </td>
                  <td>
                    {env.isDefault ? (
                      <Badge variant="success">Default</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(env.id)}
                        title="Set this environment as the project default"
                      >
                        Set Default
                      </Button>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(env)}
                        disabled={isAdding || Boolean(editingEnvId)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeletingEnv(env)}
                        disabled={isAdding || Boolean(editingEnvId)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Dialog>

      {/* Delete Environment Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingEnv)}
        onClose={() => setDeletingEnv(null)}
        title="Delete Environment?"
        description={`Are you sure you want to delete environment "${deletingEnv?.name ?? ''}"?`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="ghost" onClick={() => setDeletingEnv(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={isDeleting}
              disabled={isDeleting}
            >
              Delete Environment
            </Button>
          </div>
        }
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          This will remove the environment from the project. If this was the default environment,
          the project will temporarily have no default environment until another is selected.
        </p>
      </Dialog>
    </>
  );
}
