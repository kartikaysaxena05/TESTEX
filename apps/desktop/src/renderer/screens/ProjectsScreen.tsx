/**
 * @file apps/desktop/src/renderer/screens/ProjectsScreen.tsx
 * Professional developer-tool workspace for managing software quality engineering projects.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';
import { Alert } from '../ui/Alert.js';
import { Skeleton } from '../ui/Skeleton.js';
import { useProject } from '../context/ProjectContext.js';
import { CreateProjectDialog, type TestingTargetMode } from './projects/CreateProjectDialog.js';
import { EditProjectDialog } from './projects/EditProjectDialog.js';
import { ProjectEnvironmentsDialog } from './projects/ProjectEnvironmentsDialog.js';
import { formatDate } from '../utils/date.js';
import type { ProjectSummary, DatabaseStatusState } from '@ai-quality/contracts';

type FilterEnvOption = 'all' | 'configured' | 'none';
type SortOption = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';

export function ProjectsScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    isLoading,
    error: contextError,
    refreshProjects,
  } = useProject();

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterEnv, setFilterEnv] = useState<FilterEnvOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Active row overflow menu ID
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Health and dialog state
  const [dbStatus, setDbStatus] = useState<DatabaseStatusState>('connected');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInitialMode, setCreateInitialMode] = useState<TestingTargetMode>('folder');
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  const handleOpenCreate = (mode: TestingTargetMode = 'folder') => {
    setCreateInitialMode(mode);
    setIsCreateOpen(true);
  };
  const [envProject, setEnvProject] = useState<ProjectSummary | null>(null);
  const [archivingProject, setArchivingProject] = useState<ProjectSummary | null>(null);
  const [restoringProject, setRestoringProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setActiveMenuProjectId(null);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveMenuProjectId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

  // Compute live project counts
  const activeProjects = useMemo(() => {
    return projects.filter(p => p.status === 'ACTIVE');
  }, [projects]);

  const archivedProjects = useMemo(() => {
    return projects.filter(p => p.status === 'ARCHIVED');
  }, [projects]);

  // Tab filtered baseline
  const tabProjects = useMemo(() => {
    return activeTab === 'active' ? activeProjects : archivedProjects;
  }, [activeTab, activeProjects, archivedProjects]);

  // Search and filter pipeline
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tabProjects.filter(p => {
      // 1. Search Query
      if (query) {
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesDesc = p.description ? p.description.toLowerCase().includes(query) : false;
        if (!matchesName && !matchesDesc) {
          return false;
        }
      }

      // 2. Environment Filter
      if (filterEnv === 'configured' && p.environmentCount === 0) {
        return false;
      }
      if (filterEnv === 'none' && p.environmentCount > 0) {
        return false;
      }

      return true;
    });
  }, [tabProjects, searchQuery, filterEnv]);

  // Sort pipeline
  const sortedProjects = useMemo(() => {
    const list = [...filteredProjects];
    switch (sortBy) {
      case 'updated_desc':
        return list.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      case 'updated_asc':
        return list.sort(
          (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        );
      case 'name_asc':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return list.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return list;
    }
  }, [filteredProjects, sortBy]);

  // Pagination pipeline
  const totalPages = Math.max(1, Math.ceil(sortedProjects.length / pageSize));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (effectiveCurrentPage - 1) * pageSize;
  const paginatedProjects = sortedProjects.slice(startIndex, startIndex + pageSize);

  // Reset pagination when search/filter/tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterEnv, sortBy, activeTab]);

  const handleSelectAndOpen = (project: ProjectSummary) => {
    setSelectedProjectId(project.id);
    navigate('/');
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterEnv('all');
    setSortBy('updated_desc');
  };

  const handleArchiveConfirm = async () => {
    if (!archivingProject || !window.desktop?.projects?.archive) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await window.desktop.projects.archive(archivingProject.id);
      if (res.ok) {
        setArchivingProject(null);
        setActiveMenuProjectId(null);
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
        setActiveMenuProjectId(null);
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
        setActiveMenuProjectId(null);
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
    <div className="projects-workspace-container">
      {/* Page Header */}
      <header className="projects-header">
        <div className="projects-header-title-group">
          <div className="projects-header-title-row">
            <h1 className="projects-header-title">Projects</h1>
            <div className="projects-header-totals" data-testid="project-totals">
              <span>{isLoading ? '—' : `${activeProjects.length} Active`}</span>
              <span>•</span>
              <span>{isLoading ? '—' : `${archivedProjects.length} Archived`}</span>
            </div>
          </div>
          <p className="projects-header-description">
            Manage software quality engineering workspaces, repositories, and testing environments.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => handleOpenCreate('folder')}
          disabled={dbStatus !== 'connected'}
          data-testid="new-project-btn"
        >
          + New Project
        </Button>
      </header>

      {/* Database Warning Banner if not connected */}
      {dbStatus === 'unavailable' && (
        <Alert variant="danger" title="Database Unavailable">
          Project data is unavailable because the PostgreSQL connection could not be established.
          Please check your database service and connection settings.
        </Alert>
      )}

      {/* Context Error Banner with sanitized error message */}
      {contextError && (
        <Alert variant="danger" title="Unable to load projects">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span>An error occurred while fetching the project directory. Please try again.</span>
            <Button size="sm" variant="secondary" onClick={() => void refreshProjects()}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Toolbar: Search, Filter, Sort, Tabs */}
      <section className="projects-toolbar" aria-label="Projects Filter and Search Toolbar">
        <div className="projects-toolbar-left">
          {/* Search Box */}
          <div className="projects-search-wrapper">
            <span className="projects-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="text"
              className="projects-search-input"
              placeholder="Search projects by name or description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search projects by name or description"
              data-testid="project-search-input"
            />
          </div>

          {/* Environment Filter */}
          <select
            className="projects-filter-select"
            value={filterEnv}
            onChange={e => setFilterEnv(e.target.value as FilterEnvOption)}
            aria-label="Filter by environment configuration"
            data-testid="project-env-filter"
          >
            <option value="all">All Environments</option>
            <option value="configured">Configured Environments</option>
            <option value="none">No Environment</option>
          </select>

          {/* Sort Dropdown */}
          <select
            className="projects-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            aria-label="Sort projects"
            data-testid="project-sort-select"
          >
            <option value="updated_desc">Recently Updated</option>
            <option value="updated_asc">Oldest Updated</option>
            <option value="name_asc">Name: A to Z</option>
            <option value="name_desc">Name: Z to A</option>
          </select>
        </div>

        {/* Active / Archived Tabs */}
        <nav className="projects-tabs-wrapper" role="tablist" aria-label="Project Status Tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`projects-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
            data-testid="tab-active"
          >
            <span>Active</span>
            <span className="projects-tab-count">{activeProjects.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'archived'}
            className={`projects-tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => setActiveTab('archived')}
            data-testid="tab-archived"
          >
            <span>Archived</span>
            <span className="projects-tab-count">{archivedProjects.length}</span>
          </button>
        </nav>
      </section>

      {/* Main Table / List Workspace */}
      <main className="projects-table-container" ref={menuContainerRef}>
        <table className="projects-table" aria-label="Projects Directory">
          <thead>
            <tr className="projects-table-header-row">
              <th className="projects-th projects-th-project" scope="col">
                Project
              </th>
              <th className="projects-th projects-th-env" scope="col">
                Environment
              </th>
              <th className="projects-th projects-th-updated" scope="col">
                Updated
              </th>
              <th className="projects-th projects-th-status" scope="col">
                Status
              </th>
              <th className="projects-th projects-th-actions" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              // Loading Skeleton Rows
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="projects-table-row">
                  <td className="projects-td">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <Skeleton width="180px" height="16px" />
                      <Skeleton width="280px" height="12px" />
                    </div>
                  </td>
                  <td className="projects-td projects-cell-env">
                    <Skeleton width="100px" height="16px" />
                  </td>
                  <td className="projects-td projects-cell-updated">
                    <Skeleton width="90px" height="14px" />
                  </td>
                  <td className="projects-td">
                    <Skeleton width="60px" height="16px" />
                  </td>
                  <td className="projects-td projects-cell-actions">
                    <Skeleton width="30px" height="24px" />
                  </td>
                </tr>
              ))
            ) : paginatedProjects.length > 0 ? (
              // Project Rows
              paginatedProjects.map(project => {
                const isCurrentSelected = project.id === selectedProjectId;
                const isMenuOpen = activeMenuProjectId === project.id;

                return (
                  <tr
                    key={project.id}
                    className={`projects-table-row ${isCurrentSelected ? 'current-selected-project' : ''}`}
                    data-testid={`project-row-${project.id}`}
                  >
                    {/* Project Column */}
                    <td className="projects-td">
                      <div className="projects-cell-project">
                        <div className="projects-identity-row">
                          <button
                            type="button"
                            className="projects-name-button"
                            onClick={() => handleSelectAndOpen(project)}
                            title={`Open workspace for ${project.name}`}
                          >
                            {project.name}
                          </button>
                          {isCurrentSelected && (
                            <span
                              className="projects-current-indicator"
                              data-testid="current-project-badge"
                            >
                              Current
                            </span>
                          )}
                        </div>
                        {project.description ? (
                          <p className="projects-description-clamped" title={project.description}>
                            {project.description}
                          </p>
                        ) : (
                          <p
                            className="projects-description-clamped"
                            style={{ color: 'var(--color-text-muted)' }}
                          >
                            No description provided.
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Environment Column */}
                    <td className="projects-td projects-cell-env">
                      {project.environmentCount > 0 ? (
                        <div className="projects-env-pill">
                          <span>
                            {project.defaultEnvironment?.name ?? `${project.environmentCount} envs`}
                          </span>
                          {project.environmentCount > 1 && project.defaultEnvironment?.name && (
                            <span className="projects-env-count-badge">
                              +{project.environmentCount - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="projects-table-env-none">No environment</span>
                      )}
                    </td>

                    {/* Updated Timestamp */}
                    <td className="projects-td projects-cell-updated">
                      <span className="projects-updated-text" title={project.updatedAt}>
                        {formatDate(project.updatedAt)}
                      </span>
                    </td>

                    {/* Status Column */}
                    <td className="projects-td">
                      <div className="projects-status-pill">
                        <span
                          className={`projects-status-dot ${project.status === 'ACTIVE' ? 'active' : 'archived'}`}
                          aria-hidden="true"
                        />
                        <span
                          style={{ color: project.status === 'ACTIVE' ? '#22c55e' : '#94a3b8' }}
                        >
                          {project.status === 'ACTIVE' ? 'Active' : 'Archived'}
                        </span>
                      </div>
                    </td>

                    {/* Actions Column: Single Overflow Menu */}
                    <td className="projects-td projects-cell-actions">
                      <button
                        type="button"
                        className="projects-overflow-trigger"
                        aria-label={`Actions for ${project.name}`}
                        aria-expanded={isMenuOpen}
                        onClick={e => {
                          e.stopPropagation();
                          setActiveMenuProjectId(isMenuOpen ? null : project.id);
                        }}
                        data-testid={`project-actions-${project.id}`}
                      >
                        ⋯
                      </button>

                      {/* Dropdown Menu Popover */}
                      {isMenuOpen && (
                        <div
                          className="projects-dropdown-menu"
                          role="menu"
                          aria-orientation="vertical"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="projects-dropdown-item"
                            role="menuitem"
                            onClick={() => {
                              handleSelectAndOpen(project);
                              setActiveMenuProjectId(null);
                            }}
                          >
                            <span>🚀</span> Open Workspace
                          </button>

                          {project.status === 'ACTIVE' && (
                            <>
                              <button
                                type="button"
                                className="projects-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  setEditingProject(project);
                                  setActiveMenuProjectId(null);
                                }}
                              >
                                <span>✏️</span> Edit Project
                              </button>
                              <button
                                type="button"
                                className="projects-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  setEnvProject(project);
                                  setActiveMenuProjectId(null);
                                }}
                              >
                                <span>🌐</span> Environments ({project.environmentCount})
                              </button>
                              <div className="projects-dropdown-separator" />
                              <button
                                type="button"
                                className="projects-dropdown-item destructive"
                                role="menuitem"
                                onClick={() => {
                                  setArchivingProject(project);
                                  setActiveMenuProjectId(null);
                                }}
                              >
                                <span>📦</span> Archive Project
                              </button>
                            </>
                          )}

                          {project.status === 'ARCHIVED' && (
                            <>
                              <button
                                type="button"
                                className="projects-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  setRestoringProject(project);
                                  setActiveMenuProjectId(null);
                                }}
                              >
                                <span>🔄</span> Restore to Active
                              </button>
                              <div className="projects-dropdown-separator" />
                              <button
                                type="button"
                                className="projects-dropdown-item destructive"
                                role="menuitem"
                                onClick={() => {
                                  setDeletingProject(project);
                                  setActiveMenuProjectId(null);
                                }}
                              >
                                <span>🗑️</span> Delete Permanently
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : tabProjects.length === 0 ? (
              // Genuine Zero Projects in Active/Archived Tab
              <tr>
                <td colSpan={5} className="projects-td">
                  <div className="projects-empty-container" data-testid="zero-projects-view">
                    {activeTab === 'active' ? (
                      <>
                        <div className="projects-hero-badge" aria-hidden="true">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="m9 12 2 2 4-4" />
                          </svg>
                        </div>
                        <h3 className="projects-empty-title">No projects yet</h3>
                        <p className="projects-empty-desc">
                          Create your first software quality engineering workspace to begin analysing source code and requirements.
                        </p>
                        <Button
                          variant="primary"
                          className="projects-hero-cta-btn"
                          onClick={() => handleOpenCreate('folder')}
                          disabled={dbStatus !== 'connected'}
                        >
                          Create Project
                        </Button>

                        <div className="projects-quickstart-grid" role="group" aria-label="Quick-start workspace options">
                          <button
                            type="button"
                            className="projects-quickstart-card"
                            onClick={() => handleOpenCreate('folder')}
                            disabled={dbStatus !== 'connected'}
                          >
                            <div className="quickstart-icon-wrap folder">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 2 2Z" />
                              </svg>
                            </div>
                            <div className="quickstart-text">
                              <span className="quickstart-title">Connect Local Folder</span>
                              <span className="quickstart-desc">Inspect codebase on disk, scan components & discover test targets.</span>
                            </div>
                            <span className="quickstart-arrow" aria-hidden="true">→</span>
                          </button>

                          <button
                            type="button"
                            className="projects-quickstart-card"
                            onClick={() => handleOpenCreate('website')}
                            disabled={dbStatus !== 'connected'}
                          >
                            <div className="quickstart-icon-wrap website">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                            </div>
                            <div className="quickstart-text">
                              <span className="quickstart-title">Point to Website URL</span>
                              <span className="quickstart-desc">Test live web applications, staging servers, or localhost dev URLs.</span>
                            </div>
                            <span className="quickstart-arrow" aria-hidden="true">→</span>
                          </button>

                          <button
                            type="button"
                            className="projects-quickstart-card"
                            onClick={() => handleOpenCreate('git')}
                            disabled={dbStatus !== 'connected'}
                          >
                            <div className="quickstart-icon-wrap git">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="6" y1="3" x2="6" y2="15" />
                                <circle cx="18" cy="6" r="3" />
                                <circle cx="6" cy="18" r="3" />
                                <path d="M18 9a9 9 0 0 1-9 9" />
                              </svg>
                            </div>
                            <div className="quickstart-text">
                              <span className="quickstart-title">Import Git Repository</span>
                              <span className="quickstart-desc">Connect remote GitHub/GitLab repositories with branch tracking.</span>
                            </div>
                            <span className="quickstart-arrow" aria-hidden="true">→</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="projects-empty-title">No archived projects</h3>
                        <p className="projects-empty-desc">
                          Archived projects will appear here when archived from the active workspace.
                        </p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              // Search / Filter yielded 0 results
              <tr>
                <td colSpan={5} className="projects-td">
                  <div className="projects-empty-container" data-testid="search-no-results-view">
                    <h3 className="projects-empty-title">No projects found</h3>
                    <p className="projects-empty-desc">
                      No projects match your current search query or environment filters.
                    </p>
                    <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                      Clear Filters
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Bar (when items exist) */}
        {sortedProjects.length > 0 && (
          <footer className="projects-pagination-bar" aria-label="Project Pagination">
            <div className="projects-pagination-info">
              <span>
                Showing {Math.min(startIndex + 1, sortedProjects.length)}–
                {Math.min(startIndex + pageSize, sortedProjects.length)} of {sortedProjects.length}{' '}
                projects
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Per page:</span>
                <select
                  className="projects-page-size-select"
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  aria-label="Items per page"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            {totalPages > 1 && (
              <div className="projects-pagination-controls">
                <button
                  type="button"
                  className="projects-page-btn"
                  disabled={effectiveCurrentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  aria-label="Previous Page"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={`page-${pageNum}`}
                      type="button"
                      className={`projects-page-btn ${effectiveCurrentPage === pageNum ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pageNum)}
                      aria-label={`Page ${pageNum}`}
                      aria-current={effectiveCurrentPage === pageNum ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  className="projects-page-btn"
                  disabled={effectiveCurrentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  aria-label="Next Page"
                >
                  Next
                </button>
              </div>
            )}
          </footer>
        )}
      </main>

      {/* Dialog Modals */}
      <CreateProjectDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => void refreshProjects()}
        initialMode={createInitialMode}
      />

      <EditProjectDialog
        project={editingProject}
        isOpen={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
        onUpdated={() => void refreshProjects()}
      />

      <ProjectEnvironmentsDialog
        project={envProject}
        isOpen={Boolean(envProject)}
        onClose={() => setEnvProject(null)}
      />

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={Boolean(archivingProject)}
        onClose={() => !actionLoading && setArchivingProject(null)}
        title="Archive Project"
        description={`Are you sure you want to archive "${archivingProject?.name}"? Archived projects are hidden from active workspace selection.`}
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
              variant="danger"
              onClick={() => void handleArchiveConfirm()}
              loading={actionLoading}
            >
              Archive Project
            </Button>
          </div>
        }
      >
        {actionError && (
          <Alert variant="danger" title="Failed to archive project">
            {actionError}
          </Alert>
        )}
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog
        open={Boolean(restoringProject)}
        onClose={() => !actionLoading && setRestoringProject(null)}
        title="Restore Project"
        description={`Restore "${restoringProject?.name}" to active status?`}
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
              onClick={() => void handleRestoreConfirm()}
              loading={actionLoading}
            >
              Restore Project
            </Button>
          </div>
        }
      >
        {actionError && (
          <Alert variant="danger" title="Failed to restore project">
            {actionError}
          </Alert>
        )}
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingProject)}
        onClose={() => !actionLoading && setDeletingProject(null)}
        title="Permanently Delete Project"
        description={`Permanently delete "${deletingProject?.name}" and all associated quality engineering assets? This action cannot be undone.`}
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
              onClick={() => void handleDeleteConfirm()}
              loading={actionLoading}
            >
              Permanently Delete
            </Button>
          </div>
        }
      >
        {actionError && (
          <Alert variant="danger" title="Failed to delete project">
            {actionError}
          </Alert>
        )}
      </Dialog>
    </div>
  );
}
