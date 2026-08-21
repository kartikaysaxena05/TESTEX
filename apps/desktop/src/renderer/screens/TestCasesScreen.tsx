import React, { useState } from 'react';
import { useProject } from '../context/ProjectContext.js';
import { TestCasesListView } from '../features/test-cases/TestCasesListView.js';
import { TestReviewQueueView } from '../features/test-review/TestReviewQueueView.js';
import { EmptyState } from '../ui/index.js';

export function TestCasesScreen(): React.JSX.Element {
  const { selectedProjectId } = useProject();
  const [activeTab, setActiveTab] = useState<'tests' | 'review'>('tests');

  if (!selectedProjectId) {
    return (
      <EmptyState
        screenId="test-cases"
        title="No Project Selected"
        description="Select a project from the header or create one to view and manage structured test cases."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Workspace Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('tests')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            activeTab === 'tests'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Canonical Test Cases
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
            activeTab === 'review'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Review, Governance & Versioning</span>
          <span className="px-1.5 py-0.2 rounded bg-blue-500/30 text-[10px] text-blue-200 font-bold">
            Phase 56
          </span>
        </button>
      </div>

      {activeTab === 'tests' ? (
        <TestCasesListView projectId={selectedProjectId} />
      ) : (
        <TestReviewQueueView projectId={selectedProjectId} />
      )}
    </div>
  );
}
