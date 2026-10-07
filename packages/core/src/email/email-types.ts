/**
 * @file packages/core/src/email/email-types.ts
 * Core domain types and interfaces for the Phase 95 Email Notification System.
 */

import type {
  EmailProviderType,
  NotificationEventType,
  NotificationDeliveryStatus,
  NotificationDeliveryMode,
  NotificationAuditAction,
  ProjectEmailConfigDto,
  EmailNotificationDto,
  NotificationDeliveryAttemptDto,
} from '@ai-quality/contracts';

export type {
  EmailProviderType,
  NotificationEventType,
  NotificationDeliveryStatus,
  NotificationDeliveryMode,
  NotificationAuditAction,
  ProjectEmailConfigDto,
  EmailNotificationDto,
  NotificationDeliveryAttemptDto,
};

export interface SendEmailMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  from: string;
  replyTo?: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface SendEmailResult {
  accepted: boolean;
  providerMessageId?: string;
  providerResponse?: string;
  deliveryMode: NotificationDeliveryMode;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
  isTransient?: boolean;
  durationMs?: number;
}

export interface IEmailProvider {
  readonly providerType: EmailProviderType;
  send(message: SendEmailMessage): Promise<SendEmailResult>;
  validateConfiguration?(): Promise<{ valid: boolean; message?: string }>;
}

export interface EmailRecipient {
  userId?: string;
  email: string;
  name?: string;
  role: 'ASSIGNED_ENGINEER' | 'QA_OWNER' | 'PROJECT_OWNER' | 'CONFIGURED_RECIPIENT';
}

export interface WorkflowNotificationContext {
  projectId: string;
  eventType: NotificationEventType;
  entityType: 'BUG_REPORT' | 'DEFECT_OWNERSHIP' | 'FAILURE_CASE' | 'JIRA_ISSUE';
  entityId: string;
  bugReportId?: string;
  failureCaseId?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailTemplatePayload {
  projectName: string;
  projectKey?: string;
  eventType: NotificationEventType;
  eventDescription: string;
  bugReportNumber?: string;
  bugTitle?: string;
  bugSeverity?: string;
  bugPriority?: string;
  bugSummary?: string;
  testCaseKey?: string;
  testCaseTitle?: string;
  failureSummary?: string;
  errorMessage?: string;
  reproducibility?: string;
  assignedEngineerName?: string;
  assignedEngineerEmail?: string;
  previousEngineerName?: string;
  jiraIssueKey?: string;
  jiraIssueUrl?: string;
  actionUrl?: string;
  recipientName?: string;
  timestamp: string;
}

export interface RenderedEmail {
  subject: string;
  htmlBody: string;
  textBody: string;
  templateId: string;
  templateVersion: string;
}
