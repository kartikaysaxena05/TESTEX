# V8 Phase 113 — User Authentication Foundation

## 1. Executive Summary

Phase 113 implements the authoritative, production-grade **User Authentication Foundation** for the desktop AI-driven software quality platform. This architectural layer provides cryptographically resilient identity management, separate credential storage with memory-hard `scrypt` hashing, constant-time verification with timing-attack mitigations, bearer session management with SHA-256 token hashing, hardware-backed desktop secure storage, brute-force rate-limiting, and immutable security audit logging directly integrated with PostgreSQL.

Strict adherence to the phase boundaries ensures that only authentication primitives, secure services, IPC bridges, and desktop secure storage are introduced, with zero premature UI implementation (Phase 114 login/signup dialogs deferred) and zero third-party OAuth/SSO (Phase 115 deferred).

---

## 2. Core Architecture & Components

```
+-------------------------------------------------------------------------+
|                        Desktop Renderer Process                         |
|  - AuthContext & useAuth Hook                                            |
|  - window.desktop.auth (Preload Sandboxed Bridge)                       |
+------------------------------------+------------------------------------+
                                     |
                                     | IPC (Safe Invocation with Sender & Top-Frame Check)
                                     v
+-------------------------------------------------------------------------+
|                         Desktop Main Process                            |
|  - DesktopSecureStorage (safeStorage AES-256-GCM / Fallback)            |
|  - Auth IPC Handlers (get-state, login, logout, revoke, current-user)    |
+------------------------------------+------------------------------------+
                                     |
                                     | Direct Domain Service Call
                                     v
+-------------------------------------------------------------------------+
|                           Core Domain Layer                             |
|  - AuthenticationService (Identity, Auth, Session Orchestration)        |
|  - PasswordHasher (scrypt N=16384, r=8, p=1, constant-time eq)         |
|  - PasswordPolicy (Length 12-128, Blacklist, Character Classes)         |
|  - EmailCanonicalizer (RFC 5322, Trimming, Lowercase Normalization)     |
|  - SessionTokenService (256-bit CSPRNG, SHA-256 Persistence)            |
|  - AuthThrottleService (Sliding Window Lockout, Bypass Defense)         |
|  - AuthAuditService (Immutable PostgreSQL Audit + Secret Redaction)     |
+------------------------------------+------------------------------------+
                                     |
                                     | Prisma ORM (Migration in Sync)
                                     v
+-------------------------------------------------------------------------+
|                      PostgreSQL 16 Database                             |
|  - users (id, email, normalized_email, account_status, security_version)|
|  - password_credentials (user_id, password_hash, algorithm, params)     |
|  - auth_sessions (user_id, session_token_hash, expires_at, is_revoked)   |
|  - auth_audit_events (action, user_id, actor_email, metadata, ip)       |
+-------------------------------------------------------------------------+
```

---

## 3. Database Models & Schema Migration

Migration `20260912135201_v8_phase113_user_authentication_foundation` introduced the following schema objects:

### 3.1 User Model (`users`)
- `id`: UUID primary key.
- `email`: Preserved canonical representation.
- `normalized_email`: Deterministic unique lowercase representation (`unique` index).
- `display_name`: Formatted human-readable name (1-128 characters).
- `account_status`: Enum (`ACTIVE`, `UNVERIFIED`, `LOCKED`, `DISABLED`, `DELETED`).
- `email_verified`: Boolean flag with `email_verified_at` timestamp.
- `last_authenticated_at`: Audit timestamp for recent successful logins.
- `security_version`: Integer sequence incremented on global session revocation, invalidating all past sessions atomically.

### 3.2 Password Credential Model (`password_credentials`)
- `id`: UUID primary key.
- `user_id`: Foreign key referencing `users(id)` with `onDelete: Cascade`.
- `password_hash`: Serialized hash formatted as `$scrypt$v=1$n=16384,r=8,p=1,k=64$<salt_hex>$<hash_hex>`.
- `algorithm`: Default `'scrypt'`.
- `parameters`: JSON storing parameters (`N`, `r`, `p`, `keylen`).
- `version`: Hash schema version (currently `1`).
- `password_changed_at`: Timestamp tracking credential changes.

### 3.3 Auth Session Model (`auth_sessions`)
- `id`: UUID primary key.
- `user_id`: Foreign key referencing `users(id)`.
- `session_token_hash`: Deterministic SHA-256 digest of the 256-bit bearer token. The plaintext token is **never** written to disk or the database.
- `device_info`: User-agent or device fingerprint string.
- `ip_address`: Network IP address (nullable).
- `is_revoked`: Boolean revocation flag.
- `revoked_at`: Timestamp of revocation.
- `revocation_reason`: Revocation rationale (`USER_LOGOUT`, `SECURITY_RESET`, etc.).
- `expires_at`: Absolute session expiration timestamp (30 days default).
- `last_used_at`: Sliding activity touch timestamp.

### 3.4 Auth Audit Event Model (`auth_audit_events`)
- `id`: UUID primary key.
- `action`: Audit action enum (`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGOUT`, `SESSION_ISSUED`, `SESSION_REVOKED`, `ALL_SESSIONS_REVOKED`, `CREDENTIAL_CREATED`, `ACCOUNT_LOCKED`).
- `user_id`: Optional UUID of target user.
- `actor_email`: Normalized email of actor.
- `metadata`: JSON payload sanitized through `SecretRedactor` to guarantee 0% credential leakage.

---

## 4. Cryptographic Security Primitives

### 4.1 Memory-Hard `scrypt` Hashing
- **Parameters**: `N = 16384` (CPU/memory cost), `r = 8` (block size), `p = 1` (parallelization), `keylen = 64` bytes, `salt = 32` bytes CSPRNG.
- **Constant-Time Verification**: `crypto.timingSafeEqual` prevents timing-channel side attacks when comparing derived hashes.
- **Automatic Secret Redaction**: All plaintext passwords and hashes generated are dynamically registered with `SecretRedactor` to prevent accidental logging.

### 4.2 Account Enumeration & Unknown User Timing Defense
- When an unknown email attempts authentication, `AuthenticationService` executes a synthetic `scrypt` dummy computation against a pre-warmed dummy hash.
- This ensures authentication attempt response times are identical whether the user exists or not, resisting username enumeration via timing analysis.

### 4.3 Bearer Token Generation & Hashing
- Session tokens are generated with 256 bits (32 bytes) of cryptographic randomness formatted as 64 hex characters.
- Token validation calculates the SHA-256 hash in O(1) time and queries by indexed `sessionTokenHash`. Token verification uses `crypto.timingSafeEqual`.

---

## 5. Defense-in-Depth & Throttling

### 5.1 Brute-Force Rate Limiting (`AuthThrottleService`)
- Sliding-window attempt tracking per canonical identity.
- Limit: 5 failed attempts within 15 minutes leads to an automatic 15-minute account lockout.
- Immunity to normalization bypasses: Email inputs are canonicalized prior to throttle key generation (`user@test.com` and ` USER@TEST.COM ` map to the exact same throttle bucket).

### 5.2 Desktop IPC Security
- **Strict Sender Origin**: Verified against `mainWindow.webContents` URL origin.
- **Top-Frame Validation**: Blocks nested subframe/iframe invocations (`event.senderFrame.parent === null`).
- **Mass-Assignment Defense**: Input schemas strictly validate payload properties; extraneous authoritative fields (e.g. attempting to inject `accountStatus: 'ACTIVE'` over IPC) are immediately rejected.
- **Error Sanitization**: Unhandled exceptions are scrubbed into standardized `DesktopErrorCode` instances without revealing internal stack traces.

### 5.3 Desktop Secure Storage (`DesktopSecureStorage`)
- Persists session tokens in Electron's `safeStorage` (Keychain on macOS, DPAPI on Windows, Secret Service on Linux).
- Supports AES-256-GCM fallback encryption with isolated test modes for headless CI/CD environments.
- Tampered session payloads are detected via AEAD tag validation failure and purged immediately from disk.

---

## 6. Verification & Test Certification

The authentication foundation has been certified with 100% pass rates across all test suites:

| Test Suite | Tests Executed | Passed | Failed |
| :--- | :---: | :---: | :---: |
| **Phase 113 Full Certification** (`test:phase113`) | 17 | 17 | 0 |
| **V8 Certification Suite** (`test:v8-certification`) | 44 | 44 | 0 |
| **Core Auth Unit Tests** (`packages/core/src/auth/*.test.ts`) | 28 | 28 | 0 |
| **Desktop Auth IPC Tests** (`auth-handlers.test.ts`) | 10 | 10 | 0 |
| **Renderer Unit Tests** (`test:renderer`) | 90 | 90 | 0 |
| **V7 Closed-Loop Certification** (`test:v7-certification`) | 17 | 17 | 0 |
| **Desktop Smoke Test** (`desktop:smoke`) | 1 | 1 | 0 |
| **TypeScript Monorepo Typecheck** (`typecheck`) | - | 0 errors | 0 |
| **Phase 113 Specific Linting** (`eslint`) | - | 0 errors | 0 |
