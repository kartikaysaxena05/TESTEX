# V8 Phase 119 — Website URL Connection, Environment Targeting & Live Production Safety

## Overview

V8 Phase 119 implements the authoritative, production-grade **Website URL Connection, Environment Targeting & Live Production Safety** subsystem for the **AI-Driven Software Quality Engineering Platform**. It empowers authenticated users to connect web applications across `LOCAL`, `DEVELOPMENT`, `STAGING`, and `PRODUCTION` tiers to their V8 projects.

Phase 119 establishes strict URL normalization, defense-in-depth SSRF and cloud metadata protection, preflight connectivity verification, target authorization workflows, deterministic Production Safe Mode, immutable execution snapshotting, and seamless handoff to the certified V5 autonomous Playwright browser testing engine—with **zero duplicate browser engines created**, and strict preservation of Phase 120+ boundaries.

---

## 1. Architectural Flow & Integration

```
+----------------------------------------------------------------------------------------------------+
|                                    RENDERER UI LAYER (React 19)                                    |
| +------------------------------------------------------------------------------------------------+ |
| | AddWebsiteTargetModal (URL input, environment, safe mode toggle, live preflight check, ack)    | |
| | WebsiteTargetCard (Active indicator, environment badge, connection probe, delete guard)        | |
| | EmptyProjectSourceSelection (Triggers AddWebsiteTargetModal, Phase 120+ boundary notices)      | |
| | EnvironmentOverview (Connected Website Targets view + '+ Add Target' trigger)                 | |
| | ProjectContext (websiteTargets, activeWebsiteTarget, sourceState: 'WEBSITE_CONFIGURED')        | |
| +--------------------------------------------------+---------------------------------------------+ |
+----------------------------------------------------|-----------------------------------------------+
                                                     | IPC Bridge (window.desktop.websiteTargets)
+----------------------------------------------------v-----------------------------------------------+
|                                    PRELOAD & DESKTOP IPC LAYER                                     |
| +------------------------------------------------------------------------------------------------+ |
| | Preload API: websiteTargets.list, get, create, update, delete, setActive, testConnection, etc. | |
| | IPC Channels: DESKTOP_CHANNELS.WEBSITE_TARGETS_* (validated by schema, extractUser(event))      | |
| | Security Handlers: assertAuthenticated(event), validateSender(event), envelope error mapping   | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Domain Calls (userId injected)
+----------------------------------------------------v-----------------------------------------------+
|                                       CORE DOMAIN LAYER                                            |
| +------------------------------------------------------------------------------------------------+ |
| | WebsiteTargetService: Authorization orchestration, audit logging, V5 environment sync adapter  | |
| | WebsiteTargetRepository: Soft-delete filtered CRUD, atomic transaction-safe setActiveTarget     | |
| | UrlSafetyEvaluator: Normalization, protocol whitelist, SSRF / cloud-metadata blocker            | |
| | WebsiteTargetConnectivityChecker: DNS resolution, bounded HTTP/HTTPS probes, redirect auditor  | |
| | ProductionSafetyChecker: Action classification & deterministic side-effect blocker             | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Handoff / Persistence
+----------------------------------------------------v-----------------------------------------------+
|               DATABASE PERSISTENCE               |         V5 PLAYWRIGHT EXECUTION ENGINE          |
| +----------------------------------------------+ | +---------------------------------------------+ |
| | WebsiteTarget Table (Prisma ORM)             | | | Target Snapshot Consumer                    | |
| | ProjectEnvironment Sync Adapter (V5 Compat)  | | | Action Guard (Production Safe Mode checks)  | |
| | AuthAuditEvent (8 dedicated target actions)  | | | Certified Autonomous Execution Pipeline     | |
| +----------------------------------------------+ | +---------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Core Subsystems

### 2.1 URL Normalization & Protocol Whitelisting
All incoming URLs undergo rigorous parsing and canonicalization via [`UrlSafetyEvaluator`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/website-targets/url-safety.ts):
- **Protocol Allowlist**: Only `http:` and `https:` schemes are permitted. Malicious or unsupported schemes (`file:`, `ftp:`, `javascript:`, `data:`, `chrome:`, `electron:`, etc.) are rejected with `TargetValidationError`.
- **Hostname & Scheme Normalization**: Hostnames and protocols are converted to lowercase. Default scheme ports (`:80` for HTTP, `:443` for HTTPS) are stripped.
- **Path Normalization**: Trailing slashes on root URLs are normalized, multiple slashes are collapsed, and canonical representations are created for index deduplication.
- **Loopback & Production Restriction**: `PRODUCTION` environments are strictly barred from targeting loopback hosts (`localhost`, `127.0.0.1`, `::1`).

### 2.2 SSRF & Cloud Metadata Protection
To protect against server-side request forgery (SSRF) and AWS/GCP/Azure instance metadata exfiltration:
- **Cloud Metadata IPv4**: `169.254.0.0/16` and specifically `169.254.169.254` are blocked across all environments.
- **Link-Local & Cloud Metadata IPv6**: `fe80::/10` and `fd00:ec2::254` are blocked.
- **Redirect Chain Validation**: During preflight connectivity probes, every intermediate redirect `Location` header is evaluated by the SSRF firewall *before* following. Any redirect pointing to internal metadata IP ranges immediately aborts the probe and marks the target as `BLOCKED`.

### 2.3 Preflight Connectivity Verification
The [`WebsiteTargetConnectivityChecker`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/website-targets/connectivity-checker.ts) performs real network verification:
- **DNS Resolution**: Checks whether the target host resolves to an IP address.
- **HTTP / HTTPS Probe**: Sends a bounded `HEAD` request (falling back to `GET` if `HEAD` yields 405 Method Not Allowed).
- **TLS Inspection**: Verifies certificate validity and flags TLS errors for HTTPS targets.
- **Metrics Collected**: HTTP status code, latency in milliseconds, redirect hop count, resolved IP, TLS validity.
- **Timeout & Cancellation**: Enforces a 5,000ms timeout with full `AbortSignal` cancellation support.

### 2.4 Target Authorization Workflow
To ensure that testing is authorized and intentional:
1. **Initial State**: Newly created targets start in `UNVERIFIED`.
2. **User Confirmation**: The user confirms target ownership, transitioning status to `USER_CONFIRMED`.
3. **Production Safety Gate**: For `PRODUCTION` targets, confirmation requires explicit acknowledgment of live production risk (`acknowledgedProductionRisk: true`). Attempts to confirm without this flag are rejected with `TargetValidationError`.

### 2.5 Production Safe Mode
The [`ProductionSafetyChecker`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/website-targets/production-safety-checker.ts) guarantees that live applications are not damaged during automated browser execution:
- **Default State**: Production Safe Mode is `ON` (`true`) by default for all targets.
- **Production Invariant**: In `PRODUCTION` environments, Production Safe Mode is mandatory and cannot be disabled.
- **Action Classification**:
  - `READ_ONLY`: `NAVIGATE`, `SCREENSHOT`, `SNAPSHOT`, `WAIT`, `ASSERT_*`, `SCROLL`, `HOVER`, `FOCUS`, `BLUR`.
  - `MUTATING`: Standard user clicks, form fills, inputs.
  - `DESTRUCTIVE`: Buttons/elements with labels or actions matching `delete`, `drop`, `destroy`, `purge`, `wipe`, `terminate`, `truncate`, `remove_all`.
  - `FINANCIAL`: Actions matching `pay`, `purchase`, `checkout`, `buy`, `order`, `subscribe`, `charge`, `invoice`.
  - `EXTERNAL_SIDE_EFFECT`: Actions matching `send_email`, `webhook`, `sms`, `publish`, `broadcast`, `notify_all`.
- **Enforcement**: In Safe Mode, any attempt to dispatch `DESTRUCTIVE`, `FINANCIAL`, or `EXTERNAL_SIDE_EFFECT` actions throws `ProductionSafeModeViolationError` *before* the Playwright command is transmitted to the browser.

### 2.6 Immutable Execution Snapshotting
To prevent race conditions, wrong-target execution, or mid-test configuration drift:
- [`resolveTargetSnapshot`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/website-targets/website-target-service.ts) generates an immutable `WebsiteTargetSnapshot` containing target ID, canonical URL, normalized URL, environment type, safe mode flag, authorization state, and snapshot timestamp.
- The snapshot is supplied to the V5 test runner. The test runner validates target authorization before launching browser contexts.

### 2.7 V5 Engine Backward Compatibility Adapter
To maintain complete compatibility with V5 without altering the certified autonomous execution pipeline:
- `WebsiteTargetService` synchronizes each `WebsiteTarget` to an underlying `ProjectEnvironment` record.
- Any update to a target's URL, environment type, or active state automatically updates the corresponding `ProjectEnvironment`.
- Existing V5 test plan compilers, browser session managers, and execution orchestrators execute against the target transparently.

---

## 3. Database Schema & Prisma Migration

Migration: `20261004103534_v8_phase119_website_targets_and_production_safety`
Prisma Status: **77 migrations applied, 0 schema drift**.

```prisma
enum TargetAuthorizationState {
  UNVERIFIED
  USER_CONFIRMED
  VERIFIED
  BLOCKED
}

enum TargetConnectionStatus {
  CONFIGURED
  VERIFIED_REACHABLE
  UNREACHABLE
  BLOCKED
  UNKNOWN
}

model WebsiteTarget {
  id                   String                   @id @default(uuid())
  projectId            String
  environmentType      TargetEnvironmentType
  displayName          String
  url                  String
  normalizedUrl        String
  canonicalUrl         String
  isProductionSafeMode Boolean                  @default(true)
  requiresAuth         Boolean                  @default(false)
  notes                String?
  authorizationState   TargetAuthorizationState @default(UNVERIFIED)
  connectionStatus     TargetConnectionStatus   @default(CONFIGURED)
  isActive             Boolean                  @default(false)
  lastCheckedAt        DateTime?
  lastLatencyMs        Int?
  lastStatusCode       Int?
  deletedAt            DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt
  projectEnvironmentId String?

  project            Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectEnvironment ProjectEnvironment? @relation(fields: [projectEnvironmentId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([environmentType])
  @@index([isActive])
  @@index([deletedAt])
  @@index([canonicalUrl])
}
```

### Audit Trail Events
Added 8 dedicated actions to `AuthAuditAction`:
- `WEBSITE_TARGET_CREATED`
- `WEBSITE_TARGET_UPDATED`
- `WEBSITE_TARGET_ENVIRONMENT_CHANGED`
- `WEBSITE_TARGET_AUTH_CONFIRMED`
- `WEBSITE_TARGET_SAFE_MODE_CHANGED`
- `WEBSITE_TARGET_CONNECTION_CHECKED`
- `WEBSITE_TARGET_ACTIVATED`
- `WEBSITE_TARGET_REMOVED`

---

## 4. Desktop IPC & Preload API

Exposed on `window.desktop.websiteTargets`:
- `list(projectId: string): Promise<IpcResponse<WebsiteTargetSummary[]>>`
- `get(targetId: string): Promise<IpcResponse<WebsiteTargetDetails>>`
- `create(input: CreateWebsiteTargetDto): Promise<IpcResponse<WebsiteTargetDetails>>`
- `update(targetId: string, input: UpdateWebsiteTargetDto): Promise<IpcResponse<WebsiteTargetDetails>>`
- `delete(targetId: string): Promise<IpcResponse<{ success: boolean; targetId: string }>>`
- `setActive(targetId: string): Promise<IpcResponse<WebsiteTargetDetails>>`
- `testConnection(targetId: string): Promise<IpcResponse<ConnectivityCheckResultDto>>`
- `confirmAuth(targetId: string, acknowledgedProductionRisk?: boolean): Promise<IpcResponse<WebsiteTargetDetails>>`
- `resolveSnapshot(targetId: string): Promise<IpcResponse<WebsiteTargetSnapshot>>`

---

## 5. Verification & Test Certification Summary

| Test Suite | File | Tests | Status |
| :--- | :--- | :--- | :--- |
| **Phase 119 Certification** | `v8-phase119-certification.test.ts` | 40 | **PASSED (40/40)** |
| **V8 Certification Suite** | `v8-certification.test.ts` (31 files) | 192 | **PASSED (192/192)** |
| **V7 Certification Suite** | `v7-certification.test.ts` | 17 | **PASSED (17/17)** |
| **Auth & Security Suite** | `packages/core/src/auth/**` | 119 | **PASSED (119/119)** |
| **Renderer Unit Suite** | `apps/desktop/src/renderer/**` | 90 | **PASSED (90/90)** |
| **Desktop Build** | `npm run desktop:build` | - | **PASSED (0 errors)** |
| **Desktop Smoke** | `npm run desktop:smoke` | - | **PASSED (0 errors)** |
| **Prisma Migrations** | `npm run db:migrate:status` | 77 | **PASSED (0 drift)** |
| **TypeScript Monorepo** | `npm run typecheck` (`tsc -b`) | - | **PASSED (0 errors)** |

---

## 6. Strict Boundary Verification
- **Phase 120 (Git Connection)**: Zero git repository connection or cloning logic was added.
- **Phase 121 (Local Folder Import)**: Zero filesystem project scanning was added.
- **Phase 122 (Browser Attachment)**: Zero browser attachment code was added.
- **V5 Engine Reusability**: Reused the existing V5 Playwright Chromium runner via `WebsiteTargetSnapshot` and verified with live browser testing.
