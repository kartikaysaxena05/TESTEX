/**
 * @file apps/desktop/src/renderer/features/retest/RetestPlanCard.tsx
 * Interactive workspace for Requirement Change-Impact Analysis and Retest Plan Selection.
 */

import React, { useState, useMemo } from 'react';
import type {
  ChangeSourceType,
  RetestPlanDto,
  RetestSelectedTestDto,
  TestSelectionState,
} from '@ai-quality/contracts';
import { Button, Card, CardHeader, CardContent } from '../../ui/index.js';
import { ImpactExplanationModal } from './ImpactExplanationModal.js';

export interface RetestPlanCardProps {
  readonly projectId: string;
  readonly plan: RetestPlanDto | null;
  readonly isLoading?: boolean;
  readonly onPlanGenerated?: (plan: RetestPlanDto) => void;
  readonly onRefresh?: () => void;
}

export const RetestPlanCard: React.FC<RetestPlanCardProps> = ({
  projectId,
  plan,
  isLoading = false,
  onPlanGenerated,
  onRefresh,
}) => {
  const [filterState, setFilterState] = useState<TestSelectionState | 'ALL'>('ALL');
  const [selectedTest, setSelectedTest] = useState<RetestSelectedTestDto | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // New Analysis Dialog state
  const [isNewAnalysisOpen, setIsNewAnalysisOpen] = useState<boolean>(false);
  const [sourceType, setSourceType] = useState<ChangeSourceType>('SOURCE_CODE_CHANGE');
  const [title, setTitle] = useState<string>('Feature Change Impact Assessment');
  const [description, setDescription] = useState<string>('');
  const [diffText, setDiffText] = useState<string>('');
  const [forceFullRegression, setForceFullRegression] = useState<boolean>(false);
  const [conservativePolicy, setConservativePolicy] = useState<boolean>(true);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredTests = useMemo(() => {
    if (!plan?.selectedTests) return [];
    if (filterState === 'ALL') return plan.selectedTests;
    return plan.selectedTests.filter(t => t.selectionState === filterState);
  }, [plan, filterState]);

  const handleStartAnalysis = async () => {
    if (!window.desktop?.retest?.planRetest) {
      setActionError('Desktop retest bridge is unavailable.');
      return;
    }
    setIsAnalyzing(true);
    setActionError(null);

    try {
      const res = await window.desktop.retest.planRetest({
        projectId,
        forceFullRegression,
        conservativeSafetyPolicy: conservativePolicy,
        snapshotInput: {
          projectId,
          sourceType,
          title,
          description: description || undefined,
          diffText: diffText || undefined,
        },
      });

      if (res.ok) {
        setIsNewAnalysisOpen(false);
        onPlanGenerated?.(res.data);
      } else {
        setActionError(res.error.message);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Analysis failed unexpectedly.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getBadgeColor = (state: string) => {
    switch (state) {
      case 'MANDATORY':
        return 'bg-red-500/10 text-red-500 border border-red-500/30';
      case 'RECOMMENDED':
        return 'bg-blue-500/10 text-blue-500 border border-blue-500/30';
      case 'OPTIONAL':
        return 'bg-purple-500/10 text-purple-500 border border-purple-500/30';
      case 'UNKNOWN':
        return 'bg-amber-500/10 text-amber-500 border border-amber-500/30';
      case 'EXCLUDED':
      case 'NOT_IMPACTED':
      default:
        return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Trigger Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/50 p-5 rounded-xl border border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Intelligent Retest & Impact Analysis
          </h2>
          <p className="text-sm text-zinc-400">
            Determine exact requirements, code paths, and tests affected by changes to prevent blind
            regression runs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onRefresh && (
            <Button variant="secondary" onClick={onRefresh} disabled={isLoading || isAnalyzing}>
              Refresh
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setIsNewAnalysisOpen(true)}
            disabled={isLoading || isAnalyzing}
          >
            + Analyze Change Impact
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg text-sm text-red-400">
          <strong>Error:</strong> {actionError}
        </div>
      )}

      {/* Full Regression Escalation Alert */}
      {plan?.fullRegressionRequired && (
        <div className="p-4 bg-amber-950/40 border-2 border-amber-500/60 rounded-xl text-amber-200">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠</span>
            <div>
              <h3 className="font-bold text-base text-amber-300">
                Full Regression Escalation Mandated
              </h3>
              <p className="text-sm text-amber-200/90 mt-1">
                {plan.fullRegressionReason ||
                  'Change scope cannot safely be bounded. All project tests are designated MANDATORY for safety.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {plan ? (
        <Card className="border border-zinc-800 bg-zinc-900/40">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                    {plan.changeSnapshot?.sourceType ?? 'CHANGE'}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    Base: {plan.baseRevision ? plan.baseRevision.substring(0, 8) : 'N/A'} → Target:{' '}
                    {plan.targetRevision ? plan.targetRevision.substring(0, 8) : 'HEAD'}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-zinc-100">
                  {plan.changeSnapshot?.title ?? 'Change Retest Plan'}
                </h3>
              </div>

              {/* Statistics Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold">
                  Total: {plan.totalTestsCount}
                </span>
                <span className="px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold">
                  Mandatory: {plan.mandatoryCount}
                </span>
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold">
                  Recommended: {plan.recommendedCount}
                </span>
                {plan.unknownCount > 0 && (
                  <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold">
                    Unknown: {plan.unknownCount}
                  </span>
                )}
                <span className="px-3 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-xs font-medium">
                  Excluded: {plan.excludedCount}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Filter Tabs */}
            <div className="flex items-center gap-2 mb-4 border-b border-zinc-800 pb-3 overflow-x-auto">
              {(['ALL', 'MANDATORY', 'RECOMMENDED', 'UNKNOWN', 'EXCLUDED'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterState(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filterState === tab
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Test Selection Table */}
            {filteredTests.length === 0 ? (
              <div className="text-center py-12 text-sm text-zinc-500">
                No tests match the selected filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-medium text-zinc-400">
                      <th className="pb-3 pl-2">Test Key</th>
                      <th className="pb-3">Title</th>
                      <th className="pb-3">Selection State</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Confidence</th>
                      <th className="pb-3">Reason Summary</th>
                      <th className="pb-3 pr-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredTests.map(test => (
                      <tr key={test.testCaseId} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 pl-2 font-mono text-xs text-indigo-400">
                          {test.testCaseKey}
                        </td>
                        <td className="py-3 font-medium text-zinc-200 max-w-xs truncate">
                          {test.testCaseTitle}
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${getBadgeColor(
                              test.selectionState,
                            )}`}
                          >
                            {test.selectionState}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-zinc-400">{test.impactCategory}</td>
                        <td className="py-3 text-xs text-zinc-400">{test.confidence}</td>
                        <td className="py-3 text-xs text-zinc-400 max-w-sm truncate">
                          {test.selectionReason}
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedTest(test);
                              setIsModalOpen(true);
                            }}
                          >
                            Why this test?
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="text-center py-16 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-400 text-sm">
            No active retest plan available. Click <strong>+ Analyze Change Impact</strong> to run
            analysis.
          </p>
        </div>
      )}

      {/* Explanation Modal */}
      <ImpactExplanationModal
        isOpen={isModalOpen}
        test={selectedTest}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTest(null);
        }}
      />

      {/* New Analysis Trigger Modal */}
      {isNewAnalysisOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-lg text-zinc-100">Launch Change-Impact Analysis</h3>
              <button
                onClick={() => setIsNewAnalysisOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Change Source Type
                </label>
                <select
                  value={sourceType}
                  onChange={e => setSourceType(e.target.value as ChangeSourceType)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200"
                >
                  <option value="SOURCE_CODE_CHANGE">Source Code Change</option>
                  <option value="REQUIREMENT_CHANGE">Requirement Change</option>
                  <option value="APPROVED_PATCH">Approved Patch</option>
                  <option value="COMMIT_DIFF">Git Commit Diff</option>
                  <option value="BRANCH_DIFF">Git Branch Diff</option>
                  <option value="API_CONTRACT_CHANGE">API Contract Change</option>
                  <option value="CONFIGURATION_CHANGE">Configuration Change</option>
                  <option value="MANUAL_FILE_CHANGE">Manual File Change</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200"
                  placeholder="e.g. Auth Token Expiry Validation Update"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200"
                  placeholder="Context or rationale for the change"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Unified Diff (Optional for code change)
                </label>
                <textarea
                  value={diffText}
                  onChange={e => setDiffText(e.target.value)}
                  rows={6}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200"
                  placeholder="Paste unified diff (--- a/src/... +++ b/src/...)"
                />
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={conservativePolicy}
                    onChange={e => setConservativePolicy(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-800 text-indigo-600"
                  />
                  <span>
                    Conservative Safety Policy (Include unknown impact tests as RECOMMENDED)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={forceFullRegression}
                    onChange={e => setForceFullRegression(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-800 text-indigo-600"
                  />
                  <span>Force Full Regression (Mark all tests MANDATORY)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button variant="secondary" onClick={() => setIsNewAnalysisOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleStartAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
