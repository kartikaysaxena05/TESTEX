/**
 * @file apps/desktop/src/renderer/screens/projects/EditProjectDialog.tsx
 * Dialog modal for editing an active project's metadata.
 */

import React, { useState, useEffect } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Textarea } from '../../ui/Textarea.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { useProject } from '../../context/ProjectContext.js';
import type { ProjectSummary } from '@ai-quality/contracts';

export interface EditProjectDialogProps {
  readonly project: ProjectSummary | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUpdated?: () => void;
}

export function EditProjectDialog({
  project,
  isOpen,
  onClose,
  onUpdated,
}: EditProjectDialogProps): React.JSX.Element {
  const { refreshProjects } = useProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
    }
    setErrorMessage(null);
    setNameError(null);
  }, [project]);

  const handleClose = () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setNameError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !project) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Project name is required.');
      return;
    }
    if (trimmedName.length > 120) {
      setNameError('Project name must be 120 characters or fewer.');
      return;
    }
    setNameError(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!window.desktop?.projects?.update) {
        throw new Error('Project editing is not supported in this environment.');
      }

      const result = await window.desktop.projects.update({
        projectId: project.id,
        name: trimmedName,
        description: description.trim() || null,
      });

      if (result.ok) {
        await refreshProjects();
        handleClose();
        onUpdated?.();
      } else {
        setErrorMessage(result.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen && Boolean(project)}
      onClose={handleClose}
      title={`Edit Project: ${project?.name ?? ''}`}
      description="Update the project name and description."
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="edit-project-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Save Changes
          </Button>
        </div>
      }
    >
      <form id="edit-project-form" onSubmit={handleSubmit} noValidate>
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger" title="Error saving changes">
              {errorMessage}
            </Alert>
          </div>
        )}

        <FormField
          label="Project Name"
          htmlFor="edit-project-name"
          required
          description="Maximum 120 characters."
          error={nameError ?? undefined}
        >
          <Input
            id="edit-project-name"
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            invalid={Boolean(nameError)}
            disabled={isSubmitting}
            autoFocus
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="edit-project-description"
          description="Optional summary or notes about this project (max 5000 chars)."
        >
          <Textarea
            id="edit-project-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            disabled={isSubmitting}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
