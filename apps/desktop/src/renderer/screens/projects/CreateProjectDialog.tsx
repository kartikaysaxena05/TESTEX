/**
 * @file apps/desktop/src/renderer/screens/projects/CreateProjectDialog.tsx
 * Dialog modal for creating a new project.
 */

import React, { useState } from 'react';
import { Dialog } from '../../ui/Dialog.js';
import { FormField } from '../../ui/FormField.js';
import { Input } from '../../ui/Input.js';
import { Textarea } from '../../ui/Textarea.js';
import { Button } from '../../ui/Button.js';
import { Alert } from '../../ui/Alert.js';
import { useProject } from '../../context/ProjectContext.js';

export interface CreateProjectDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated?: () => void;
}

export function CreateProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectDialogProps): React.JSX.Element {
  const { selectProjectOnCreate, refreshProjects } = useProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setDescription('');
    setErrorMessage(null);
    setNameError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

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
      if (!window.desktop?.projects?.create) {
        throw new Error('Project creation is not supported in this environment.');
      }

      const result = await window.desktop.projects.create({
        name: trimmedName,
        description: description.trim() || null,
      });

      if (result.ok) {
        selectProjectOnCreate(result.data);
        await refreshProjects();
        handleClose();
        onCreated?.();
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
      open={isOpen}
      onClose={handleClose}
      title="Create New Project"
      description="Initialize a new software testing project."
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-project-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Create Project
          </Button>
        </div>
      }
    >
      <form id="create-project-form" onSubmit={handleSubmit} noValidate>
        {errorMessage && (
          <div style={{ marginBottom: '16px' }}>
            <Alert variant="danger" title="Error creating project">
              {errorMessage}
            </Alert>
          </div>
        )}

        <FormField
          label="Project Name"
          htmlFor="create-project-name"
          required
          description="Maximum 120 characters."
          error={nameError ?? undefined}
        >
          <Input
            id="create-project-name"
            value={name}
            onChange={e => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g. E-Commerce Web App"
            invalid={Boolean(nameError)}
            disabled={isSubmitting}
            autoFocus
          />
        </FormField>

        <FormField
          label="Description"
          htmlFor="create-project-description"
          description="Optional summary or notes about this project (max 5000 chars)."
        >
          <Textarea
            id="create-project-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the application, scope, or quality objectives..."
            rows={4}
            disabled={isSubmitting}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
