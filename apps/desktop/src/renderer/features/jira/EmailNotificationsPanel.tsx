/**
 * @file apps/desktop/src/renderer/features/jira/EmailNotificationsPanel.tsx
 * Transactional Email Notifications panel for reviewing notification delivery status,
 * recipient routing, idempotency audit, and triggering bounded retries.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { EmailNotificationDto, NotificationDeliveryStatus } from '@ai-quality/contracts';

export interface EmailNotificationsPanelProps {
  readonly projectId: string | null;
  readonly bugReportId?: string | null;
  readonly failureCaseId?: string | null;
}

export function EmailNotificationsPanel({
  projectId,
  bugReportId,
  failureCaseId,
}: EmailNotificationsPanelProps) {
  const [notifications, setNotifications] = useState<readonly EmailNotificationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!projectId || !window.desktop?.email?.listNotifications) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await window.desktop.email.listNotifications({
        projectId,
        bugReportId: bugReportId ?? undefined,
        failureCaseId: failureCaseId ?? undefined,
        page: 1,
        pageSize: 50,
      });

      if (result.ok) {
        setNotifications(result.data.items);
      } else {
        setErrorMessage(result.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, bugReportId, failureCaseId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleRetry = async (notificationId: string) => {
    if (!projectId || !window.desktop?.email?.retryNotification) return;

    setRetryingId(notificationId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await window.desktop.email.retryNotification({
        projectId,
        notificationId,
      });

      if (result.ok) {
        setSuccessMessage('Notification delivery retried.');
        await fetchNotifications();
      } else {
        setErrorMessage(result.error.message);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadgeStyle = (status: NotificationDeliveryStatus) => {
    switch (status) {
      case 'SENT':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'FAILED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'PENDING':
      case 'SENDING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'SUPPRESSED':
      case 'CANCELLED':
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div
      data-testid="email-notifications-panel"
      className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4"
    >
      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <span className="text-base">📧</span>
          <div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Email Notifications & Dispatch Audit
            </h3>
            <p className="text-[11px] text-slate-400">
              Authoritative transactional email dispatch status, recipient routing, and delivery
              logs
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="btn-refresh-notifications"
          onClick={fetchNotifications}
          disabled={isLoading}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold border border-slate-700 transition"
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {errorMessage && (
        <div
          data-testid="email-notification-error-banner"
          className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 flex justify-between items-center"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-300 hover:text-rose-200 text-xs font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div
          data-testid="email-notification-success-banner"
          className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-400 flex justify-between items-center"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-300 hover:text-emerald-200 text-xs font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div
          data-testid="empty-notifications-message"
          className="p-4 bg-slate-950/40 rounded border border-slate-800 text-center text-xs text-slate-500 italic"
        >
          No email notifications recorded for this context.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              data-testid="email-notification-row"
              className="p-3 bg-slate-950/60 rounded border border-slate-800 space-y-2 text-xs"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-200">{n.subject}</span>
                    <span
                      data-testid="notification-status-badge"
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusBadgeStyle(
                        n.status,
                      )}`}
                    >
                      {n.status}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                      {n.deliveryMode}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                    <div>
                      Recipient:{' '}
                      <span
                        data-testid="notification-recipient-address"
                        className="font-medium text-slate-300"
                      >
                        {n.recipientAddress}
                      </span>
                      {n.recipientName && (
                        <span className="text-slate-500 ml-1">({n.recipientName})</span>
                      )}
                    </div>
                    <div>•</div>
                    <div>
                      Event: <span className="font-mono text-slate-300">{n.eventType}</span>
                    </div>
                    <div>•</div>
                    <div>
                      Attempts:{' '}
                      <span className="font-mono text-slate-300">
                        {n.attemptCount} / {n.maxAttempts}
                      </span>
                    </div>
                  </div>
                </div>

                {n.status === 'FAILED' && n.attemptCount < n.maxAttempts && (
                  <button
                    type="button"
                    data-testid="btn-retry-notification"
                    disabled={retryingId === n.id}
                    onClick={() => handleRetry(n.id)}
                    className="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition flex items-center space-x-1"
                  >
                    <span>🔄</span>
                    <span>{retryingId === n.id ? 'Retrying...' : 'Retry Send'}</span>
                  </button>
                )}
              </div>

              {n.lastErrorMessage && (
                <div className="p-2 bg-rose-950/20 border border-rose-500/20 rounded text-[11px] text-rose-300">
                  <span className="font-bold mr-1">Error:</span>
                  <span>{n.lastErrorMessage}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                <span>ID: {n.id}</span>
                <span>
                  {n.sentAt
                    ? `Sent: ${new Date(n.sentAt).toLocaleString()}`
                    : `Queued: ${new Date(n.queuedAt).toLocaleString()}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
