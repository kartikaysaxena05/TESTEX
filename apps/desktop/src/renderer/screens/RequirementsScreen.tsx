/**
 * @file apps/desktop/src/renderer/screens/RequirementsScreen.tsx
 * Screen displaying project requirements list, summaries, filters, and manual CRUD management with lifecycle state transitions.
 */

import React, { useState, useMemo } from 'react';
import { useProject } from '../context/ProjectContext.js';
import {
  useSelectedProjectRequirements,
  AddEditRequirementModal,
  BulkAddRequirementsModal,
  ViewRequirementModal,
  DeleteRequirementDialog,
  RequirementDocumentsList,
} from '../features/requirements/index.js';
import type {
  RequirementDto,
  RequirementType,
  RequirementPriority,
  RequirementStatus,
} from '@ai-quality/contracts';
import {
  Button,
  Input,
  Select,
  Badge,
  EmptyState,
  Spinner,
  type BadgeVariant,
} from '../ui/index.js';

export function RequirementsScreen(): React.JSX.Element {
  const { selectedProjectId, selectedProject } = useProject();
  const isArchivedProject = selectedProject?.status === 'ARCHIVED';

  const {
    requirements,
    total,
    page,
    totalPages,
    summary,
    isLoading,
    error,
    filters,
    setPage,
    updateFilters,
    clearFilters,
    refetch,
    createRequirement,
    updateRequirement,
    activateRequirement,
    deprecateRequirement,
    draftRequirement,
    archiveRequirement,
    restoreRequirement,
    deleteRequirement,
  } = useSelectedProjectRequirements(selectedProjectId);

  const [activeTab, setActiveTab] = useState<'REQUIREMENTS' | 'DOCUMENTS'>('REQUIREMENTS');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState<boolean>(false);
  const [editingRequirement, setEditingRequirement] = useState<RequirementDto | null>(null);
  const [viewingRequirement, setViewingRequirement] = useState<RequirementDto | null>(null);
  const [deletingRequirement, setDeletingRequirement] = useState<RequirementDto | null>(null);

  // Compute next suggested requirement key (e.g. REQ-001, REQ-002, ...)
  const defaultNextKey = useMemo(() => {
    if (!total || total === 0) return 'REQ-001';
    const nextNum = total + 1;
    return `REQ-${String(nextNum).padStart(3, '0')}`;
  }, [total]);

  const handleOpenAdd = () => {
    setEditingRequirement(null);
    setIsAddModalOpen(true);
  };

  const handleOpenBulkAdd = () => {
    setIsBulkAddModalOpen(true);
  };

  const handleOpenEdit = (req: RequirementDto) => {
    setViewingRequirement(null);
    setEditingRequirement(req);
    setIsAddModalOpen(true);
  };

  const handleOpenView = (req: RequirementDto) => {
    setViewingRequirement(req);
  };

  const handleOpenDelete = (req: RequirementDto) => {
    setViewingRequirement(null);
    setDeletingRequirement(req);
  };

  const handleArchiveToggle = async (req: RequirementDto) => {
    if (req.status === 'ARCHIVED') {
      await restoreRequirement(req.id);
    } else {
      await archiveRequirement(req.id);
    }
    if (viewingRequirement && viewingRequirement.id === req.id) {
      setViewingRequirement(null);
    }
  };

  const handleActivate = async (req: RequirementDto) => {
    await activateRequirement(req.id);
    if (viewingRequirement && viewingRequirement.id === req.id) {
      setViewingRequirement(null);
    }
  };

  const handleDeprecate = async (req: RequirementDto) => {
    await deprecateRequirement(req.id);
    if (viewingRequirement && viewingRequirement.id === req.id) {
      setViewingRequirement(null);
    }
  };

  const handleDraft = async (req: RequirementDto) => {
    await draftRequirement(req.id);
    if (viewingRequirement && viewingRequirement.id === req.id) {
      setViewingRequirement(null);
    }
  };

  const getPriorityBadgeVariant = (priority: string): BadgeVariant => {
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

  const getStatusBadgeVariant = (status: string): BadgeVariant => {
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

  if (!selectedProjectId) {
    return (
      <div className="p-6">
        <EmptyState
          screenId="requirements-no-project"
          title="No Project Selected"
          description="Please select or create a project from the project switcher to manage requirements."
          icon={
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-neutral-100">Requirement Intelligence</h1>
            {summary && (
              <Badge variant="info">
                {summary.totalCount} {summary.totalCount === 1 ? 'Requirement' : 'Requirements'}
              </Badge>
            )}
            {isArchivedProject && <Badge variant="warning">Archived (Read-Only)</Badge>}
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Manual requirement management, specification tracking, identity integrity, and lifecycle
            state management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
          {activeTab === 'REQUIREMENTS' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenBulkAdd}
                disabled={isArchivedProject}
              >
                Bulk Add
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAdd}
                disabled={isArchivedProject}
              >
                + Add Requirement
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('REQUIREMENTS')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'REQUIREMENTS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
          }`}
        >
          <span>Requirements</span>
          {summary && (
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                activeTab === 'REQUIREMENTS'
                  ? 'bg-blue-800 text-white'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {summary.totalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DOCUMENTS')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === 'DOCUMENTS'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
          }`}
        >
          <span>Requirement Documents</span>
        </button>
      </div>

      {activeTab === 'DOCUMENTS' ? (
        <RequirementDocumentsList
          projectId={selectedProjectId}
          isArchivedProject={isArchivedProject}
        />
      ) : (
        <>
          {/* Summary status pills */}
          {summary && summary.totalCount > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                <span className="text-xs text-neutral-400">Active</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {summary.countsByStatus.ACTIVE}
                </span>
              </div>
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                <span className="text-xs text-neutral-400">Draft</span>
                <span className="text-sm font-semibold text-neutral-300">
                  {summary.countsByStatus.DRAFT}
                </span>
              </div>
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                <span className="text-xs text-neutral-400">Archived</span>
                <span className="text-sm font-semibold text-neutral-400">
                  {summary.countsByStatus.ARCHIVED}
                </span>
              </div>
              <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
                <span className="text-xs text-neutral-400">Deprecated</span>
                <span className="text-sm font-semibold text-amber-400">
                  {summary.countsByStatus.DEPRECATED}
                </span>
              </div>
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="p-4 bg-neutral-900/80 border border-neutral-800 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Input
                  placeholder="Search by key or title..."
                  value={filters.searchQuery ?? ''}
                  onChange={e => updateFilters({ searchQuery: e.target.value || undefined })}
                />
              </div>

              <div>
                <Select
                  value={filters.status ?? ''}
                  onChange={e =>
                    updateFilters({ status: (e.target.value as RequirementStatus) || undefined })
                  }
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="DEPRECATED">Deprecated</option>
                </Select>
              </div>

              <div>
                <Select
                  value={filters.type ?? ''}
                  onChange={e =>
                    updateFilters({ type: (e.target.value as RequirementType) || undefined })
                  }
                >
                  <option value="">All Types</option>
                  <option value="FUNCTIONAL">Functional</option>
                  <option value="NON_FUNCTIONAL">Non-Functional</option>
                  <option value="BUSINESS_RULE">Business Rule</option>
                  <option value="SECURITY">Security</option>
                  <option value="PERFORMANCE">Performance</option>
                  <option value="USABILITY">Usability</option>
                  <option value="DATA">Data</option>
                  <option value="INTEGRATION">Integration</option>
                  <option value="CONSTRAINT">Constraint</option>
                  <option value="UNKNOWN">Unknown</option>
                </Select>
              </div>

              <div>
                <Select
                  value={filters.priority ?? ''}
                  onChange={e =>
                    updateFilters({
                      priority: (e.target.value as RequirementPriority) || undefined,
                    })
                  }
                >
                  <option value="">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                  <option value="UNSPECIFIED">Unspecified</option>
                </Select>
              </div>
            </div>

            {(filters.searchQuery || filters.status || filters.type || filters.priority) && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Main Content State */}
          {isLoading && (
            <div className="p-12 flex flex-col items-center justify-center space-y-3">
              <Spinner size="md" />
              <p className="text-xs text-neutral-400">Loading requirements...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <span>⚠️</span>
                <span>Failed to load requirements</span>
              </div>
              <p className="text-xs text-rose-300">{error}</p>
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !error && requirements.length === 0 && (
            <div className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-xl">
              <EmptyState
                screenId="requirements-empty"
                title="No Requirements Available"
                description="No requirements recorded for this project yet. Add your first requirement manually to establish requirement traceability foundation."
                icon={
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                }
                action={
                  !isArchivedProject ? (
                    <div className="flex items-center gap-3">
                      <Button variant="secondary" onClick={handleOpenBulkAdd}>
                        Bulk Add Requirements
                      </Button>
                      <Button variant="primary" onClick={handleOpenAdd}>
                        + Add Requirement
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            </div>
          )}

          {!isLoading && !error && requirements.length > 0 && (
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-neutral-950/60 text-xs font-semibold uppercase text-neutral-400">
                        <th className="py-3 px-4">Key</th>
                        <th className="py-3 px-4">Title</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Priority</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Source</th>
                        <th className="py-3 px-4">Updated</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {requirements.map(req => (
                        <tr
                          key={req.id}
                          className="hover:bg-neutral-800/30 transition-colors group cursor-pointer"
                          onClick={() => handleOpenView(req)}
                        >
                          <td className="py-3.5 px-4 font-mono font-medium text-blue-400 whitespace-nowrap">
                            {req.requirementKey}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-neutral-200 max-w-md truncate">
                            {req.title}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-400">
                            {req.type}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <Badge variant={getPriorityBadgeVariant(req.priority)}>
                              {req.priority}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <Badge variant={getStatusBadgeVariant(req.status)}>{req.status}</Badge>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-400">
                            {req.requirementSourceName || 'Manual'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-xs text-neutral-500">
                            {new Date(req.updatedAt).toLocaleDateString()}
                          </td>
                          <td
                            className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap"
                            onClick={e => e.stopPropagation()}
                          >
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenView(req)}
                            >
                              View
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEdit(req)}
                              disabled={isArchivedProject}
                            >
                              Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer */}
                {totalPages > 1 && (
                  <div className="p-3 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400 bg-neutral-950/40">
                    <span>
                      Showing page {page} of {totalPages} ({total} total)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals & Dialogs */}
      <AddEditRequirementModal
        isOpen={isAddModalOpen}
        editingRequirement={editingRequirement}
        defaultNextKey={defaultNextKey}
        isArchivedProject={isArchivedProject}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingRequirement(null);
        }}
        onSubmitCreate={createRequirement}
        onSubmitUpdate={updateRequirement}
      />

      <BulkAddRequirementsModal
        isOpen={isBulkAddModalOpen}
        projectId={selectedProjectId}
        isArchivedProject={isArchivedProject}
        onClose={() => setIsBulkAddModalOpen(false)}
        onImportSuccess={() => {
          setIsBulkAddModalOpen(false);
          refetch();
        }}
      />

      <ViewRequirementModal
        requirement={viewingRequirement}
        isArchivedProject={isArchivedProject}
        onClose={() => setViewingRequirement(null)}
        onEdit={handleOpenEdit}
        onActivate={handleActivate}
        onDeprecate={handleDeprecate}
        onDraft={handleDraft}
        onArchiveToggle={handleArchiveToggle}
        onDelete={handleOpenDelete}
      />

      <DeleteRequirementDialog
        isOpen={Boolean(deletingRequirement)}
        requirement={deletingRequirement}
        onClose={() => setDeletingRequirement(null)}
        onConfirmDelete={deleteRequirement}
      />
    </div>
  );
}
