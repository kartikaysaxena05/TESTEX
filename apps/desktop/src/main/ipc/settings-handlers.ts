/**
 * @file apps/desktop/src/main/ipc/settings-handlers.ts
 * IPC handlers for V8 Phase 116 User Profile, Account Settings, and Application Preferences.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type {
  UserProfileDto,
  UpdateProfileInputDto,
  ChangePasswordInputDto,
  UserAuthMethodsDto,
  SessionSummaryDto,
  UserPreferencesDto,
  UpdateUserPreferencesInputDto,
  DeleteAccountInputDto,
} from '@ai-quality/contracts';
import {
  getPrismaClient,
  UserSettingsService,
  AuthenticationUnavailableError,
} from '@ai-quality/core';
import {
  assertAuthenticated,
  getSecureStorage,
} from './auth-handlers.js';

let settingsServiceInstance: UserSettingsService | null = null;

export function getSettingsService(): UserSettingsService {
  if (!settingsServiceInstance) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new AuthenticationUnavailableError('Database is not initialized or unavailable.');
    }
    settingsServiceInstance = new UserSettingsService(prisma);
  }
  return settingsServiceInstance;
}

export function setSettingsServiceForTest(service: UserSettingsService | null): void {
  settingsServiceInstance = service;
}

export function resetSettingsServiceForTest(): void {
  settingsServiceInstance = null;
}

/**
 * Retrieves the profile of the currently authenticated user.
 */
export async function handleGetProfile(
  event: IpcMainInvokeEvent,
): Promise<UserProfileDto> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.getProfile(user.userId);
}

/**
 * Updates the display name of the currently authenticated user.
 */
export async function handleUpdateProfile(
  event: IpcMainInvokeEvent,
  input: UpdateProfileInputDto,
): Promise<UserProfileDto> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.updateProfile(user.userId, input);
}

/**
 * Changes the password for the currently authenticated user.
 */
export async function handleChangePassword(
  event: IpcMainInvokeEvent,
  input: ChangePasswordInputDto,
): Promise<{ success: boolean }> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.changePassword(user.userId, input);
}

/**
 * Retrieves connected authentication methods for the currently authenticated user.
 */
export async function handleGetAuthMethods(
  event: IpcMainInvokeEvent,
): Promise<UserAuthMethodsDto> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.getAuthMethods(user.userId);
}

/**
 * Retrieves active sessions for the currently authenticated user.
 */
export async function handleGetSessions(
  event: IpcMainInvokeEvent,
): Promise<readonly SessionSummaryDto[]> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.getActiveSessions(user.userId, user.sessionId);
}

/**
 * Retrieves application preferences for the currently authenticated user.
 */
export async function handleGetPreferences(
  event: IpcMainInvokeEvent,
): Promise<UserPreferencesDto> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.getPreferences(user.userId);
}

/**
 * Updates application preferences for the currently authenticated user.
 */
export async function handleUpdatePreferences(
  event: IpcMainInvokeEvent,
  input: UpdateUserPreferencesInputDto,
): Promise<UserPreferencesDto> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  return service.updatePreferences(user.userId, input);
}

/**
 * Performs protected account deletion for the currently authenticated user.
 * On success, purges the local session token.
 */
export async function handleDeleteAccount(
  event: IpcMainInvokeEvent,
  input: DeleteAccountInputDto,
): Promise<{ success: boolean }> {
  const user = await assertAuthenticated(event);
  const service = getSettingsService();
  const res = await service.deleteAccount(user.userId, input);
  const secureStorage = getSecureStorage();
  await secureStorage.clearSessionToken();
  return res;
}
