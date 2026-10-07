/**
 * @file apps/desktop/src/main/ipc/auth-profile-handlers.ts
 * IPC handlers for Authentication Profiles & Browser Session Management (V5 Phase 62).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopErrorCode,
  type AuthProfileDto,
  type AuthValidationResultDto,
  type CreateAuthProfileInputDto,
  type UpdateAuthProfileInputDto,
  type GetAuthProfileInputDto,
  type ListAuthProfilesInputDto,
  type DeleteAuthProfileInputDto,
  type ValidateAuthProfileInputDto,
  createAuthProfileInputSchema,
  updateAuthProfileInputSchema,
  getAuthProfileInputSchema,
  listAuthProfilesInputSchema,
  deleteAuthProfileInputSchema,
  validateAuthProfileInputSchema,
} from '@ai-quality/contracts';
import {
  getAuthProfileService,
  getPrismaClient,
  ExecutionDomainError,
  AuthProfileService,
  ProjectError,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

let authProfileService: AuthProfileService | null = null;

export function setAuthProfileServiceForTest(service: AuthProfileService | null): void {
  authProfileService = service;
}

function getService(): AuthProfileService {
  return authProfileService ?? getAuthProfileService(getPrismaClient()!);
}

function sanitizeAuthProfileError(err: unknown): { code: DesktopErrorCode; message: string } {
  if (err instanceof ExecutionDomainError || err instanceof ProjectError) {
    return {
      code: err.code as DesktopErrorCode,
      message: err.message.slice(0, 300),
    };
  }
  const message = err instanceof Error ? err.message : 'Unknown authentication profile error';
  return {
    code: 'INTERNAL_ERROR',
    message: message.slice(0, 300),
  };
}

/**
 * Handles creation of an Authentication Profile.
 */
export async function handleCreateAuthProfile(
  event: IpcMainInvokeEvent,
  input: CreateAuthProfileInputDto,
): Promise<DesktopResult<AuthProfileDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = createAuthProfileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid create authentication profile input payload.',
      },
    };
  }

  try {
    const service = getService();
    const profile = await service.createProfile(parseResult.data);
    return { ok: true, data: profile };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}

/**
 * Handles retrieving an Authentication Profile by ID.
 */
export async function handleGetAuthProfile(
  event: IpcMainInvokeEvent,
  input: GetAuthProfileInputDto,
): Promise<DesktopResult<AuthProfileDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = getAuthProfileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid get authentication profile input payload.',
      },
    };
  }

  try {
    const service = getService();
    const profile = await service.getProfile(parseResult.data);
    return { ok: true, data: profile };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}

/**
 * Handles listing Authentication Profiles for a project.
 */
export async function handleListAuthProfiles(
  event: IpcMainInvokeEvent,
  input: ListAuthProfilesInputDto,
): Promise<DesktopResult<readonly AuthProfileDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = listAuthProfilesInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid list authentication profiles input payload.',
      },
    };
  }

  try {
    const service = getService();
    const profiles = await service.listProfiles(parseResult.data);
    return { ok: true, data: profiles };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}

/**
 * Handles updating an Authentication Profile.
 */
export async function handleUpdateAuthProfile(
  event: IpcMainInvokeEvent,
  input: UpdateAuthProfileInputDto,
): Promise<DesktopResult<AuthProfileDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = updateAuthProfileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid update authentication profile input payload.',
      },
    };
  }

  try {
    const service = getService();
    const profile = await service.updateProfile(parseResult.data);
    return { ok: true, data: profile };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}

/**
 * Handles deleting an Authentication Profile.
 */
export async function handleDeleteAuthProfile(
  event: IpcMainInvokeEvent,
  input: DeleteAuthProfileInputDto,
): Promise<DesktopResult<{ readonly deleted: true }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = deleteAuthProfileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid delete authentication profile input payload.',
      },
    };
  }

  try {
    const service = getService();
    const result = await service.deleteProfile(parseResult.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}

/**
 * Handles live validation test for an Authentication Profile.
 */
export async function handleValidateAuthProfile(
  event: IpcMainInvokeEvent,
  input: ValidateAuthProfileInputDto,
): Promise<DesktopResult<AuthValidationResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'IPC invocation rejected: untrusted sender frame',
      },
    };
  }

  const parseResult = validateAuthProfileInputSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid validate authentication profile input payload.',
      },
    };
  }

  try {
    const service = getService();
    const result = await service.validateProfile(parseResult.data);
    return { ok: true, data: result };
  } catch (err: unknown) {
    return { ok: false, error: sanitizeAuthProfileError(err) };
  }
}
