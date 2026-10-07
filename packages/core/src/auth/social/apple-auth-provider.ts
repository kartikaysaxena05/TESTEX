/**
 * @file packages/core/src/auth/social/apple-auth-provider.ts
 * Sign in with Apple provider implementation with OIDC, form_post support, and dynamic JWKS validation.
 */

import {
  SocialAuthCancelledError,
  SocialAuthProviderUnavailableError,
  SocialAuthTokenInvalidError,
} from '../auth-errors.js';
import { JwksClient } from './jwks-client.js';
import type {
  AppleProviderConfig,
  NormalizedSocialProfile,
  SocialAuthProviderContract,
  SocialAuthStartOptions,
  SocialAuthStartResult,
  SocialAuthCallbackPayload,
} from './social-types.js';

export const APPLE_AUTH_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
export const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_ISSUER = 'https://appleid.apple.com';

export class AppleAuthProvider implements SocialAuthProviderContract {
  public readonly provider = 'APPLE' as const;
  public readonly name = 'Apple';

  private readonly config: AppleProviderConfig;
  private readonly jwksClient: JwksClient;

  constructor(config?: AppleProviderConfig, jwksClient?: JwksClient) {
    this.config = {
      clientId: config?.clientId ?? process.env.APPLE_CLIENT_ID,
      teamId: config?.teamId ?? process.env.APPLE_TEAM_ID,
      keyId: config?.keyId ?? process.env.APPLE_KEY_ID,
      privateKey: config?.privateKey ?? process.env.APPLE_PRIVATE_KEY,
      redirectUri: config?.redirectUri,
      jwksUrl: config?.jwksUrl ?? APPLE_JWKS_URL,
      authEndpoint: config?.authEndpoint ?? APPLE_AUTH_ENDPOINT,
      tokenEndpoint: config?.tokenEndpoint ?? APPLE_TOKEN_ENDPOINT,
    };
    this.jwksClient = jwksClient ?? JwksClient.getInstance();
  }

  public isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientId.trim().length > 0);
  }

  public createAuthorizationRequest(options: SocialAuthStartOptions): SocialAuthStartResult {
    if (!this.isConfigured()) {
      throw new SocialAuthProviderUnavailableError(
        'Apple OAuth is not configured: missing APPLE_CLIENT_ID',
      );
    }

    const { redirectUri, state, nonce } = options;
    const authEndpoint = this.config.authEndpoint || APPLE_AUTH_ENDPOINT;
    const url = new URL(authEndpoint);

    url.searchParams.set('client_id', this.config.clientId!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', state);

    if (nonce) {
      url.searchParams.set('nonce', nonce);
    }

    return {
      authorizationUrl: url.toString(),
      state,
      nonce,
      redirectUri,
    };
  }

  public async validateCallback(
    payload: SocialAuthCallbackPayload,
  ): Promise<NormalizedSocialProfile> {
    if (payload.error) {
      if (
        payload.error === 'user_cancelled_authorize' ||
        payload.error === 'access_denied' ||
        payload.error === 'cancelled'
      ) {
        throw new SocialAuthCancelledError(
          payload.errorDescription ?? 'Apple authentication cancelled by user',
        );
      }
      throw new SocialAuthTokenInvalidError(
        `Apple authorization error: ${payload.error}${payload.errorDescription ? ` - ${payload.errorDescription}` : ''}`,
      );
    }

    const idToken = payload.idToken;
    if (!idToken) {
      throw new SocialAuthTokenInvalidError('No identity token received in Apple callback');
    }

    // Dynamic JWKS token verification
    const decoded = await this.jwksClient.verifyIdToken({
      idToken,
      jwksUrl: this.config.jwksUrl || APPLE_JWKS_URL,
      expectedIssuer: APPLE_ISSUER,
      expectedAudience: this.config.clientId || '',
      expectedNonce: payload.nonce,
    });

    const claims = decoded.payload;
    const emailVerified =
      claims.email_verified === true ||
      claims.email_verified === 'true' ||
      (claims.email_verified as unknown) === 1;

    const isPrivateEmail =
      claims.is_private_email === true ||
      claims.is_private_email === 'true' ||
      (claims.is_private_email as unknown) === 1;

    // Parse user profile if sent on initial authentication
    let displayName: string | null = null;
    if (payload.userJson) {
      try {
        const parsedUser = typeof payload.userJson === 'string'
          ? JSON.parse(payload.userJson)
          : payload.userJson;

        if (parsedUser && typeof parsedUser === 'object') {
          const nameObj = (parsedUser as { name?: { firstName?: string; lastName?: string } }).name;
          if (nameObj) {
            const parts = [nameObj.firstName, nameObj.lastName].filter(Boolean);
            if (parts.length > 0) {
              displayName = parts.join(' ');
            }
          }
        }
      } catch {
        // Ignored, user profile json parse error does not invalidate identity
      }
    }

    return {
      provider: 'APPLE',
      providerSubjectId: claims.sub,
      email: claims.email ?? null,
      emailVerified,
      displayName,
      isPrivateEmail,
      rawProfile: claims as Record<string, unknown>,
    };
  }
}
