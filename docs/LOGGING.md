# Logging & Error Handling Architecture

## AI-Driven Software Quality Engineering Platform

**Current Phase:** Version 1 — Phase 13: Global Error Handling & Logging

---

## 1. Architectural Overview

The platform implements a unified, local, structured diagnostic and error handling subsystem. It enforces strict separation between operational diagnostic data and secret credentials, ensuring that logs remain private and safe while providing comprehensive visibility into application health.

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│  ├── AppErrorBoundary (Root Failure Fallback)          │
│  ├── ScreenErrorBoundary (Route/Screen Level Recovery) │
│  └── setupRendererErrorCapture (window/unhandled)      │
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.logging.reportRendererError()
                           │ (Narrow Sanitized DTO)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          └── desktop.logging.reportRendererError()     │
└──────────────────────────┬─────────────────────────────┘
                           │ desktop:logging:report-renderer-error
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── isTrustedIpcSender (Sender Validation)            │
│  ├── Rate Limiter (20 reports / min / window)          │
│  ├── Deduplication Filter (5s suppression window)      │
│  ├── Request ID Generator (UUID Correlation)           │
│  ├── uncaughtException (Fatal Log + Flush + Exit 1)    │
│  └── unhandledRejection (Error Log)                    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── AppLogger (Structured JSONL Logger)               │
│  ├── RotatingLogStream (Bounded Size & Retention)      │
│  ├── Deep Redaction (Automated Secret Scrubbing)       │
│  └── Safe Error Serializer (Code, Stack, Message)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct Append (Local Disk)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   LOCAL LOG FILES                      │
│             (Electron app.getPath('logs'))             │
│   ├── ai-quality-platform.log                          │
│   ├── ai-quality-platform.log.1                        │
│   └── ai-quality-platform.log.2 (Max 5 files, 5MB max) │
└────────────────────────────────────────────────────────┘
```

---

## 2. Log Levels & Usage Policy

The system supports exactly 5 standard levels:

| Level       | Severity | Intended Usage                                                                                                          |
| :---------- | :------: | :---------------------------------------------------------------------------------------------------------------------- |
| **`debug`** |    10    | Verbose development-only diagnostics and low-level step execution details.                                              |
| **`info`**  |    20    | Meaningful operational and lifecycle milestones (`application.started`, `project.created`, `project.archived`).         |
| **`warn`**  |    30    | Expected degraded states or rate-limit occurrences (`database.unavailable`, `renderer.error.rate_limited`).             |
| **`error`** |    40    | Unexpected recoverable failures (`ipc.request_failed`, `renderer.error_reported`).                                      |
| **`fatal`** |    50    | Unrecoverable process failures requiring clean flush and non-zero exit (`process.uncaught_exception`, startup failure). |

---

## 3. Structured Record Format

Production log files are written strictly as newline-delimited JSON (JSONL):

```json
{
  "timestamp": "2026-08-21T03:10:00.000Z",
  "level": "info",
  "event": "project.created",
  "projectId": "6ccdf176-8627-407b-add1-56b4c7fecf66",
  "requestId": "e1f74812-4000-8000-000000000001",
  "durationMs": 14
}
```

Unexpected failure record example:

```json
{
  "timestamp": "2026-08-21T03:10:05.120Z",
  "level": "error",
  "event": "ipc.request_failed",
  "channel": "desktop:projects:create",
  "requestId": "92c72039-4000-8000-000000000002",
  "durationMs": 8,
  "error": {
    "name": "PrismaClientInitializationError",
    "message": "Can't reach database server at postgresql://[REDACTED]@localhost:5432/ai_quality_platform",
    "code": "P1001"
  }
}
```

---

## 4. Mandatory Secret Redaction

All log payloads pass through recursive redaction:

- **Sensitive Key Names:** Case-insensitive pattern matching for `password`, `passwd`, `secret`, `token`, `accessToken`, `refreshToken`, `apiKey`, `authorization`, `cookie`, `set-cookie`, `databaseUrl`, `DATABASE_URL`, `credentials`, `privateKey`.
- **URL Credentials:** Connection strings (e.g. `postgresql://user:password@host/db`) are sanitized to `postgresql://[REDACTED]@host/db`.
- **Auth Headers:** `Bearer ...` tokens are replaced with `Bearer [REDACTED]`.
- **Process Environment:** The global `process.env` object is never serialized or dumped to disk.

---

## 5. Bounded Local Retention Policy

- **Target Directory:** Electron's application log directory (`app.getPath('logs')` or `userData/logs`).
- **Active Log Name:** `ai-quality-platform.log`.
- **Maximum File Size:** 5 MB.
- **Maximum Retained Files:** 5 rotated generations (`.1` through `.5`).
- **Zero Cloud Telemetry:** Logs are stored purely on the local filesystem. No data is transmitted to Sentry, Datadog, CloudWatch, OpenAI, or external analytics.

---

## 6. Renderer Error Boundaries & Reporting

1. **Root Application Boundary (`AppErrorBoundary`):**
   - Catches fatal React tree rendering crashes.
   - Renders a self-contained fallback screen with `[Try Again]` and `[Reload Window]` actions.
   - Stack traces and internal error messages are strictly hidden from the user.
2. **Workspace Screen Boundary (`ScreenErrorBoundary`):**
   - Wraps individual routed views inside `Workspace`.
   - When an isolated screen throws, only the workspace is replaced with a controlled failure card offering `[Try Again]` and `[Return to Overview]`.
   - Preserves the outer `AppShell` and sidebar navigation.
3. **Restricted Error Reporting Bridge:**
   - Preload exposes only `window.desktop.logging.reportRendererError(report)`.
   - Strict Zod validation on message (<=2000 chars), stack (<=8000 chars), route (<=256 chars).
   - Protected by sender frame validation, rate limiting (20/min), and duplicate error suppression.
