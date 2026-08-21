# AI-Driven Software Quality Engineering Platform

> **Requirement-to-Test Traceability, Autonomous Web Testing and Intelligent Bug Triage**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-43.4.1-blue.svg)](https://www.electronjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.13-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19.x-2D3748.svg)](https://www.prisma.io/)
[![React](https://img.shields.io/badge/React-19.2.8-61dafb.svg)](https://react.dev/)
[![React Router](https://img.shields.io/badge/React%20Router-7.18.2-ca4245.svg)](https://reactrouter.com/)
[![Vite](https://img.shields.io/badge/Vite-8.2.2-646cff.svg)](https://vitejs.dev/)
[![npm Workspaces](https://img.shields.io/badge/npm-workspaces-red.svg)](https://docs.npmjs.com/cli/using-npm/workspaces)
[![Phase](https://img.shields.io/badge/Version%201-Complete%20%26%20Certified-brightgreen.svg)](<>)

---

## 1. Project Overview

The **AI-Driven Software Quality Engineering Platform** is an enterprise-grade desktop application engineered to automate and streamline the software testing lifecycle. It bridges the gap between software specifications and production-quality verification by combining requirement parsing, automated test synthesis, Playwright-driven browser execution, intelligent root-cause failure classification, and automated bug tracking.

---

## 2. Project Status

### **Version 1 — Desktop Application Foundation: COMPLETE & CERTIFIED**

| Milestone                                     |           Status            | Description                                                                                                                                                                                                                                                                                        |
| :-------------------------------------------- | :-------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1: Project Architecture**             | **Implemented & Certified** | Monorepo structure, strict boundaries, contracts package, core package, and code quality pipelines.                                                                                                                                                                                                |
| **Phase 2: Electron Main Process**            | **Implemented & Certified** | Stable Electron runtime (`v43.4.1`), secure BrowserWindow lifecycle, global sandboxing, navigation guards, and single-instance lock.                                                                                                                                                               |
| **Phase 3: React Renderer Setup**             | **Implemented & Certified** | React 19 (`createRoot`), Vite 8 bundler, loopback HMR dev server (`127.0.0.1:5173`), secure custom application protocol (`app://renderer/`) with path-traversal protection, and deterministic React-mount smoke testing.                                                                           |
| **Phase 4: Secure IPC Communication**         | **Implemented & Certified** | Narrow typed `window.desktop` bridge via sandboxed CommonJS preload, main-process frame sender validation, sanitized `DesktopResult<T>` error envelopes, and automated end-to-end smoke verification.                                                                                              |
| **Phase 5: Application Layout**               | **Implemented & Certified** | Professional desktop engineering shell (`AppShell`, `Sidebar`, `TopBar`, `Workspace`, `StatusBar`, `ProductMark`, `ProjectSelectorPlaceholder`) with dark CSS design tokens, real IPC status, and accessibility semantics.                                                                         |
| **Phase 6: Navigation & Core Screens**        | **Implemented & Certified** | Hash-based client routing (`react-router-dom`), centralized typed route registry, dynamic TopBar and Sidebar active state, and 11 core screen shells.                                                                                                                                              |
| **Phase 7: Design System**                    | **Implemented & Certified** | Reusable, domain-neutral, accessible UI components (`Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `FormField`, `Card`, `Badge`, `Alert`, `EmptyState`, `Spinner`, `Skeleton`, `Table`, `Dialog`, `Tabs`, `Separator`) with semantic CSS tokens and component unit test suite. |
| **Phase 8: PostgreSQL Foundation**            | **Implemented & Certified** | PostgreSQL connection infrastructure, environment configuration, database status IPC, and clean shutdown.                                                                                                                                                                                          |
| **Phase 9: Prisma ORM Setup**                 | **Implemented & Certified** | Prisma ORM integration, `prisma/schema.prisma` foundation, singleton `PrismaClient` lifecycle, safe parameterized health checking, and CLI migration workflow scripts.                                                                                                                             |
| **Phase 10: Core Project Data Models**        | **Implemented & Certified** | Foundational relational entities (`Project`, `ProjectSettings`, `ProjectEnvironment`), enums, cascade deletion, unique constraints, and PostgreSQL partial unique index for default environments.                                                                                                  |
| **Phase 11: Project Creation & Management**   | **Implemented & Certified** | Project CRUD & Environment management (`ProjectService`, `ProjectRepository`, transactions, Zod runtime validation, narrow IPC, `ProjectContext`, functional `ProjectSelector`, `ProjectsScreen` modals).                                                                                          |
| **Phase 12: Project Dashboard**               | **Implemented & Certified** | Real database-backed project dashboard (`ProjectDashboard`, `ProjectHeader`, `ProjectSnapshot`, `EnvironmentOverview`, `QualityWorkspace`, stale response protection, honest zero-data handling).                                                                                                  |
| **Phase 13: Global Error Handling & Logging** | **Implemented & Certified** | Structured local logging (`AppLogger`, `RotatingLogStream`), automated recursive secret redaction, root/screen React Error Boundaries (`AppErrorBoundary`, `ScreenErrorBoundary`), narrow error reporting IPC, main process fatal/crash handlers, and IPC request correlation (`requestId`).       |
| **Phase 14: Foundation Testing & Validation** | **Implemented & Certified** | Comprehensive foundation audit, 159 automated tests passing across 64 suites, clean builds, zero architecture violations, PostgreSQL lifecycle certification, and Version 2 readiness.                                                                                                             |

---

## 3. High-Level Architecture

The platform enforces a unidirectional, boundary-enforced architecture designed for maximum security and maintainability:

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── AppErrorBoundary (Root Failure Fallback)     │
│       ├── ScreenErrorBoundary (Route Level Recovery)   │
│       ├── AppRouter (HashRouter + Central Routes)      │
│       ├── AppShell (Sidebar, TopBar, Workspace, Status)│
│       ├── OverviewScreen (ProjectDashboard feature)    │
│       ├── ProjectsScreen (Active & Archived Management)│
│       ├── ProjectContext & ProjectSelector             │
│       └── window.desktop.logging.reportRendererError() │
└──────────────────────────┬─────────────────────────────┘
                           │ (Read-only Sanitized DTOs Only)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          └── contextBridge.exposeInMainWorld('desktop')│
└──────────────────────────┬─────────────────────────────┘
                           │ ipcRenderer.invoke(channel)
                           │ (desktop:projects:*, desktop:logging:*)
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── Sender Validation (Top-level Frame Verification)  │
│  ├── Safe IPC Handlers (Sanitized Error Envelopes)     │
│  ├── Request ID Generation (UUID Traceability)         │
│  ├── Process Error Handlers (uncaughtException/fatal)  │
│  └── BrowserWindow Hardened WebPreferences             │
└──────────────────────────┬─────────────────────────────┘
                           │ (Direct Monorepo Import)
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── AppLogger (Structured JSONL Logger)               │
│  ├── RotatingLogStream (Size-based Rotation & Delete)  │
│  ├── Deep Secret Redaction (Zero Leaks Policy)         │
│  ├── ProjectService (Authoritative Business Logic)     │
│  ├── ProjectRepository (Prisma Transactions)           │
│  └── DatabaseManager (Lifecycle Orchestrator)          │
└──────────────────────────┬─────────────────────────────┘
                           │ Prisma Engine TCP/IP
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│             (PostgreSQL 16.x / 15.x / 14.x)            │
└────────────────────────────────────────────────────────┘
```

---

## 4. Available Workspace Commands

All validation commands run at the workspace root:

```bash
# Start development environment with Vite HMR + Preload bundle + Electron
npm run desktop:dev

# Build the desktop application (TypeScript, Preload bundle, and Vite renderer)
npm run desktop:build

# Launch the production compiled desktop application (using app:// protocol)
npm run desktop:start

# Validate Prisma schema
npm run db:schema:validate

# Format Prisma schema
npm run db:schema:format

# Generate Prisma client artifacts
npm run db:generate

# Apply pending development migrations
npm run db:migrate:dev

# Check Prisma migration status
npm run db:migrate:status

# Run standalone PostgreSQL connectivity & health check CLI tool
npm run db:check

# Run standalone project management integration tests against PostgreSQL
npm run test:projects:integration

# Run standalone renderer unit tests
npm run test:renderer

# Run deterministic automated Electron smoke test verifying routing and IPC
npm run desktop:smoke

# Run security, protocol, IPC, navigation, preload, UI, logging, and database unit/integration tests
npm test

# Typecheck all packages and applications with strict compiler settings
npm run typecheck

# Run ESLint across all TypeScript and JavaScript files
npm run lint

# Check code formatting with Prettier
npm run format:check

# Automatically fix code formatting with Prettier
npm run format

# Run full static check pipeline (typecheck + lint + format:check + test)
npm run check
```

---

## 5. Core Architectural & Security Invariants

1. **Zero Generic IPC:** The renderer has no access to `ipcRenderer`, generic `invoke`, `send`, or `on`. Only explicit methods under `window.desktop.*` are callable.
2. **Sender Security Validation:** Every main process IPC handler inspects `event.senderFrame`, verifying the request originates from the top-level trusted renderer frame.
3. **Database & Prisma Privileged:** `DATABASE_URL`, `@prisma/client`, and database passwords never cross into the renderer. All sensitive strings are masked with `***` prior to logging.
4. **Zero SQL in Renderer:** The renderer cannot execute arbitrary SQL queries.
5. **Strict Error Sanitization:** Main process exceptions are trapped and returned as `DesktopResult<T>` error envelopes; stack traces and local filesystem paths are never leaked across the IPC boundary.
6. **Sandboxed Preload Compilation:** Preload scripts are bundled as a single-file CommonJS artifact (`dist/preload/index.cjs`) compatible with Chromium `sandbox: true`.
7. **Local Structured Logging:** Logs are written to rotating local files in Electron's application directory with automatic secret scrubbing; no data is sent to external clouds or third-party telemetry.
8. **React Error Boundaries:** Rendering failures are caught gracefully at root and route boundaries, displaying user-friendly recovery actions without raw stack traces.
9. **Custom Protocol Isolation:** Production renderer is loaded via `app://renderer/index.html` with built-in path-traversal prevention.
10. **Loopback Dev Server:** Development server binds strictly to `127.0.0.1:5173`; arbitrary host origins are blocked.
11. **BrowserWindow Hardening:** All windows explicitly enforce `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`.

For detailed documentation, see [ARCHITECTURE.md](file:///Users/kartikaysaxena/Desktop/collage/docs/ARCHITECTURE.md), [DATABASE.md](file:///Users/kartikaysaxena/Desktop/collage/docs/DATABASE.md), [PROJECT_MODEL.md](file:///Users/kartikaysaxena/Desktop/collage/docs/PROJECT_MODEL.md), [PROJECT_MANAGEMENT.md](file:///Users/kartikaysaxena/Desktop/collage/docs/PROJECT_MANAGEMENT.md), [PROJECT_DASHBOARD.md](file:///Users/kartikaysaxena/Desktop/collage/docs/PROJECT_DASHBOARD.md), [LOGGING.md](file:///Users/kartikaysaxena/Desktop/collage/docs/LOGGING.md), [DESIGN_SYSTEM.md](file:///Users/kartikaysaxena/Desktop/collage/docs/DESIGN_SYSTEM.md), and [DEVELOPMENT.md](file:///Users/kartikaysaxena/Desktop/collage/docs/DEVELOPMENT.md).
