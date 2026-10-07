/**
 * @file apps/desktop/src/main/ipc/auth-handlers.ts
 * IPC handlers for V8 Phase 113 User Authentication Foundation.
 */

import electron, { type IpcMainInvokeEvent } from 'electron';
const electronModule = electron as unknown as { shell?: { openExternal: (url: string) => Promise<void> } } | undefined;
const shell = electronModule?.shell;
import {
  type AuthenticatedUserContextDto,
  type AuthStateDto,
  type LoginInputDto,
  type RevokeSessionInputDto,
  type RevokeAllSessionsInputDto,
  type SignupInputDto,
  type ForgotPasswordInputDto,
  type ResetPasswordInputDto,
  type PasswordResetResponseDto,
  type SocialAuthStartInputDto,
  type SocialAuthStartResponseDto,
  type SocialAuthCallbackInputDto,
  type SocialAuthCancelInputDto,
  type SocialProviderStatusDto,
} from '@ai-quality/contracts';
import {
  getPrismaClient,
  AuthenticationService,
  InvalidAuthInputError,
  AuthenticationUnavailableError,
  UnauthorizedError,
  AUTH_BOUNDS,
  LoopbackCallbackServer,
  type StartedLoopbackServer,
} from '@ai-quality/core';
import {
  DesktopSecureStorage,
  type IDesktopSecureStorage,
} from '../secure-storage/desktop-secure-storage.js';

let authServiceInstance: AuthenticationService | null = null;
let secureStorageInstance: IDesktopSecureStorage | null = null;
const activeLoopbackServers = new Map<string, StartedLoopbackServer>();

function getAuthService(): AuthenticationService {
  if (!authServiceInstance) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new AuthenticationUnavailableError('Database is not initialized or unavailable.');
    }
    authServiceInstance = new AuthenticationService(prisma);
  }
  return authServiceInstance;
}

export function getSecureStorage(): IDesktopSecureStorage {
  if (!secureStorageInstance) {
    secureStorageInstance = new DesktopSecureStorage();
  }
  return secureStorageInstance;
}

export function setAuthServiceForTest(service: AuthenticationService | null): void {
  authServiceInstance = service;
}

export function setSecureStorageForTest(storage: IDesktopSecureStorage | null): void {
  secureStorageInstance = storage;
}

export function resetAuthStoreForTest(): void {
  for (const server of activeLoopbackServers.values()) {
    server.close('Reset test').catch(() => {});
  }
  activeLoopbackServers.clear();
  authServiceInstance = null;
  secureStorageInstance = null;
}

/**
 * Retrieves the current authentication state and active user context.
 */
export async function handleGetAuthState(_event: IpcMainInvokeEvent): Promise<AuthStateDto> {
  const secureStorage = getSecureStorage();
  const token = await secureStorage.retrieveSessionToken();

  if (!token) {
    return {
      status: 'UNAUTHENTICATED',
      user: null,
    };
  }

  try {
    const authService = getAuthService();
    const user = await authService.validateSession(token);
    return {
      status: 'AUTHENTICATED',
      user,
    };
  } catch {
    // If stored session is expired, revoked, or invalid, clear storage safely
    await secureStorage.clearSessionToken();
    return {
      status: 'UNAUTHENTICATED',
      user: null,
    };
  }
}

/**
 * Retrieves the currently authenticated user context, or null if unauthenticated.
 */
export async function handleGetCurrentUser(
  _event: IpcMainInvokeEvent,
): Promise<AuthenticatedUserContextDto | null> {
  const secureStorage = getSecureStorage();
  const token = await secureStorage.retrieveSessionToken();

  if (!token) {
    return null;
  }

  try {
    const authService = getAuthService();
    return await authService.validateSession(token);
  } catch {
    await secureStorage.clearSessionToken();
    return null;
  }
}

/**
 * Authenticates user credentials and securely persists the resulting session token.
 */
export async function handleLogin(
  _event: IpcMainInvokeEvent,
  input: LoginInputDto,
): Promise<AuthenticatedUserContextDto> {
  // Mass assignment and runtime validation
  if (!input || typeof input !== 'object') {
    throw new InvalidAuthInputError('Login payload must be a non-null object.');
  }

  if (!input.email || typeof input.email !== 'string') {
    throw new InvalidAuthInputError('Email is required.');
  }

  if (input.email.length > AUTH_BOUNDS.MAX_EMAIL_LENGTH) {
    throw new InvalidAuthInputError(
      `Email cannot exceed ${AUTH_BOUNDS.MAX_EMAIL_LENGTH} characters.`,
    );
  }

  if (!input.password || typeof input.password !== 'string') {
    throw new InvalidAuthInputError('Password is required.');
  }

  if (input.password.length > AUTH_BOUNDS.MAX_PASSWORD_LENGTH) {
    throw new InvalidAuthInputError(
      `Password cannot exceed ${AUTH_BOUNDS.MAX_PASSWORD_LENGTH} characters.`,
    );
  }

  // Reject unauthorized client-supplied fields
  const forbiddenFields = [
    'id',
    'userId',
    'accountStatus',
    'emailVerified',
    'passwordHash',
    'createdAt',
  ];
  for (const field of forbiddenFields) {
    if (field in (input as unknown as Record<string, unknown>)) {
      throw new InvalidAuthInputError(
        `Supplying authoritative field '${field}' is strictly prohibited.`,
      );
    }
  }

  const authService = getAuthService();
  const secureStorage = getSecureStorage();

  const result = await authService.authenticateWithPassword(input.email, input.password, {
    deviceInfo: input.deviceInfo ?? 'desktop-client',
  });

  // Authoritative session token persisted only in desktop secure storage
  await secureStorage.storeSessionToken(result.sessionToken);

  return result.userContext;
}

/**
 * Creates a new user account and securely persists the resulting session token.
 */
export async function handleSignup(
  _event: IpcMainInvokeEvent,
  input: SignupInputDto,
): Promise<AuthenticatedUserContextDto> {
  if (!input || typeof input !== 'object') {
    throw new InvalidAuthInputError('Signup payload must be a non-null object.');
  }

  // Reject unauthorized client-supplied fields
  const forbiddenFields = [
    'id',
    'userId',
    'accountStatus',
    'emailVerified',
    'passwordHash',
    'createdAt',
    'securityVersion',
    'role',
    'isAdmin',
  ];
  for (const field of forbiddenFields) {
    if (field in (input as unknown as Record<string, unknown>)) {
      throw new InvalidAuthInputError(
        `Supplying authoritative field '${field}' is strictly prohibited.`,
      );
    }
  }

  const authService = getAuthService();
  const secureStorage = getSecureStorage();

  const result = await authService.signup(input, {
    deviceInfo: input.deviceInfo ?? 'desktop-client',
  });

  await secureStorage.storeSessionToken(result.sessionToken);

  return result.userContext;
}

/**
 * Requests a password reset for a specified email address.
 */
export async function handleForgotPassword(
  _event: IpcMainInvokeEvent,
  input: ForgotPasswordInputDto,
): Promise<PasswordResetResponseDto> {
  if (!input || typeof input !== 'object') {
    throw new InvalidAuthInputError('Forgot password payload must be a non-null object.');
  }

  const forbiddenFields = ['id', 'userId', 'tokenHash', 'resetToken'];
  for (const field of forbiddenFields) {
    if (field in (input as unknown as Record<string, unknown>)) {
      throw new InvalidAuthInputError(`Supplying field '${field}' is prohibited.`);
    }
  }

  const authService = getAuthService();
  return await authService.forgotPassword(input);
}

/**
 * Resets a user password using a verified one-time token.
 */
export async function handleResetPassword(
  _event: IpcMainInvokeEvent,
  input: ResetPasswordInputDto,
): Promise<{ readonly success: boolean }> {
  if (!input || typeof input !== 'object') {
    throw new InvalidAuthInputError('Reset password payload must be a non-null object.');
  }

  const forbiddenFields = ['id', 'userId', 'passwordHash', 'tokenHash'];
  for (const field of forbiddenFields) {
    if (field in (input as unknown as Record<string, unknown>)) {
      throw new InvalidAuthInputError(`Supplying field '${field}' is prohibited.`);
    }
  }

  const authService = getAuthService();
  return await authService.resetPassword(input);
}

/**
 * Validates that an active, non-revoked session exists for the desktop client.
 * Throws UnauthorizedError if unauthenticated.
 */
export async function assertAuthenticated(
  _event: IpcMainInvokeEvent,
): Promise<AuthenticatedUserContextDto> {
  const secureStorage = getSecureStorage();
  const token = await secureStorage.retrieveSessionToken();
  if (!token) {
    throw new UnauthorizedError('Unauthorized: An active authenticated session is required.');
  }
  try {
    const authService = getAuthService();
    return await authService.validateSession(token);
  } catch {
    throw new UnauthorizedError('Unauthorized: Session is invalid or expired.');
  }
}

/**
 * Revokes the active session and purges local credentials.
 */
export async function handleLogout(
  _event: IpcMainInvokeEvent,
): Promise<{ readonly success: boolean }> {
  const secureStorage = getSecureStorage();
  const token = await secureStorage.retrieveSessionToken();

  if (token) {
    try {
      const authService = getAuthService();
      const user = await authService.validateSession(token);
      await authService.revokeSession(user.sessionId, 'USER_LOGOUT');
    } catch {
      // Best-effort remote revocation
    }
  }

  await secureStorage.clearSessionToken();
  return { success: true };
}

/**
 * Revokes a specific session by ID.
 */
export async function handleRevokeSession(
  _event: IpcMainInvokeEvent,
  input: RevokeSessionInputDto,
): Promise<{ readonly revoked: boolean }> {
  if (
    !input ||
    typeof input !== 'object' ||
    !input.sessionId ||
    typeof input.sessionId !== 'string'
  ) {
    throw new InvalidAuthInputError('Valid sessionId is required.');
  }

  const authService = getAuthService();
  return await authService.revokeSession(input.sessionId, input.reason ?? 'MANUAL_REVOCATION');
}

/**
 * Revokes all sessions for a user.
 */
export async function handleRevokeAllSessions(
  _event: IpcMainInvokeEvent,
  input: RevokeAllSessionsInputDto,
): Promise<{ readonly revokedCount: number }> {
  if (!input || typeof input !== 'object' || !input.userId || typeof input.userId !== 'string') {
    throw new InvalidAuthInputError('Valid userId is required.');
  }

  const authService = getAuthService();
  return await authService.revokeAllUserSessions(input.userId, input.reason ?? 'GLOBAL_REVOCATION');
}

// ============================================================================
// V8 Phase 115: Google & Apple Social Authentication Handlers
// ============================================================================

/**
 * Initiates social authentication: starts loopback server, creates auth request, opens external browser.
 */
export async function handleSocialAuthStart(
  event: IpcMainInvokeEvent,
  input: SocialAuthStartInputDto,
): Promise<SocialAuthStartResponseDto> {
  if (!input || typeof input !== 'object' || !input.provider) {
    throw new InvalidAuthInputError('Provider is required for social authentication.');
  }

  // Start ephemeral loopback server on 127.0.0.1
  const loopback = await LoopbackCallbackServer.start({ timeoutMs: 5 * 60 * 1000 });
  const authService = getAuthService();

  let startResult: SocialAuthStartResponseDto;
  try {
    startResult = await authService.startSocialAuth(input, {
      redirectUri: loopback.redirectUri,
      port: loopback.port,
    });
  } catch (err) {
    await loopback.close('Start failed');
    throw err;
  }

  activeLoopbackServers.set(startResult.state, loopback);

  // Background wait for callback from loopback server
  loopback
    .waitForCallback()
    .then(async (callbackPayload) => {
      try {
        const result = await authService.completeSocialAuth(callbackPayload, {
          deviceInfo: input.deviceInfo ?? 'desktop-client',
        });
        await getSecureStorage().storeSessionToken(result.sessionToken);

        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('desktop:auth:state-changed', {
            status: 'AUTHENTICATED',
            user: result.userContext,
          });
        }
      } catch (completeErr) {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('desktop:auth:social-error', {
            state: startResult.state,
            message: completeErr instanceof Error ? completeErr.message : String(completeErr),
          });
        }
      } finally {
        activeLoopbackServers.delete(startResult.state);
      }
    })
    .catch(() => {
      activeLoopbackServers.delete(startResult.state);
    });

  // Open external browser if not in headless test environment
  if (process.env.NODE_ENV !== 'test' && !process.env.CI && shell?.openExternal) {
    shell.openExternal(startResult.authorizationUrl).catch(() => {});
  }

  return startResult;
}

/**
 * Completes social authentication manually or via deep link.
 */
export async function handleSocialAuthCallback(
  _event: IpcMainInvokeEvent,
  input: SocialAuthCallbackInputDto,
): Promise<AuthenticatedUserContextDto> {
  if (!input || typeof input !== 'object' || !input.state) {
    throw new InvalidAuthInputError('State parameter is required in callback.');
  }

  const authService = getAuthService();
  const result = await authService.completeSocialAuth(input);
  await getSecureStorage().storeSessionToken(result.sessionToken);

  const loopback = activeLoopbackServers.get(input.state);
  if (loopback) {
    await loopback.close('Completed manually');
    activeLoopbackServers.delete(input.state);
  }

  return result.userContext;
}

/**
 * Cancels a pending social authorization flow.
 */
export async function handleSocialAuthCancel(
  _event: IpcMainInvokeEvent,
  input: SocialAuthCancelInputDto,
): Promise<{ readonly cancelled: boolean }> {
  if (!input || typeof input !== 'object' || !input.state) {
    return { cancelled: false };
  }

  const loopback = activeLoopbackServers.get(input.state);
  if (loopback) {
    await loopback.close(input.reason ?? 'Cancelled by user');
    activeLoopbackServers.delete(input.state);
  }

  const authService = getAuthService();
  return await authService.cancelSocialAuth(input);
}

/**
 * Returns availability and status of configured social providers.
 */
export async function handleSocialAuthGetProviders(
  _event: IpcMainInvokeEvent,
): Promise<readonly SocialProviderStatusDto[]> {
  const authService = getAuthService();
  return authService.getSocialProviders();
}

