/**
 * @file apps/desktop/src/renderer/features/jira/WorkflowSyncCard.tsx
 * UI component for Bug Status & External Workflow Synchronization (V7 Phase 96).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  BugWorkflowStateDto,
  WorkflowSyncEventDto,
  InternalBugStatusDto,
} from '@ai-quality/contracts';

export interface WorkflowSyncCardProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly bugReportId?: string;
  readonly jiraIssueKey?: string;
}

const ALL_INTERNAL_STATUSES: readonly InternalBugStatusDto[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'REOPENED',
  'CLOSED',
  'BLOCKED',
  'WONT_FIX',
  'DUPLICATE',
];

export const WorkflowSyncCard: React.FC<WorkflowSyncCardProps> = ({
  projectId,
  failureCaseId,
  bugReportId,
  jiraIssueKey,
}) => {
  const [workflowState, setWorkflowState] = useState<BugWorkflowStateDto | null>(null);
  const [syncEvents, setSyncEvents] = useState<readonly WorkflowSyncEventDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTargetStatus, setSelectedTargetStatus] =
    useState<InternalBugStatusDto>('IN_PROGRESS');
  const [statusReason, setStatusReason] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false);
  const [conflictResolutionNote, setConflictResolutionNote] = useState<string>('');

  const loadWorkflowState = useCallback(async () => {
    const bridge = window.desktop?.workflow;
    if (!bridge) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await bridge.getState({ projectId, failureCaseId, bugReportId });
      if (res.ok) {
        setWorkflowState(res.data);
      } else {
        setError(res.error.message);
      }

      const eventsRes = await bridge.listSyncEvents({
        projectId,
        failureCaseId,
        pageSize: 10,
      });
      if (eventsRes.ok) {
        setSyncEvents(eventsRes.data.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, failureCaseId, bugReportId]);

  useEffect(() => {
    loadWorkflowState();
  }, [loadWorkflowState]);

  const handleSyncNow = async () => {
    const bridge = window.desktop?.workflow;
    if (!bridge) return;

    setIsSyncing(true);
    setError(null);
    try {
      const res = await bridge.syncNow({ projectId, failureCaseId });
      if (res.ok) {
        setWorkflowState(res.data);
        const eventsRes = await bridge.listSyncEvents({ projectId, failureCaseId, pageSize: 10 });
        if (eventsRes.ok) setSyncEvents(eventsRes.data.items);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateStatus = async () => {
    const bridge = window.desktop?.workflow;
    if (!bridge || !workflowState) return;

    setIsSyncing(true);
    setError(null);
    try {
      const res = await bridge.updateInternalStatus({
        projectId,
        failureCaseId,
        targetStatus: selectedTargetStatus,
        reason: statusReason || undefined,
        syncExternal: true,
      });
      if (res.ok) {
        setWorkflowState(res.data);
        setStatusReason('');
        const eventsRes = await bridge.listSyncEvents({ projectId, failureCaseId, pageSize: 10 });
        if (eventsRes.ok) setSyncEvents(eventsRes.data.items);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (chosenWinner: 'INTERNAL' | 'EXTERNAL') => {
    const bridge = window.desktop?.workflow;
    if (!bridge || !workflowState) return;

    setIsSyncing(true);
    setError(null);
    try {
      const res = await bridge.resolveConflict({
        projectId,
        failureCaseId,
        chosenWinner,
        resolutionNote: conflictResolutionNote || `Manually resolved in favor of ${chosenWinner}`,
      });
      if (res.ok) {
        setWorkflowState(res.data);
        setShowResolveModal(false);
        setConflictResolutionNote('');
        const eventsRes = await bridge.listSyncEvents({ projectId, failureCaseId, pageSize: 10 });
        if (eventsRes.ok) setSyncEvents(eventsRes.data.items);
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const hasConflict =
    Boolean(workflowState?.conflictState) || workflowState?.lastSyncResult === 'CONFLICT';

  return (
    <div
      data-testid="workflow-sync-card"
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: '#ffffff',
        marginTop: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
          Workflow & Status Synchronization
        </h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            data-testid="sync-now-button"
            onClick={handleSyncNow}
            disabled={isSyncing || isLoading}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              backgroundColor: isSyncing ? '#94a3b8' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            data-testid="view-sync-history-button"
            onClick={() => setShowHistory(!showHistory)}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {showHistory ? 'Hide History' : 'Sync History'}
          </button>
        </div>
      </div>

      {error && (
        <div
          data-testid="workflow-error-alert"
          style={{
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '13px',
            marginBottom: '12px',
          }}
        >
          {error}
        </div>
      )}

      {hasConflict && (
        <div
          data-testid="workflow-conflict-banner"
          style={{
            padding: '12px 14px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            color: '#92400e',
            fontSize: '13px',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Synchronization Conflict Detected
          </div>
          <div>
            Internal status ({workflowState?.currentStatus}) disagrees with external status (
            {workflowState?.lastExternalStatus ?? 'Unknown'}). Independent changes detected on both
            sides.
          </div>
          <button
            data-testid="resolve-conflict-button"
            onClick={() => setShowResolveModal(true)}
            style={{
              marginTop: '8px',
              padding: '4px 10px',
              backgroundColor: '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            Resolve Conflict
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Internal Status
          </div>
          <div
            data-testid="internal-status-badge"
            style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '4px' }}
          >
            {workflowState?.currentStatus ?? 'OPEN'}
          </div>
        </div>

        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            External Jira Status
          </div>
          <div
            data-testid="external-jira-status-badge"
            style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '4px' }}
          >
            {workflowState?.lastExternalStatus ?? (jiraIssueKey ? 'Not Synced' : 'Unlinked')}
          </div>
        </div>

        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Verification Status
          </div>
          <div
            data-testid="verification-status-badge"
            style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginTop: '4px' }}
          >
            {workflowState?.verificationStatus ?? 'NOT_VERIFIED'}
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
            Independent of Jira resolution
          </div>
        </div>

        <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Sync State
          </div>
          <div
            data-testid="sync-result-badge"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color:
                workflowState?.lastSyncResult === 'SYNCED'
                  ? '#16a34a'
                  : workflowState?.lastSyncResult === 'CONFLICT'
                    ? '#d97706'
                    : workflowState?.lastSyncResult === 'UNMAPPED' ||
                        workflowState?.lastSyncResult === 'BLOCKED'
                      ? '#dc2626'
                      : '#475569',
              marginTop: '4px',
            }}
          >
            {workflowState?.lastSyncResult ?? 'PENDING'}
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
            {workflowState?.lastSyncedAt
              ? new Date(workflowState.lastSyncedAt).toLocaleTimeString()
              : 'Never synced'}
          </div>
        </div>
      </div>

      {/* Internal status transition control */}
      <div
        style={{
          borderTop: '1px solid #f1f5f9',
          paddingTop: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
          Transition Internal Status:
        </label>
        <select
          data-testid="target-status-select"
          value={selectedTargetStatus}
          onChange={e => setSelectedTargetStatus(e.target.value as InternalBugStatusDto)}
          style={{
            padding: '5px 8px',
            fontSize: '13px',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
          }}
        >
          {ALL_INTERNAL_STATUSES.map(status => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          data-testid="status-reason-input"
          type="text"
          placeholder="Reason for change (optional)"
          value={statusReason}
          onChange={e => setStatusReason(e.target.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '13px',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
          }}
        />
        <button
          data-testid="update-status-button"
          onClick={handleUpdateStatus}
          disabled={isSyncing}
          style={{
            padding: '6px 12px',
            fontSize: '13px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          Update Status
        </button>
      </div>

      {/* History table */}
      {showHistory && (
        <div
          data-testid="sync-history-panel"
          style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}
        >
          <h5 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#334155' }}>
            Recent Synchronization Events
          </h5>
          {syncEvents.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>No sync events recorded yet.</div>
          ) : (
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '6px 8px' }}>Time</th>
                  <th style={{ padding: '6px 8px' }}>Direction</th>
                  <th style={{ padding: '6px 8px' }}>Source</th>
                  <th style={{ padding: '6px 8px' }}>Target</th>
                  <th style={{ padding: '6px 8px' }}>Result</th>
                  <th style={{ padding: '6px 8px' }}>Actor</th>
                </tr>
              </thead>
              <tbody>
                {syncEvents.map(evt => (
                  <tr key={evt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px' }}>
                      {new Date(evt.startedAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '6px 8px' }}>{evt.direction}</td>
                    <td style={{ padding: '6px 8px' }}>{evt.sourceStatus}</td>
                    <td style={{ padding: '6px 8px' }}>{evt.targetStatus ?? '-'}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{evt.syncResult}</td>
                    <td style={{ padding: '6px 8px' }}>{evt.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {showResolveModal && (
        <div
          data-testid="conflict-resolution-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0' }}>Resolve Workflow Conflict</h4>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Both internal and external states have changed independently. Choose which system is
              authoritative:
            </p>
            <div style={{ marginBottom: '16px' }}>
              <input
                data-testid="conflict-resolution-note-input"
                type="text"
                placeholder="Resolution note (required)"
                value={conflictResolutionNote}
                onChange={e => setConflictResolutionNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                data-testid="resolve-cancel-button"
                onClick={() => setShowResolveModal(false)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  background: '#fff',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="resolve-internal-wins-button"
                onClick={() => handleResolveConflict('INTERNAL')}
                disabled={!conflictResolutionNote.trim()}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Internal Wins ({workflowState?.currentStatus})
              </button>
              <button
                data-testid="resolve-external-wins-button"
                onClick={() => handleResolveConflict('EXTERNAL')}
                disabled={!conflictResolutionNote.trim()}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                External Wins ({workflowState?.lastExternalStatus})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
