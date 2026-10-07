/**
 * @file apps/desktop/src/main/ipc/email-handlers.ts
 * Main-process IPC handlers for Email Notification System (V7 Phase 95).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type DesktopErrorCode,
  type ProjectEmailConfigDto,
  type TestEmailConnectionResultDto,
  type EmailNotificationDto,
  getProjectEmailConfigInputSchema,
  saveProjectEmailConfigInputSchema,
  testEmailConnectionInputSchema,
  listEmailNotificationsInputSchema,
  getEmailNotificationInputSchema,
  retryEmailNotificationInputSchema,
  sendWorkflowNotificationInputSchema,
} from '@ai-quality/contracts';
import { EmailNotificationService, EmailError, getPrismaClient } from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let emailNotificationService: EmailNotificationService | null = null;

export function resolveEmailNotificationService(): EmailNotificationService {
  if (!emailNotificationService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Database client is not available.');
    }
    emailNotificationService = new EmailNotificationService(prisma);
  }
  return emailNotificationService;
}

export function setEmailNotificationService(service: EmailNotificationService | null): void {
  emailNotificationService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'issues' in err) {
    // Zod validation error
    return {
      code: 'VALIDATION_ERROR',
      message:
        (err as { issues: Array<{ message: string }> }).issues[0]?.message ?? 'Validation error',
    };
  }

  if (err instanceof EmailError) {
    return {
      code: err.code,
      message: err.message,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: 'INTERNAL_ERROR',
    message,
  };
}

export async function handleGetEmailConfig(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ProjectEmailConfigDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getProjectEmailConfigInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.getConfig(validated.projectId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSaveEmailConfig(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ProjectEmailConfigDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = saveProjectEmailConfigInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.saveConfig(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleTestEmailConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<TestEmailConnectionResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = testEmailConnectionInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.testConnection(validated.projectId, validated.testRecipientEmail);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListEmailNotifications(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<
  DesktopResult<{
    readonly items: readonly EmailNotificationDto[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }>
> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = listEmailNotificationsInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.listNotifications(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetEmailNotification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<EmailNotificationDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = getEmailNotificationInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.getNotification(validated.projectId, validated.notificationId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRetryEmailNotification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<EmailNotificationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = retryEmailNotificationInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const data = await service.retryNotification(validated.projectId, validated.notificationId);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSendWorkflowNotification(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly EmailNotificationDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: { code: 'UNAUTHORIZED_SENDER', message: 'Untrusted IPC sender origin.' },
    };
  }

  try {
    const validated = sendWorkflowNotificationInputSchema.parse(input);
    const service = resolveEmailNotificationService();
    const entityId = validated.bugReportId ?? validated.failureCaseId ?? crypto.randomUUID();
    const entityType = validated.bugReportId ? 'BUG_REPORT' : 'FAILURE_CASE';

    const data = await service.notifyWorkflowEvent({
      projectId: validated.projectId,
      eventType: validated.eventType,
      entityType,
      entityId,
      bugReportId: validated.bugReportId,
      failureCaseId: validated.failureCaseId,
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
