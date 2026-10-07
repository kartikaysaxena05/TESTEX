import React from 'react';
import { useProject } from '../context/ProjectContext.js';
import { FailureCasesListView } from '../features/failures/FailureCasesListView.js';
import { EmptyState } from '../ui/index.js';

export function DefectsScreen(): React.JSX.Element {
  const { selectedProjectId } = useProject();

  if (!selectedProjectId) {
    return (
      <EmptyState
        screenId="defects"
        title="No Project Selected"
        description="Select a project to inspect failure intelligence cases, evidence references, and analysis lifecycles."
      />
    );
  }

  return (
    <div className="space-y-4" data-screen="defects">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Failure Intelligence & Analysis Pipeline</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative failure cases, controlled analysis lifecycle state transitions, and
            auditable V5 evidence references.
          </p>
        </div>
      </div>

      <FailureCasesListView projectId={selectedProjectId} />
    </div>
  );
}
