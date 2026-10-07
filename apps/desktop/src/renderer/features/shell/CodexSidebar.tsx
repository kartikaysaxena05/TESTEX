/**
 * @file apps/desktop/src/renderer/features/shell/CodexSidebar.tsx
 * Left Navigation Sidebar for the Codex-style product shell.
 * Includes Project switcher, Recent Work / Sessions, and core V1–V7 navigation.
 */

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext.js';
import { useWorkspace } from '../../context/WorkspaceContext.js';
import { ProductMark } from '../../components/ProductMark.js';
import { Button } from '../../ui/index.js';
import { CreateProjectModal } from '../projects/CreateProjectModal.js';

export function CodexSidebar(): React.JSX.Element {
  const navigate = useNavigate();
  const {
    activeProjects,
    recentProjects,
    selectedProjectId,
    setSelectedProjectId,
    searchQuery,
    setSearchQuery,
  } = useProject();
  const { sessions, activeSessionId, setActiveSessionId, isSidebarCollapsed } = useWorkspace();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  if (isSidebarCollapsed) {
    return (
      <aside
        className="codex-sidebar collapsed"
        data-testid="codex-sidebar-collapsed"
        aria-label="Sidebar Collapsed"
      >
        <div className="codex-sidebar-mini-header">
          <span className="codex-mini-logo" title="AI Quality Platform">
            AQ
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="codex-sidebar" data-testid="codex-sidebar" aria-label="Primary Navigation">
      <div className="codex-sidebar-header">
        <ProductMark />
      </div>

      <div className="codex-sidebar-action">
        <Button
          variant="primary"
          size="sm"
          className="codex-new-project-btn"
          data-testid="codex-new-project-btn"
          onClick={() => setIsCreateModalOpen(true)}
          aria-label="Create New Project"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New Project</span>
        </Button>
      </div>

      <div className="codex-sidebar-scroll">
        {/* PROJECTS SECTION */}
        <section className="codex-sidebar-section" aria-labelledby="sidebar-projects-heading">
          <div className="flex items-center justify-between pb-1">
            <div id="sidebar-projects-heading" className="codex-section-title">
              Projects
            </div>
            {activeProjects.length > 0 && (
              <span className="text-[10px] text-neutral-400 font-medium px-1.5 py-0.5 bg-neutral-800 rounded">
                {activeProjects.length}
              </span>
            )}
          </div>
          {activeProjects.length > 0 && (
            <div className="px-2 pb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                className="w-full px-2.5 py-1.5 bg-[#121212] border border-white/10 rounded-md text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                data-testid="sidebar-project-search-input"
              />
            </div>
          )}
          <div className="codex-project-list" role="list">
            {activeProjects.length === 0 ? (
              <div className="codex-empty-subtext" data-testid="sidebar-no-projects">
                {searchQuery ? 'No matching projects' : 'No active projects'}
              </div>
            ) : (
              activeProjects.slice(0, 10).map(p => {
                const isSelected = p.id === selectedProjectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`codex-project-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedProjectId(p.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    data-testid={`sidebar-project-item-${p.id}`}
                  >
                    <span className="codex-project-item-dot" />
                    <span className="codex-project-item-name">{p.name}</span>
                    {p.isFavorite && (
                      <span
                        className="codex-project-fav-star text-amber-400 text-xs ml-auto"
                        title="Favorite"
                        aria-label="Favorite"
                      >
                        ★
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* RECENT WORK / SESSIONS */}
        <section className="codex-sidebar-section" aria-labelledby="sidebar-recent-heading">
          <div id="sidebar-recent-heading" className="codex-section-title">
            Recent Work
          </div>
          <div className="codex-session-list" role="list">
            {sessions.length === 0 ? (
              <div className="codex-empty-subtext" data-testid="sidebar-no-sessions">
                No recent sessions
              </div>
            ) : (
              sessions.slice(0, 5).map(s => {
                const isCurrent = s.id === activeSessionId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`codex-session-item ${isCurrent ? 'active' : ''}`}
                    onClick={() => setActiveSessionId(s.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                  >
                    <span className="codex-session-item-title">{s.title}</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* CORE PLATFORM VIEWS */}
        <section className="codex-sidebar-section" aria-labelledby="sidebar-platform-heading">
          <div id="sidebar-platform-heading" className="codex-section-title">
            Quality Navigation
          </div>
          <nav className="codex-nav-links">
            <NavLink
              to="/workspace"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Testing Sessions / Workspace</span>
            </NavLink>

            <NavLink
              to="/test-runs"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              <span>Test Runs</span>
            </NavLink>

            <NavLink
              to="/requirements"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
              </svg>
              <span>Requirements</span>
            </NavLink>

            <NavLink
              to="/test-cases"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>Tests</span>
            </NavLink>

            <NavLink
              to="/defects"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m8 2 1.88 1.88" />
                <path d="M14.12 3.88 16 2" />
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                <path d="M12 20v-9" />
              </svg>
              <span>Bugs & Failures</span>
            </NavLink>

            <NavLink
              to="/reports"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" x2="18" y1="20" y2="10" />
                <line x1="12" x2="12" y1="20" y2="4" />
                <line x1="6" x2="6" y1="20" y2="14" />
              </svg>
              <span>Reports</span>
            </NavLink>

            <NavLink
              to="/traceability"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                <line x1="6" y1="9" x2="6" y2="21" />
              </svg>
              <span>Traceability</span>
            </NavLink>

            <NavLink
              to="/source"
              className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>Source</span>
            </NavLink>
          </nav>
        </section>
      </div>

      {/* FOOTER: SETTINGS & ACCOUNT */}
      <div className="codex-sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `codex-nav-item ${isActive ? 'active' : ''}`}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </NavLink>
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </aside>
  );
}
