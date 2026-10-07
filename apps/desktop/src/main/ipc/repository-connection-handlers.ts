/**
 * @file apps/desktop/src/main/ipc/repository-connection-handlers.ts
 * Privileged IPC handlers for Git Repository Connections, Verification, and Atomic Import.
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  RepositoryConnectionService,
  RepositoryValidationError,
} from '@ai-quality/core';
import {
  createRepositoryConnectionSchema,
  updateRepositoryConnectionSchema,
  deleteRepositoryConnectionSchema,
  setActiveRepositoryConnectionSchema,
  verifyRepositoryConnectionSchema,
  importRepositoryConnectionSchema,
  cancelRepositoryImportSchema,
  resolveRepositorySnapshotSchema,
  getRepositoryConnectionSchema,
  listRepositoryConnectionsSchema,
  verifyGitProviderAuthSchema,
  listGitProviderReposSchema,
  listGitProviderBranchesSchema,
  type RepositoryConnectionDetails,
  type RepositoryConnectionSummary,
  type RepositoryConnectionSnapshot,
  type RepositoryImportResultDto,
  type RepositoryVerificationResultDto,
  type GitProviderAccountDto,
  type GitProviderRepositoryDto,
  type GitBranchDto,
} from '@ai-quality/contracts';
import { ZodError } from 'zod';
import { assertAuthenticated } from './auth-handlers.js';
import { isTrustedIpcSender } from './sender-validation.js';

let defaultRepoService: RepositoryConnectionService | null = null;

export function getRepositoryConnectionService(): RepositoryConnectionService {
  if (!defaultRepoService) {
    defaultRepoService = new RepositoryConnectionService();
  }
  return defaultRepoService;
}

export function setRepositoryConnectionServiceForTest(
  service: RepositoryConnectionService | null,
): void {
  defaultRepoService = service;
}

function isIpcEvent(val: unknown): val is IpcMainInvokeEvent {
  return typeof val === 'object' && val !== null && 'senderFrame' in val;
}

async function extractUser(event?: IpcMainInvokeEvent): Promise<string | null> {
  if (!event) return null;
  const user = await assertAuthenticated(event);
  return user.userId;
}

export function handleRepoServiceError(error: unknown): never {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const message = firstIssue ? firstIssue.message : 'Invalid request payload.';
    const err = new RepositoryValidationError(message);
    err.name = 'RepositoryValidationError';
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

function resolveService(
  arg1: unknown,
  arg3?: RepositoryConnectionService,
): RepositoryConnectionService {
  if (isIpcEvent(arg1) && arg3) {
    return arg3;
  }
  return getRepositoryConnectionService();
}

export async function handleListRepositoryConnections(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<readonly RepositoryConnectionSummary[]> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = listRepositoryConnectionsSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.listConnections(userId, parseResult.data.projectId, parseResult.data.includeDeleted);
}

export async function handleGetRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryConnectionDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = getRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.getConnection(userId, parseResult.data.projectId, parseResult.data.connectionId);
}

export async function handleCreateRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryConnectionDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = createRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.createConnection(userId, parseResult.data);
}

export async function handleUpdateRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryConnectionDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = updateRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.updateConnection(userId, parseResult.data);
}

export async function handleDeleteRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<{ readonly deleted: true; readonly connectionId: string }> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = deleteRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.deleteConnection(userId, parseResult.data.projectId, parseResult.data.connectionId);
}

export async function handleSetActiveRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryConnectionDetails> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = setActiveRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.setActiveConnection(userId, parseResult.data.projectId, parseResult.data.connectionId);
}

export async function handleVerifyRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryVerificationResultDto> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = verifyRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.verifyConnection(userId, parseResult.data.projectId, parseResult.data.connectionId);
}

export async function handleImportRepositoryConnection(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryImportResultDto> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = importRepositoryConnectionSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.importRepository(
    userId,
    parseResult.data.projectId,
    parseResult.data.connectionId,
    {
      branch: parseResult.data.branch,
      revision: parseResult.data.revision,
    },
  );
}

export async function handleCancelRepositoryImport(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<{ readonly cancelled: true }> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = cancelRepositoryImportSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.cancelImport(userId, parseResult.data.projectId, parseResult.data.connectionId);
}

export async function handleResolveRepositorySnapshot(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<RepositoryConnectionSnapshot> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = resolveRepositorySnapshotSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.resolveRepositorySnapshot(
    userId,
    parseResult.data.projectId,
    parseResult.data.connectionId,
  );
}

export async function handleVerifyGitProviderAuth(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<GitProviderAccountDto> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = verifyGitProviderAuthSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.verifyProviderAuth(userId, parseResult.data.token);
}

export async function handleListGitProviderRepos(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<readonly GitProviderRepositoryDto[]> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = listGitProviderReposSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.listProviderRepositories(userId, parseResult.data.token, parseResult.data.search);
}

export async function handleListGitProviderBranches(
  arg1?: unknown,
  arg2?: unknown,
  arg3?: RepositoryConnectionService,
): Promise<readonly GitBranchDto[]> {
  const event = isIpcEvent(arg1) ? arg1 : undefined;
  assertTrustedSender(event);
  const rawInput = extractRawInput(arg1, arg2);
  const service = resolveService(arg1, arg3);

  const userId = await extractUser(event);
  const parseResult = listGitProviderBranchesSchema.safeParse(rawInput);
  if (!parseResult.success) {
    handleRepoServiceError(parseResult.error);
  }
  return service.listProviderBranches(
    userId,
    parseResult.data.repositoryIdentifier,
    parseResult.data.token,
  );
}
