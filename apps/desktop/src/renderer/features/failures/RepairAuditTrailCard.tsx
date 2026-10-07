/**
 * @file apps/desktop/src/renderer/features/failures/RepairAuditTrailCard.tsx
 * UI component for Complete Repair & Reverification Audit Trail (V7 Phase 108).
 * Renders an authoritative append-only chronological timeline reconstructing the entire defect repair
 * and reverification lifecycle with multi-actor attribution badges, state transitions, evidence references,
 * and cryptographic JSON/Markdown export triggers.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  RepairAuditTimelineDto,
  RepairAuditActorType,
  ExportRepairTimelineResultDto,
} from '@ai-quality/contracts';

export interface RepairAuditTrailCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly initialTimeline?: RepairAuditTimelineDto | null;
}

export const RepairAuditTrailCard: React.FC<RepairAuditTrailCardProps> = ({
  projectId,
  failureCaseId,
  initialTimeline,
}) => {
  const [timeline, setTimeline] = useState<RepairAuditTimelineDto | null>(initialTimeline ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<ExportRepairTimelineResultDto | null>(null);
  const [copiedChecksum, setCopiedChecksum] = useState<boolean>(false);

  const activeProjectRef = useRef(projectId);
  const activeFailureRef = useRef(failureCaseId);

  useEffect(() => {
    activeProjectRef.current = projectId;
    activeFailureRef.current = failureCaseId;
  }, [projectId, failureCaseId]);

  const loadTimeline = useCallback(async () => {
    const bridge = window.desktop?.audit;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await bridge.getTimeline({
        projectId,
        failureCaseId,
        limit: 200,
      });

      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        if (res.ok) {
          setTimeline(res.data);
        } else {
          setError(res.error.message);
        }
      }
    } catch (err) {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeProjectRef.current === projectId && activeFailureRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const handleExport = async (format: 'JSON' | 'MARKDOWN') => {
    const bridge = window.desktop?.audit;
    if (!bridge) return;

    setIsExporting(true);
    setExportResult(null);

    try {
      const res = await bridge.exportTimeline({
        projectId,
        failureCaseId,
        format,
      });

      if (res.ok) {
        setExportResult(res.data);
        // Create browser download
        const blob = new Blob([res.data.content], {
          type: format === 'JSON' ? 'application/json' : 'text/markdown',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.data.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const getActorBadge = (actorType: RepairAuditActorType, actorId: string) => {
    switch (actorType) {
      case 'USER':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-950/80 text-amber-300 border border-amber-800"
          >
            HUMAN DECISION ({actorId})
          </span>
        );
      case 'AI':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-950/80 text-purple-300 border border-purple-800"
          >
            AI PROPOSAL ({actorId})
          </span>
        );
      case 'TEST_ENGINE':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-950/80 text-blue-300 border border-blue-800"
          >
            TEST RESULT ({actorId})
          </span>
        );
      case 'JIRA_INTEGRATION':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-sky-950/80 text-sky-300 border border-sky-800"
          >
            EXTERNAL JIRA ACTION ({actorId})
          </span>
        );
      case 'NOTIFICATION_SERVICE':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800"
          >
            NOTIFICATION ({actorId})
          </span>
        );
      case 'REPAIR_ENGINE':
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800"
          >
            REPAIR ENGINE ({actorId})
          </span>
        );
      case 'SYSTEM':
      default:
        return (
          <span
            data-testid="actor-badge"
            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-300 border border-slate-700"
          >
            SYSTEM FACT ({actorId})
          </span>
        );
    }
  };

  const filteredEvents = (timeline?.events || []).filter(evt => {
    if (actorFilter !== 'ALL' && evt.actorType !== actorFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchType = evt.eventType.toLowerCase().includes(q);
      const matchActor = evt.actorId.toLowerCase().includes(q);
      const matchReason = evt.reason?.toLowerCase().includes(q) ?? false;
      const matchComp = evt.sourceComponent.toLowerCase().includes(q);
      return matchType || matchActor || matchReason || matchComp;
    }
    return true;
  });

  return (
    <div
      data-testid="repair-audit-trail-card"
      className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <span className="text-amber-500 font-bold text-sm">📜</span>
          <h3 className="text-sm font-semibold text-slate-200">
            Complete Repair & Reverification Audit Trail
          </h3>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            V7 Phase 108
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {timeline?.session && (
            <span
              data-testid="session-status-badge"
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                timeline.session.status === 'COMPLETED' || timeline.session.status === 'VERIFIED'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : timeline.session.status === 'REVERTED' || timeline.session.status === 'FAILED'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-blue-950 text-blue-300 border border-blue-800'
              }`}
            >
              SESSION: {timeline.session.status} (#{timeline.session.totalEventsCount} events)
            </span>
          )}
          <button
            onClick={() => void loadTimeline()}
            disabled={isLoading}
            className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition disabled:opacity-50"
            title="Refresh Audit Trail"
          >
            {isLoading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          data-testid="audit-error-message"
          className="text-xs p-2 bg-rose-950/60 border border-rose-800 text-rose-300 rounded"
        >
          {error}
        </div>
      )}

      {/* Controls: Filter by Actor & Search & Export */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center space-x-2">
          <label className="text-[11px] text-slate-400">Actor Filter:</label>
          <select
            data-testid="filter-actor-select"
            value={actorFilter}
            onChange={e => setActorFilter(e.target.value)}
            className="text-xs bg-slate-950 border border-slate-700 text-slate-300 rounded px-2 py-1 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Actors</option>
            <option value="USER">Human Decisions (USER)</option>
            <option value="AI">AI Proposals (AI)</option>
            <option value="TEST_ENGINE">Test Engine Results</option>
            <option value="JIRA_INTEGRATION">Jira Integration Actions</option>
            <option value="NOTIFICATION_SERVICE">Notification Service</option>
            <option value="REPAIR_ENGINE">Repair Engine Actions</option>
            <option value="SYSTEM">System Orchestrator</option>
          </select>

          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-xs bg-slate-950 border border-slate-700 text-slate-300 rounded px-2 py-1 w-44 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Export Buttons */}
        <div className="flex items-center space-x-2">
          <button
            data-testid="export-json-button"
            onClick={() => void handleExport('JSON')}
            disabled={isExporting || isLoading || !timeline?.events.length}
            className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-medium rounded border border-slate-700 transition disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export JSON'}
          </button>
          <button
            data-testid="export-markdown-button"
            onClick={() => void handleExport('MARKDOWN')}
            disabled={isExporting || isLoading || !timeline?.events.length}
            className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 font-medium rounded border border-slate-700 transition disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Markdown'}
          </button>
        </div>
      </div>

      {/* Export Result Checksum Notification */}
      {exportResult && (
        <div
          data-testid="export-checksum-alert"
          className="text-xs p-2 bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 rounded flex items-center justify-between"
        >
          <div>
            <span className="font-semibold">Export Ready:</span> {exportResult.fileName} (
            {exportResult.eventCount} events, {exportResult.content.length} chars)
            <span className="block text-[10px] text-emerald-400/80 font-mono mt-0.5">
              SHA-256: {exportResult.checksumSha256}
            </span>
          </div>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(exportResult.checksumSha256);
              setCopiedChecksum(true);
              setTimeout(() => setCopiedChecksum(false), 2000);
            }}
            className="text-[10px] px-2 py-0.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 rounded border border-emerald-700 shrink-0 ml-2"
          >
            {copiedChecksum ? 'Copied!' : 'Copy Checksum'}
          </button>
        </div>
      )}

      {/* Timeline List */}
      <div className="space-y-2 mt-2 max-h-96 overflow-y-auto pr-1">
        {filteredEvents.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center">
            {isLoading
              ? 'Loading authoritative audit trail...'
              : 'No audit events found matching the filter.'}
          </p>
        ) : (
          filteredEvents.map(evt => (
            <div
              key={evt.id}
              data-testid="audit-event-item"
              className="text-xs p-2.5 bg-slate-950/90 rounded border border-slate-800 space-y-1 hover:border-slate-700 transition"
            >
              {/* Event Top Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-slate-500 text-[10px]">
                    #{evt.sequenceNumber}
                  </span>
                  <span className="font-semibold text-slate-200">
                    {evt.eventType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    {evt.sourceComponent}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {getActorBadge(evt.actorType, evt.actorId)}
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(evt.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* State Transition */}
              {(evt.previousState || evt.newState) && (
                <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 pt-0.5">
                  <span className="text-slate-500">State:</span>
                  <span className="font-mono text-slate-400 bg-slate-900 px-1 rounded">
                    {evt.previousState ?? 'NONE'}
                  </span>
                  <span className="text-slate-600">→</span>
                  <span className="font-mono text-amber-400 bg-slate-900 px-1 rounded">
                    {evt.newState ?? 'NONE'}
                  </span>
                </div>
              )}

              {/* Reason / Summary */}
              {evt.reason && <p className="text-[11px] text-slate-300 pt-0.5">{evt.reason}</p>}

              {/* Jira Reference */}
              {evt.jiraReference && (
                <div className="text-[10px] text-sky-400 bg-sky-950/30 border border-sky-900/50 rounded px-2 py-1 flex items-center space-x-2">
                  <span>Jira:</span>
                  <span className="font-semibold font-mono">{evt.jiraReference.issueKey}</span>
                  {evt.jiraReference.status && (
                    <span className="text-slate-400">({evt.jiraReference.status})</span>
                  )}
                </div>
              )}

              {/* Notification Reference */}
              {evt.notificationReference && (
                <div className="text-[10px] text-indigo-400 bg-indigo-950/30 border border-indigo-900/50 rounded px-2 py-1 flex items-center space-x-2">
                  <span>Notification:</span>
                  <span className="font-mono">{evt.notificationReference.recipientEmail}</span>
                  <span className="text-slate-400">
                    ({evt.notificationReference.deliveryStatus})
                  </span>
                </div>
              )}

              {/* Traceability Footnote */}
              <div className="text-[9px] text-slate-600 font-mono pt-0.5 flex items-center space-x-3">
                <span>corr: {evt.correlationId.slice(0, 8)}...</span>
                {evt.causationId && <span>caus: {evt.causationId.slice(0, 8)}...</span>}
                <span className="truncate max-w-[200px]" title={evt.idempotencyKey}>
                  key: {evt.idempotencyKey}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
