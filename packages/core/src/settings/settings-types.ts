/**
 * @file packages/core/src/settings/settings-types.ts
 * Domain types, bounds, and interfaces for V8 Phase 116 User Profile & Preferences.
 */

import type {
  UserProfileDto,
  UpdateProfileInputDto,
  ChangePasswordInputDto,
  UserAuthMethodsDto,
  SessionSummaryDto,
  UserPreferencesDto,
  UpdateUserPreferencesInputDto,
  DeleteAccountInputDto,
  ThemePreference,
  DensityPreference,
  TimeFormatPreference,
  BrowserPreference,
} from '@ai-quality/contracts';

export type {
  UserProfileDto,
  UpdateProfileInputDto,
  ChangePasswordInputDto,
  UserAuthMethodsDto,
  SessionSummaryDto,
  UserPreferencesDto,
  UpdateUserPreferencesInputDto,
  DeleteAccountInputDto,
  ThemePreference,
  DensityPreference,
  TimeFormatPreference,
  BrowserPreference,
};

export const SETTINGS_BOUNDS = {
  MIN_DISPLAY_NAME_LENGTH: 1,
  MAX_DISPLAY_NAME_LENGTH: 100,
  SUPPORTED_THEMES: ['system', 'light', 'dark'] as const,
  SUPPORTED_DENSITIES: ['comfortable', 'compact'] as const,
  SUPPORTED_TIME_FORMATS: ['system', '12h', '24h'] as const,
  SUPPORTED_BROWSERS: ['chromium', 'system', 'firefox', 'webkit'] as const,
  ACCOUNT_DELETION_CONFIRM_TEXT: 'DELETE',
} as const;

export interface IUserSettingsService {
  getProfile(userId: string): Promise<UserProfileDto>;
  updateProfile(userId: string, input: UpdateProfileInputDto): Promise<UserProfileDto>;
  changePassword(userId: string, input: ChangePasswordInputDto): Promise<{ readonly success: boolean }>;
  getAuthMethods(userId: string): Promise<UserAuthMethodsDto>;
  getActiveSessions(userId: string, currentSessionId?: string): Promise<readonly SessionSummaryDto[]>;
  getPreferences(userId: string): Promise<UserPreferencesDto>;
  updatePreferences(userId: string, input: UpdateUserPreferencesInputDto): Promise<UserPreferencesDto>;
  deleteAccount(userId: string, input: DeleteAccountInputDto): Promise<{ readonly success: boolean }>;
}
