# System Architecture

## AI-Driven Software Quality Engineering Platform

**Subtitle:** Requirement-to-Test Traceability, Autonomous Web Testing and Intelligent Bug Triage  
**Current Phase:** Version 1 — Phase 13: Global Error Handling & Logging

---

## 1. Architectural Overview

The platform is architected as a secure, modular desktop application using Electron, React 19, TypeScript, and Node.js. It enforces a strict separation between unprivileged user interface execution and privileged domain/system operations.

### Current Implemented Architecture (Phase 13)

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│          (React 19 + TypeScript + Vite 8)              │
│       ├── main.tsx (createRoot bootstrap)              │
│       ├── App.tsx (Root bridge state connection)       │
│       ├── components/AppErrorBoundary.tsx              │
│       ├── components/ScreenErrorBoundary.tsx           │
│       ├── utils/setupRendererErrorCapture.ts           │
│       ├── context/ProjectContext.tsx (Session state)   │
│       ├── navigation/ (AppRouter, routes, navigation)  │
│       ├── layout/ (AppShell, Sidebar, TopBar, Status)  │
│       ├── screens/ (OverviewScreen, ProjectsScreen)    │
│       ├── features/dashboard/ (ProjectDashboard View)  │
│       ├── ui/ (Design System Primitives)               │
│       └── styles/ (tokens.css, globals.css, layout.css)│
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.*
                           │ (Narrow Typed Bridge Methods)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          (Compiled Single-file CommonJS Bundle)        │
│          └── contextBridge.exposeInMainWorld('desktop')│
└──────────────────────────┬─────────────────────────────┘
                           │ ipcRenderer.invoke(channel)
                           │ (desktop:projects:*, desktop:logging:*)
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── ipc/                                              │
│  │   ├── sender-validation.ts (Top-level Frame Check)  │
│  │   ├── register-ipc.ts (Safe Error Sanitization)     │
│  │   ├── logging-handlers.ts (Rate Limiting & Dedup)   │
│  │   ├── project-handlers.ts (Zod Input Validation)    │
│  │   ├── app-handlers.ts (AppInfo DTO Handler)         │
│  │   ├── health-handlers.ts (Health Check Handler)     │
│  │   └── database-handlers.ts (Database Status Handler)│
│  ├── logging/                                          │
│  │   ├── log-path.ts (Electron Logs Directory)         │
│  │   └── error-handlers.ts (uncaughtException / fatal) │
│  ├── app-lifecycle.ts (Lifecycle & Shutdown Runner)    │
│  ├── main-window.ts (BrowserWindow Management)         │
│  ├── protocol.ts (app:// Custom Protocol Handler)      │
│  ├── security.ts (Navigation, CSP & Permissions)       │
│  └── paths.ts (Safe Local Path Resolution)             │
└──────────────────────────┬─────────────────────────────┘
                           │ (Direct Monorepo Import)
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── logging/                                          │
│  │   ├── logger.ts (AppLogger Structured JSONL)        │
│  │   ├── file-stream.ts (RotatingLogStream)            │
│  │   ├── redaction.ts (Automated Secret Scrubbing)     │
│  │   └── error-serializer.ts (Safe Error Serializer)   │
│  ├── projects/                                         │
│  │   ├── project-service.ts (Authoritative Logic)      │
│  │   ├── project-repository.ts (Prisma Transactions)   │
│  │   ├── project-mappers.ts (Prisma to DTOs)           │
│  │   └── project-errors.ts (Domain Errors)             │
│  ├── database/                                         │
│  │   ├── config.ts (DATABASE_URL & maskDatabaseUrl)    │
│  │   ├── client.ts (getPrismaClient Singleton)         │
│  │   ├── database.ts (DatabaseManager Orchestrator)    │
│  │   ├── health.ts (SELECT 1 AS ok Parameterized Query)│
│  │   └── errors.ts (mapPrismaError Sanitization)       │
│  └── index.ts (Public Core Domain API)                 │
└──────────────────────────┬─────────────────────────────┘
                           │ Prisma Engine (TCP/IP)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│             (PostgreSQL 16.x / 15.x / 14.x)            │
│   ├── projects (UUID PK, name, status, timestamps)     │
│   ├── project_settings (UUID PK/FK, 1:1, cascade)      │
│   └── project_environments (1:N, default partial idx)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Diagnostics & Failure Flow Layer (Phase 13)

```text
Controlled Operation Failure
        ↓
Domain Error (ProjectValidationError, ProjectNotFoundError, etc.)
        ↓
Safe DesktopResult (ok: false, error: { code, message })
        ↓
Rendered Controlled Alert / Inline Validation (No stack trace)

Unexpected Operation Failure
        ↓
Uncaught Exception / Prisma Crash
        ↓
Privileged Error Log (RequestId, Duration, Sanitized Error)
        ↓
Sanitized INTERNAL_ERROR envelope returned to renderer
        ↓
Safe generic error displayed to user

Fatal Main Process Failure
        ↓
uncaughtException
        ↓
FATAL log record written + Logger Flushed
        ↓
Clean process exit (code 1)
```

---

## 3. Dependency Direction & Strict Boundaries

The repository enforces unidirectional dependency flow:

```
apps/desktop (renderer) ──────► packages/contracts
apps/desktop (preload)  ──────► packages/contracts
apps/desktop (main)     ──────► packages/core ──────► packages/contracts
```

### Prohibited Cross-Layer Interactions

- `core` → `renderer` (Domain must never depend on UI)
- `contracts` → `Electron` (Contracts must remain platform-neutral)
- `contracts` → `database` / `fs` / `Playwright` / `AI SDKs`
- `renderer` → `node:fs`, `node:child_process`, `node:os`, `node:path`, `electron`
- `renderer` → `@prisma/client`, `prisma`
- `renderer` → raw SQL queries
