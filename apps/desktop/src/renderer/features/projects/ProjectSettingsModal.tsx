/**
 * @file apps/desktop/src/renderer/features/projects/ProjectSettingsModal.tsx
 * Project Settings modal providing metadata editing, archive/restore, and safe deletion.
 *
 * CRITICAL INVARIANTS:
 * 1. Safe deletion requires explicit user confirmation.
 * 2. Active projects must be archived before deletion or confirmed through archive->delete flow.
 * 3. Deleted projects immediately clear workspace context to prevent stale interaction.
 */

import React, { useState, useEffect, useRef } from "react";
import { useProject } from "../../context/ProjectContext.js";
import type { ProjectDetails } from "@ai-quality/contracts";
import { Button } from "../../ui/Button.js";
import { Badge } from "../../ui/Badge.js";
import { Alert } from "../../ui/Alert.js";

export interface ProjectSettingsModalProps {
  readonly isOpen: boolean;
  readonly project: ProjectDetails;
  readonly onClose: () => void;
}

export function ProjectSettingsModal({
  isOpen,
  project,
  onClose,
}: ProjectSettingsModalProps): React.JSX.Element | null {
  const {
    updateProject,
    archiveProject,
    restoreProject,
    deleteProject,
    setSelectedProjectId,
  } = useProject();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [isFavorite, setIsFavorite] = useState(project.isFavorite ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isBusyRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setName(project.name);
      setDescription(project.description ?? "");
      setIsFavorite(project.isFavorite ?? false);
      setIsSaving(false);
      setIsArchiving(false);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
      setError(null);
      setSuccessMessage(null);
      isBusyRef.current = false;
    }
  }, [isOpen, project]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isBusyRef.current) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSaveMetadata(e: React.FormEvent) {
    e.preventDefault();
    if (isBusyRef.current) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name cannot be empty.");
      return;
    }
    if (trimmedName.length > 120) {
      setError("Project name must be 120 characters or fewer.");
      return;
    }

    const trimmedDesc = description.trim();
    if (trimmedDesc.length > 5000) {
      setError("Project description must be 5000 characters or fewer.");
      return;
    }

    isBusyRef.current = true;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateProject({
        projectId: project.id,
        name: trimmedName,
        description: trimmedDesc || null,
        isFavorite,
      });
      setSuccessMessage("Project settings updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project settings.");
    } finally {
      isBusyRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setIsArchiving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (project.status === "ACTIVE") {
        await archiveProject(project.id);
        setSuccessMessage("Project archived successfully.");
      } else {
        await restoreProject(project.id);
        setSuccessMessage("Project restored to active status.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle archive status.");
    } finally {
      isBusyRef.current = false;
      setIsArchiving(false);
    }
  }

  async function handleDelete() {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setIsDeleting(true);
    setError(null);

    try {
      // If project is ACTIVE, archive it first to satisfy deletion safety invariant
      if (project.status === "ACTIVE") {
        await archiveProject(project.id);
      }
      await deleteProject(project.id);
      setSelectedProjectId(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project.");
      setIsDeleting(false);
      isBusyRef.current = false;
    }
  }

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusyRef.current) onClose();
      }}
    >
      <div
        className="project-settings-modal bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        data-testid="project-settings-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <h2 id="project-settings-title" className="text-lg font-semibold text-neutral-100">
              Project Settings
            </h2>
            <Badge variant={project.status === "ACTIVE" ? "success" : "neutral"} dot>
              {project.status}
            </Badge>
          </div>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
            onClick={onClose}
            disabled={isSaving || isArchiving || isDeleting}
            aria-label="Close settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto flex flex-col gap-6">
          {error && (
            <Alert variant="danger" data-testid="project-settings-error">
              {error}
            </Alert>
          )}

          {successMessage && (
            <Alert variant="success" data-testid="project-settings-success">
              {successMessage}
            </Alert>
          )}

          {/* Metadata Form */}
          <form onSubmit={handleSaveMetadata} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-name-input" className="text-sm font-medium text-neutral-200">
                Project Name
              </label>
              <input
                id="settings-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={isSaving || isDeleting || project.status === "ARCHIVED"}
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 text-sm"
                data-testid="settings-project-name-input"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-desc-input" className="text-sm font-medium text-neutral-200">
                Description
              </label>
              <textarea
                id="settings-desc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
                rows={3}
                disabled={isSaving || isDeleting || project.status === "ARCHIVED"}
                className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 text-sm resize-none"
                data-testid="settings-project-desc-input"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="settings-favorite-input"
                type="checkbox"
                checked={isFavorite}
                onChange={(e) => setIsFavorite(e.target.checked)}
                disabled={isSaving || isDeleting || project.status === "ARCHIVED"}
                className="rounded-sm border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500"
                data-testid="settings-project-favorite-checkbox"
              />
              <label htmlFor="settings-favorite-input" className="text-sm text-neutral-300 select-none cursor-pointer">
                Pin to Favorites
              </label>
            </div>

            {project.status !== "ARCHIVED" && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSaving || !name.trim()}
                  data-testid="settings-save-btn"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </form>

          {/* Lifecycle & Status Section */}
          <div className="border-t border-neutral-800 pt-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-neutral-200">Lifecycle State</h3>
            <div className="flex items-center justify-between p-3 bg-neutral-800/60 rounded-lg border border-neutral-700">
              <div>
                <p className="text-sm font-medium text-neutral-200">
                  {project.status === "ACTIVE" ? "Archive Project" : "Restore Project"}
                </p>
                <p className="text-xs text-neutral-400">
                  {project.status === "ACTIVE"
                    ? "Archived projects are hidden from default views and cannot be modified."
                    : "Restore this project to active status to resume test operations."}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleToggleArchive}
                disabled={isArchiving || isDeleting}
                data-testid="settings-archive-toggle-btn"
              >
                {isArchiving
                  ? "Processing..."
                  : project.status === "ACTIVE"
                  ? "Archive"
                  : "Restore"}
              </Button>
            </div>
          </div>

          {/* Danger Zone: Permanent Deletion */}
          <div className="border-t border-red-900/40 pt-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            {!showDeleteConfirm ? (
              <div className="flex items-center justify-between p-3 bg-red-950/20 rounded-lg border border-red-900/30">
                <div>
                  <p className="text-sm font-medium text-red-300">Delete Project</p>
                  <p className="text-xs text-neutral-400">
                    Permanently delete this project workspace and its configuration.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  data-testid="settings-delete-open-btn"
                >
                  Delete...
                </Button>
              </div>
            ) : (
              <div
                className="p-4 bg-red-950/30 rounded-lg border border-red-800/60 flex flex-col gap-3"
                data-testid="settings-delete-confirm-panel"
              >
                <p className="text-sm font-medium text-red-200">
                  Delete &ldquo;{project.name}&rdquo;?
                </p>
                <p className="text-xs text-neutral-300">
                  This action is irreversible. All associated project environments and settings will be permanently removed.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={`Type "${project.name}" to confirm`}
                    className="flex-1 px-3 py-1.5 bg-neutral-900 border border-red-700/60 rounded-lg text-neutral-100 placeholder-neutral-500 text-xs focus:outline-hidden focus:border-red-500"
                    data-testid="settings-delete-confirm-input"
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting || deleteConfirmText !== project.name}
                    data-testid="settings-delete-confirm-btn"
                  >
                    {isDeleting ? "Deleting..." : "Delete Project"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText("");
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-800 bg-neutral-950/50">
          <span className="text-xs text-neutral-500 font-mono">ID: {project.id}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
