# Repository Metadata & Source Identity

## 1. Overview

**V2 Phase 16: Repository Metadata & Source Identity** establishes a stable, trustworthy source root identity for local software repositories attached to QA Projects in PostgreSQL.

This phase extends the foundational attachment from Phase 15 with safe root-level filesystem metadata, deterministic SHA-256 fingerprinting, and non-destructive metadata refresh without prematurely performing recursive repository scanning or code analysis.

---

## 2. Core Architectural Principle

```text
SOURCE IDENTITY, NOT SOURCE INTELLIGENCE
```

Phase 16 establishes the verified root identity of the attached directory:

- Canonical path resolution
- Display name
- Root directory timestamps (`filesystemCreatedAt`, `filesystemModifiedAt`, `metadataRefreshedAt`)
- Deterministic SHA-256 root identity fingerprint
- Availability verification (`AVAILABLE` vs. `UNAVAILABLE`)

Phase 16 explicitly **does NOT** perform:

- Recursive file enumeration or tree construction (constant time O(1) relative to repository size)
- Git command execution or `.git` inspection (reserved for Phase 17)
- `package.json` or manifest parsing
- Language / framework classification
- Source code reading or AST analysis
- Code content hashing or change diffing (reserved for Phase 27)

---

## 3. Database Model

The `ProjectSource` entity in `prisma/schema.prisma` stores the verified root identity:

```prisma
enum ProjectSourceKind {
  LOCAL_DIRECTORY
}

model ProjectSource {
  id                   String            @id @default(uuid()) @db.Uuid
  projectId            String            @unique @map("project_id") @db.Uuid
  kind                 ProjectSourceKind @default(LOCAL_DIRECTORY)
  displayName          String            @map("display_name") @db.VarChar(255)
  rootPath             String            @map("root_path") @db.VarChar(4096)
  identityFingerprint  String?           @map("identity_fingerprint") @db.VarChar(64)
  filesystemCreatedAt  DateTime?         @map("filesystem_created_at")
  filesystemModifiedAt DateTime?         @map("filesystem_modified_at")
  metadataRefreshedAt  DateTime?         @map("metadata_refreshed_at")
  lastValidatedAt      DateTime?         @map("last_validated_at")
  createdAt            DateTime          @default(now()) @map("created_at")
  updatedAt            DateTime          @updatedAt @map("updated_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("project_sources")
}
```

---

## 4. Deterministic Identity Fingerprinting

The root identity fingerprint is a 64-character SHA-256 hex string derived from normalized root metadata:

```ts
const identityPayload = {
  kind: 'LOCAL_DIRECTORY',
  canonicalPath: path.normalize(canonicalPath),
  dev: stats.dev,
  ino: stats.ino,
  birthtimeMs: filesystemCreatedAt ? filesystemCreatedAt.getTime() : null,
};

const identityFingerprint = crypto
  .createHash('sha256')
  .update(JSON.stringify(identityPayload))
  .digest('hex');
```

### Important Fingerprint Limitation

A path-and-stat-based fingerprint identifies the _source root identity_ (verifying that the directory path still points to the same root entity). It does **NOT** compute a checksum of internal repository file contents. Content-change detection is part of Phase 27.

---

## 5. Metadata Refresh Lifecycle

```text
Renderer: window.desktop.sources.refreshMetadata(projectId)
  │
  ▼ (IPC: desktop:sources:refresh-metadata)
Privileged Electron Main (Security & Zod validation)
  │
  ▼
SourceService.refreshMetadata(projectId)
  ├── 1. Verify project exists and is ACTIVE (rejects ARCHIVED projects)
  ├── 2. Retrieve ProjectSource from PostgreSQL
  ├── 3. Inspect directory accessibility (non-destructively)
  ├── 4. If accessible:
  │       - Compute fresh root identity (O(1) stat)
  │       - Detect fingerprint changes (logs source.identity_changed)
  │       - Update database record (metadataRefreshedAt, timestamps, fingerprint)
  │       - Return DTO with availability = AVAILABLE
  └── 5. If inaccessible:
          - Update lastValidatedAt in database (preserves known metadata)
          - Log source.unavailable
          - Return DTO with availability = UNAVAILABLE
```

---

## 6. Security Boundary & Non-Destructive Invariants

1. **Zero Generic Filesystem Bridge:** Preload exposes only explicit `window.desktop.sources.*` methods (`get`, `attachLocalDirectory`, `detach`, `validate`, `refreshMetadata`). The renderer has no access to `fs`, `path`, or shell APIs.
2. **Filesystem Safety Guarantee:** Detaching a source deletes only the database row. Source files and git histories on disk are NEVER modified or deleted.
3. **Database Cascades:** Deleting an archived project permanently cascades to delete the `ProjectSource` record from PostgreSQL while leaving disk files untouched.
