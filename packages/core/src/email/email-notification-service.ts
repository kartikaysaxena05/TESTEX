/**
 * @file packages/core/src/email/email-notification-service.ts
 * Central Email Notification Service for Phase 95.
 * Enforces authoritative domain resolution, project isolation, idempotency,
 * bounded retries, partial-failure decoupling, and full audit trailing.
 */

import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger } from '../logging/index.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import { JiraCredentialVault } from '../jira/jira-credential-vault.js';
import type {
  IEmailProvider,
  EmailRecipient,
  WorkflowNotificationContext,
  EmailTemplatePayload,
} from './email-types.js';
import {
  EmailConfigurationMissingError,
  EmailCrossProjectError,
  EmailNotFoundError,
  EmailRetryLimitExceededError,
  EmailRecipientInvalidError,
} from './email-errors.js';
import { SmtpEmailProvider } from './smtp-provider.js';
import { SandboxEmailProvider } from './sandbox-provider.js';
import { EmailTemplateEngine } from './email-templates.js';
import type {
  ProjectEmailConfigDto,
  SaveProjectEmailConfigInputDto,
  EmailNotificationDto,
  ListEmailNotificationsInputDto,
  NotificationEventType,
} from '@ai-quality/contracts';

const SEVERITY_LEVELS: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export class EmailNotificationService {
  private readonly prisma: PrismaClient;
  private readonly credentialVault: JiraCredentialVault;
  private customProvider: IEmailProvider | null = null;
  private readonly mutexMap: Map<string, Promise<unknown>> = new Map();

  constructor(prisma?: PrismaClient, customProvider?: IEmailProvider) {
    const client = prisma ?? getPrismaClient();
    if (!client) {
      throw new Error('PrismaClient is not initialized. Ensure DATABASE_URL is set.');
    }
    this.prisma = client;
    this.credentialVault = new JiraCredentialVault();
    this.customProvider = customProvider ?? null;
  }

  public setCustomProvider(provider: IEmailProvider | null): void {
    this.customProvider = provider;
  }

  // ---------------------------------------------------------------------------
  // Configuration Management
  // ---------------------------------------------------------------------------

  public async getConfig(projectId: string): Promise<ProjectEmailConfigDto | null> {
    const config = await this.prisma.projectEmailConfig.findUnique({
      where: { projectId },
    });

    if (!config) return null;

    return {
      id: config.id,
      projectId: config.projectId,
      providerType: config.providerType,
      senderName: config.senderName,
      senderAddress: config.senderAddress,
      replyTo: config.replyTo,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
      isConfigured: Boolean(config.smtpHost && config.senderAddress),
      isEnabled: config.isEnabled,
      isTestMode: config.isTestMode,
      testInboxAddress: config.testInboxAddress,
      minSeverity: config.minSeverity,
      notifyOnBugCreated: config.notifyOnBugCreated,
      notifyOnBugAssigned: config.notifyOnBugAssigned,
      notifyOnJiraAction: config.notifyOnJiraAction,
      qaTeamRecipients: (config.qaTeamRecipients as Array<{ email: string; name?: string }>) ?? [],
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  public async saveConfig(input: SaveProjectEmailConfigInputDto): Promise<ProjectEmailConfigDto> {
    // Validate project existence
    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
    });
    if (!project) {
      throw new EmailCrossProjectError(`Project ${input.projectId} not found.`);
    }

    if (!this.isValidEmail(input.senderAddress)) {
      throw new EmailRecipientInvalidError(`Invalid sender address: ${input.senderAddress}`);
    }

    let encryptedPassword: string | undefined = undefined;
    if (input.smtpPassword) {
      SecretRedactor.registerSecret(input.smtpPassword);
      encryptedPassword = await this.credentialVault.encrypt(
        input.smtpPassword,
        `email-config-${input.projectId}`,
      );
    }

    const qaRecipientsJson = JSON.parse(JSON.stringify(input.qaTeamRecipients ?? []));

    const upserted = await this.prisma.projectEmailConfig.upsert({
      where: { projectId: input.projectId },
      create: {
        projectId: input.projectId,
        providerType: input.providerType ?? 'SMTP',
        senderName: input.senderName ?? 'AI Quality Platform',
        senderAddress: input.senderAddress,
        replyTo: input.replyTo,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort ?? 587,
        smtpSecure: input.smtpSecure ?? false,
        smtpUser: input.smtpUser,
        smtpPasswordEncrypted: encryptedPassword,
        isEnabled: input.isEnabled ?? true,
        isTestMode: input.isTestMode ?? false,
        testInboxAddress: input.testInboxAddress,
        minSeverity: input.minSeverity ?? 'MEDIUM',
        notifyOnBugCreated: input.notifyOnBugCreated ?? true,
        notifyOnBugAssigned: input.notifyOnBugAssigned ?? true,
        notifyOnJiraAction: input.notifyOnJiraAction ?? true,
        qaTeamRecipients: qaRecipientsJson,
      },
      update: {
        providerType: input.providerType,
        senderName: input.senderName,
        senderAddress: input.senderAddress,
        replyTo: input.replyTo,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUser: input.smtpUser,
        ...(encryptedPassword ? { smtpPasswordEncrypted: encryptedPassword } : {}),
        isEnabled: input.isEnabled,
        isTestMode: input.isTestMode,
        testInboxAddress: input.testInboxAddress,
        minSeverity: input.minSeverity,
        notifyOnBugCreated: input.notifyOnBugCreated,
        notifyOnBugAssigned: input.notifyOnBugAssigned,
        notifyOnJiraAction: input.notifyOnJiraAction,
        qaTeamRecipients: input.qaTeamRecipients ? qaRecipientsJson : undefined,
      },
    });

    return {
      id: upserted.id,
      projectId: upserted.projectId,
      providerType: upserted.providerType,
      senderName: upserted.senderName,
      senderAddress: upserted.senderAddress,
      replyTo: upserted.replyTo,
      smtpHost: upserted.smtpHost,
      smtpPort: upserted.smtpPort,
      smtpSecure: upserted.smtpSecure,
      smtpUser: upserted.smtpUser,
      isConfigured: Boolean(upserted.smtpHost && upserted.senderAddress),
      isEnabled: upserted.isEnabled,
      isTestMode: upserted.isTestMode,
      testInboxAddress: upserted.testInboxAddress,
      minSeverity: upserted.minSeverity,
      notifyOnBugCreated: upserted.notifyOnBugCreated,
      notifyOnBugAssigned: upserted.notifyOnBugAssigned,
      notifyOnJiraAction: upserted.notifyOnJiraAction,
      qaTeamRecipients:
        (upserted.qaTeamRecipients as Array<{ email: string; name?: string }>) ?? [],
      createdAt: upserted.createdAt,
      updatedAt: upserted.updatedAt,
    };
  }

  public async testConnection(
    projectId: string,
    testRecipientEmail?: string,
  ): Promise<{ success: boolean; provider: string; message: string }> {
    const config = await this.prisma.projectEmailConfig.findUnique({
      where: { projectId },
    });

    if (!config) {
      throw new EmailConfigurationMissingError(
        `Email configuration not found for project ${projectId}.`,
      );
    }

    const provider = await this.resolveProvider(config);

    if (testRecipientEmail && this.isValidEmail(testRecipientEmail)) {
      const res = await provider.send({
        from: config.senderAddress,
        to: [testRecipientEmail],
        subject: '[Test] AI Quality Platform Email Verification',
        textBody: 'This is a test notification confirming that email delivery is working properly.',
        htmlBody:
          '<p>This is a test notification confirming that email delivery is working properly.</p>',
      });
      return {
        success: res.accepted,
        provider: provider.providerType,
        message: res.accepted
          ? 'Test email delivered successfully.'
          : (res.errorMessage ?? 'Delivery failed'),
      };
    }

    if (provider.validateConfiguration) {
      const validRes = await provider.validateConfiguration();
      return {
        success: validRes.valid,
        provider: provider.providerType,
        message:
          validRes.message ??
          (validRes.valid ? 'Configuration validated successfully.' : 'Validation failed'),
      };
    }

    return {
      success: true,
      provider: provider.providerType,
      message: 'Provider is available.',
    };
  }

  // ---------------------------------------------------------------------------
  // Authoritative Workflow Notification Processing
  // ---------------------------------------------------------------------------

  public async notifyWorkflowEvent(
    context: WorkflowNotificationContext,
  ): Promise<EmailNotificationDto[]> {
    const { projectId, eventType } = context;

    // 1. Verify Project
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { projectEmailConfig: true },
    });
    if (!project) {
      throw new EmailCrossProjectError(`Project ${projectId} not found.`);
    }

    // 2. Load Authoritative Domain Data & Validate Project Boundaries
    let bugReport: any = null;
    let failureCase: any = null;

    if (context.bugReportId) {
      bugReport = await this.prisma.structuredBugReport.findUnique({
        where: { id: context.bugReportId },
        include: {
          failureCase: true,
          defectOwnership: {
            include: { assignedEngineer: true },
          },
          jiraIssueLinks: {
            where: { isActive: true },
            take: 1,
          },
        },
      });

      if (!bugReport || bugReport.projectId !== projectId) {
        throw new EmailCrossProjectError('Bug report does not belong to the specified project.');
      }
      failureCase = bugReport.failureCase;
    } else if (context.failureCaseId) {
      failureCase = await this.prisma.failureCase.findUnique({
        where: { id: context.failureCaseId },
        include: {
          structuredBugReports: {
            where: { isAuthoritative: true },
            include: {
              defectOwnership: { include: { assignedEngineer: true } },
              jiraIssueLinks: { where: { isActive: true }, take: 1 },
            },
            take: 1,
          },
          defectOwnerships: {
            include: { assignedEngineer: true },
            take: 1,
          },
          jiraIssueLinks: {
            where: { isActive: true },
            take: 1,
          },
        },
      });

      if (!failureCase || failureCase.projectId !== projectId) {
        throw new EmailCrossProjectError('Failure case does not belong to the specified project.');
      }
      bugReport = failureCase.structuredBugReports[0] ?? null;
    }

    const emailConfig = project.projectEmailConfig;
    if (!emailConfig || !emailConfig.isEnabled) {
      getLogger().info('email.suppressed_disabled', { projectId, eventType });
      return [];
    }

    // 3. Event & Severity Eligibility
    if (!this.isEventEligible(eventType, emailConfig)) {
      getLogger().debug('email.event_type_disabled', { projectId, eventType });
      return [];
    }

    const bugSeverity = bugReport?.severity?.toUpperCase() ?? 'MEDIUM';
    const minSev = emailConfig.minSeverity?.toUpperCase() ?? 'MEDIUM';
    if ((SEVERITY_LEVELS[bugSeverity] ?? 2) < (SEVERITY_LEVELS[minSev] ?? 2)) {
      getLogger().debug('email.severity_below_threshold', {
        projectId,
        bugSeverity,
        minSev,
      });
      return [];
    }

    // 4. Resolve Eligible Recipients strictly within project boundary
    const recipients = await this.resolveRecipients(
      projectId,
      eventType,
      bugSeverity,
      bugReport,
      failureCase,
      emailConfig,
    );

    if (recipients.length === 0) {
      getLogger().info('email.no_eligible_recipients', { projectId, eventType });
      return [];
    }

    // 5. Build Authoritative Template Payload
    const activeJiraLink =
      bugReport?.jiraIssueLinks?.[0] ?? failureCase?.jiraIssueLinks?.[0] ?? null;

    const assignedEngineer =
      bugReport?.defectOwnership?.assignedEngineer ??
      failureCase?.defectOwnerships?.[0]?.assignedEngineer ??
      null;

    const templatePayload: EmailTemplatePayload = {
      projectName: project.name,
      eventType,
      eventDescription: this.getEventDescription(eventType),
      bugReportNumber: bugReport?.reportNumber,
      bugTitle: bugReport?.title ?? failureCase?.title,
      bugSeverity,
      bugPriority: bugReport?.priority ?? undefined,
      bugSummary: bugReport?.summary ?? failureCase?.errorMessage,
      testCaseKey: bugReport?.testCaseKey ?? undefined,
      testCaseTitle: bugReport?.testCaseTitle ?? undefined,
      failureSummary: failureCase?.failureSummary ?? undefined,
      errorMessage: failureCase?.errorMessage ?? undefined,
      reproducibility: bugReport?.reproducibilityState ?? undefined,
      assignedEngineerName: assignedEngineer?.displayName ?? undefined,
      assignedEngineerEmail: assignedEngineer?.email ?? undefined,
      jiraIssueKey: activeJiraLink?.jiraIssueKey ?? undefined,
      jiraIssueUrl: activeJiraLink?.jiraIssueUrl ?? undefined,
      timestamp: new Date().toISOString(),
    };

    const rendered = EmailTemplateEngine.render(templatePayload);
    const provider = await this.resolveProvider(emailConfig);

    const deliveredNotifications: EmailNotificationDto[] = [];

    // 6. Process each recipient with mutex locking and idempotency
    for (const recipient of recipients) {
      // Validate recipient email
      if (!this.isValidEmail(recipient.email)) {
        await this.logSuppressedNotification(
          projectId,
          context,
          recipient,
          'INVALID_RECIPIENT_EMAIL_FORMAT',
        );
        continue;
      }

      const entityVersion = bugReport?.revision ?? 1;
      const idempotencyKey = this.computeIdempotencyKey(
        projectId,
        eventType,
        context.entityId,
        entityVersion,
        recipient.email,
      );

      const notification = await this.withMutex(idempotencyKey, async () => {
        return this.processRecipientNotification(
          projectId,
          context,
          recipient,
          idempotencyKey,
          rendered,
          provider,
          emailConfig,
          bugReport?.id,
          failureCase?.id,
        );
      });

      deliveredNotifications.push(notification);
    }

    return deliveredNotifications;
  }

  private async processRecipientNotification(
    projectId: string,
    context: WorkflowNotificationContext,
    recipient: EmailRecipient,
    idempotencyKey: string,
    rendered: {
      subject: string;
      htmlBody: string;
      textBody: string;
      templateId: string;
      templateVersion: string;
    },
    provider: IEmailProvider,
    emailConfig: any,
    bugReportId?: string,
    failureCaseId?: string,
  ): Promise<EmailNotificationDto> {
    // Check existing notification by idempotency key
    const existing = await this.prisma.emailNotification.findUnique({
      where: { idempotencyKey },
      include: { deliveryAttempts: true },
    });

    if (existing) {
      if (existing.status === 'SENT') {
        getLogger().info('email.duplicate_suppressed_already_sent', {
          idempotencyKey,
          notificationId: existing.id,
        });
        return this.mapToDto(existing);
      }
      if (existing.status === 'SENDING') {
        getLogger().info('email.in_flight_duplicate_detected', {
          idempotencyKey,
          notificationId: existing.id,
        });
        return this.mapToDto(existing);
      }
    }

    // Create notification in PENDING / SENDING
    const notification =
      existing ??
      (await this.prisma.emailNotification.create({
        data: {
          projectId,
          eventType: context.eventType,
          entityType: context.entityType,
          entityId: context.entityId,
          failureCaseId,
          bugReportId,
          recipientUserId: recipient.userId,
          recipientAddress: recipient.email.toLowerCase().trim(),
          recipientName: recipient.name,
          recipientRole: recipient.role,
          subject: rendered.subject,
          bodyText: rendered.textBody,
          bodyHtml: rendered.htmlBody,
          templateId: rendered.templateId,
          templateVersion: rendered.templateVersion,
          idempotencyKey,
          status: 'SENDING',
          deliveryMode: emailConfig.isTestMode
            ? 'TEST'
            : provider.providerType === 'SANDBOX'
              ? 'SIMULATED'
              : 'REAL',
          provider: provider.providerType,
          attemptCount: 1,
          maxAttempts: 3,
          queuedAt: new Date(),
          lastAttemptAt: new Date(),
        },
        include: { deliveryAttempts: true },
      }));

    await this.recordAudit(projectId, notification.id, 'NOTIFICATION_CREATED', {
      recipient: recipient.email,
      eventType: context.eventType,
      idempotencyKey,
    });

    // Attempt provider send
    const attemptStartTime = performance.now();
    const sendResult = await provider.send({
      from: emailConfig.senderAddress,
      to: [recipient.email],
      subject: rendered.subject,
      htmlBody: rendered.htmlBody,
      textBody: rendered.textBody,
    });

    const attemptDurationMs = Math.round(performance.now() - attemptStartTime);
    const attemptStatus = sendResult.accepted ? 'SENT' : 'FAILED';

    // Record Delivery Attempt
    await this.prisma.notificationDeliveryAttempt.create({
      data: {
        notificationId: notification.id,
        projectId,
        attemptNumber: notification.attemptCount,
        status: attemptStatus,
        provider: provider.providerType,
        providerMessageId: sendResult.providerMessageId,
        providerResponse: sendResult.providerResponse,
        errorCode: sendResult.errorCode,
        errorMessage: sendResult.errorMessage,
        isTransient: sendResult.isTransient ?? false,
        durationMs: attemptDurationMs,
        completedAt: new Date(),
      },
    });

    // Update Notification row
    const updated = await this.prisma.emailNotification.update({
      where: { id: notification.id },
      data: {
        status: attemptStatus,
        sentAt: sendResult.accepted ? new Date() : null,
        failedAt: !sendResult.accepted ? new Date() : null,
        providerMessageId: sendResult.providerMessageId,
        providerResponse: sendResult.providerResponse,
        lastErrorCode: sendResult.errorCode,
        lastErrorMessage: sendResult.errorMessage,
      },
      include: { deliveryAttempts: true },
    });

    await this.recordAudit(
      projectId,
      notification.id,
      sendResult.accepted ? 'DELIVERY_SUCCEEDED' : 'DELIVERY_FAILED',
      {
        recipient: recipient.email,
        provider: provider.providerType,
        providerMessageId: sendResult.providerMessageId,
        errorCode: sendResult.errorCode,
      },
    );

    return this.mapToDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Manual Retry Workflow
  // ---------------------------------------------------------------------------

  public async retryNotification(
    projectId: string,
    notificationId: string,
  ): Promise<EmailNotificationDto> {
    const notification = await this.prisma.emailNotification.findUnique({
      where: { id: notificationId },
      include: { deliveryAttempts: true },
    });

    if (!notification || notification.projectId !== projectId) {
      throw new EmailNotFoundError(
        `Notification ${notificationId} not found in project ${projectId}.`,
      );
    }

    if (notification.status === 'SENT') {
      return this.mapToDto(notification);
    }

    if (notification.attemptCount >= notification.maxAttempts) {
      throw new EmailRetryLimitExceededError(
        `Notification ${notificationId} has reached maximum delivery attempts (${notification.maxAttempts}).`,
      );
    }

    const config = await this.prisma.projectEmailConfig.findUnique({
      where: { projectId },
    });
    if (!config || !config.isEnabled) {
      throw new EmailConfigurationMissingError(
        'Email notifications are disabled for this project.',
      );
    }

    const provider = await this.resolveProvider(config);
    const newAttemptNumber = notification.attemptCount + 1;

    // Mutex lock on this notification
    return this.withMutex(`retry:${notificationId}`, async () => {
      await this.prisma.emailNotification.update({
        where: { id: notificationId },
        data: {
          status: 'SENDING',
          attemptCount: newAttemptNumber,
          lastAttemptAt: new Date(),
        },
      });

      const attemptStartTime = performance.now();
      const sendResult = await provider.send({
        from: config.senderAddress,
        to: [notification.recipientAddress],
        subject: notification.subject,
        htmlBody: notification.bodyHtml,
        textBody: notification.bodyText,
      });

      const durationMs = Math.round(performance.now() - attemptStartTime);
      const attemptStatus = sendResult.accepted ? 'SENT' : 'FAILED';

      await this.prisma.notificationDeliveryAttempt.create({
        data: {
          notificationId,
          projectId,
          attemptNumber: newAttemptNumber,
          status: attemptStatus,
          provider: provider.providerType,
          providerMessageId: sendResult.providerMessageId,
          providerResponse: sendResult.providerResponse,
          errorCode: sendResult.errorCode,
          errorMessage: sendResult.errorMessage,
          isTransient: sendResult.isTransient ?? false,
          durationMs,
          completedAt: new Date(),
        },
      });

      const updated = await this.prisma.emailNotification.update({
        where: { id: notificationId },
        data: {
          status: attemptStatus,
          sentAt: sendResult.accepted ? new Date() : null,
          failedAt: !sendResult.accepted ? new Date() : null,
          providerMessageId: sendResult.providerMessageId,
          providerResponse: sendResult.providerResponse,
          lastErrorCode: sendResult.errorCode,
          lastErrorMessage: sendResult.errorMessage,
        },
        include: { deliveryAttempts: true },
      });

      await this.recordAudit(
        projectId,
        notificationId,
        sendResult.accepted ? 'DELIVERY_SUCCEEDED' : 'DELIVERY_FAILED',
        {
          retryAttempt: newAttemptNumber,
          errorCode: sendResult.errorCode,
        },
      );

      return this.mapToDto(updated);
    });
  }

  // ---------------------------------------------------------------------------
  // Read Operations (Strictly Idempotent)
  // ---------------------------------------------------------------------------

  public async listNotifications(input: ListEmailNotificationsInputDto): Promise<{
    items: EmailNotificationDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { projectId, bugReportId, failureCaseId, status, eventType } = input;
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {
      projectId,
      ...(bugReportId ? { bugReportId } : {}),
      ...(failureCaseId ? { failureCaseId } : {}),
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.emailNotification.findMany({
        where,
        include: { deliveryAttempts: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.emailNotification.count({ where }),
    ]);

    return {
      items: items.map(n => this.mapToDto(n)),
      total,
      page,
      pageSize,
    };
  }

  public async getNotification(
    projectId: string,
    notificationId: string,
  ): Promise<EmailNotificationDto | null> {
    const notification = await this.prisma.emailNotification.findUnique({
      where: { id: notificationId },
      include: { deliveryAttempts: true },
    });

    if (!notification || notification.projectId !== projectId) {
      return null;
    }

    return this.mapToDto(notification);
  }

  // ---------------------------------------------------------------------------
  // Restart Recovery
  // ---------------------------------------------------------------------------

  public async reconcileStuckNotifications(stuckThresholdMs = 300000): Promise<number> {
    const cutoff = new Date(Date.now() - stuckThresholdMs);

    const stuckNotifications = await this.prisma.emailNotification.findMany({
      where: {
        status: 'SENDING',
        lastAttemptAt: { lt: cutoff },
      },
    });

    let reconciled = 0;
    for (const stuck of stuckNotifications) {
      await this.prisma.emailNotification.update({
        where: { id: stuck.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          lastErrorCode: 'RESTART_INTERRUPTED',
          lastErrorMessage: 'Application restarted while notification was in-flight.',
        },
      });

      await this.recordAudit(stuck.projectId, stuck.id, 'RESTART_RECOVERED', {
        previousStatus: 'SENDING',
      });
      reconciled++;
    }

    return reconciled;
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private async resolveRecipients(
    projectId: string,
    eventType: NotificationEventType,
    severity: string,
    bugReport: any,
    failureCase: any,
    config: any,
  ): Promise<EmailRecipient[]> {
    const recipientsMap = new Map<string, EmailRecipient>();

    const assignedEngineer =
      bugReport?.defectOwnership?.assignedEngineer ??
      failureCase?.defectOwnerships?.[0]?.assignedEngineer ??
      null;

    // 1. Assigned Engineer
    if (assignedEngineer && assignedEngineer.isActive && assignedEngineer.email) {
      recipientsMap.set(assignedEngineer.email.toLowerCase(), {
        userId: assignedEngineer.userId,
        email: assignedEngineer.email.toLowerCase(),
        name: assignedEngineer.displayName,
        role: 'ASSIGNED_ENGINEER',
      });
    }

    // 2. High & Critical severity also alert configured QA team
    const isHighOrCritical = severity === 'CRITICAL' || severity === 'HIGH';
    if (isHighOrCritical || !assignedEngineer) {
      const qaRecipients =
        (config.qaTeamRecipients as Array<{ email: string; name?: string }>) ?? [];
      for (const qa of qaRecipients) {
        if (qa.email && !recipientsMap.has(qa.email.toLowerCase())) {
          recipientsMap.set(qa.email.toLowerCase(), {
            email: qa.email.toLowerCase(),
            name: qa.name,
            role: 'QA_OWNER',
          });
        }
      }
    }

    return Array.from(recipientsMap.values());
  }

  private async resolveProvider(config: any): Promise<IEmailProvider> {
    if (this.customProvider) {
      return this.customProvider;
    }

    if (config.providerType === 'SANDBOX' || config.isTestMode) {
      return new SandboxEmailProvider();
    }

    // Decrypt SMTP password if present
    let decryptedPassword: string | undefined = undefined;
    if (config.smtpPasswordEncrypted) {
      try {
        decryptedPassword = await this.credentialVault.decrypt(
          config.smtpPasswordEncrypted,
          `email-config-${config.projectId}`,
        );
        SecretRedactor.registerSecret(decryptedPassword);
      } catch (err) {
        getLogger().warn('email.password_decrypt_failed', { projectId: config.projectId });
      }
    }

    return new SmtpEmailProvider({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      user: config.smtpUser,
      password: decryptedPassword,
      senderAddress: config.senderAddress,
      senderName: config.senderName,
      replyTo: config.replyTo,
      isTestMode: config.isTestMode,
      testInboxAddress: config.testInboxAddress,
    });
  }

  private isEventEligible(eventType: NotificationEventType, config: any): boolean {
    switch (eventType) {
      case 'BUG_CREATED':
      case 'HIGH_SEVERITY_BUG_CREATED':
      case 'CRITICAL_SEVERITY_BUG_CREATED':
        return config.notifyOnBugCreated;
      case 'BUG_ASSIGNED':
      case 'BUG_REASSIGNED':
        return config.notifyOnBugAssigned;
      case 'JIRA_ISSUE_CREATED':
      case 'JIRA_ISSUE_LINKED':
      case 'JIRA_ISSUE_CREATION_FAILED':
        return config.notifyOnJiraAction;
      case 'TEST_REVERIFICATION_REQUIRED':
        return true;
      default:
        return true;
    }
  }

  private getEventDescription(eventType: NotificationEventType): string {
    switch (eventType) {
      case 'CRITICAL_SEVERITY_BUG_CREATED':
        return 'Critical Severity Defect Created';
      case 'HIGH_SEVERITY_BUG_CREATED':
        return 'High Severity Defect Created';
      case 'BUG_ASSIGNED':
        return 'Defect Assigned to Engineer';
      case 'BUG_REASSIGNED':
        return 'Defect Reassigned';
      case 'JIRA_ISSUE_CREATED':
        return 'Jira Issue Created';
      case 'JIRA_ISSUE_LINKED':
        return 'Defect Linked to Jira Issue';
      case 'JIRA_ISSUE_CREATION_FAILED':
        return 'Jira Issue Creation Failed';
      case 'TEST_REVERIFICATION_REQUIRED':
        return 'Test Reverification Required';
      case 'POST_FIX_VERIFICATION_SUCCEEDED':
        return 'Post-Fix Verification Succeeded';
      case 'POST_FIX_VERIFICATION_FAILED':
        return 'Post-Fix Verification Failed';
      case 'POST_FIX_REGRESSION_DETECTED':
        return 'Post-Fix Regression Detected';
      case 'POST_FIX_VERIFICATION_BLOCKED':
        return 'Post-Fix Verification Blocked';
      case 'BUG_CREATED':
      default:
        return 'Defect Report Created';
    }
  }

  private computeIdempotencyKey(
    projectId: string,
    eventType: NotificationEventType,
    entityId: string,
    version: number,
    recipientEmail: string,
  ): string {
    return crypto
      .createHash('sha256')
      .update(
        `${projectId}:${eventType}:${entityId}:${version}:${recipientEmail.toLowerCase().trim()}`,
      )
      .digest('hex');
  }

  private async withMutex<T>(key: string, task: () => Promise<T>): Promise<T> {
    while (this.mutexMap.has(key)) {
      await this.mutexMap.get(key);
    }

    let resolveMutex: () => void;
    const promise = new Promise<void>(r => {
      resolveMutex = r;
    });
    this.mutexMap.set(key, promise);

    try {
      return await task();
    } finally {
      this.mutexMap.delete(key);
      resolveMutex!();
    }
  }

  private async recordAudit(
    projectId: string,
    notificationId: string | null,
    action: any,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.notificationAudit.create({
        data: {
          projectId,
          notificationId,
          action,
          details: details as unknown as any,
          actor: 'EMAIL_SERVICE',
        },
      });
    } catch {
      // Audit failure should not block core flow
    }
  }

  private async logSuppressedNotification(
    projectId: string,
    context: WorkflowNotificationContext,
    recipient: EmailRecipient,
    reason: string,
  ): Promise<void> {
    await this.recordAudit(projectId, null, 'NOTIFICATION_SUPPRESSED', {
      recipient: recipient.email,
      eventType: context.eventType,
      reason,
    });
  }

  private mapToDto(model: any): EmailNotificationDto {
    return {
      id: model.id,
      projectId: model.projectId,
      eventType: model.eventType,
      entityType: model.entityType,
      entityId: model.entityId,
      failureCaseId: model.failureCaseId,
      bugReportId: model.bugReportId,
      recipientUserId: model.recipientUserId,
      recipientAddress: model.recipientAddress,
      recipientName: model.recipientName,
      recipientRole: model.recipientRole,
      subject: model.subject,
      bodyText: model.bodyText,
      bodyHtml: model.bodyHtml,
      templateId: model.templateId,
      templateVersion: model.templateVersion,
      idempotencyKey: model.idempotencyKey,
      status: model.status,
      deliveryMode: model.deliveryMode,
      attemptCount: model.attemptCount,
      maxAttempts: model.maxAttempts,
      provider: model.provider,
      providerMessageId: model.providerMessageId,
      providerResponse: model.providerResponse,
      lastErrorCode: model.lastErrorCode,
      lastErrorMessage: model.lastErrorMessage,
      suppressionReason: model.suppressionReason,
      queuedAt: model.queuedAt,
      sentAt: model.sentAt,
      failedAt: model.failedAt,
      lastAttemptAt: model.lastAttemptAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
      deliveryAttempts: model.deliveryAttempts?.map((a: any) => ({
        id: a.id,
        notificationId: a.notificationId,
        projectId: a.projectId,
        attemptNumber: a.attemptNumber,
        status: a.status,
        provider: a.provider,
        providerMessageId: a.providerMessageId,
        providerResponse: a.providerResponse,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
        isTransient: a.isTransient,
        durationMs: a.durationMs,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
      })),
    };
  }

  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email.trim());
  }
}
