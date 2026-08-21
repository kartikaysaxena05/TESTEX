# Secure Local Source Attachment Foundation

## 1. Overview

The **Source Attachment Foundation** (V2 Phase 15) establishes the first persistent link between a QA Project in PostgreSQL and a real software project on the user's local filesystem.

This foundation enables users to attach, inspect availability, change, and detach a local project directory without exposing arbitrary filesystem access to the unprivileged React renderer.

---

## 2. Architectural Security Boundaries

The source attachment flow enforces strict process isolation:

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── SourceScreen (Overview & Management)         │
│       ├── useSelectedProjectSource Hook                │
│       ├── SourceDetailsCard                            │
│       ├── DetachSourceDialog                           │
│       └── ChangeSourceDialog                           │
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.sources.attachLocalDirectory(projectId)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│    └── Exposes only explicit, typed sources methods    │
└──────────────────────────┬─────────────────────────────┘
                           │ ipcRenderer.invoke(channel, projectId)
                           │ (desktop:sources:*)
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│       ├── Sender Security Frame Validation             │
│       ├── Zod Schema Payload Validation                │
│       ├── Native OS Directory Picker (dialog API)      │
│       └── Sanitized DesktopResult<T> Envelopes         │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct TypeScript Method Invocation
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│       ├── SourceService (Business Logic)               │
│       ├── SourcePathValidation (Canonical realpath)    │
│       ├── SourceRepository (Prisma Persistence)        │
│       └── Structured Logging (source.* events)         │
└──────────────────────────┬─────────────────────────────┘
                           │ Prisma TCP
                           ▼
┌────────────────────────────────────────────────────────┐
│                   POSTGRESQL SERVER                    │
│                 Table: project_sources                 │
└────────────────────────────────────────────────────────┘
```

### Security Invariants

1. **Zero Generic Filesystem Bridge:** The renderer cannot call `fs`, `path`, `readFile`, `readDirectory`, `stat`, or arbitrary shell execution.
2. **Native Dialog in Privileged Main:** Folder selection is delegated to Electron's native `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`. The renderer never provides arbitrary path strings.
3. **Canonical Path Storage:** Filesystem paths are validated and converted to canonical realpaths (`fs.realpathSync`) before persistence to prevent symlink traversal ambiguities.
4. **Immutable Local Files:** The application only stores a read-reference in PostgreSQL. Detaching a source removes only the database row; source code and local files are never modified or deleted.

---

## 3. Database Schema

The `ProjectSource` entity maintains a strict 1:1 relation with `Project`:

```prisma
enum ProjectSourceKind {
  LOCAL_DIRECTORY
}

model ProjectSource {
  id              String            @id @default(uuid()) @db.Uuid
  projectId       String            @unique @map("project_id") @db.Uuid
  kind            ProjectSourceKind @default(LOCAL_DIRECTORY)
  displayName     String            @map("display_name") @db.VarChar(255)
  rootPath        String            @map("root_path") @db.VarChar(4096)
  lastValidatedAt DateTime?         @map("last_validated_at")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("project_sources")
}
```

### Relational Constraints

- **One Primary Source per Project:** Enforced by `@unique` constraint on `project_id`.
- **Cascade Deletion:** When a `Project` is permanently deleted from PostgreSQL, its associated `ProjectSource` row is automatically deleted via `onDelete: Cascade`. The actual directory on disk remains untouched.

---

## 4. Public IPC Bridge Surface

The `window.desktop.sources` bridge exposes only high-level business operations:

```ts
window.desktop.sources = {
  // Retrieves the current source attachment for a project
  get: (projectId: string) => Promise<DesktopResult<ProjectSourceDto | null>>,

  // Opens native directory picker, validates folder, and attaches to active project
  attachLocalDirectory: (projectId: string) => Promise<DesktopResult<AttachLocalDirectoryResult>>,

  // Removes source attachment from project (database only, disk files untouched)
  detach: (projectId: string) => Promise<DesktopResult<DetachSourceResult>>,

  // Rechecks availability of attached folder and updates lastValidatedAt
  validate: (projectId: string) => Promise<DesktopResult<ProjectSourceDto>>,
};
```

---

## 5. Availability & Runtime Behavior

A local directory may become inaccessible if deleted, moved, or located on a disconnected drive.

- **Availability States:** `AVAILABLE` (directory exists and is accessible) vs. `UNAVAILABLE` (directory is missing or inaccessible).
- **Non-Destructive Degradation:** If a source becomes `UNAVAILABLE`, the database record is preserved. The user is informed via the UI and can recheck availability once the drive/folder is restored, or change the attachment directory.

---

## 6. Future Scope (Subsequent V2 Phases)

Phase 15 strictly establishes secure attachment and persistence. The following capabilities are reserved for future phases:

- **Phase 16+:** Repository structure discovery, file indexing, technology detection (e.g. package.json analysis), Git metadata ingestion, AST parsing, and automated test generation.
