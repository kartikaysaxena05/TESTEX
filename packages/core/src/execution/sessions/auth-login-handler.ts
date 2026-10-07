/**
 * @file packages/core/src/execution/sessions/auth-login-handler.ts
 * Deterministic authentication execution, credential submission, and session validation engine.
 */

import type { BrowserContext, Page } from 'playwright';
import type { AuthenticationProfile } from '@prisma/client';
import {
  type AuthenticationAttemptResult,
  type ICredentialResolver,
  type ResolvedCredentials,
  SESSION_BOUNDS,
} from './session-types.js';
import {
  AuthenticationRejectedError,
  AuthenticationTimeoutError,
  SessionValidationFailedError,
  AuthStrategyUnsupportedError,
  CredentialReferenceNotFoundError,
} from './session-errors.js';
import { SecretRedactor } from './secret-redactor.js';
import { UrlValidator } from '../../environments/url-validator.js';
import type { ILogger } from '../../logging/index.js';

export class AuthLoginHandler {
  private readonly credentialResolver?: ICredentialResolver;
  private readonly logger?: ILogger;

  constructor(credentialResolver?: ICredentialResolver, logger?: ILogger) {
    this.credentialResolver = credentialResolver;
    this.logger = logger;
  }

  /**
   * Executes authentication on the provided Page according to the profile strategy.
   */
  public async authenticate(
    profile: AuthenticationProfile,
    page: Page,
    context: BrowserContext,
    options?: {
      readonly testPassword?: string;
      readonly abortSignal?: AbortSignal;
      readonly isRestored?: boolean;
    },
  ): Promise<AuthenticationAttemptResult> {
    const tStart = performance.now();
    const strategy = profile.strategy;

    if (options?.abortSignal?.aborted) {
      return {
        status: 'CANCELLED',
        durationMs: 0,
        strategy,
        isRestored: Boolean(options?.isRestored),
        errorMessage: 'Authentication cancelled by user.',
      };
    }

    if (strategy === 'NONE') {
      return {
        status: 'NOT_REQUIRED',
        durationMs: 0,
        strategy: 'NONE',
        isRestored: false,
      };
    }

    if (strategy === 'STORAGE_STATE') {
      return await this.validateRestoredSession(profile, page, context, tStart, options);
    }

    if (strategy === 'HTTP_BASIC') {
      return await this.executeHttpBasic(profile, page, context, tStart, options);
    }

    if (strategy === 'FORM_LOGIN') {
      return await this.executeFormLogin(profile, page, context, tStart, options);
    }

    throw new AuthStrategyUnsupportedError(strategy);
  }

  /**
   * Executes Form Login authentication flow.
   */
  private async executeFormLogin(
    profile: AuthenticationProfile,
    page: Page,
    _context: BrowserContext,
    tStart: number,
    options?: {
      readonly testPassword?: string;
      readonly abortSignal?: AbortSignal;
      readonly isRestored?: boolean;
    },
  ): Promise<AuthenticationAttemptResult> {
    if (!profile.loginUrl) {
      throw new AuthenticationRejectedError(
        `Authentication profile '${profile.name}' is missing a login URL.`,
      );
    }

    // 1. Validate login URL safety
    UrlValidator.validateAndNormalizeBaseUrl(profile.loginUrl);

    // 2. Resolve credentials
    let credentials: ResolvedCredentials | null = null;
    if (options?.testPassword) {
      credentials = {
        username: profile.usernameFieldSelector ? 'test-user' : undefined,
        password: options.testPassword,
        secretReference: 'inline.test.credential',
      };
    } else if (profile.credentialReference && this.credentialResolver) {
      credentials = await this.credentialResolver.resolve(
        profile.projectId,
        profile.credentialReference,
      );
    }

    if (!credentials?.password && !options?.testPassword) {
      if (profile.credentialReference) {
        throw new CredentialReferenceNotFoundError(profile.credentialReference);
      }
      throw new AuthenticationRejectedError(
        `No password or credential reference configured for profile '${profile.name}'.`,
      );
    }

    const passwordToUse = options?.testPassword ?? credentials?.password ?? '';
    SecretRedactor.registerSecret(passwordToUse);

    try {
      this.logger?.info('auth_login.started', {
        profileId: profile.id,
        strategy: profile.strategy,
        loginUrl: SecretRedactor.redactUrl(profile.loginUrl),
      });

      // 3. Navigate to Login URL
      await page.goto(profile.loginUrl, {
        timeout: SESSION_BOUNDS.DEFAULT_AUTH_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });

      if (options?.abortSignal?.aborted) {
        return {
          status: 'CANCELLED',
          durationMs: Math.round(performance.now() - tStart),
          strategy: 'FORM_LOGIN',
          isRestored: false,
          errorMessage: 'Authentication cancelled by user.',
        };
      }

      // 4. Fill username if selector configured
      if (profile.usernameFieldSelector && credentials?.username) {
        await page.fill(profile.usernameFieldSelector, credentials.username, {
          timeout: SESSION_BOUNDS.DEFAULT_VALIDATION_TIMEOUT_MS,
        });
      }

      // 5. Fill password
      if (profile.passwordFieldSelector) {
        await page.fill(profile.passwordFieldSelector, passwordToUse, {
          timeout: SESSION_BOUNDS.DEFAULT_VALIDATION_TIMEOUT_MS,
        });
      }

      // 6. Submit form
      if (profile.submitControlSelector) {
        await page.click(profile.submitControlSelector, {
          timeout: SESSION_BOUNDS.DEFAULT_VALIDATION_TIMEOUT_MS,
        });
      } else {
        // Fallback: press Enter on password field
        if (profile.passwordFieldSelector) {
          await page.press(profile.passwordFieldSelector, 'Enter');
        }
      }

      // 7. Wait briefly for navigation / network transition
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
        // Non-blocking timeout on network idle
      });

      // 8. Deterministic Success Validation
      await this.validateSuccessCondition(profile, page);

      const durationMs = Math.round(performance.now() - tStart);
      const finalUrl = SecretRedactor.redactUrl(page.url());

      this.logger?.info('auth_login.success', {
        profileId: profile.id,
        durationMs,
        finalUrl,
      });

      return {
        status: 'AUTHENTICATED',
        durationMs,
        strategy: 'FORM_LOGIN',
        isRestored: false,
        finalUrl,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - tStart);
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = SecretRedactor.redactText(rawMsg);

      this.logger?.warn('auth_login.failed', {
        profileId: profile.id,
        error: sanitizedMsg,
        durationMs,
      });

      if (options?.abortSignal?.aborted) {
        return {
          status: 'CANCELLED',
          durationMs,
          strategy: 'FORM_LOGIN',
          isRestored: false,
          errorMessage: 'Authentication cancelled.',
        };
      }

      if (sanitizedMsg.includes('Timeout') || sanitizedMsg.includes('timed out')) {
        throw new AuthenticationTimeoutError(
          SESSION_BOUNDS.DEFAULT_AUTH_TIMEOUT_MS,
          'form-login navigation or submission',
        );
      }

      throw new AuthenticationRejectedError(
        `Authentication rejected or failed validation: ${sanitizedMsg}`,
      );
    }
  }

  /**
   * Executes HTTP Basic authentication setup.
   */
  private async executeHttpBasic(
    profile: AuthenticationProfile,
    page: Page,
    context: BrowserContext,
    tStart: number,
    options?: {
      readonly testPassword?: string;
      readonly abortSignal?: AbortSignal;
    },
  ): Promise<AuthenticationAttemptResult> {
    if (!profile.loginUrl) {
      throw new AuthenticationRejectedError(
        `Authentication profile '${profile.name}' is missing a target URL for HTTP Basic Auth.`,
      );
    }

    UrlValidator.validateAndNormalizeBaseUrl(profile.loginUrl);

    let credentials: ResolvedCredentials | null = null;
    if (options?.testPassword) {
      credentials = {
        username: 'basic-user',
        password: options.testPassword,
        secretReference: 'inline.basic.credential',
      };
    } else if (profile.credentialReference && this.credentialResolver) {
      credentials = await this.credentialResolver.resolve(
        profile.projectId,
        profile.credentialReference,
      );
    }

    if (!credentials?.username || !credentials?.password) {
      throw new AuthenticationRejectedError(
        `HTTP Basic Auth requires username and password credentials for profile '${profile.name}'.`,
      );
    }

    SecretRedactor.registerSecret(credentials.password);

    await context.setHTTPCredentials({
      username: credentials.username,
      password: credentials.password,
    });

    await page.goto(profile.loginUrl, {
      timeout: SESSION_BOUNDS.DEFAULT_AUTH_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    await this.validateSuccessCondition(profile, page);

    const durationMs = Math.round(performance.now() - tStart);
    return {
      status: 'AUTHENTICATED',
      durationMs,
      strategy: 'HTTP_BASIC',
      isRestored: false,
      finalUrl: SecretRedactor.redactUrl(page.url()),
    };
  }

  /**
   * Validates a restored storage-state session against deterministic success criteria.
   */
  private async validateRestoredSession(
    profile: AuthenticationProfile,
    page: Page,
    context: BrowserContext,
    tStart: number,
    options?: {
      readonly abortSignal?: AbortSignal;
    },
  ): Promise<AuthenticationAttemptResult> {
    if (profile.loginUrl) {
      await page.goto(profile.loginUrl, {
        timeout: SESSION_BOUNDS.DEFAULT_AUTH_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
    }

    if (options?.abortSignal?.aborted) {
      return {
        status: 'CANCELLED',
        durationMs: Math.round(performance.now() - tStart),
        strategy: 'STORAGE_STATE',
        isRestored: true,
        errorMessage: 'Cancelled by user.',
      };
    }

    // Run deterministic validation
    await this.validateSuccessCondition(profile, page, context);

    const durationMs = Math.round(performance.now() - tStart);
    return {
      status: 'AUTHENTICATED',
      durationMs,
      strategy: 'STORAGE_STATE',
      isRestored: true,
      finalUrl: SecretRedactor.redactUrl(page.url()),
    };
  }

  /**
   * Deterministically validates that authentication succeeded without LLM guesswork.
   */
  public async validateSuccessCondition(
    profile: AuthenticationProfile,
    page: Page,
    context?: BrowserContext,
  ): Promise<void> {
    const valType = profile.successValidationType;
    const valValue = profile.successValidationValue;

    if (valType === 'NONE' || !valValue) {
      return;
    }

    switch (valType) {
      case 'URL_MATCH': {
        const currentUrl = page.url();
        const matches = currentUrl.includes(valValue) || currentUrl.endsWith(valValue);
        if (!matches) {
          throw new SessionValidationFailedError(
            `Expected URL to match or contain '${SecretRedactor.redactUrl(valValue)}', but was '${SecretRedactor.redactUrl(currentUrl)}'`,
          );
        }
        break;
      }
      case 'ELEMENT_PRESENT': {
        try {
          const locator = page.locator(valValue).first();
          await locator.waitFor({
            state: 'visible',
            timeout: SESSION_BOUNDS.DEFAULT_VALIDATION_TIMEOUT_MS,
          });
        } catch {
          throw new SessionValidationFailedError(
            `Authenticated DOM indicator element '${valValue}' was not visible after login.`,
          );
        }
        break;
      }
      case 'COOKIE_PRESENT': {
        const cookies = context ? await context.cookies() : await page.context().cookies();
        const hasCookie = cookies.some(c => c.name === valValue);
        if (!hasCookie) {
          throw new SessionValidationFailedError(
            `Expected session cookie '${valValue}' was not present in context cookies.`,
          );
        }
        break;
      }
      default:
        break;
    }
  }
}
