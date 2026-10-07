/**
 * @file apps/desktop/src/renderer/features/requirements/AddEditRequirementModal.tsx
 * Modal dialog for manually creating or editing a project requirement.
 */

import React, { useState, useEffect } from 'react';
import type {
  RequirementDto,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
  CreateRequirementInput,
  UpdateRequirementInput,
} from '@ai-quality/contracts';
import { Button, Input, Select, Textarea } from '../../ui/index.js';

interface AddEditRequirementModalProps {
  readonly isOpen: boolean;
  readonly editingRequirement?: RequirementDto | null;
  readonly defaultNextKey?: string;
  readonly isArchivedProject?: boolean;
  readonly onClose: () => void;
  readonly onSubmitCreate: (
    input: Omit<CreateRequirementInput, 'projectId'>,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly onSubmitUpdate: (
    requirementId: string,
    input: Omit<UpdateRequirementInput, 'projectId' | 'requirementId'>,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const REQUIREMENT_TYPES: { value: RequirementType; label: string }[] = [
  { value: 'FUNCTIONAL', label: 'Functional' },
  { value: 'NON_FUNCTIONAL', label: 'Non-Functional' },
  { value: 'BUSINESS_RULE', label: 'Business Rule' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'USABILITY', label: 'Usability' },
  { value: 'DATA', label: 'Data' },
  { value: 'INTEGRATION', label: 'Integration' },
  { value: 'CONSTRAINT', label: 'Constraint' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const REQUIREMENT_PRIORITIES: { value: RequirementPriority; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'UNSPECIFIED', label: 'Unspecified' },
];

const REQUIREMENT_STATUSES: { value: RequirementStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEPRECATED', label: 'Deprecated' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function AddEditRequirementModal({
  isOpen,
  editingRequirement,
  defaultNextKey = 'REQ-001',
  isArchivedProject = false,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: AddEditRequirementModalProps): React.JSX.Element | null {
  const isEditing = Boolean(editingRequirement);

  const [requirementKey, setRequirementKey] = useState<string>(
    editingRequirement ? editingRequirement.requirementKey : defaultNextKey || '',
  );
  const [title, setTitle] = useState<string>(editingRequirement?.title ?? '');
  const [originalText, setOriginalText] = useState<string>(editingRequirement?.originalText ?? '');
  const [type, setType] = useState<RequirementType>(editingRequirement?.type ?? 'FUNCTIONAL');
  const [priority, setPriority] = useState<RequirementPriority>(
    editingRequirement?.priority ?? 'MEDIUM',
  );
  const [status, setStatus] = useState<RequirementStatus>(editingRequirement?.status ?? 'ACTIVE');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (editingRequirement) {
        setRequirementKey(editingRequirement.requirementKey);
        setTitle(editingRequirement.title);
        setOriginalText(editingRequirement.originalText);
        setType(editingRequirement.type);
        setPriority(editingRequirement.priority);
        setStatus(editingRequirement.status);
      } else {
        setRequirementKey(defaultNextKey);
        setTitle('');
        setOriginalText('');
        setType('FUNCTIONAL');
        setPriority('MEDIUM');
        setStatus('ACTIVE');
      }
      setFieldErrors({});
      setSubmitError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, editingRequirement, defaultNextKey]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!isEditing && !requirementKey.trim()) {
      errors.requirementKey = 'Requirement key is required (e.g. REQ-001).';
    } else if (!isEditing && requirementKey.trim().length > 64) {
      errors.requirementKey = 'Requirement key must be 64 characters or fewer.';
    }

    if (!title.trim()) {
      errors.title = 'Requirement title is required.';
    } else if (title.trim().length > 255) {
      errors.title = 'Requirement title must be 255 characters or fewer.';
    }

    if (!originalText.trim()) {
      errors.originalText = 'Requirement text is required.';
    } else if (originalText.trim().length > 20000) {
      errors.originalText = 'Requirement text must be 20,000 characters or fewer.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isArchivedProject) return;

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    if (isEditing && editingRequirement) {
      const res = await onSubmitUpdate(editingRequirement.id, {
        title: title.trim(),
        originalText: originalText.trim(),
        type,
        priority,
        status,
      });

      if (res.ok) {
        onClose();
      } else {
        setSubmitError(res.error || 'Failed to update requirement.');
        setIsSubmitting(false);
      }
    } else {
      const res = await onSubmitCreate({
        requirementKey: requirementKey.trim(),
        title: title.trim(),
        originalText: originalText.trim(),
        type,
        priority,
        status,
      });

      if (res.ok) {
        onClose();
      } else {
        setSubmitError(res.error || 'Failed to create requirement.');
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="requirement-modal-title"
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] bg-[#161616] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0 bg-[#161616]">
          <h2 id="requirement-modal-title" className="text-lg font-semibold text-neutral-100">
            {isEditing
              ? `Edit Requirement: ${editingRequirement?.requirementKey}`
              : 'Add Manual Requirement'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-neutral-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 space-y-4 flex-1 overflow-y-auto overscroll-contain">
          {submitError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-rose-400">
              {submitError}
            </div>
          )}

          {isArchivedProject && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
              This project is archived and read-only. Requirements cannot be created or modified.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="req-key-input"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Requirement Key *
              </label>
              <Input
                id="req-key-input"
                value={requirementKey}
                onChange={e => setRequirementKey(e.target.value)}
                disabled={isEditing || isSubmitting || isArchivedProject}
                placeholder="e.g. REQ-001"
                aria-invalid={Boolean(fieldErrors.requirementKey)}
              />
              {fieldErrors.requirementKey && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.requirementKey}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="req-title-input"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Title *
              </label>
              <Input
                id="req-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={isSubmitting || isArchivedProject}
                placeholder="e.g. User Authentication & Session Lock"
                aria-invalid={Boolean(fieldErrors.title)}
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.title}</p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="req-text-input"
              className="block text-xs font-medium text-neutral-300 mb-1"
            >
              Original Requirement Text *
            </label>
            <Textarea
              id="req-text-input"
              rows={6}
              value={originalText}
              onChange={e => setOriginalText(e.target.value)}
              disabled={isSubmitting || isArchivedProject}
              placeholder="The system shall lock user accounts after 5 consecutive failed login attempts..."
              aria-invalid={Boolean(fieldErrors.originalText)}
            />
            {fieldErrors.originalText && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.originalText}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="req-type-select"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Type
              </label>
              <Select
                id="req-type-select"
                value={type}
                onChange={e => setType(e.target.value as RequirementType)}
                disabled={isSubmitting || isArchivedProject}
              >
                {REQUIREMENT_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label
                htmlFor="req-priority-select"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Priority
              </label>
              <Select
                id="req-priority-select"
                value={priority}
                onChange={e => setPriority(e.target.value as RequirementPriority)}
                disabled={isSubmitting || isArchivedProject}
              >
                {REQUIREMENT_PRIORITIES.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label
                htmlFor="req-status-select"
                className="block text-xs font-medium text-neutral-300 mb-1"
              >
                Status
              </label>
              <Select
                id="req-status-select"
                value={status}
                onChange={e => setStatus(e.target.value as RequirementStatus)}
                disabled={isSubmitting || isArchivedProject}
              >
                {REQUIREMENT_STATUSES.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

          <div className="px-6 py-4 border-t border-white/10 bg-[#141414] flex items-center justify-end gap-3 flex-shrink-0">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || isArchivedProject}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Requirement'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
