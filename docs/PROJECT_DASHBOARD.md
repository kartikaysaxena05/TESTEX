# Project Dashboard Architecture & Implementation

## AI-Driven Software Quality Engineering Platform

**Current Phase:** Version 1 — Phase 12: Project Dashboard

---

## 1. Architectural Overview

The **Project Dashboard** serves as the primary project-aware landing screen (`/overview`). It transforms the application workspace from a generic shell into an active quality engineering cockpit that responds to the currently selected real project.

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│  ├── ProjectContext (Session-local selectedProjectId)  │
│  ├── OverviewScreen (Host View)                        │
│  └── features/dashboard/                               │
│      ├── useSelectedProjectDetails (Stale-protected)   │
│      ├── ProjectDashboard (State Orchestrator)         │
│      ├── ProjectHeader (Identity, Status & Action)     │
│      ├── ProjectSnapshot (Status, Timestamps, Envs)    │
│      ├── EnvironmentOverview (Target URLs & Default)   │
│      └── QualityWorkspace (Future QA Modules & Links)  │
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.projects.get(projectId)
                           │ (Read-only Sanitized DTO)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│          └── desktop.projects.get(projectId)           │
└──────────────────────────┬─────────────────────────────┘
                           │ desktop:projects:get
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│  ├── isTrustedIpcSender (Top-level Frame Verification) │
│  └── projectIdSchema.parse (Zod UUID validation)       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│  ├── ProjectService.getProject(projectId)              │
│  ├── ProjectRepository.getProjectById(id)              │
│  └── Prisma Client ($transaction / findUnique)         │
└──────────────────────────┬─────────────────────────────┘
                           │ TCP/IP Connection Pool
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│   ├── projects (name, status, timestamps)              │
│   ├── project_settings (1:1 relation)                  │
│   └── project_environments (type, baseUrl, isDefault)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Dashboard Lifecycle States

The dashboard deterministically renders one of 5 distinct states:

| State                            | Trigger Condition                                  | Rendered Visual                                                                                                              |
| :------------------------------- | :------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **1. No Selected Project**       | `selectedProjectId === null`                       | Semantic `EmptyState` prompting user to select a project from the sidebar or click `Go to Projects`.                         |
| **2. Loading State**             | `isLoading === true && !project`                   | Modular `Skeleton` placeholders for Header, Snapshot, Environments, and Quality cards while `AppShell` remains intact.       |
| **3. Project Loaded**            | `project !== null`                                 | Full `ProjectDashboard` (Header, Snapshot, Environments, Quality Workspace).                                                 |
| **4. Project Deleted / Missing** | `res.error.code === 'PROJECT_NOT_FOUND'`           | Clears selection from `ProjectContext` and displays error `Alert` with action button to return to Projects.                  |
| **5. Database Unavailable**      | `dbStatus === 'unavailable'` or `'not-configured'` | Controlled `Alert` informing the user that the PostgreSQL server is unreachable without leaking database credentials or SQL. |

---

## 3. Real Persisted Data Provenance

Every data point rendered on the dashboard originates from PostgreSQL or is deterministically derived:

| Data Field              | PostgreSQL Table & Column         | UI Presentation                                               |
| :---------------------- | :-------------------------------- | :------------------------------------------------------------ |
| **Project Name**        | `projects.name`                   | `h2` heading with text wrapping                               |
| **Project Description** | `projects.description`            | Text paragraph or `"No description provided."`                |
| **Project Status**      | `projects.status`                 | `Badge` (`success` for `ACTIVE`, `neutral` for `ARCHIVED`)    |
| **Created Timestamp**   | `projects.created_at`             | Native `Intl.DateTimeFormat` string                           |
| **Updated Timestamp**   | `projects.updated_at`             | Native `Intl.DateTimeFormat` string                           |
| **Environment Count**   | `COUNT(project_environments)`     | Deterministic count (`project.environments.length`)           |
| **Environment Names**   | `project_environments.name`       | Table row header                                              |
| **Environment Types**   | `project_environments.type`       | `Badge` (`LOCAL`, `DEV`, `TEST`, `STAGING`, `PROD`, `CUSTOM`) |
| **Base URLs**           | `project_environments.base_url`   | Monospace plain text with `word-break: break-all`             |
| **Default Environment** | `project_environments.is_default` | Green `Default Target` badge                                  |

---

## 4. Strict "No Fake Metrics" Policy

In accordance with platform requirements:

- **Zero Fabricated Counts:** The dashboard **never** displays fake requirement counts, generated test counts, pass/fail numbers, bug counts, or severity breakdowns.
- **Zero Fake Zeroes:** Nonexistent modules do not display `0` (which falsely implies an active scanner ran and found 0 items). They explicitly display **`Not available`** / **`No data available for this project`**.
- **Zero Fake Quality Scores / Charts:** No formulas, circular progress bars, sparklines, or rating metrics are displayed.

---

## 5. Stale Response Protection on Rapid Project Switch

When a user switches projects rapidly in the sidebar (e.g. Project A → Project B):

- The custom hook `useSelectedProjectDetails` increments an internal `requestCounterRef` on every selection change.
- If a delayed response for Project A arrives after Project B was selected, the generation ID check rejects the stale response, preventing UI state contamination.

---

## 6. Future Quality Workspace Integration

Future development phases will populate the Quality Engineering Workspace from authoritative database entities:

```text
Requirements Card   ← Requirements domain model & parser
Test Cases Card     ← Test synthesis engine & test case repository
Test Runs Card      ← Playwright test runner & execution logs
Defects Card        ← Root-cause classifier & defect repository
Traceability Card   ← Requirement-to-Test coverage matrix
```
