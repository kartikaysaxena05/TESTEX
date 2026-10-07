# V8 Phase 122 — Browser / Target Environment / Authentication Configuration

## 1. Overview & Objective

Phase 122 provides the AI-Driven Software Quality Engineering Platform with enterprise-grade management and security for **real web application targets**, their execution environments (Development, Staging, Production), browser runtimes (Chromium, Firefox, WebKit), and authenticated test sessions.

It bridges the project-level setup directly to the underlying Playwright autonomous test execution engine while guaranteeing strict cryptographic protection of credentials, SSRF defense, multi-tenant workspace isolation, and an immutable audit trail.

---

## 2. Architecture & Service Ecosystem

The system reuses and complements existing V5/V7 core infrastructure:
- **`TargetEnvironmentService`** (`packages/core/src/target-environments/`):
  Privileged business domain service handling environment CRUD, transactional environment activation, live network reachability probing, Playwright-driven authentication verification, and execution snapshot resolution.
- **`TargetAuthVault`** (`packages/core/src/target-environments/target-auth-vault.ts`):
  Cryptographic credential vault utilizing AES-256-GCM authenticated encryption. Incorporates multi-tenant Additional Authenticated Data (`AAD = projectId:environmentId`), tamper detection, UI password masking (`••••••••`), and registration with `SecretRedactor`.
- **`TargetEnvValidator`** (`packages/core/src/target-environments/target-env-validator.ts`):
  Target URL validation and normalization, protocol allowlisting (`http:`, `https:`), cloud metadata IP blocking (AWS/GCP/Azure link-local `169.254.169.254` and `169.254.0.0/16`, IPv6 `fe80::` / `fd00:ec2::`), production loopback denial (`localhost`, `127.0.0.1`), browser engine validation, and viewport boundary checks.
- **`PlaywrightBrowserProvider`** (`packages/core/src/execution/browser-provider.ts`):
  Reused directly from V5 to launch real Chromium, Firefox, and WebKit browser contexts for live authentication testing and assertion validation without fake or simulated runtimes.
- **`SecretRedactor`** (`packages/core/src/execution/sessions/secret-redactor.ts`):
  Automated pattern and registered literal redaction preventing plain passwords from leaking into execution logs, traces, or diagnostic screenshots.
- **Desktop Main IPC Handlers** (`apps/desktop/src/main/ipc/target-env-handlers.ts`):
  Secure IPC boundary with `isTrustedIpcSender` frame validation, session authentication enforcement, and Zod runtime schema validation.
- **Desktop Preload Bridge** (`apps/desktop/src/preload/index.ts`):
  Exposes typed channel methods via `window.desktop.targetEnvironment`.
- **Desktop UI Components** (`apps/desktop/src/renderer/features/environments/`):
  - `TargetEnvironmentConfigModal`: Full modal for configuring base/API URLs, browser engine, viewport, headless mode, security flags, and credentials with live "Test Connection" and "Test Authentication" actions.
  - `TargetEnvironmentCard`: Workspace dashboard overview card displaying active target, browser runtime, auth badge, live reachability status, and one-click environment switcher.

---

## 3. Database Schema Extensions

Applied via migration `20261005091230_v8_phase122_target_environment_and_auth_configuration`:

```prisma
// Extended ProjectEnvironment
model ProjectEnvironment {
  // Existing fields...
  apiUrl                  String?
  browserEngine           String                @default("chromium")
  headless                Boolean               @default(true)
  viewportWidth           Int                   @default(1280)
  viewportHeight          Int                   @default(720)
  ignoreHttpsErrors       Boolean               @default(false)
  authProfiles            AuthenticationProfile[]
  // ...
}

// Extended AuthenticationProfile
model AuthenticationProfile {
  // Existing fields...
  username                String?
  encryptedPassword       String?
  passwordPreview         String?               // Stored as masked '••••••••'
  // ...
}

// Extended AuthAuditAction
enum AuthAuditAction {
  // Existing actions...
  TARGET_ENVIRONMENT_CONFIGURED
  TARGET_ENVIRONMENT_SWITCHED
  BROWSER_CONFIGURATION_CHANGED
  AUTH_CONFIGURATION_CHANGED
  AUTH_TEST_RESULT
}
```

---

## 4. Security & Guardrails

1. **Zero Plaintext Secrets**:
   - Passwords and sensitive keys are encrypted with AES-256-GCM before storage.
   - IVs and auth tags are stored as structured hex tokens (`enc:v1:<iv>:<tag>:<ciphertext>`).
   - UI only ever receives masked representations (`••••••••`).
   - Audit logs store only metadata (`hasPassword: true`), never secrets.
2. **Context Binding & Tamper Detection**:
   - Encryption binds `projectId:environmentId` as AAD; tampering with the ciphertext or swapping secrets across projects or environments triggers cryptographic decryption failure.
3. **SSRF & Cloud Metadata Defense**:
   - Rejects link-local IP addresses (`169.254.169.254`, `169.254.0.0/16`, `fe80::/10`).
   - Forbids loopback/localhost targets on environments marked `PRODUCTION`.
   - Rejects non-HTTP(S) protocols (`ftp:`, `file:`, `javascript:`, `data:`).
4. **Multi-Tenant Isolation**:
   - All mutations and reads verify project ownership against the authenticated user.
   - Users cannot access, modify, or test environments of projects they do not own.
5. **Real Diagnostic Evidence**:
   - On failed authentication verification, Playwright captures a base64 diagnostic screenshot, logs the failed step, and measures execution duration, while ensuring passwords are sanitized.

---

## 5. Playwright Integration Handoff

Target configuration directly feeds into test execution via `resolveExecutionTarget(projectId)`:
```
Project
  └── Selected Active Environment
        └── Target Configuration (baseUrl, apiUrl, browserEngine, headless, viewport)
              └── Decrypted Credentials (registered with SecretRedactor)
                    └── Test Plan Compiler (V5)
                          └── Playwright Execution Engine (V5)
```

No secondary test execution engine is introduced; the existing V5/V7 runner consumes the resolved execution snapshot.

---

## 6. Verification & Test Summary

- **Unit & IPC Security Tests** (`apps/desktop/dist/main/ipc/target-env-handlers.test.js`):
  - 20/20 PASS (Frame sender security, authentication checks, Zod validation, error translations, handler delegations).
- **Domain Certification Suite** (`packages/core/dist/target-environments/certification/v8-phase122-certification.test.js`):
  - 24/24 PASS (URL validation & SSRF, real HTTP server reachability, redirect following, environment profile switching, AES-256-GCM vault tamper resistance, real Playwright browser login & failure screenshots, multi-tenant isolation, audit trail verification).
- **V8 Certification Regression Suite** (`npm run test:v8-certification`):
  - 328/328 PASS across 75 test suites (Phases 111–122 verified together).
- **TypeScript & Build**:
  - `tsc -b`: 0 errors.
  - `npm run desktop:build`: 0 errors.
  - `npx eslint`: 0 errors, 0 warnings.
