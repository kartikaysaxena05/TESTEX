# Project Creation & Management

## AI-Driven Software Quality Engineering Platform

**Current Phase:** Version 1 — Phase 11: Project Creation & Management

---

## 1. Architectural Overview

Project and environment management follows strict boundary-enforced unidirectional flow:

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── ProjectsScreen (Active & Archived Tabs)      │
│       ├── CreateProjectDialog / EditProjectDialog      │
│       ├── ProjectEnvironmentsDialog (Targets & Default)│
│       ├── ProjectSelector (Active Projects in Sidebar) │
│       ├── ProjectContext (Session-local state)         │
│       └── window.desktop.projects.*                    │
└──────────────────────────┬─────────────────────────────┘
                           │ Typed methods & DTO envelopes
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          └── desktop.projects: { list, get, ... }      │
└──────────────────────────┬─────────────────────────────┘
                           │ Explicit IPC Channels
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── isTrustedIpcSender (Top-level frame verification) │
│  ├── createSafeIpcHandler (Sanitization & code mapping)│
│  └── Zod Runtime Input Validation                      │
└──────────────────────────┬─────────────────────────────┘
                           │ Typed Inputs
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── ProjectService (Authoritative Business Logic)     │
│  ├── ProjectRepository (Prisma Transactions & Queries) │
│  ├── ProjectMappers (Prisma to Serializable DTOs)      │
│  └── ProjectErrors (Domain Exception Classes)          │
└──────────────────────────┬─────────────────────────────┘
                           │ Prisma ORM Client (TCP/IP)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│   ├── projects (UUID PK, Name, Status, Timestamps)     │
│   ├── project_settings (UUID PK/FK, 1:1, cascade)      │
│   └── project_environments (1:N, default partial idx)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Public Bridge API Surface (`window.desktop.projects`)

```ts
window.desktop.projects = {
  list(input?: ListProjectsInput): Promise<DesktopResult<readonly ProjectSummary[]>>,
  get(projectId: string): Promise<DesktopResult<ProjectDetails>>,
  create(input: CreateProjectInput): Promise<DesktopResult<ProjectDetails>>,
  update(input: UpdateProjectInput): Promise<DesktopResult<ProjectDetails>>,
  archive(projectId: string): Promise<DesktopResult<ProjectDetails>>,
  restore(projectId: string): Promise<DesktopResult<ProjectDetails>>,
  delete(projectId: string): Promise<DesktopResult<{ readonly deleted: true }>>,
  environments: {
    create(input: CreateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>>,
    update(input: UpdateEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>>,
    delete(input: DeleteEnvironmentInput): Promise<DesktopResult<{ readonly deleted: true }>>,
    setDefault(input: SetDefaultEnvironmentInput): Promise<DesktopResult<ProjectEnvironmentDto>>,
  }
}
```

---

## 3. IPC Channels

| Channel Name                                | Handler                       | Payload                                                             | Return DTO              |
| :------------------------------------------ | :---------------------------- | :------------------------------------------------------------------ | :---------------------- |
| `desktop:projects:list`                     | `handleListProjects`          | `{ status?: 'ACTIVE' \| 'ARCHIVED' \| 'ALL' }`                      | `ProjectSummary[]`      |
| `desktop:projects:get`                      | `handleGetProject`            | `projectId: string` (UUID)                                          | `ProjectDetails`        |
| `desktop:projects:create`                   | `handleCreateProject`         | `{ name: string, description?: string \| null }`                    | `ProjectDetails`        |
| `desktop:projects:update`                   | `handleUpdateProject`         | `{ projectId: string, name: string, description?: string \| null }` | `ProjectDetails`        |
| `desktop:projects:archive`                  | `handleArchiveProject`        | `projectId: string` (UUID)                                          | `ProjectDetails`        |
| `desktop:projects:restore`                  | `handleRestoreProject`        | `projectId: string` (UUID)                                          | `ProjectDetails`        |
| `desktop:projects:delete`                   | `handleDeleteProject`         | `projectId: string` (UUID)                                          | `{ deleted: true }`     |
| `desktop:projects:environments:create`      | `handleCreateEnvironment`     | `{ projectId, name, type, baseUrl? }`                               | `ProjectEnvironmentDto` |
| `desktop:projects:environments:update`      | `handleUpdateEnvironment`     | `{ projectId, environmentId, name, type, baseUrl? }`                | `ProjectEnvironmentDto` |
| `desktop:projects:environments:delete`      | `handleDeleteEnvironment`     | `{ projectId, environmentId }`                                      | `{ deleted: true }`     |
| `desktop:projects:environments:set-default` | `handleSetDefaultEnvironment` | `{ projectId, environmentId }`                                      | `ProjectEnvironmentDto` |

---

## 4. Authoritative Business Rules & Lifecycle Policies

### 4.1. Project Creation & Automatic Settings

- **Name Validation:** Trimmed string length must be 1–120 characters. Blank names are rejected.
- **Description:** Optional; trimmed string up to 5000 characters (empty strings normalize to `null`).
- **Atomic Transaction:** Every `Project` creation creates an associated `ProjectSettings` row within the same Prisma transaction. If settings creation fails, the project creation is rolled back.

### 4.2. Project Modification & Archiving

- **Archived Immutability:** When a project has `status: 'ARCHIVED'`, all normal update operations (`updateProject`, `createEnvironment`, `updateEnvironment`, `deleteEnvironment`, `setDefaultEnvironment`) are rejected with `PROJECT_ARCHIVED`.
- **Restore:** Calling `restoreProject()` returns the project to `status: 'ACTIVE'`, re-enabling mutations and active selector visibility.

### 4.3. Permanent Deletion Policy

- **Safety Gate:** Active projects **cannot** be permanently deleted directly. The project must first be transitioned to `status: 'ARCHIVED'` before `deleteProject()` is permitted.
- **Cascading Removal:** Permanent deletion cascades and removes `Project`, `ProjectSettings`, and all child `ProjectEnvironment` records.

### 4.4. Environment Management & Default Rules

- **First Environment Rule:** The first environment created for a project automatically becomes `isDefault: true`. Subsequent environments default to `false`.
- **Switch Default:** `setDefaultEnvironment()` uses an atomic Prisma transaction to set existing default flags for that project to `false` and designate the selected environment as `true`.
- **Base URL Validation:** URLs must use `http://` or `https://` protocols (e.g. `http://localhost:3000`, `https://staging.example.com`). Embedded user credentials (e.g. `https://user:pass@host`) and non-web schemes (`javascript:`, `file:`, `ftp:`) are strictly rejected.
- **Cross-Project Isolation:** Mutating an environment requires verifying that `env.projectId === input.projectId`.

### 4.5. Session-Local Project Selection

- Project selection state is owned by `ProjectContext` in the React renderer session. It is **not** written to the database.
- When an active project is created, it is automatically selected.
- If the currently selected project is archived or deleted, the selection is cleared.
