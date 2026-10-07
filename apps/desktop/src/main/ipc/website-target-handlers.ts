/**
 * @file apps/desktop/src/main/ipc/website-target-handlers.ts
 * Privileged IPC handlers for Website Targets, Live Environment Targeting & Production Safety.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  WebsiteTargetService,
  TargetValidationError,
  getWebsiteTargetService,
} from '@ai-quality/core';
import {
  createWebsiteTargetSchema,
  updateWebsiteTargetSchema,
  deleteWebsiteTargetSchema,
  setActiveWebsiteTargetSchema,
  testWebsiteTargetConnectionSchema,
  confirmWebsiteTargetAuthSchema,
  getWebsiteTargetSchema,
  listWebsiteTargetsSchema,
  resolveWebsiteTargetSnapshotSchema,
  type WebsiteTargetDetails,
  type WebsiteTargetSummary,
  type WebsiteTargetSnapshot,
  type ConnectivityCheckResultDto,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultWebsiteTargetService: WebsiteTargetService | null = null;

export function getTargetService(): WebsiteTargetService {
  if (!defaultWebsiteTargetService) {
    defaultWebsiteTargetService = getWebsiteTargetService();
  }
  return defaultWebsiteTargetService;
}

export function setWebsiteTargetServiceForTest(service: WebsiteTargetService | null): void {
  defaultWebsiteTargetService = service;
}

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string | null> {
  if (!event) return null;
  const user = await assertAuthenticated(event);
  return user.userId;
}

export function handleWebsiteTargetServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid request payload.';
    const err = new TargetValidationError(message);
    err.name = 'TargetValidationError';
    throw err;
  }
  throw error;
}

function assertTrustedSender(event?: IpcMainInvokeEvent): void {
  if (event && !isTrustedIpcSender(event)) {
    throw new Error('IPC invocation rejected: untrusted sender frame');
  }
}

function extractRawInput(arg1: unknown, arg2: unknown): unknown {
  return isIpcEvent(arg1) ? arg2 : (arg1 !== undefined ? arg1 : arg2);
}

function resolveService(arg1: unknown, arg3?: WebsiteTargetService): WebsiteTargetService {
  if (isIpcEvent(arg1) && arg3) {
    return arg3;
  }
  return getTargetService();
}

export async function handleCreateWebsiteTarget(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = createWebsiteTargetSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.createWebsiteTarget(parseResult.data, userId);
}

export async function handleGetWebsiteTarget(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = getWebsiteTargetSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.getWebsiteTarget(parseResult.data, userId);
}

export async function handleListWebsiteTargets(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<readonly WebsiteTargetSummary[]> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = listWebsiteTargetsSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.listWebsiteTargets(parseResult.data, userId);
}

export async function handleUpdateWebsiteTarget(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = updateWebsiteTargetSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.updateWebsiteTarget(parseResult.data, userId);
}

export async function handleDeleteWebsiteTarget(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<{ readonly deleted: true }> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = deleteWebsiteTargetSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.deleteWebsiteTarget(parseResult.data, userId);
}

export async function handleSetActiveWebsiteTarget(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = setActiveWebsiteTargetSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.setActiveWebsiteTarget(parseResult.data, userId);
}

export async function handleTestWebsiteTargetConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<ConnectivityCheckResultDto> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = testWebsiteTargetConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.testConnection(parseResult.data, userId);
}

export async function handleConfirmWebsiteTargetAuth(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = confirmWebsiteTargetAuthSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.confirmAuthorization(parseResult.data, userId);
}

export async function handleResolveWebsiteTargetSnapshot(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: WebsiteTargetService,
): Promise<WebsiteTargetSnapshot> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = resolveWebsiteTargetSnapshotSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleWebsiteTargetServiceError(parseResult.error);
  }
  return service.resolveSnapshot(parseResult.data, userId);
}
