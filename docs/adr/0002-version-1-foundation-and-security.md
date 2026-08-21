# ADR 0002: Version 1 Desktop Foundation, IPC Security, and Database Architecture

- **Status:** Accepted
- **Date:** 2026-08-21
- **Authors:** Core Engineering Team
- **Context:** Completion and Certification of Version 1 Desktop Application Foundation

---

## 1. Context

Version 1 establishes the complete desktop application shell, user interface design system, secure typed IPC communication, PostgreSQL persistence layer via Prisma ORM, and local structured error handling and logging.

Before expanding the system in Version 2 (Repository Intelligence) and beyond, all core architectural and security invariants must be codified and certified.

---

## 2. Decisions

1. **Strict Sandboxed Execution:**
   - All `BrowserWindow` instances enforce `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.
   - Global sandbox (`electron.app.enableSandbox()`) is activated before any webContents/renderers are instantiated.

2. **Custom Application Protocol:**
   - Production renderer is loaded strictly via `app://renderer/index.html` with explicit path-traversal prevention, preventing raw `file://` protocol access.

3. **Narrow Typed IPC Bridge:**
   - Renderer accesses main-process capabilities solely through explicit methods exposed on `window.desktop.*`.
   - Generic IPC mechanisms (`ipcRenderer.send`, `ipcRenderer.invoke`, `ipcRenderer.on`, `execute`, `dispatch`) are strictly prohibited.
   - All IPC handlers validate sender frame origins via `isTrustedIpcSender()`.
   - All IPC arguments receive runtime schema validation via Zod.
   - Internal exceptions are scrubbed into safe `DesktopResult<T>` error envelopes; stack traces and database credentials are never transmitted across the IPC boundary.

4. **Relational PostgreSQL Persistence with Prisma ORM:**
   - Privileged domain logic and database operations reside exclusively in `@ai-quality/core`.
   - `DATABASE_URL` is parsed and masked (`***`) at startup; neither database URLs nor Prisma Client are accessible to the renderer.
   - Data models enforce relational integrity via foreign keys, cascading deletions, and a PostgreSQL partial unique index ensuring exactly one default environment per project.

5. **Local Structured Logging and Error Boundaries:**
   - Production logging utilizes `AppLogger` and `RotatingLogStream` writing JSONL records to local files (`ai-quality-platform.log`) with bounded rotation (5 MB / 5 files).
   - Zero external cloud telemetry or third-party tracking.
   - Deep recursive secret redaction scrubs passwords, tokens, cookies, API keys, and connection credentials.
   - Root (`AppErrorBoundary`) and screen (`ScreenErrorBoundary`) boundaries prevent unhandled React rendering crashes from breaking the application while hiding raw stack traces.

---

## 3. Consequences

### Positive

- Strict, mathematically verifiable security boundary between renderer and operating system.
- Zero risk of remote code execution or credential leakage via renderer compromise.
- Reproducible, automated test coverage (159 unit/integration/UI tests across 64 suites).
- Robust foundation ready for Version 2 Repository Intelligence.

### Negative / Trade-offs

- Adding new IPC operations requires coordinated updates across contracts, preload, and main handlers (intentional security design).
