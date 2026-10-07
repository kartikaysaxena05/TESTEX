/**
 * @file apps/desktop/src/renderer/features/qa-report/FinalQaReportCard.tsx
 * Interactive workspace for Final QA Report & Release Readiness Intelligence.
 * Displays authoritative verdicts, readiness score, release blockers,
 * requirement coverage, defect health, and provides cryptographic export.
 */

import React, { useState } from 'react';
import type {
  FinalQaReportDto,
  ReleaseReadinessVerdictDto,
  ExportQaReportResultDto,
} from '@ai-quality/contracts';
import { Button, Card, CardHeader, CardContent } from '../../ui/index.js';

export interface FinalQaReportCardProps {
  readonly projectId: string;
  readonly report: FinalQaReportDto | null;
  readonly isLoading?: boolean;
  readonly onReportGenerated?: (report: FinalQaReportDto) => void;
  readonly onReportFinalized?: (report: FinalQaReportDto) => void;
  readonly onRefresh?: () => void;
}

export const FinalQaReportCard: React.FC<FinalQaReportCardProps> = ({
  projectId,
  report,
  isLoading = false,
  onReportGenerated,
  onReportFinalized,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'BLOCKERS' | 'REQUIREMENTS' | 'DEFECTS' | 'HEALTH'>('BLOCKERS');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportQaReportResultDto | null>(null);

  // Generate Dialog state
  const [isGenerateOpen, setIsGenerateOpen] = useState<boolean>(false);
  const [releaseIdInput, setReleaseIdInput] = useState<string>('v1.0.0');
  const [buildIdInput, setBuildIdInput] = useState<string>('build-101');
  const [branchInput, setBranchInput] = useState<string>('main');

  const handleGenerate = async () => {
    if (!window.desktop?.qaReport?.generate) {
      setActionError('Desktop QA Report bridge unavailable.');
      return;
    }
    setIsGenerating(true);
    setActionError(null);

    try {
      const res = await window.desktop.qaReport.generate({
        projectId,
        releaseIdentifier: releaseIdInput,
        buildIdentifier: buildIdInput || undefined,
        branch: branchInput || undefined,
      });

      if (!res.ok) {
        setActionError(res.error?.message ?? 'Failed to generate report.');
      } else {
        setIsGenerateOpen(false);
        onReportGenerated?.(res.data);
        onRefresh?.();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (!report || !window.desktop?.qaReport?.finalize) return;
    if (report.status === 'FINAL') return;

    setIsFinalizing(true);
    setActionError(null);

    try {
      const res = await window.desktop.qaReport.finalize({
        projectId,
        reportId: report.id,
      });

      if (!res.ok) {
        setActionError(res.error?.message ?? 'Failed to finalize report.');
      } else {
        onReportFinalized?.(res.data);
        onRefresh?.();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleExport = async (format: 'JSON' | 'MARKDOWN') => {
    if (!report || !window.desktop?.qaReport?.export) return;

    setIsExporting(true);
    setActionError(null);

    try {
      const res = await window.desktop.qaReport.export({
        projectId,
        reportId: report.id,
        format,
      });

      if (!res.ok) {
        setActionError(res.error?.message ?? 'Export failed.');
      } else {
        setExportResult(res.data);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const getVerdictStyle = (verdict: ReleaseReadinessVerdictDto) => {
    switch (verdict) {
      case 'READY':
        return { bg: 'bg-green-950/40 border-green-500/40 text-green-300', badge: 'bg-green-600 text-white' };
      case 'READY_WITH_RISK':
        return { bg: 'bg-amber-950/40 border-amber-500/40 text-amber-300', badge: 'bg-amber-600 text-white' };
      case 'NOT_READY':
        return { bg: 'bg-red-950/40 border-red-500/40 text-red-300', badge: 'bg-red-600 text-white' };
      case 'BLOCKED':
        return { bg: 'bg-purple-950/40 border-purple-500/40 text-purple-300', badge: 'bg-purple-600 text-white' };
      case 'UNKNOWN':
      default:
        return { bg: 'bg-zinc-900/60 border-zinc-700 text-zinc-300', badge: 'bg-zinc-600 text-white' };
    }
  };

  if (!report) {
    return (
      <Card className="border border-zinc-800 bg-zinc-950 text-zinc-100">
        <CardHeader className="border-b border-zinc-800 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Final QA Report & Release Readiness</h2>
            <p className="text-sm text-zinc-400 mt-1">
              No QA Report has been generated for this release.
            </p>
          </div>
          <Button
            onClick={() => setIsGenerateOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded"
          >
            Generate QA Report
          </Button>
        </CardHeader>
        <CardContent className="p-8 text-center text-zinc-500">
          Click "Generate QA Report" to evaluate test executions, requirement coverage, and defect health.
        </CardContent>

        {isGenerateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-zinc-100">Generate QA Report</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-zinc-400 mb-1">Release Identifier</label>
                  <input
                    type="text"
                    value={releaseIdInput}
                    onChange={e => setReleaseIdInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
                    placeholder="e.g. v1.0.0"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Build Identifier (optional)</label>
                  <input
                    type="text"
                    value={buildIdInput}
                    onChange={e => setBuildIdInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
                    placeholder="e.g. build-101"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Branch (optional)</label>
                  <input
                    type="text"
                    value={branchInput}
                    onChange={e => setBranchInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100"
                    placeholder="e.g. main"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-zinc-800">
                <Button
                  variant="secondary"
                  onClick={() => setIsGenerateOpen(false)}
                  className="border-zinc-700 text-zinc-300"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !releaseIdInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  {isGenerating ? 'Evaluating...' : 'Generate'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  const verdictStyle = getVerdictStyle(report.verdict);

  return (
    <Card className="border border-zinc-800 bg-zinc-950 text-zinc-100 space-y-6">
      {/* Header & Controls */}
      <CardHeader className="border-b border-zinc-800 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Final QA & Release Readiness</h2>
            <span className="text-xs px-2.5 py-1 rounded-full font-mono bg-zinc-800 text-zinc-300">
              v{report.reportVersion}
            </span>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                report.status === 'FINAL'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-600/40'
                  : report.status === 'SUPERSEDED'
                  ? 'bg-zinc-800 text-zinc-400'
                  : 'bg-blue-950/60 text-blue-300 border border-blue-600/40'
              }`}
            >
              {report.status}
            </span>
            {report.isStale && (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-950/60 text-amber-300 border border-amber-600/40">
                STALE SNAPSHOT
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Release: <strong className="text-zinc-200">{report.releaseIdentifier}</strong> | Key:{' '}
            <code className="text-zinc-300">{report.reportKey}</code> | Sealed Checksum:{' '}
            <code className="text-xs text-zinc-400">{report.checksumSha256.substring(0, 12)}...</code>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {report.status === 'DRAFT' && (
            <Button
              onClick={handleFinalize}
              disabled={isFinalizing}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 py-2 rounded"
            >
              {isFinalizing ? 'Finalizing...' : 'Finalize Report'}
            </Button>
          )}
          <Button
            onClick={() => handleExport('JSON')}
            disabled={isExporting}
            variant="secondary"
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs px-3 py-2 rounded"
          >
            Export JSON
          </Button>
          <Button
            onClick={() => handleExport('MARKDOWN')}
            disabled={isExporting}
            variant="secondary"
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-xs px-3 py-2 rounded"
          >
            Export Markdown
          </Button>
          <Button
            onClick={onRefresh}
            variant="ghost"
            className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-2"
          >
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {actionError && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded text-red-300 text-sm">
            {actionError}
          </div>
        )}

        {/* Verdict Banner */}
        <div className={`p-5 rounded-lg border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${verdictStyle.bg}`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider ${verdictStyle.badge}`}>
                {report.verdict.replace(/_/g, ' ')}
              </span>
              <span className="text-xs font-mono text-zinc-400">Policy v{report.policyVersion}</span>
            </div>
            <h3 className="text-lg font-bold">{report.readinessExplanation}</h3>
          </div>

          <div className="text-right flex flex-col items-end">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Readiness Score</span>
            <span className="text-3xl font-extrabold tracking-tight">
              {report.readinessScore !== null && report.readinessScore !== undefined
                ? `${report.readinessScore}`
                : 'N/A'}
              <span className="text-sm font-normal text-zinc-400"> / 100</span>
            </span>
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-lg">
            <span className="text-xs text-zinc-400 uppercase">Distinct Tests Pass Rate</span>
            <div className="text-2xl font-bold mt-1 text-zinc-100">
              {report.testExecutionSummary.passPercentage}%
            </div>
            <span className="text-xs text-zinc-500">
              {report.testExecutionSummary.passedCount} of {report.testExecutionSummary.totalDistinctTests} passed
            </span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-lg">
            <span className="text-xs text-zinc-400 uppercase">Requirement Coverage</span>
            <div className="text-2xl font-bold mt-1 text-zinc-100">
              {report.requirementSummary.coveragePercentage}%
            </div>
            <span className="text-xs text-zinc-500">
              {report.requirementSummary.verified} verified / {report.requirementSummary.testable} testable
            </span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-lg">
            <span className="text-xs text-zinc-400 uppercase">Open Defects (Crit / High)</span>
            <div className={`text-2xl font-bold mt-1 ${report.defectSummary.openCritical > 0 || report.defectSummary.openHigh > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {report.defectSummary.openCritical} / {report.defectSummary.openHigh}
            </div>
            <span className="text-xs text-zinc-500">
              {report.defectSummary.resolvedOrClosed} resolved or closed
            </span>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-lg">
            <span className="text-xs text-zinc-400 uppercase">Reverification Health</span>
            <div className="text-2xl font-bold mt-1 text-zinc-100">
              {report.reverificationSummary.verifiedFixedCount}
              <span className="text-sm font-normal text-zinc-400">
                {' '}/ {report.reverificationSummary.totalReverifications}
              </span>
            </div>
            <span className="text-xs text-zinc-500">
              {report.reverificationSummary.stillFailingCount} still failing
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-zinc-800 flex gap-4 text-sm font-medium">
          <button
            onClick={() => setActiveTab('BLOCKERS')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'BLOCKERS'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Blockers & Risks ({report.releaseBlockers.length + report.residualRisks.length})
          </button>
          <button
            onClick={() => setActiveTab('REQUIREMENTS')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'REQUIREMENTS'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Requirement Traceability ({report.traceabilityMatrix.length})
          </button>
          <button
            onClick={() => setActiveTab('DEFECTS')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'DEFECTS'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Defects & Reverifications
          </button>
          <button
            onClick={() => setActiveTab('HEALTH')}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === 'HEALTH'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Harness & Environment Health
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'BLOCKERS' && (
          <div className="space-y-4">
            {report.releaseBlockers.length === 0 && report.residualRisks.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 border border-zinc-800/80 rounded bg-zinc-900/30">
                No active release blockers or residual risk warnings identified.
              </div>
            ) : (
              <div className="space-y-3">
                {report.releaseBlockers.map((b, idx) => (
                  <div key={idx} className="p-4 bg-red-950/40 border border-red-800/60 rounded-lg flex items-start gap-3">
                    <span className="text-xs px-2 py-0.5 rounded font-bold uppercase bg-red-800 text-white">
                      BLOCKER
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-red-200">{b.title}</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{b.description}</p>
                      <code className="text-xs text-zinc-500 mt-1 block font-mono">{b.ruleCode}</code>
                    </div>
                  </div>
                ))}
                {report.residualRisks.map((r, idx) => (
                  <div key={idx} className="p-4 bg-amber-950/30 border border-amber-800/50 rounded-lg flex items-start gap-3">
                    <span className="text-xs px-2 py-0.5 rounded font-bold uppercase bg-amber-700 text-white">
                      RISK
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-amber-200">{r.title}</h4>
                      <p className="text-xs text-zinc-400 mt-0.5">{r.description}</p>
                      {r.mitigation && (
                        <p className="text-xs text-zinc-300 mt-1">
                          <strong>Mitigation:</strong> {r.mitigation}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'REQUIREMENTS' && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase">
                <tr>
                  <th className="p-3">Key</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Tests</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {report.traceabilityMatrix.map((item, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/50">
                    <td className="p-3 font-mono text-indigo-400">{item.requirementKey}</td>
                    <td className="p-3 font-medium text-zinc-200">{item.title}</td>
                    <td className="p-3 text-zinc-400">{item.priority}</td>
                    <td className="p-3 text-zinc-400">{item.associatedTestCount}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-xs ${
                          item.verified
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                            : item.failingTests.length > 0
                            ? 'bg-red-950 text-red-300 border border-red-700/50'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {item.verified ? 'VERIFIED' : item.failingTests.length > 0 ? 'FAILING' : 'UNVERIFIED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'DEFECTS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">Defect Severities</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-red-400">Critical (P0)</span>
                  <span className="font-bold">{report.defectSummary.openCritical}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-amber-400">High (P1)</span>
                  <span className="font-bold">{report.defectSummary.openHigh}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span className="text-yellow-400">Medium (P2)</span>
                  <span className="font-bold">{report.defectSummary.openMedium}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-400">Low (P3)</span>
                  <span className="font-bold">{report.defectSummary.openLow}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">Failure Domain Separation</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span>Application Defects</span>
                  <span className="font-bold">{report.failureDomainSummary.applicationDefects}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span>Automation Harness Failures</span>
                  <span className="font-bold">{report.failureDomainSummary.automationFailures}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-800">
                  <span>Test Data Failures</span>
                  <span className="font-bold">{report.failureDomainSummary.testDataFailures}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Environment Failures</span>
                  <span className="font-bold">{report.failureDomainSummary.environmentFailures}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'HEALTH' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-lg space-y-2">
              <h4 className="text-xs text-zinc-400 uppercase">Environment Health</h4>
              <div className="text-lg font-bold text-zinc-200">{report.environmentHealth.status}</div>
              <p className="text-xs text-zinc-400">
                {report.environmentHealth.issues.join('; ') || 'No environment instability reported.'}
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-lg space-y-2">
              <h4 className="text-xs text-zinc-400 uppercase">Automation Harness Health</h4>
              <div className="text-lg font-bold text-zinc-200">{report.automationHealth.status}</div>
              <p className="text-xs text-zinc-400">
                {report.automationHealth.issues.join('; ') || 'Harness locator stability verified.'}
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-lg space-y-2">
              <h4 className="text-xs text-zinc-400 uppercase">Flakiness Assessment</h4>
              <div className="text-lg font-bold text-zinc-200">{report.flakinessSummary.flakinessRate}%</div>
              <p className="text-xs text-zinc-400">
                {report.flakinessSummary.flakyTestsDetected} flaky test cases identified during retries.
              </p>
            </div>
          </div>
        )}

        {/* Export Modal / Notification */}
        {exportResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-100">Export Generated</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  SEALED
                </span>
              </div>
              <div className="space-y-2 text-xs font-mono text-zinc-300">
                <p><strong>File Name:</strong> {exportResult.fileName}</p>
                <p><strong>Content Type:</strong> {exportResult.contentType}</p>
                <p><strong>SHA-256 Checksum:</strong> <span className="text-indigo-400">{exportResult.checksumSha256}</span></p>
              </div>
              <div className="max-h-60 overflow-y-auto bg-zinc-950 p-3 rounded border border-zinc-800 text-xs font-mono text-zinc-400 whitespace-pre-wrap">
                {exportResult.content}
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setExportResult(null)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
