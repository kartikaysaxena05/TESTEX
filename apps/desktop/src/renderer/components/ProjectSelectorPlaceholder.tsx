export function ProjectSelectorPlaceholder() {
  return (
    <div className="project-selector-wrapper" data-testid="project-selector">
      <div className="project-selector-label">Current Project</div>
      <button
        type="button"
        className="project-selector-btn"
        disabled
        aria-label="Project selection (available in Phase 11)"
        title="Project selection will be enabled in Phase 11"
      >
        <span>No project selected</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
