/**
 * @file apps/desktop/src/renderer/features/requirements/ViewRequirementModal.tsx
 * Modal dialog displaying complete persisted details and lifecycle actions for a selected requirement.
 */

import React from 'react';
import type { RequirementDto } from '@ai-quality/contracts';
import { Button, Badge, type BadgeVariant } from '../../ui/index.js';
import { RequirementProvenanceView } from './RequirementProvenanceView.js';
import { RequirementRepresentationView } from './RequirementRepresentationView.js';
import { RequirementClassificationView } from './RequirementClassificationView.js';
import { RequirementQualityView } from './RequirementQualityView.js';
import { RequirementRelationshipsView } from './RequirementRelationshipsView.js';
import { RequirementEvidenceView } from './RequirementEvidenceView.js';
import { RequirementHistoryView } from './RequirementHistoryView.js';
import { RequirementImpactView } from './RequirementImpactView.js';
import { RequirementAiAnalysisView } from './RequirementAiAnalysisView.js';
import { RequirementTestDesignView } from './RequirementTestDesignView.js';
import { RequirementScenariosView } from './RequirementScenariosView.js';
import { RequirementCategorizedTestsView } from './RequirementCategorizedTestsView.js';
import { RequirementTestSpecificationsView } from './RequirementTestSpecificationsView.js';
import { RequirementLinkedTracesView } from './RequirementLinkedTracesView.js';

interface ViewRequirementModalProps {
  readonly requirement: RequirementDto | null;
  readonly isArchivedProject?: boolean;
  readonly onClose: () => void;
  readonly onEdit: (req: RequirementDto) => void;
  readonly onActivate?: (req: RequirementDto) => void;
  readonly onDeprecate?: (req: RequirementDto) => void;
  readonly onDraft?: (req: RequirementDto) => void;
  readonly onArchiveToggle: (req: RequirementDto) => void;
  readonly onDelete: (req: RequirementDto) => void;
}

export function ViewRequirementModal({
  requirement,
  isArchivedProject = false,
  onClose,
  onEdit,
  onActivate,
  onDeprecate,
  onDraft,
  onArchiveToggle,
  onDelete,
}: ViewRequirementModalProps): React.JSX.Element | null {
  if (!requirement) return null;

  const getPriorityVariant = (priority: string): BadgeVariant => {
    switch (priority) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'DRAFT':
        return 'neutral';
      case 'ARCHIVED':
        return 'neutral';
      case 'DEPRECATED':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-requirement-title"
    >
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2.5 py-1 rounded">
              {requirement.requirementKey}
            </span>
            <h2
              id="view-requirement-title"
              className="text-base font-semibold text-neutral-100 line-clamp-1"
            >
              {requirement.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 transition-colors p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant={getStatusVariant(requirement.status)}>
              {`Status: ${requirement.status}`}
            </Badge>
            <Badge variant="neutral">{`Type: ${requirement.type}`}</Badge>
            <Badge variant={getPriorityVariant(requirement.priority)}>
              {`Priority: ${requirement.priority}`}
            </Badge>
            {requirement.requirementSourceName && (
              <Badge variant="neutral">{`Source: ${requirement.requirementSourceName}`}</Badge>
            )}
          </div>

          {/* Original requirement text */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Original Requirement Text
            </h3>
            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-200 font-normal whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {requirement.originalText}
            </div>
          </div>

          {/* Provenance & Timestamps */}
          <div className="grid grid-cols-2 gap-4 text-xs text-neutral-400 border-t border-neutral-800/80 pt-4">
            <div>
              <span className="text-neutral-300 font-medium">Created:</span>{' '}
              {new Date(requirement.createdAt).toLocaleString()}
            </div>
            <div>
              <span className="text-neutral-300 font-medium">Last Updated:</span>{' '}
              {new Date(requirement.updatedAt).toLocaleString()}
            </div>
          </div>

          {/* Source Provenance & Cryptographic Audit View */}
          <RequirementProvenanceView requirement={requirement} />

          {/* Structured Representation & Normalization View */}
          <RequirementRepresentationView
            requirement={requirement}
            isArchivedProject={isArchivedProject}
          />

          {/* Classification & Metadata Enrichment View (Phase 38) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Classification & Metadata Enrichment
            </h3>
            <RequirementClassificationView
              projectId={requirement.projectId}
              requirementId={requirement.id}
            />
          </div>

          {/* Quality, Testability & Ambiguity Analysis View (Phase 39) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Quality, Testability & Ambiguity Analysis
            </h3>
            <RequirementQualityView
              projectId={requirement.projectId}
              requirementId={requirement.id}
            />
          </div>

          {/* Relationships & Dependencies View (Phase 40) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Requirement Dependencies & Relationships
            </h3>
            <RequirementRelationshipsView
              projectId={requirement.projectId}
              requirementId={requirement.id}
            />
          </div>

          {/* Repository Evidence Mapping View (Phase 40) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Repository Evidence & Source Mapping
            </h3>
            <RequirementEvidenceView
              projectId={requirement.projectId}
              requirementId={requirement.id}
            />
          </div>

          {/* Version History & Diff Analysis (Phase 41) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Version History & Diff Analysis
            </h3>
            <RequirementHistoryView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              onRequirementRestored={onEdit}
            />
          </div>

          {/* Change Impact Analysis (Phase 41) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Change Impact Candidates & Review
            </h3>
            <RequirementImpactView
              projectId={requirement.projectId}
              requirementId={requirement.id}
            />
          </div>

          {/* AI Requirement Analysis & Reasoning (Phase 47) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3 flex items-center gap-2">
              <span>✨</span>
              <span>LLM Requirement Analysis & Reasoning</span>
            </h3>
            <RequirementAiAnalysisView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              isArchivedProject={isArchivedProject}
            />
          </div>

          {/* Test Design Intelligence (Phase 48) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
              <span>🎯</span>
              <span>Test Design Intelligence & Strategy</span>
            </h3>
            <RequirementTestDesignView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              isArchivedProject={isArchivedProject}
            />
          </div>

          {/* Candidate Test Scenarios (Phase 49) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-2">
              <span>📋</span>
              <span>Candidate Test Scenarios</span>
            </h3>
            <RequirementScenariosView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              isArchivedProject={isArchivedProject}
            />
          </div>

          {/* Categorized Test Designs (Phase 50) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-teal-400 mb-3 flex items-center gap-2">
              <span>🧪</span>
              <span>Categorized Test Designs (Positive, Negative, Boundary, Validation)</span>
            </h3>
            <RequirementCategorizedTestsView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              isArchivedProject={isArchivedProject}
            />
          </div>

          {/* Test Specifications: Preconditions, Test Data & Expected Results (Phase 51) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <RequirementTestSpecificationsView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              requirementKey={requirement.requirementKey}
            />
          </div>

          {/* Requirement-to-Test Traceability (Phase 54) */}
          <div className="border-t border-neutral-800/80 pt-4">
            <RequirementLinkedTracesView
              projectId={requirement.projectId}
              requirementId={requirement.id}
              isArchivedProject={isArchivedProject}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {!isArchivedProject && (
              <>
                {requirement.status === 'DRAFT' && onActivate && (
                  <Button variant="primary" size="sm" onClick={() => onActivate(requirement)}>
                    Activate
                  </Button>
                )}
                {requirement.status === 'ACTIVE' && onDeprecate && (
                  <Button variant="secondary" size="sm" onClick={() => onDeprecate(requirement)}>
                    Deprecate
                  </Button>
                )}
                {requirement.status === 'ACTIVE' && onDraft && (
                  <Button variant="secondary" size="sm" onClick={() => onDraft(requirement)}>
                    Move to Draft
                  </Button>
                )}
                {requirement.status === 'DEPRECATED' && onActivate && (
                  <Button variant="primary" size="sm" onClick={() => onActivate(requirement)}>
                    Re-Activate
                  </Button>
                )}
                {requirement.status !== 'ARCHIVED' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onArchiveToggle(requirement)}
                  >
                    Archive
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => onArchiveToggle(requirement)}>
                    Restore
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => onDelete(requirement)}>
                  Delete
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {!isArchivedProject && (
              <Button variant="secondary" size="sm" onClick={() => onEdit(requirement)}>
                Edit
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
