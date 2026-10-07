# V8 Phase 116 — User Profile, Account Settings & Application Preferences

## Overview

V8 Phase 116 delivers enterprise-grade, secure, and production-ready **User Profile, Account Settings & Application Preferences** for the desktop AI-Driven Software Quality Engineering Platform. It extends the foundation established in Phase 113 (User Authentication Foundation), Phase 114 (Auth Flow & Session Management Certification), and Phase 115 (Google & Apple Social Auth) to provide comprehensive user account management, password lifecycle operations, active session visibility, and persistent application preferences.

Phase 116 enforces strict multi-user isolation, authoritative session validation, zero token exposure, read-only email security, and protected account deletion while maintaining a strict phase boundary (ZERO Phase 117+ workspace or test execution capabilities).

---

## 1. Architecture & Protocol Design

### 1.1 Multi-User Isolation & Session Authority
- **Authoritative Identity**: The renderer NEVER dictates `userId`. The backend IPC layer resolves the active session token from secure storage, queries the database for the active `AuthSession`, and strictly binds operations to the authenticated user ID.
- **Cross-User Protection**: Any attempt by User A to read or mutate User B's profile, credentials, sessions, or preferences is architecturally impossible.

### 1.2 User Profile Management
- **Read-Only Email**: Email addresses are immutable after account creation to eliminate email hijacking and identity mismatch vectors.
- **Display Name Sanitization**: Display names are validated for length (1–70 characters), trimmed of leading/trailing whitespace, sanitized against control characters, and support international Unicode strings.

### 1.3 Password Lifecycle & Social Account Protection
- **Existing Password Verification**: Uses `PasswordHasher` (`scrypt` with random salt) to verify current password credentials before allowing changes.
- **Password Policy Enforcement**: Validates new passwords against `PasswordPolicy` (minimum 12 characters, uppercase, lowercase, numeric/special characters, common password blocklist).
- **OAuth-Only Account Defense**: If a user signed up exclusively via Google or Apple and has no local password credential, password change attempts are rejected with `CannotChangeOAuthPasswordError` (`CANNOT_CHANGE_OAUTH_PASSWORD`).
- **Security Version Increment**: Upon successful password change, `User.securityVersion` is incremented and active sessions are updated.

### 1.4 Persistent Preferences & Production Safe Mode
- **Production Safe Mode Guard**: Defaults to `true` (ON) across all preference initializations and database records. When active, irreversible production modifications are blocked.
- **Persistent Storage**: Preferences are stored in the PostgreSQL database table `user_preferences` linked 1-to-1 with `User`, supporting idempotent initialization on first access.
- **Client Reactive Context**: `PreferencesContext` dynamically synchronizes loaded preferences to the DOM document root via `data-theme` (`dark`, `light`, `system`) and `data-density` (`compact`, `comfortable`).

### 1.5 Protected Account Deletion
- **Two-Factor Deletion Guard**:
  1. Exact confirmation text match (`"DELETE"`).
  2. Local password verification (for password-based accounts).
- **Soft Deletion & Audit Trail**: Sets `User.accountStatus = 'DELETED'`, immediately revokes all active `AuthSession` records, and writes an `ACCOUNT_DELETED` audit log. This prevents orphaned records while preserving compliance and audit trails.

---

## 2. Database Schema & Migration

Database migration `20260912153229_v8_phase116_user_profile_and_preferences` created the `user_preferences` table and linked it to `User`:

```prisma
model UserPreference {
  id                 String               @id @default(uuid())
  userId             String               @unique
  theme              ThemePreference      @default(DARK)
  density            DensityPreference    @default(COMFORTABLE)
  timeFormat         TimeFormatPreference @default(TWENTY_FOUR_HOUR)
  animationsEnabled  Boolean              @default(true)
  soundEffects       Boolean              @default(false)
  productionSafeMode Boolean              @default(true)
  testConcurrency    Int                  @default(2)
  defaultTimeoutSec  Int                  @default(60)
  defaultBrowser     BrowserPreference    @default(CHROMIUM)
  telemetryEnabled   Boolean              @default(false)
  crashReporting     Boolean              @default(false)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_preferences")
}
```

### New `AuthAuditAction` Audit Events:
- `PROFILE_UPDATED`: Recorded when display name is modified.
- `PASSWORD_CHANGED`: Recorded when account password is changed.
- `PREFERENCE_UPDATED`: Recorded when user preferences are saved.
- `ACCOUNT_DELETED`: Recorded when an account is deleted and its sessions revoked.

---

## 3. Desktop IPC & Preload Interface

Eight secure IPC channels exposed under `window.desktop.settings`:

| IPC Channel | Desktop API | Description |
|---|---|---|
| `desktop:settings:get-profile` | `desktop.settings.getProfile()` | Retrieves current user profile (ID, email, name, role, status). |
| `desktop:settings:update-profile` | `desktop.settings.updateProfile(data)` | Updates user display name. |
| `desktop:settings:change-password` | `desktop.settings.changePassword(data)` | Verifies current password and sets new password. |
| `desktop:settings:get-auth-methods` | `desktop.settings.getAuthMethods()` | Returns list of connected providers (PASSWORD, GOOGLE, APPLE). |
| `desktop:settings:get-sessions` | `desktop.settings.getSessions()` | Returns sanitized active session records with `isCurrent` flag. |
| `desktop:settings:get-preferences` | `desktop.settings.getPreferences()` | Retrieves user application preferences. |
| `desktop:settings:update-preferences` | `desktop.settings.updatePreferences(data)` | Mutates preferences with enum and range validation. |
| `desktop:settings:delete-account` | `desktop.settings.deleteAccount(data)` | Performs protected account deletion and revokes sessions. |

### IPC Security Guarantees:
- **Frame Validation**: All handlers verify `event.senderFrame.parent === null` and reject any nested iframe invocations.
- **Session Validation**: Handlers verify the active bearer token from secure storage before invoking domain services.
- **Error Sanitization**: Domain errors are mapped strictly to known contract error codes (`CURRENT_PASSWORD_INCORRECT`, `CANNOT_CHANGE_OAUTH_PASSWORD`, `PASSWORD_TOO_WEAK`, `ACCOUNT_DELETION_FAILED`, etc.) without exposing internal stack traces.

---

## 4. Desktop UI Implementation

### 4.1 SettingsScreen (`apps/desktop/src/renderer/screens/SettingsScreen.tsx`)
Features 8 accessible, categorized tabs:
1. **Profile**: Displays avatar, user ID, read-only email, role badge, and editable display name with inline validation and save indicator.
2. **Account & Security**: Password change form (current password, new password, confirm new password), connected OAuth providers list (Google, Apple, Local Password), active sessions list with current session indicator and device details, and a protected Danger Zone for account deletion.
3. **Appearance**: Theme toggle (Dark, Light, System), density control (Comfortable, Compact), animations toggle, and time format (12-hour vs. 24-hour).
4. **Preferences**: Production Safe Mode toggle with protective warning badge, test concurrency (1–8 workers), default timeout slider (10–300 seconds), and default browser selector (Chromium, Firefox, WebKit).
5. **Notifications**: Desktop notification toggle, test run completion alerts, failure alerts, and sound effects toggle.
6. **Privacy & Data**: Anonymous telemetry toggle, crash reporting toggle, and local audit retention policy options.
7. **Infrastructure**: Local CLI paths, Docker engine status indicator, and test runner pool configuration.
8. **About**: Application version, build hash, Node/Electron engine versions, documentation links, and release notes.

### 4.2 PreferencesContext (`apps/desktop/src/renderer/context/PreferencesContext.tsx`)
- Provides app-wide reactive state for `theme`, `density`, and preferences.
- Synchronizes `data-theme` attribute on `document.documentElement` to trigger CSS variables in `tokens.css`.
- Synchronizes `data-density` attribute on `document.documentElement` for layout scaling.

### 4.3 Navigation Shell Integration (`ProjectHeaderBar.tsx`)
- Adds `codex-settings-btn` gear button in the header bar.
- Clicking the settings gear opens `SettingsScreen` as an overlay modal or dedicated view.
- Preserves `codex-signout-btn` for seamless logout workflow.

---

## 5. Certification & Verification Results

### Test Suite Execution Summary
- `test:phase116`: **30/30 tests passed** (20 desktop IPC/UI integration tests + 10 domain service unit tests)
- `test:v8-certification`: **101/101 tests across 16 suites passed**
- `test:auth`: **119/119 tests across 14 suites passed**
- `test:v7-certification`: **17/17 tests across 3 suites passed**
- `desktop:smoke`: **Passed** (0 errors)
- `typecheck`: **0 errors (`tsc -b`)**
