# V8 Phase 115 — Google & Apple Social Authentication

## Overview

V8 Phase 115 delivers enterprise-grade, secure, and production-ready **Google & Apple Social Authentication** for the AI-Driven Software Quality Engineering Platform. It extends the foundation established in Phase 113 (User Authentication Foundation) and Phase 114 (Auth Flow & Session Management Certification) to enable seamless, passwordless identity onboarding and federated single sign-on (SSO).

Phase 115 implements strict protocol adherence, RFC 7636 PKCE security, state & nonce validation, dynamic JWKS token signature verification, ephemeral loopback callback handling, deep link routing, zero fake password generation, and defense against account takeover attacks.

---

## 1. Architecture & Protocol Design

### 1.1 Google OAuth 2.0 / OpenID Connect
- **Authorization Endpoint**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Token Endpoint**: `https://oauth2.googleapis.com/token`
- **JWKS Endpoint**: `https://www.googleapis.com/oauth2/v3/certs`
- **Issuer**: `https://accounts.google.com` or `accounts.google.com`
- **Protocol Features**:
  - RFC 7636 PKCE with `code_challenge_method=S256` derived via SHA-256 and base64url encoding.
  - Cryptographically random `state` (32 bytes / 64 hex characters) stored as SHA-256 hash in database.
  - Cryptographically random `nonce` (32 bytes / 64 hex characters) verified against claims in ID Token.
  - `prompt=select_account` to guarantee user choice of account.
  - `access_type=offline` and scopes `openid email profile`.

### 1.2 Sign in with Apple
- **Authorization Endpoint**: `https://appleid.apple.com/auth/authorize`
- **Token Endpoint**: `https://appleid.apple.com/auth/token`
- **JWKS Endpoint**: `https://appleid.apple.com/auth/keys`
- **Issuer**: `https://appleid.apple.com`
- **Protocol Features**:
  - `response_mode=form_post` and `response_type=code id_token`.
  - Scopes `name email`.
  - Apple Private Relay support (`@privaterelay.appleid.com`) with trusted verified email claims.
  - Initial vs. Returning User Handling: Apple only sends `user` JSON (containing first/last name) on initial authorization. On subsequent logins, Apple sends only `code` and `id_token`. The service preserves existing profile data and names across returning logins.

### 1.3 Dynamic JWKS Validation (`JwksClient`)
- Dynamically retrieves keys from provider JWKS URIs.
- In-memory key caching with configurable TTL (default: 1 hour) and key rotation support.
- Native Node.js `crypto.createPublicKey` JWK import and `crypto.createVerify('RSA-SHA256')` verification.
- Enforces strict JWT validation:
  - Header `alg === 'RS256'`
  - `kid` matching JWKS entry
  - Expiration `exp > now` (with configurable clock skew, default 60s)
  - Issuer `iss` matches expected provider URL
  - Audience `aud` matches desktop client ID
  - Nonce matches attempt nonce or SHA-256 nonce hash

### 1.4 Loopback Callback Server (`LoopbackCallbackServer`)
- Binds to `127.0.0.1` on an ephemeral OS-assigned port (`port: 0`).
- Supports both `GET` (Google OAuth query redirect) and `POST` (Apple `form_post` body).
- Returns a clean, sanitized HTML completion page to the user browser (`Authentication Successful`, `You can close this tab and return to the application`).
- Enforces a 5-minute timeout with automatic socket destruction and graceful shutdown.
- Deep link URI scheme support: `aiquality://auth/callback` handles redirects when packaged protocol handlers are active.

---

## 2. Database Schema & Migration

Database migration `20260912150244_v8_phase115_social_authentication` applied 2 new models and updated `User` and `AuthAuditAction`:

```prisma
model SocialIdentity {
  id                String             @id @default(uuid())
  userId            String
  provider          SocialAuthProvider
  providerSubjectId String
  providerEmail     String?
  emailVerified     Boolean            @default(false)
  profileData       Json?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSubjectId])
  @@index([userId])
  @@index([providerEmail])
  @@map("social_identities")
}

model SocialAuthAttempt {
  id           String                 @id @default(uuid())
  provider     SocialAuthProvider
  stateHash    String                 @unique
  nonceHash    String?
  codeVerifier String?
  redirectUri  String
  status       SocialAuthAttemptState @default(PENDING)
  expiresAt    DateTime
  completedAt  DateTime?
  errorMessage String?
  createdAt    DateTime               @default(now())

  @@index([status])
  @@index([expiresAt])
  @@map("social_auth_attempts")
}
```

### New `AuthAuditAction` Audit Events:
- `SOCIAL_AUTH_STARTED`
- `SOCIAL_AUTH_SUCCESS`
- `SOCIAL_AUTH_FAILURE`
- `SOCIAL_AUTH_CANCELLED`
- `SOCIAL_IDENTITY_LINKED`
- `ACCOUNT_LINK_CONFLICT`

---

## 3. Security Hardening & Threat Defense

1. **Anti-Collision & Account Takeover Defense Policy**:
   - Auto-linking an incoming social identity to an existing database user by email is ONLY permitted if BOTH `existingUser.emailVerified === true` AND `providerProfile.emailVerified === true`.
   - If either is false, rejected immediately with `SocialAuthAccountConflictError` and an `ACCOUNT_LINK_CONFLICT` audit event is written to prevent attacker account hijacking via unverified emails.
2. **Single-Use State & Attempt Consumption**:
   - States are indexed by SHA-256 hash. Once accessed, the attempt is marked `COMPLETED` or `FAILED`. Replaying the same state or code throws `SocialAuthStateInvalidError`.
3. **Zero Fake Password Generation**:
   - Social user signups create `User` and `SocialIdentity` without creating any record in `PasswordCredential`. The user has 0 password credentials.
4. **Account Lockout & Status Invariant**:
   - Disabled (`status === 'DISABLED'`) or locked (`status === 'LOCKED'`) accounts cannot sign in via social authentication (`AccountDisabledError` / `AccountLockedError`).
5. **IPC Sender Validation**:
   - All IPC channels (`desktop:auth:social-*`) strictly validate the sender frame (`event.senderFrame.parent === null` and URL origin validation) to prevent cross-frame injection attacks.
6. **Zero Plaintext Secret Exposure**:
   - Tokens, client secrets, and code verifiers are never logged or stored in audit trails or client responses.

---

## 4. Desktop UI Integration

- **AuthScreen (`AuthScreen.tsx`)**:
  - Replaced disabled mock social buttons with interactive, accessible Google and Apple authentication buttons.
  - Supports loading state (`Signing in with Google...`, `Signing in with Apple...`) with spinner and explicit **Cancel** button (`social-cancel-btn`).
  - Gracefully displays error notifications for cancelled or failed attempts.
- **AuthContext (`AuthContext.tsx`)**:
  - Exposes `startSocialAuth(provider)`, `cancelSocialAuth(state)`, and `getSocialProviders()`.
- **Preload API (`DesktopBridge.auth`)**:
  - `startSocialAuth(input): Promise<SocialAuthStartResponseDto>`
  - `completeSocialAuth(input): Promise<AuthStateDto>`
  - `cancelSocialAuth(input): Promise<{ cancelled: boolean }>`
  - `getSocialProviders(): Promise<SocialProviderStatusDto[]>`

---

## 5. Certification & Verification Results

### Test Suite Execution
- `test:phase115`: **20/20 subtests passed**
- `test:auth`: **119/119 tests across 14 suites passed**
- `test:v8-certification`: **81/81 tests across 15 suites passed**
- `test:v7-certification`: **17/17 tests across 3 suites passed**
- `test:renderer`: **90/90 tests across 51 suites passed**
- `typecheck`: **0 errors (`tsc -b`)**
- `lint` (Phase 115 files): **0 errors, 0 warnings**

### Live Provider Status
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: **NOT CONFIGURED** (mock / protocol-certified in test environment).
- `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID`: **NOT CONFIGURED** (mock / protocol-certified in test environment).
- Both providers honestly report `configured: false` when environmental secrets are not provided.
