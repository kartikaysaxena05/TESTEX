/**
 * @file apps/desktop/src/renderer/features/conversational-agent/EvidenceReviewDrawer.tsx
 * Evidence review drawer with screenshot viewer, console log stream, network inspector,
 * DOM snapshot view, failure classification, bug triage, and grounded NL queries.
 */

import React, { useState } from 'react';
import type {
  AgentEvidenceQueryResultDto,
  AgentEvidenceReferenceDto,
} from '@ai-quality/contracts';
import { Badge, Button, Spinner } from '../../ui/index.js';

export interface EvidenceReviewDrawerProps {
  readonly evidenceResult?: AgentEvidenceQueryResultDto | null;
  readonly isQuerying?: boolean;
  readonly onQueryEvidence: (query: string) => Promise<void>;
}

type EvidenceTab = 'overview' | 'screenshots' | 'logs' | 'network' | 'dom' | 'provenance';

export function EvidenceReviewDrawer({
  evidenceResult,
  isQuerying = false,
  onQueryEvidence,
}: EvidenceReviewDrawerProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<EvidenceTab>('overview');
  const [queryInput, setQueryInput] = useState('');
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || isQuerying) return;
    await onQueryEvidence(queryInput.trim());
  };

  const evidenceItems = evidenceResult?.evidenceItems ?? [];
  const screenshots = evidenceItems.filter((item) => item.artifactType === 'SCREENSHOT');
  const logs = evidenceItems.filter((item) => item.artifactType === 'CONSOLE_LOG');
  const networkTraces = evidenceItems.filter((item) => item.artifactType === 'NETWORK_TRACE');
  const domSnapshots = evidenceItems.filter((item) => item.artifactType === 'DOM_SNAPSHOT');

  const failure = evidenceResult?.failureAnalysis;

  const getClassificationBadgeVariant = (classification?: string | null) => {
    switch (classification) {
      case 'PRODUCT_DEFECT':
        return 'danger';
      case 'ENVIRONMENT_ISSUE':
        return 'warning';
      case 'TEST_DEFECT':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div
      className="evidence-review-drawer bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col h-full overflow-hidden"
      data-testid="evidence-review-drawer"
    >
      {/* 1. HEADER & GROUNDED EVIDENCE QUERY BAR */}
      <div className="p-3 border-b border-neutral-800 space-y-2 bg-neutral-900/90">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Evidence Review & Diagnostics
          </span>
          {evidenceResult?.verdict && (
            <Badge variant={evidenceResult.verdict === 'PASSED' ? 'success' : 'danger'}>
              {evidenceResult.verdict}
            </Badge>
          )}
        </div>

        <form onSubmit={handleQuerySubmit} className="flex gap-1.5" data-testid="evidence-query-form">
          <input
            type="text"
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500"
            placeholder="Ask evidence question (e.g. Why did Step 2 fail?)..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            disabled={isQuerying}
            data-testid="evidence-query-input"
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!queryInput.trim() || isQuerying}
            data-testid="evidence-query-submit-btn"
          >
            {isQuerying ? <Spinner size="sm" /> : 'Ask'}
          </Button>
        </form>

        {/* NATURAL LANGUAGE EXPLANATION */}
        {evidenceResult?.naturalLanguageExplanation && (
          <div
            className="text-xs bg-blue-950/40 border border-blue-900/60 rounded p-2 text-blue-200"
            data-testid="evidence-nl-explanation"
          >
            <span className="font-semibold text-blue-300">Agent Diagnosis: </span>
            {evidenceResult.naturalLanguageExplanation}
          </div>
        )}
      </div>

      {/* 2. TAB NAVIGATION */}
      <div className="flex border-b border-neutral-800 px-2 bg-neutral-950/40 text-xs overflow-x-auto" role="tablist">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'screenshots', label: `Screenshots (${screenshots.length})` },
            { id: 'logs', label: `Console (${logs.length})` },
            { id: 'network', label: `Network (${networkTraces.length})` },
            { id: 'dom', label: `DOM (${domSnapshots.length})` },
            { id: 'provenance', label: 'Provenance' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`px-3 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`evidence-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. TAB CONTENT BODY */}
      <div className="flex-1 p-3 overflow-y-auto text-xs space-y-3">
        {/* TAB: OVERVIEW & FAILURE ANALYSIS */}
        {activeTab === 'overview' && (
          <div className="space-y-3" data-testid="evidence-tab-content-overview">
            {failure ? (
              <div className="bg-neutral-950/60 border border-neutral-800 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-300">Failure Classification</span>
                  <Badge variant={getClassificationBadgeVariant(failure.classification)}>
                    {failure.classification ?? 'UNCLASSIFIED'}
                  </Badge>
                </div>
                {failure.failureSignature && (
                  <div>
                    <span className="text-neutral-500">Signature: </span>
                    <span className="font-mono text-amber-400">{failure.failureSignature}</span>
                  </div>
                )}
                {failure.rootCause && (
                  <div>
                    <span className="text-neutral-500">Root Cause: </span>
                    <span className="text-rose-300">{failure.rootCause}</span>
                  </div>
                )}
                {failure.suggestedFix && (
                  <div>
                    <span className="text-neutral-500">Suggested Fix: </span>
                    <span className="text-emerald-300">{failure.suggestedFix}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-neutral-500 text-center py-4">No failure recorded for this run.</div>
            )}

            {/* QUICK EVIDENCE METRICS */}
            <div className="grid grid-cols-2 gap-2 text-neutral-400">
              <div className="bg-neutral-950/40 p-2 rounded border border-neutral-800/60">
                <span className="text-neutral-500 block">Test Case:</span>
                <span className="font-mono text-neutral-200">{evidenceResult?.testCaseKey ?? 'N/A'}</span>
              </div>
              <div className="bg-neutral-950/40 p-2 rounded border border-neutral-800/60">
                <span className="text-neutral-500 block">Requirement:</span>
                <span className="font-mono text-neutral-200">{evidenceResult?.requirementKey ?? 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SCREENSHOTS */}
        {activeTab === 'screenshots' && (
          <div className="space-y-3" data-testid="evidence-tab-content-screenshots">
            {screenshots.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No screenshots captured.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {screenshots.map((s) => (
                  <div
                    key={s.evidenceId}
                    className="border border-neutral-800 rounded overflow-hidden bg-black/40 cursor-pointer hover:border-neutral-700"
                    onClick={() => setSelectedScreenshot(s.urlOrPath ?? null)}
                  >
                    <div className="p-1.5 bg-neutral-950 text-[10px] text-neutral-400 truncate flex justify-between">
                      <span>{s.title || s.artifactType}</span>
                      <span>{s.stepNumber ? `Step ${s.stepNumber}` : ''}</span>
                    </div>
                    {s.urlOrPath && (
                      <img
                        src={s.urlOrPath}
                        alt={`Step screenshot: ${s.stepNumber ?? ''}`}
                        className="w-full h-auto max-h-48 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextElementSibling) {
                            (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block';
                          }
                        }}
                      />
                    )}
                    <div className="p-4 text-center text-neutral-500 text-xs">
                      [Screenshot: {s.title || s.urlOrPath}]
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: CONSOLE LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-2 font-mono text-[11px]" data-testid="evidence-tab-content-logs">
            {logs.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No console logs captured.</div>
            ) : (
              logs.map((log) => (
                <div key={log.evidenceId} className="bg-neutral-950 p-2 rounded border border-neutral-800/80 space-y-1">
                  <div className="text-[10px] text-neutral-500 flex justify-between">
                    <span>{log.title}</span>
                    {log.stepNumber && <span>Step {log.stepNumber}</span>}
                  </div>
                  <pre className="text-neutral-300 whitespace-pre-wrap overflow-x-auto">
                    {log.actualResult || log.urlOrPath}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: NETWORK TRACES */}
        {activeTab === 'network' && (
          <div className="space-y-2" data-testid="evidence-tab-content-network">
            {networkTraces.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No network traces captured.</div>
            ) : (
              networkTraces.map((trace) => (
                <div key={trace.evidenceId} className="bg-neutral-950 p-2 rounded border border-neutral-800 flex justify-between items-center">
                  <span className="font-mono text-neutral-300 truncate max-w-[200px]">{trace.urlOrPath ?? trace.title}</span>
                  <Badge variant="neutral">TRACE</Badge>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: DOM SNAPSHOT */}
        {activeTab === 'dom' && (
          <div className="space-y-2" data-testid="evidence-tab-content-dom">
            {domSnapshots.length === 0 ? (
              <div className="text-neutral-500 text-center py-4">No DOM snapshot available.</div>
            ) : (
              domSnapshots.map((dom) => (
                <div key={dom.evidenceId} className="bg-neutral-950 p-2 rounded border border-neutral-800 text-[11px] font-mono">
                  <span className="text-neutral-400 block mb-1">Snapshot: {dom.title || dom.urlOrPath}</span>
                  <pre className="text-neutral-300 max-h-48 overflow-auto">
                    {dom.actualResult || dom.urlOrPath}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB: PROVENANCE CHAIN */}
        {activeTab === 'provenance' && (
          <div className="space-y-2" data-testid="evidence-tab-content-provenance">
            <span className="font-semibold text-neutral-300 block mb-2">Provenance Audit Trail</span>
            <div className="relative pl-4 border-l-2 border-neutral-800 space-y-3">
              {[
                { label: 'Project', value: 'Active Project Workspace' },
                { label: 'Requirement', value: evidenceResult?.requirementKey ?? 'N/A' },
                { label: 'Test Case', value: evidenceResult?.testCaseKey ?? 'N/A' },
                { label: 'Test Run', value: evidenceResult?.runId ?? 'N/A' },
                { label: 'Step Results', value: `${evidenceItems.length} artifact(s) captured` },
                { label: 'Evidence', value: evidenceItems.map((i) => i.artifactType).join(', ') || 'None' },
                { label: 'Failure Root Cause', value: failure?.rootCause ?? 'No defect detected' },
                { label: 'Bug Triage', value: failure?.classification ?? 'N/A' },
              ].map((step, idx) => (
                <div key={idx} className="relative">
                  <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block font-semibold">
                    {step.label}
                  </span>
                  <span className="text-neutral-300 font-mono text-[11px]">{step.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
