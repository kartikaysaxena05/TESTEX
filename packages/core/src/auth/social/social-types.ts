/**
 * @file packages/core/src/auth/social/social-types.ts
 * Core types and provider contracts for V8 Phase 115 Social Authentication.
 */

import type { SocialAuthProvider } from '@ai-quality/contracts';

export interface NormalizedSocialProfile {
  readonly provider: SocialAuthProvider;
  readonly providerSubjectId: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  readonly isPrivateEmail?: boolean;
  readonly rawProfile: Record<string, unknown>;
}

export interface SocialAuthStartOptions {
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce?: string;
  readonly codeVerifier?: string;
}

export interface SocialAuthStartResult {
  readonly authorizationUrl: string;
  readonly state: string;
  readonly nonce?: string;
  readonly codeVerifier?: string;
  readonly redirectUri: string;
}

export interface SocialAuthCallbackPayload {
  readonly state: string;
  readonly code?: string;
  readonly idToken?: string;
  readonly userJson?: string;
  readonly error?: string;
  readonly errorDescription?: string;
  readonly redirectUri: string;
  readonly codeVerifier?: string;
  readonly nonce?: string;
}

export interface SocialAuthProviderContract {
  readonly provider: SocialAuthProvider;
  readonly name: string;
  isConfigured(): boolean;
  createAuthorizationRequest(options: SocialAuthStartOptions): SocialAuthStartResult;
  validateCallback(payload: SocialAuthCallbackPayload): Promise<NormalizedSocialProfile>;
}

export interface GoogleProviderConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  jwksUrl?: string;
  tokenEndpoint?: string;
  authEndpoint?: string;
}

export interface AppleProviderConfig {
  clientId?: string; // Apple Service ID
  teamId?: string;
  keyId?: string;
  privateKey?: string;
  redirectUri?: string;
  jwksUrl?: string;
  authEndpoint?: string;
  tokenEndpoint?: string;
}

export interface JwksKey {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

export interface JwksResponse {
  keys: JwksKey[];
}
