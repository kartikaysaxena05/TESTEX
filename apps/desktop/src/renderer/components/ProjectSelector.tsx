/**
 * @file apps/desktop/src/renderer/components/ProjectSelector.tsx
 * Functional active project selector in the sidebar bound to ProjectContext.
 */

import React from 'react';
import { useProject } from '../context/ProjectContext.js';
import { Select } from '../ui/Select.js';

export function ProjectSelector(): React.JSX.Element {
  const { activeProjects, selectedProjectId, setSelectedProjectId, isLoading } = useProject();

  return (
    <div className="project-selector-wrapper" data-testid="project-selector">
      <label htmlFor="sidebar-project-select" className="project-selector-label">
        Current Project
      </label>
      <Select
        id="sidebar-project-select"
        data-testid="project-select-input"
        sizeVariant="sm"
        disabled={isLoading || activeProjects.length === 0}
        value={selectedProjectId ?? ''}
        onChange={e => {
          setSelectedProjectId(e.target.value ? e.target.value : null);
        }}
        aria-label="Select active project"
      >
        <option value="">
          {isLoading
            ? 'Loading projects...'
            : activeProjects.length === 0
              ? 'No projects available'
              : 'No project selected'}
        </option>
        {activeProjects.map(project => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
