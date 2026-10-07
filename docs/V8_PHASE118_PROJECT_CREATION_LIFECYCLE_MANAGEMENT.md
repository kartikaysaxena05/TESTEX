# V8 Phase 118 — Project Creation & Project Lifecycle Management

## Overview

V8 Phase 118 implements comprehensive, enterprise-grade **Project Creation & Project Lifecycle Management** for the **AI-Driven Software Quality Engineering Platform**. It establishes the authoritative project workspace and lifecycle engine, enabling software engineering and quality assurance teams to create, view, rename, edit metadata, archive, restore, safe-delete, switch, list, search, sort, pin/favorite, and track recency across all testing projects.

Phase 118 delivers end-to-end multi-user isolation (User A $\neq$ User B), monotonic race condition protection on project switching, mass assignment prevention, and a truthful empty source state (`sourceState: 'NOT_CONFIGURED'`) that renders exploratory Section 11/28/32 source choice cards with strict Phase 119+ boundary notices, eliminating mock or fabricated test metrics.

---

## 1. Architecture & Layered Implementation

```
+----------------------------------------------------------------------------------------------------+
|                                    RENDERER UI LAYER (React 19)                                    |
| +------------------------------------------------------------------------------------------------+ |
| | CreateProjectModal (double-click guard, name/desc validation, favorite toggle)                 | |
| | ProjectSettingsModal (metadata editor, archive/restore toggle, safe delete confirmation)       | |
| | EmptyProjectSourceSelection (Section 11/28/32 source choices: Website, Repo, Folder, App)     | |
| | CodexSidebar (active projects, search, favorite indicator, '+ New Project' trigger)           | |
| | ProjectHeaderBar (Source: Not Connected badge, Project Settings trigger)                       | |
| | ProjectDashboard (renders EmptyProjectSourceSelection when source is NOT_CONFIGURED)           | |
| | ProjectContext (lifecycle actions, monotonic race protection, user-switch cache clearing)      | |
| +------------------------------------------------------------------------------------------------+ |
+--------------------------------------------------+-------------------------------------------------+
                                                   | IPC Bridge (window.desktop.projects)
+--------------------------------------------------v-------------------------------------------------+
|                                    PRELOAD & DESKTOP IPC LAYER                                     |
| +------------------------------------------------------------------------------------------------+ |
| | Preload API: projects.list, get, create, update, archive, restore, delete, markOpened          | |
| | IPC Channels: DESKTOP_CHANNELS.PROJECTS_* (validated by schema, extractUser(event))            | |
| | Safe IPC Handlers: assertAuthenticated(event), handleProjectServiceError mapping to envelopes  | |
| +------------------------------------------------------------------------------------------------+ |
+--------------------------------------------------+-------------------------------------------------+
                                                   | Domain Calls (userId injected)
+--------------------------------------------------v-------------------------------------------------+
|                                       CORE DOMAIN LAYER                                            |
| +------------------------------------------------------------------------------------------------+ |
| | ProjectService: checkOwnership(project, userId), recordAudit, lifecycle state validations      | |
| | ProjectRepository: listProjects (filtered, searched, sorted, pinned), softDelete, markOpened  | |
| | Domain Errors: ProjectAccessDeniedError, ProjectArchivedError, ProjectValidationError          | |
| +------------------------------------------------------------------------------------------------+ |
+--------------------------------------------------+-------------------------------------------------+
                                                   | Prisma ORM
+--------------------------------------------------v-------------------------------------------------+
|                                    DATABASE & PERSISTENCE                                          |
| +------------------------------------------------------------------------------------------------+ |
| | Project Table: userId, lastOpenedAt, archivedAt, deletedAt, isFavorite                         | |
| | Indexes: @@index([userId]), @@index([lastOpenedAt]), @@index([deletedAt]), @@index([userId, status])|
| | AuthAuditEvent: PROJECT_CREATED, PROJECT_RENAMED, PROJECT_ARCHIVED, PROJECT_RESTORED, DELETED  | |
| +------------------------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Complete Project Lifecycle State Machine

```
              +---------------------------+
              |    createProject(...)     |
              +-------------+-------------+
                            |
                            v
              +-------------+-------------+
              |          ACTIVE           | <---------------+
              |   (source: NOT_CONFIG)    |                 |
              +-------------+-------------+                 |
                            |                               |
                   archiveProject(...)              restoreProject(...)
                            |                               |
                            v                               |
              +-------------+-------------+                 |
              |         ARCHIVED          | ----------------+
              |   (archivedAt timestamp)  |
              +-------------+-------------+
                            |
                    deleteProject(...)
              (safe delete: requires ARCHIVED)
                            |
                            v
              +-------------+-------------+
              |     DELETED (Soft/Hard)   |
              |   (deletedAt timestamp)   |
              +---------------------------+
```

### Lifecycle Rules & Invariants:
1. **Creation**: Newly created projects start in `status: 'ACTIVE'`, `archivedAt: null`, `deletedAt: null`, `lastOpenedAt: null`, and truthful `sourceState: 'NOT_CONFIGURED'`.
2. **Opening / Recency**: Invoking `markOpened(projectId)` sets `lastOpenedAt` to `new Date()`, without altering `updatedAt` or metadata.
3. **Renaming & Editing**: Active projects can be renamed and their descriptions edited via `updateProject`. Mass assignment is prevented: forbidden fields (`id`, `createdAt`, `updatedAt`, `userId`, `status`) are stripped and rejected.
4. **Archiving**: Calling `archiveProject(projectId)` transitions `status` to `ARCHIVED`, stamps `archivedAt`, and hides the project from default active project listings.
5. **Modification Guard**: Archived projects cannot be renamed, edited, or have environments added. Any update attempt throws `ProjectArchivedError` (`INVALID_STATE`).
6. **Restoring**: Calling `restoreProject(projectId)` transitions status back to `ACTIVE`, clears `archivedAt`, and restores the project to active listings.
7. **Safe Deletion**: Deletion of an `ACTIVE` project is strictly prohibited. Attempting to delete an active project throws `ProjectValidationError` ("Active projects cannot be deleted. Archive the project first.").
8. **Deletion**: Deleting an `ARCHIVED` project soft-deletes the record by setting `deletedAt`. Soft-deleted projects are excluded from all listings (`ACTIVE`, `ARCHIVED`, and `ALL`). Double-deletion is safe and idempotent.

---

## 3. Multi-User Isolation & Security Invariants

1. **Authenticated Ownership**:
   - Each project stores the `userId` of its creator.
   - All mutating IPC handlers extract the authenticated user ID from the session (`assertAuthenticated(event)`).
2. **Cross-User Attack Prevention**:
   - **Cross-User Read**: User B cannot query or view User A's project. The domain service enforces `checkOwnership` and throws `ProjectAccessDeniedError` (`ACCESS_DENIED`).
   - **Cross-User Update**: User B cannot rename, update description, or pin/favorite User A's project.
   - **Cross-User Delete**: User B cannot archive, restore, or delete User A's project.
3. **User Switching & Logout Invalidation**:
   - `ProjectContext` subscribes to authentication state changes. When the active user changes or logs out, all cached project summaries, recent projects, and selected project details are immediately purged from memory.

---

## 4. Race Condition & Concurrency Protection

1. **Monotonic Request Counter**:
   - In `ProjectContext` and `useSelectedProjectDetails`, every project selection change increments a monotonic sequence counter (`requestCounterRef.current`).
   - Responses arriving asynchronously verify that their request ID matches the latest counter before committing state to the UI.
   - Slower responses from previously selected projects (e.g. Project A returning in 50ms after Project B was selected at 10ms) are discarded deterministically.
2. **Double-Click Creation Guard**:
   - In `CreateProjectModal`, submission toggles `isSubmitting` state, which immediately disables the submit button and prevents duplicate IPC dispatches.
   - Concurrent creation requests at the domain layer produce distinct entities with unique UUIDs without database collision or corrupted state.

---

## 5. Truthful Source State & Section 11/28/32 Compliance

Newly created projects enter a truthful `sourceState: 'NOT_CONFIGURED'` state. Instead of displaying empty or fabricated quality metrics (zero fake test runs, fake pass rates, or simulated coverage percentages), the platform displays `EmptyProjectSourceSelection`:

1. **Website Card**: Connects dev server, staging URL, or live app. Discloses Phase 119 boundary.
2. **Repository Card**: Connects Git repository for code intelligence. Discloses Phase 120 boundary.
3. **Local Folder Card**: Targets local source code directories. Discloses Phase 121 boundary.
4. **Browser / Running App Card**: Attaches to live browser sessions. Discloses Phase 122 boundary.

Zero web crawling, zero repository cloning, zero filesystem scanning, and zero browser sessions are initiated in Phase 118.

---

## 6. Verification & Test Suite

The implementation is verified by the authoritative certification test suite:
`apps/desktop/src/main/v8-phase118-project-lifecycle-certification.test.tsx`

Covering all 26 Authoritative Subtests:
- Subtest 1: Project Creation & Initial State
- Subtest 2: Runtime Input Validation (Name & Description boundaries)
- Subtest 3: Double-Click / Duplicate Creation Guard
- Subtest 4: Project Listing & Filtering (Active, Archived, All)
- Subtest 5: Project Search (case-insensitive name/description)
- Subtest 6: Deterministic Sorting ('recent', 'created', 'name', favorites pinned)
- Subtest 7: Pin / Favorite Toggle
- Subtest 8: Project Opening & Recency Tracking (lastOpenedAt updated)
- Subtest 9: Project Switching & State Cleanup
- Subtest 10: Monotonic Sequence Race Protection (late Project A response discarded)
- Subtest 11: Project Rename & Metadata Update
- Subtest 12: Mass Assignment Protection
- Subtest 13: Project Archiving (sets archivedAt, hidden from active list)
- Subtest 14: Modification Guard on Archived Projects
- Subtest 15: Project Restoring (clears archivedAt, returns to active list)
- Subtest 16: Safe Deletion Guard (rejects deletion of ACTIVE project)
- Subtest 17: Deletion of Archived Project & Cascading Integrity
- Subtest 18: Idempotent Double-Delete Safety
- Subtest 19: Soft-Deletion Query Exclusion (deletedAt != null excluded)
- Subtest 20: Current Project Context Clearing on Deletion
- Subtest 21: Authenticated Ownership Invariant (User A != User B)
- Subtest 22: Cross-User Read Attack Rejection
- Subtest 23: Cross-User Update Attack Rejection
- Subtest 24: Cross-User Delete Attack Rejection
- Subtest 25: User Switching & Logout Cache Invalidation
- Subtest 26: Truthful Neutral Source State (NOT_CONFIGURED, zero Phase 119 connection)
