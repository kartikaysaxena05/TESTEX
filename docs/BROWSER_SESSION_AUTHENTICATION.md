# Browser Context, Session & Authentication Management (V5 Phase 62)

## 1. Overview

Phase 62 establishes the authoritative browser-context, execution-session, and authentication-management layer for autonomous test execution in the AI-Driven Software Quality Engineering Platform.

Autonomous test runs must execute inside strict, reproducible, isolated browser sessions without cross-test state leakage, session corruption, or credential exposure.

---

## 2. Core Architecture & Components

```
+-----------------------------------------------------------------------------------+
|                            Desktop Renderer UI                                    |
|   (AuthProfilesModal.tsx / ProjectEnvironmentsDialog.tsx)                         |
+-----------------------------------------------------------------------------------+
                                       │
                      IPC (window.desktop.authProfiles)
                                       │
+-----------------------------------------------------------------------------------+
|                        Desktop Main IPC Handlers                                  |
|   (auth-profile-handlers.ts / sender-validation.ts / register-ipc.ts)             |
+-----------------------------------------------------------------------------------+
                                       │
+──────────────────────────────────────┼────────────────────────────────────────────+
|                                      │                                            |
|                                      ▼                                            |
|                        ┌───────────────────────────┐                              |
|                        │    AuthProfileService     │                              |
|                        │ (CRUD & DB Isolation)     │                              |
|                        └─────────────┬─────────────┘                              |
|                                      │                                            |
|                                      ▼                                            |
|                        ┌───────────────────────────┐                              |
|                        │   BrowserSessionManager   │                              |
|                        │ (Context Factory & State) │                              |
|                        └─────────────┬─────────────┘                              |
|                                      │                                            |
|                ┌─────────────────────┴─────────────────────┐                      |
|                ▼                                           ▼                      |
|  ┌───────────────────────────┐               ┌───────────────────────────┐        |
|  │     AuthLoginHandler      │               │   StorageStateManager     │        |
|  │ (Deterministic Validation)│               │ (Encrypted / Safe Paths)  │        |
|  └─────────────┬─────────────┘               └─────────────┬─────────────┘        |
|                │                                           │                      |
|                ▼                                           ▼                      |
|  ┌───────────────────────────┐               ┌───────────────────────────┐        |
|  │  PlaywrightBrowserProvider│               │   PostgreSQL / Filesystem │        |
|  │   (Chromium / WebKit)     │               │   (.system_generated/...) │        |
|  └───────────────────────────┘               └───────────────────────────┘        |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Session Lifecycle & State Transitions

Each `BrowserExecutionSession` follows a strict deterministic state machine:

```text
               ┌───────────┐
               │ CREATING  │
               └─────┬─────┘
                     │
         ┌───────────┴───────────┐
         │ (Auth Profile Set)    │ (No Auth Profile)
         ▼                       ▼
   ┌───────────────┐       ┌───────────┐
   │ AUTHENTICATING│       │   READY   │
   └───────┬───────┘       └─────┬─────┘
           │                     │
   ┌───────┴───────┐             │
   │ Authenticated │             │
   ▼               ▼             │
┌──────────────┐ ┌────────┐      │
│AUTHENTICATED │ │ FAILED │      │
└──────┬───────┘ └────────┘      │
       │                         │
       └───────────┬─────────────┘
                   │
                   ▼
              ┌─────────┐
              │ ACTIVE  │
              └────┬────┘
                   │
                   ▼
              ┌─────────┐
              │ CLOSING │
              └────┬────┘
                   │
                   ▼
              ┌─────────┐
              │ CLOSED  │
              └─────────┘
```

---

## 4. Authentication Strategies Supported

1. **`NONE`**: Default mode for public pages and unauthenticated test suites.
2. **`FORM_LOGIN`**: Form-based authentication where Playwright navigates to `loginUrl`, fills username & password selectors, clicks submit, and executes deterministic validation.
3. **`STORAGE_STATE`**: Restores saved cookies, origins, and localStorage from an isolated JSON file.
4. **`HTTP_BASIC`**: Injects HTTP basic credentials into the browser context.

> [!NOTE]
> MFA/OTP, CAPTCHAs, and interactive OAuth bypasses remain explicitly unsupported in automated headless pipelines.

---

## 5. Deterministic Validation (0 LLM Calls)

Authentication success is determined strictly through deterministic DOM / URL / Cookie rules:

- **`URL_MATCH`**: Verifies that `page.url()` contains or equals the expected route (e.g. `/dashboard`).
- **`ELEMENT_PRESENT`**: Verifies that an authenticated selector (e.g. `#user-avatar`, `#logout-btn`) is visible within the timeout.
- **`COOKIE_PRESENT`**: Verifies that the authenticated session cookie exists in the context cookie jar.

---

## 6. Secret Redaction & Zero Credential Leakage

The platform enforces zero password / token leakage through `SecretRedactor`:

- Registered passwords and tokens are replaced with `***` across all logs, error messages, and exceptions.
- URLs with embedded credentials (`https://user:pass@host`) or sensitive query parameters (`?token=xyz`, `?password=123`) are normalized and masked.
- DTOs return `hasCredential: boolean` instead of exposing raw values.

---

## 7. Storage State Security

- Managed storage state files are stored strictly under `.system_generated/sessions/storage-states/`.
- Arbitrary filesystem paths and directory traversal (`..`, `/etc/passwd`, absolute paths) are rejected with `StorageStateInvalidError`.
- Max storage state payload size is bounded to 2MB.

---

## 8. Multi-Tenant Project & Environment Isolation

- Every `AuthenticationProfile` and `BrowserExecutionSession` is scoped strictly to its `projectId`.
- Cross-project access is blocked with `AuthProfileProjectMismatchError`.
- Duplicate profile names within the same project are prohibited with `AuthProfileDuplicateNameError`.
- Deleting an authentication profile cascades and safely purges associated storage-state files.
