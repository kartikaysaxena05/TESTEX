/**
 * @file packages/core/src/email/email-errors.ts
 * Domain error classes for the Phase 95 Email Notification System.
 */

import type { DesktopErrorCode } from '@ai-quality/contracts';

export class EmailError extends Error {
  public readonly code: DesktopErrorCode;
  public readonly isTransient: boolean;

  constructor(message: string, code: DesktopErrorCode = 'INTERNAL_ERROR', isTransient = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.isTransient = isTransient;
  }
}

export class EmailConfigurationMissingError extends EmailError {
  constructor(
    message = 'Email notification configuration is missing or disabled for this project.',
  ) {
    super(message, 'EMAIL_CONFIGURATION_MISSING', false);
  }
}

export class EmailProviderUnavailableError extends EmailError {
  constructor(
    message = 'Email delivery provider is temporarily unreachable or unavailable.',
    isTransient = true,
  ) {
    super(message, 'EMAIL_PROVIDER_UNAVAILABLE', isTransient);
  }
}

export class EmailRecipientInvalidError extends EmailError {
  constructor(message = 'One or more recipient email addresses are malformed or invalid.') {
    super(message, 'EMAIL_RECIPIENT_INVALID', false);
  }
}

export class EmailDeliveryFailedError extends EmailError {
  constructor(message = 'Email delivery failed.', isTransient = false) {
    super(message, 'EMAIL_DELIVERY_FAILED', isTransient);
  }
}

export class EmailAlreadySentError extends EmailError {
  constructor(
    message = 'An authoritative notification for this event has already been delivered.',
  ) {
    super(message, 'EMAIL_ALREADY_SENT', false);
  }
}

export class EmailNotFoundError extends EmailError {
  constructor(message = 'The specified notification was not found in this project.') {
    super(message, 'EMAIL_NOT_FOUND', false);
  }
}

export class EmailRetryLimitExceededError extends EmailError {
  constructor(message = 'Notification has exceeded the maximum allowed delivery retry attempts.') {
    super(message, 'EMAIL_RETRY_LIMIT_EXCEEDED', false);
  }
}

export class EmailCrossProjectError extends EmailError {
  constructor(message = 'Cross-project notification access is strictly forbidden.') {
    super(message, 'EMAIL_CROSS_PROJECT_FORBIDDEN', false);
  }
}
