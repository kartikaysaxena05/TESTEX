/**
 * @file apps/desktop/src/renderer/features/projects/CreateProjectModal.tsx
 * Accessible dialog for creating a new Project Workspace with double-click guard.
 *
 * CRITICAL INVARIANTS:
 * 1. Double-click and duplicate submission guard prevents race conditions.
 * 2. Strict runtime validation on name (1..120 chars) and description (<=5000 chars).
 * 3. Does not require or trigger source connection during initial creation.
 */

import React, { useState, useRef, useEffect } from "react";
import { useProject } from "../../context/ProjectContext.js";
import { Button } from "../../ui/Button.js";
import { Alert } from "../../ui/Alert.js";

export interface CreateProjectModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps): React.JSX.Element | null {
  const { createProject, setSelectedProjectId } = useProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setIsFavorite(false);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isSubmittingRef.current) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Guard against concurrent/double-click submission
    if (isSubmittingRef.current) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required.");
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

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const created = await createProject({
        name: trimmedName,
        description: trimmedDesc || null,
        isFavorite,
      });

      setSelectedProjectId(created.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="create-project-modal border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{
          background: '#161616',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 24px 60px -12px rgba(0, 0, 0, 0.9)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        data-testid="create-project-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 id="create-project-title" className="text-lg font-bold text-white tracking-tight">
            Create Project Workspace
          </h2>
          <button
            type="button"
            className="text-neutral-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <Alert variant="danger" data-testid="create-project-error">
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-name-input" className="text-xs font-semibold text-neutral-200">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              id="project-name-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Acme Web Store"
              disabled={isSubmitting}
              className="px-3 py-2 bg-[#181818] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
              data-testid="create-project-name-input"
              required
            />
            <span className="text-[11px] text-neutral-400 text-right">{name.length}/120</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-desc-input" className="text-xs font-semibold text-neutral-200">
              Description <span className="text-neutral-400 text-xs font-normal">(optional)</span>
            </label>
            <textarea
              id="project-desc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={3}
              placeholder="Brief description of application scope, target environments, or testing goals..."
              disabled={isSubmitting}
              className="px-3 py-2 bg-[#181818] border border-white/10 rounded-lg text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-sm resize-none transition-all"
              data-testid="create-project-desc-input"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="project-favorite-input"
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              disabled={isSubmitting}
              className="rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500"
              data-testid="create-project-favorite-checkbox"
            />
            <label htmlFor="project-favorite-input" className="text-xs font-medium text-neutral-300 select-none cursor-pointer">
              Pin to Favorites
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="create-project-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              data-testid="create-project-submit-btn"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
