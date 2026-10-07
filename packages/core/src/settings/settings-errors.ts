/**
 * @file packages/core/src/settings/settings-errors.ts
 * Domain errors for V8 Phase 116 User Profile & Preferences.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export abstract class SettingsDomainError extends Error {
  public abstract readonly errorCode: DesktopErrorCode;
  public abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProfileUpdateError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'PROFILE_UPDATE_FAILED';
  public readonly statusCode = 400;

  constructor(message = 'Failed to update user profile.') {
    super(message);
  }
}

export class InvalidDisplayNameError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'INVALID_DISPLAY_NAME';
  public readonly statusCode = 400;

  constructor(message = 'Invalid display name. Must be between 1 and 100 characters and contain no control characters.') {
    super(message);
  }
}

export class CurrentPasswordIncorrectError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'CURRENT_PASSWORD_INCORRECT';
  public readonly statusCode = 401;

  constructor(message = 'The current password provided is incorrect.') {
    super(message);
  }
}

export class CannotChangeOAuthPasswordError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'CANNOT_CHANGE_OAUTH_PASSWORD';
  public readonly statusCode = 400;

  constructor(
    message = 'This account uses social authentication and does not have a local password configured.',
  ) {
    super(message);
  }
}

export class PreferenceUpdateError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'PREFERENCE_UPDATE_FAILED';
  public readonly statusCode = 400;

  constructor(message = 'Failed to update application preferences.') {
    super(message);
  }
}

export class AccountDeletionError extends SettingsDomainError {
  public readonly errorCode: DesktopErrorCode = 'ACCOUNT_DELETION_FAILED';
  public readonly statusCode = 400;

  constructor(message = 'Account deletion failed. Confirmation text or password verification was invalid.') {
    super(message);
  }
}
