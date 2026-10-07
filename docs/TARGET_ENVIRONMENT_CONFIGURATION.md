# Target Application & Test Environment Configuration Architecture (V5 Phase 59)

## 1. Overview

Version 5 introduces Autonomous Web Testing and Execution. Prior to compiling structured tests into executable browser automation plans (Phase 60) or orchestrating runs (Phase 61), test execution requires an authoritative **Target Application** model and granular **Project Environments**.

```
QA Project
  └── Target Application (1:1 Project Mapping)
        ├── Development Environment (Default)
        ├── Staging Environment
        └── Production Environment (isProduction: true, Policy: PROHIBITED)
```

Generated tests in V4 never hardcode target URLs. Instead, they reference variables such as `{{environment.baseUrl}}`, which are dynamically resolved at runtime against an immutable **Execution Environment Snapshot**.

---

## 2. Core Entities & Data Model

### Target Application

The authoritative system-under-test identity attached to a QA Project.

- `id` (UUIDv4)
- `projectId` (UUIDv4, unique 1:1 relation)
- `name` (String, e.g. "Acme Commerce Portal")
- `type` (ApplicationType: `WEB`, `SPA`, `API`, `HYBRID`)
- `primaryUrl` (Normalized Base URL)
- `description` (Optional Markdown metadata)

### Project Environment

A configured deployment target for automated and autonomous test execution.

- `id` (UUIDv4)
- `projectId` (UUIDv4)
- `targetApplicationId` (UUIDv4)
- `name` (e.g. "Staging US-East")
- `type` (`LOCAL`, `DEVELOPMENT`, `TEST`, `QA`, `STAGING`, `UAT`, `PRODUCTION`, `CUSTOM`)
- `baseUrl` (Validated & normalized RFC 3986 URL, e.g. `https://staging.acme.corp`)
- `isDefault` (Boolean; enforced atomically via transaction — exactly 0 or 1 per project)
- `isEnabled` (Boolean; disabled environments cannot execute tests)
- `isProduction` (Boolean; guards against accidental destructive actions)
- `productionSafetyPolicy` (`PROHIBITED`, `MANUAL_APPROVAL_REQUIRED`, `SAFE_MODE`)
- `browserEngine` (`chromium`, `firefox`, `webkit`)
- `headless` (Boolean, default true)
- `viewportWidth` (320..3840 px)
- `viewportHeight` (240..2160 px)
- `locale` (e.g. `en-US`, `de-DE`)
- `timezoneId` (e.g. `America/New_York`, `UTC`)
- `colorScheme` (`light`, `dark`, `no-preference`)
- `ignoreHttpsErrors` (Boolean)
- `permissions` (Array of permitted browser permissions: `geolocation`, `notifications`, `camera`, `microphone`, `clipboard-read`, `clipboard-write`)
- `extraHeaders` (Key-value dictionary of HTTP headers injected into requests)
- `variables` (Project-specific environment variable substitutions)
- `secretReferences` (Indirect key-to-secret pointer mapping; raw values never stored in DB)

---

## 3. URL Validation & Normalization Rules

All environment Base URLs are validated by `UrlValidator`:

1. **Permitted Schemes**: Only `http:` and `https:`. All other protocols (`ftp:`, `file:`, `javascript:`, `data:`, `blob:`) are strictly rejected.
2. **Embedded Credentials**: URLs containing basic authentication credentials (e.g. `https://user:pass@host.com`) are rejected to prevent credential leakage.
3. **Localhost & Loopback Support**: `http://localhost:3000`, `http://127.0.0.1:8080` are fully supported for local test targets.
4. **Normalization**: Trailing slashes are stripped; hostnames are lowercased; subpaths and ports are preserved.
5. **Path & Query Resolution**: `UrlValidator.resolveUrl(baseUrl, subpath, queryParams)` provides deterministic URL resolution with query parameter merging and fragment preservation.

---

## 4. Preflight Reachability Verification

Before dispatching autonomous test agents or Playwright runtime instances, `EnvironmentReachabilityChecker` verifies target reachability:

- **Strategy**: Bounded HTTP `HEAD` request with automatic fallback to `GET` on `405 Method Not Allowed`.
- **Redirects**: Follows up to 5 redirect hops, tracking hop history and detecting circular redirect loops.
- **Safety**: Body streaming is capped at 64 KB to prevent DoS from large binary downloads.
- **Timeout**: Configurable bounded timeout (default 5000ms, max 30000ms).
- **Classifications**:
  - `REACHABLE`: Target responded with HTTP 200–399, 404, or 500 (web server active).
  - `AUTHENTICATION_REQUIRED`: Target returned HTTP 401 or 403 (reachability confirmed, auth required).
  - `REDIRECT_LOOP`: Circular redirect detected.
  - `TLS_ERROR`: SSL/TLS certificate invalid or untrusted.
  - `TIMEOUT`: Request timed out within deadline.
  - `UNREACHABLE`: Connection refused or DNS lookup failed.

---

## 5. Production Safeguard Policies

Environments marked `isProduction: true` are subject to the project's `productionSafetyPolicy`:

1. **`PROHIBITED`** (Default): Autonomous test execution is unconditionally blocked.
2. **`MANUAL_APPROVAL_REQUIRED`**: Autonomous test execution requires explicit operator review and confirmation.
3. **`SAFE_MODE`**: Destructive operations (mutations, write actions) are restricted to readonly exploratory passes.

---

## 6. Immutable Execution Environment Snapshot

When initiating a test run, `EnvironmentConfigurationService.resolveSnapshot()` resolves the target environment and produces an immutable snapshot:

- Compiles `resolvedBaseUrl`, `browserConfig`, `effectiveHeaders`, `effectiveVariables`, and `secretBindings`.
- Computes a deterministic **SHA-256 configuration hash** of all execution parameters.
- Records the snapshot hash alongside the test run execution record, guaranteeing complete auditability and reproducibility.

---

## 7. Desktop IPC Interface

| Channel                                  | Method                                             | Description                          |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `desktop:targetApps:get`                 | `bridge.targetApplications.get(projectId)`         | Fetch target application for project |
| `desktop:targetApps:update`              | `bridge.targetApplications.update(payload)`        | Update target application metadata   |
| `desktop:environments:list`              | `bridge.environments.list(filter)`                 | List project environments            |
| `desktop:environments:get`               | `bridge.environments.get(projectId, envId)`        | Get environment details              |
| `desktop:environments:create`            | `bridge.environments.create(payload)`              | Create new environment               |
| `desktop:environments:update`            | `bridge.environments.update(payload)`              | Update existing environment          |
| `desktop:environments:delete`            | `bridge.environments.delete(projectId, envId)`     | Delete environment                   |
| `desktop:environments:setDefault`        | `bridge.environments.setDefault(projectId, envId)` | Set default environment              |
| `desktop:environments:checkReachability` | `bridge.environments.checkReachability(payload)`   | Preflight reachability ping          |
| `desktop:environments:resolveSnapshot`   | `bridge.environments.resolveSnapshot(payload)`     | Resolve immutable execution snapshot |
