/**
 * @file packages/core/src/auth/social/google-auth-provider.ts
 * Google OAuth 2.0 / OpenID Connect provider implementation with PKCE and dynamic JWKS verification.
 */

import {
  SocialAuthCancelledError,
  SocialAuthProviderUnavailableError,
  SocialAuthTokenInvalidError,
  SocialAuthNetworkError,
} from '../auth-errors.js';
import { PkceService } from './pkce-service.js';
import { JwksClient } from './jwks-client.js';
import type {
  GoogleProviderConfig,
  NormalizedSocialProfile,
  SocialAuthProviderContract,
  SocialAuthStartOptions,
  SocialAuthStartResult,
  SocialAuthCallbackPayload,
} from './social-types.js';

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

export class GoogleAuthProvider implements SocialAuthProviderContract {
  public readonly provider = 'GOOGLE' as const;
  public readonly name = 'Google';

  private readonly config: GoogleProviderConfig;
  private readonly jwksClient: JwksClient;
  private customFetch?: typeof fetch;

  constructor(
    config?: GoogleProviderConfig,
    jwksClient?: JwksClient,
    options?: { customFetch?: typeof fetch },
  ) {
    this.config = {
      clientId: config?.clientId ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret: config?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: config?.redirectUri,
      jwksUrl: config?.jwksUrl ?? GOOGLE_JWKS_URL,
      tokenEndpoint: config?.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT,
      authEndpoint: config?.authEndpoint ?? GOOGLE_AUTH_ENDPOINT,
    };
    this.jwksClient = jwksClient ?? JwksClient.getInstance();
    this.customFetch = options?.customFetch;
  }

  public isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientId.trim().length > 0);
  }

  public setCustomFetch(customFetch?: typeof fetch): void {
    this.customFetch = customFetch;
  }

  public createAuthorizationRequest(options: SocialAuthStartOptions): SocialAuthStartResult {
    if (!this.isConfigured()) {
      throw new SocialAuthProviderUnavailableError(
        'Google OAuth is not configured: missing GOOGLE_CLIENT_ID',
      );
    }

    const { redirectUri, state, nonce, codeVerifier } = options;
    const authEndpoint = this.config.authEndpoint || GOOGLE_AUTH_ENDPOINT;
    const url = new URL(authEndpoint);

    url.searchParams.set('client_id', this.config.clientId!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');

    if (codeVerifier) {
      const codeChallenge = PkceService.deriveCodeChallenge(codeVerifier);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    if (nonce) {
      url.searchParams.set('nonce', nonce);
    }

    return {
      authorizationUrl: url.toString(),
      state,
      nonce,
      codeVerifier,
      redirectUri,
    };
  }

  public async validateCallback(
    payload: SocialAuthCallbackPayload,
  ): Promise<NormalizedSocialProfile> {
    if (payload.error) {
      if (
        payload.error === 'access_denied' ||
        payload.error === 'user_cancelled_authorize' ||
        payload.error === 'cancelled'
      ) {
        throw new SocialAuthCancelledError(
          payload.errorDescription ?? 'Google authentication cancelled by user',
        );
      }
      throw new SocialAuthTokenInvalidError(
        `Google authorization error: ${payload.error}${payload.errorDescription ? ` - ${payload.errorDescription}` : ''}`,
      );
    }

    let idToken = payload.idToken;

    // If code is supplied and no idToken yet, exchange code for tokens
    if (!idToken && payload.code) {
      idToken = await this.exchangeCodeForIdToken(
        payload.code,
        payload.redirectUri,
        payload.codeVerifier,
      );
    }

    if (!idToken) {
      throw new SocialAuthTokenInvalidError(
        'No authorization code or identity token received in Google callback',
      );
    }

    // Dynamic JWKS token verification
    const decoded = await this.jwksClient.verifyIdToken({
      idToken,
      jwksUrl: this.config.jwksUrl || GOOGLE_JWKS_URL,
      expectedIssuer: GOOGLE_ISSUERS,
      expectedAudience: this.config.clientId || '',
      expectedNonce: payload.nonce,
    });

    const claims = decoded.payload;
    const emailVerified =
      claims.email_verified === true ||
      claims.email_verified === 'true' ||
      (claims.email_verified as unknown) === 1;

    return {
      provider: 'GOOGLE',
      providerSubjectId: claims.sub,
      email: claims.email ?? null,
      emailVerified,
      displayName: claims.name ?? claims.given_name ?? null,
      rawProfile: claims as Record<string, unknown>,
    };
  }

  private async exchangeCodeForIdToken(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<string> {
    const tokenEndpoint = this.config.tokenEndpoint || GOOGLE_TOKEN_ENDPOINT;
    const params = new URLSearchParams();
    params.set('code', code);
    params.set('client_id', this.config.clientId!);
    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }
    params.set('redirect_uri', redirectUri);
    params.set('grant_type', 'authorization_code');
    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    try {
      const fetchFn = this.customFetch ?? globalThis.fetch;
      const response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new SocialAuthTokenInvalidError(
          `Token exchange failed with Google: HTTP ${response.status} - ${errorText}`,
        );
      }

      const body = (await response.json()) as { id_token?: string; access_token?: string };
      if (!body.id_token) {
        throw new SocialAuthTokenInvalidError('Google token endpoint response missing id_token');
      }

      return body.id_token;
    } catch (err: unknown) {
      if (err instanceof SocialAuthTokenInvalidError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new SocialAuthNetworkError(`Network error exchanging code with Google: ${message}`);
    }
  }
}
