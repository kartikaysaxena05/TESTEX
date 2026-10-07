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
    <div className="requirements-screen-container">
      {/* Header */}
      <div className="requirements-header">
        <div className="requirements-header-info">
          <div className="requirements-header-title-row">
            <h1 className="requirements-title">Requirement Intelligence</h1>
            {summary && (
              <Badge variant="info">
                {summary.totalCount} {summary.totalCount === 1 ? 'Requirement' : 'Requirements'}
              </Badge>
            )}
            {isArchivedProject && <Badge variant="warning">Archived (Read-Only)</Badge>}
          </div>
          <p className="requirements-subtitle">
            Manual requirement management, specification tracking, identity integrity, and lifecycle
            state management.
          </p>
        </div>

        <div className="requirements-header-actions">
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
      <nav className="requirements-tab-nav" aria-label="Requirement Views">
        <button
          type="button"
          onClick={() => setActiveTab('REQUIREMENTS')}
          className={`requirements-tab-btn ${activeTab === 'REQUIREMENTS' ? 'active' : ''}`}
          aria-current={activeTab === 'REQUIREMENTS' ? 'page' : undefined}
        >
          <span>Requirements</span>
          {summary && (
            <span className="requirements-tab-badge">
              {summary.totalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DOCUMENTS')}
          className={`requirements-tab-btn ${activeTab === 'DOCUMENTS' ? 'active' : ''}`}
          aria-current={activeTab === 'DOCUMENTS' ? 'page' : undefined}
        >
          <span>Requirement Documents</span>
        </button>
      </nav>

      {activeTab === 'DOCUMENTS' ? (
        <RequirementDocumentsList
          projectId={selectedProjectId}
          isArchivedProject={isArchivedProject}
        />
      ) : (
        <>
          {/* Summary status pills */}
          {summary && summary.totalCount > 0 && (
            <div className="requirements-metrics-grid">
              <div className="requirements-metric-card">
                <div className="requirements-metric-label">
                  <span className="requirements-metric-dot active" />
                  <span>Active</span>
                </div>
                <span className="requirements-metric-value text-emerald-400">
                  {summary.countsByStatus.ACTIVE}
                </span>
              </div>
              <div className="requirements-metric-card">
                <div className="requirements-metric-label">
                  <span className="requirements-metric-dot draft" />
                  <span>Draft</span>
                </div>
                <span className="requirements-metric-value text-neutral-300">
                  {summary.countsByStatus.DRAFT}
                </span>
              </div>
              <div className="requirements-metric-card">
                <div className="requirements-metric-label">
                  <span className="requirements-metric-dot archived" />
                  <span>Archived</span>
                </div>
                <span className="requirements-metric-value text-neutral-400">
                  {summary.countsByStatus.ARCHIVED}
                </span>
              </div>
              <div className="requirements-metric-card">
                <div className="requirements-metric-label">
                  <span className="requirements-metric-dot deprecated" />
                  <span>Deprecated</span>
                </div>
                <span className="requirements-metric-value text-amber-400">
                  {summary.countsByStatus.DEPRECATED}
                </span>
              </div>
            </div>
          )}

          {/* Filter Toolbar */}
          <div className="requirements-filter-bar">
            <div className="requirements-filter-inputs-row">
              <div className="requirements-search-wrapper">
                <svg
                  className="requirements-search-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <Input
                  className="w-full"
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
              <div className="requirements-filter-footer">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="requirements-clear-filters-btn"
                >
                  ✕ Clear Filters
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
            <div className="requirements-empty-card">
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
            <div className="requirements-table-card">
              <div className="overflow-x-auto">
                <table className="requirements-table">
                  <thead>
                    <tr className="requirements-table-head-row">
                      <th className="requirements-table-th">Key</th>
                      <th className="requirements-table-th">Title</th>
                      <th className="requirements-table-th">Type</th>
                      <th className="requirements-table-th">Priority</th>
                      <th className="requirements-table-th">Status</th>
                      <th className="requirements-table-th">Source</th>
                      <th className="requirements-table-th">Updated</th>
                      <th className="requirements-table-th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requirements.map(req => (
                      <tr
                        key={req.id}
                        className="requirements-table-row"
                        onClick={() => handleOpenView(req)}
                      >
                        <td className="requirements-table-td">
                          <span className="requirements-key-badge">{req.requirementKey}</span>
                        </td>
                        <td className="requirements-table-td">
                          <div className="requirements-title-cell" title={req.title}>
                            {req.title}
                          </div>
                        </td>
                        <td className="requirements-table-td whitespace-nowrap text-xs text-neutral-400">
                          {req.type}
                        </td>
                        <td className="requirements-table-td whitespace-nowrap">
                          <Badge variant={getPriorityBadgeVariant(req.priority)}>
                            {req.priority}
                          </Badge>
                        </td>
                        <td className="requirements-table-td whitespace-nowrap">
                          <Badge variant={getStatusBadgeVariant(req.status)}>{req.status}</Badge>
                        </td>
                        <td className="requirements-table-td whitespace-nowrap text-xs text-neutral-400">
                          {req.requirementSourceName || 'Manual'}
                        </td>
                        <td className="requirements-table-td whitespace-nowrap text-xs text-neutral-500">
                          {new Date(req.updatedAt).toLocaleDateString()}
                        </td>
                        <td
                          className="requirements-table-td"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="requirements-actions-cell">
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              {totalPages > 1 && (
                <div className="requirements-pagination-bar">
                  <span>
                    Showing page {page} of {totalPages} ({total} total)
                  </span>
                  <div className="requirements-pagination-actions">
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
