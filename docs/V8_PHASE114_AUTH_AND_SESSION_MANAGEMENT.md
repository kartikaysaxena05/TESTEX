# V8 Phase 114 — Signup, Login, Logout, Password Recovery & Session Management

## 1. Executive Summary

Phase 114 builds directly upon the Phase 113 User Authentication Foundation, implementing the complete, certified authentication lifecycle for the AI-Driven Software Quality Engineering Platform:
- **Email/Password Signup**: Real account creation with normalized email uniqueness, password policy enforcement (minimum 12 characters, uppercase, lowercase, numbers, symbols, blacklist), confirm-password verification, mass-assignment protection, memory-hard `scrypt` hashing, and immediate active session issuance.
- **Login**: Case-normalized email matching, constant-time `crypto.timingSafeEqual` hash verification, wrong-password rejection, account enumeration resistance with timing-safe dummy hashing for unknown accounts, and account status enforcement (`DISABLED`, `LOCKED`).
- **Logout & Session Management**: Revocation of active sessions (`isRevoked: true`, `revocationReason: 'USER_LOGOUT'`), automatic purging from desktop safe storage (`DesktopSecureStorage`), sliding activity touch tracking, and multi-session independence across devices.
- **Password Recovery**: Generation of time-limited (1-hour) single-use recovery tokens generated via 256-bit CSPRNG, stored in PostgreSQL as SHA-256 digests (`PasswordResetToken`), and enumeration-resistant responses for unregistered accounts.
- **Password Reset Execution**: Validation of unexpired and unconsumed recovery tokens, password policy enforcement on new passwords, atomical credential update in `PasswordCredential`, token single-use invalidation (`usedAt = now()`), and global revocation of all active sessions (`isRevoked: true`, `revocationReason: 'PASSWORD_RESET'`) with user `securityVersion` incrementation.
- **Desktop UI & Authentication Gating**: Accessible, keyboard-navigable `AuthScreen` supporting four discrete modes (`login`, `signup`, `forgot-password`, `reset-password`), non-flashing loading state on application startup, route protection in `AppRouter`, and accessible "Sign Out" button in the `ProjectHeaderBar`.
- **Strict Scope Boundaries**: Google & Apple Social Authentication buttons are rendered in a strictly disabled state with visible "Coming in Phase 115" indicators, maintaining complete phase separation.

---

## 2. Architecture & Data Flow

```
+-----------------------------------------------------------------------------------------+
|                                    Renderer Process                                     |
|                                                                                         |
|   +--------------------------+                         +----------------------------+   |
|   |   AuthContext (State)    | <---------------------> |        AuthScreen          |   |
|   |  - status: AuthStatus    |                         |  - Mode: login             |   |
|   |  - user: AuthUser        |                         |  - Mode: signup            |   |
|   |  - login, signup, etc.   |                         |  - Mode: forgot-password   |   |
|   +------------+-------------+                         |  - Mode: reset-password    |   |
|                |                                       |  - Disabled Phase 115 OAuth|   |
|                v                                       +----------------------------+   |
|   +--------------------------+                                                          |
|   |   AppRouter (Gating)     | ---> status === 'loading': <AuthLoadingState />          |
|   |  - Gated route tree      | ---> status === 'unauthenticated': <AuthScreen />        |
|   +--------------------------+ ---> status === 'authenticated': <AppShell />           |
|                |                                                                        |
|                v (window.desktop.auth IPC Bridge)                                       |
+----------------+------------------------------------------------------------------------+
                 |
                 | IPC Invocation (Safe Handler + Sender & Top-Frame Verification)
                 v
+----------------+------------------------------------------------------------------------+
|                                  Desktop Main Process                                   |
|                                                                                         |
|   - auth-handlers.ts:                                                                   |
|     * handleSignup, handleLogin, handleLogout                                           |
|     * handleForgotPassword, handleResetPassword                                         |
|     * handleGetAuthState, handleGetCurrentUser, assertAuthenticated                     |
|                                                                                         |
|   - DesktopSecureStorage:                                                               |
|     * AES-256-GCM / Electron safeStorage local token persistence                        |
+----------------+------------------------------------------------------------------------+
                 |
                 | Direct Domain Invocation
                 v
+----------------+------------------------------------------------------------------------+
|                                   Core Domain Layer                                     |
|                                                                                         |
|   - AuthenticationService:                                                              |
|     * signup(), authenticateWithPassword(), forgotPassword(), resetPassword()           |
|     * validateSession(), revokeSession(), revokeAllUserSessions()                       |
|                                                                                         |
|   - PasswordHasher: Memory-hard scrypt ($scrypt$v=1$n=16384,r=8,p=1)                    |
|   - PasswordPolicy: 12-128 chars, character classes, dictionary blacklist               |
|   - SessionTokenService: 256-bit CSPRNG bearer tokens, SHA-256 persistence              |
|   - EmailCanonicalizer: RFC 5322 normalization & whitespace trimming                    |
|   - AuthThrottleService: Abuse detection, sliding window lockout                        |
|   - AuthAuditService: PostgreSQL immutable audit logging with secret redaction          |
+----------------+------------------------------------------------------------------------+
                 |
                 | Prisma Client (Real PostgreSQL 16)
                 v
+----------------+------------------------------------------------------------------------+
|                                 PostgreSQL Database                                     |
|                                                                                         |
|   - users: id, email, normalized_email, display_name, account_status, security_version   |
|   - password_credentials: user_id, password_hash, algorithm, version, changed_at         |
|   - auth_sessions: user_id, session_token_hash, expires_at, is_revoked, last_used_at    |
|   - password_reset_tokens: user_id, token_hash, expires_at, used_at                     |
|   - auth_audit_events: action, user_id, actor_email, metadata, ip_address, timestamp   |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Database Migration & Schema Enhancements

Migration `20260912144539_v8_phase114_password_recovery_and_session_management` added:
1. **PasswordResetToken Model (`password_reset_tokens`)**:
   - `id`: UUID primary key.
   - `userId`: Foreign key referencing `User(id)` with `onDelete: Cascade`.
   - `tokenHash`: Unique SHA-256 hash of the 256-bit CSPRNG reset token.
   - `expiresAt`: Absolute expiration timestamp (1 hour from creation).
   - `usedAt`: Timestamp set upon consumption, ensuring single-use.
   - `createdAt`: Timestamp of issuance.
2. **AuthAuditAction Enum Additions**:
   - `PASSWORD_RESET_REQUESTED`
   - `PASSWORD_RESET_COMPLETED`

---

## 4. Contract Specifications (`@ai-quality/contracts`)

### 4.1 Channels & Error Codes
- **Channels**:
  - `desktop:auth:signup`
  - `desktop:auth:forgot-password`
  - `desktop:auth:reset-password`
- **Error Codes**:
  - `ACCOUNT_ALREADY_EXISTS`: Duplicate email registration attempt.
  - `PASSWORD_MISMATCH`: Confirm password mismatch on signup or reset.
  - `RESET_TOKEN_EXPIRED`: Recovery token past 1-hour expiration.
  - `RESET_TOKEN_INVALID`: Unknown, tampered, or already consumed recovery token.
  - `UNAUTHORIZED`: Request made without valid authenticated session.

### 4.2 Data Transfer Objects
- `SignupInputDto`: `fullName`, `email`, `password`, `confirmPassword?`, `deviceInfo?`.
- `ForgotPasswordInputDto`: `email`.
- `ResetPasswordInputDto`: `resetToken`, `newPassword`, `confirmPassword?`.
- `PasswordResetResponseDto`: `message`, `resetToken?`.

---

## 5. Security & Boundary Invariants

1. **Zero Secret Leakage**:
   - Passwords and bearer tokens are never persisted in plaintext.
   - Only SHA-256 hashes of session and reset tokens are saved in PostgreSQL.
   - Reset tokens and password hashes are filtered out of audit events, log payloads, and renderer contexts.
2. **Account Enumeration Immunity**:
   - Unknown emails in `forgotPassword` return a uniform success response without issuing tokens.
   - Unknown emails in `login` trigger timing-safe dummy scrypt hashing to equalize processing latency with valid accounts.
3. **Global Revocation on Password Reset**:
   - When a password is reset, all existing sessions for that user are immediately revoked (`isRevoked: true`, `revocationReason: 'PASSWORD_RESET'`) and `User.securityVersion` is incremented.
4. **IPC Sender Validation**:
   - All authentication IPC channels enforce top-frame origin verification, rejecting untrusted origins or nested subframes with `UNAUTHORIZED_SENDER`.
5. **Phase 115 Separation**:
   - Google and Apple OAuth buttons are visually and programmatically disabled (`disabled`, `aria-label`, badge "Coming in Phase 115"). Zero third-party network requests are made.

---

## 6. Test Suites & Certification Results

All certification and regression suites pass with 100% success rate on PostgreSQL 16:

| Suite | Tests | Suites | Result |
|---|---|---|---|
| `test:phase114` (Phase 114 Certification) | 17 | 1 | PASS (0 failures) |
| `test:v8-certification` (Phases 111-114) | 61 | 14 | PASS (0 failures) |
| `test:auth` (All Core Auth Primitives + IPC) | 72 | 8 | PASS (0 failures) |
| `test:renderer` (UI & Design System) | 90 | 51 | PASS (0 failures) |
| `test:v7-certification` (V7 Freeze Regression) | 17 | 3 | PASS (0 failures) |
| `desktop:smoke` (Electron Headless Boot) | 1 | 1 | PASS (0 failures) |
| `typecheck` (`tsc -b`) | - | - | PASS (0 errors) |
| `lint` (ESLint on Phase 114 files) | - | - | PASS (0 warnings, 0 errors) |
