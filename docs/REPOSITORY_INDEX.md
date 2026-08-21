# Repository Index & Source Intelligence Foundation (V2 Phase 24)

## 1. Overview & Objectives

Version 2 continues with **Phase 24: Repository Index & Source Intelligence Foundation**.
Phase 24 introduces a persistent, relational repository index stored in PostgreSQL via Prisma. Subsequent repository intelligence phases (architecture discovery in Phase 25, run configuration in Phase 26, and change impact analysis in Phase 27) can query this index efficiently without repeatedly traversing the filesystem or rereading raw source code.

```text
Authorized ProjectSource
        ↓
Filtered Repository Structure (Phase 19)
        ↓
File Classification (Phase 22)
        ↓
Secure Content Access Gateway (Phase 23)
        ↓
Deterministic AST / Source Parsers (TypeScript / Python)
        ↓
Local Import Path Resolver
        ↓
SHA-256 Content Hashing & Incremental Comparison
        ↓
Relational PostgreSQL Index (RepositoryFile, RepositorySymbol, RepositoryImport, RepositoryIndexRun)
        ↓
Queryable Repository Intelligence Foundation
```

---

## 2. Core Security, Privacy & Architectural Invariants

1. **Zero Source Code Execution:**
   - Parsers treat source code strictly as inert text and AST data.
   - Code is never executed via `require()`, `import()`, `eval()`, `new Function()`, or sub-processes.
2. **Zero Direct Filesystem Read Bypass:**
   - All source reading operations strictly route through the Phase-23 `SourceContentService` gateway with bounds checking and path traversal protection.
3. **Zero Raw Source Content in Database:**
   - PostgreSQL persists only structured metadata, content hashes (SHA-256), top-level symbol declarations, and module import references. Raw file text is never stored in the database.
4. **Zero Source Content in Logs:**
   - Source text, code snippets, tokens, and secret markers are strictly excluded from all logging and telemetry.
5. **Relational Cascading Deletes:**
   - When a `Project` or `ProjectSource` is deleted or detached, all associated `RepositoryFile`, `RepositorySymbol`, `RepositoryImport`, and `RepositoryIndexRun` database records cascade delete in PostgreSQL. The physical repository files on disk remain untouched.
6. **Deterministic Incremental Reindexing:**
   - SHA-256 content hashes identify unchanged files to skip reparsing. Modified files are reparsed and updated, new files inserted, and deleted files pruned.
7. **Strict Phase Boundaries:**
   - Zero semantic architecture claims (no MVC/Clean Architecture labeling, no entry-point declarations, no API route discovery, no vector databases or LLM embeddings).

---

## 3. Database Schema Models (`prisma/schema.prisma`)

```prisma
enum IndexStatus {
  INDEXED
  SKIPPED
  ERROR
  STALE
}

enum IndexRunStatus {
  RUNNING
  COMPLETED
  PARTIAL
  FAILED
}

enum SymbolKind {
  FUNCTION
  CLASS
  INTERFACE
  TYPE
  ENUM
  VARIABLE
  CONSTANT
  METHOD
  MODULE
  UNKNOWN
}

enum ImportKind {
  LOCAL
  EXTERNAL
  DYNAMIC
  UNKNOWN
}

model RepositoryIndexRun {
  id                       String         @id @default(uuid()) @db.Uuid
  sourceId                 String         @map("source_id") @db.Uuid
  status                   IndexRunStatus @default(RUNNING)
  schemaVersion            Int            @default(1) @map("schema_version")
  parserVersion            Int            @default(1) @map("parser_version")
  filesEligible            Int            @default(0) @map("files_eligible")
  filesIndexed             Int            @default(0) @map("files_indexed")
  filesSkipped             Int            @default(0) @map("files_skipped")
  filesFailed              Int            @default(0) @map("files_failed")
  symbolsIndexed           Int            @default(0) @map("symbols_indexed")
  importsIndexed           Int            @default(0) @map("imports_indexed")
  exportsIndexed           Int            @default(0) @map("exports_indexed")
  unsupportedLanguageFiles Int            @default(0) @map("unsupported_language_files")
  durationMs               Int?           @map("duration_ms")
  truncated                Boolean        @default(false)
  warnings                 String[]       @default([])
  startedAt                DateTime       @default(now()) @map("started_at")
  completedAt              DateTime?      @map("completed_at")

  source ProjectSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId])
  @@index([sourceId, status])
  @@map("repository_index_runs")
}

model RepositoryFile {
  id             String      @id @default(uuid()) @db.Uuid
  sourceId       String      @map("source_id") @db.Uuid
  relativePath   String      @map("relative_path") @db.VarChar(1024)
  name           String      @db.VarChar(255)
  extension      String?     @db.VarChar(64)
  language       String?     @db.VarChar(64)
  classification String      @db.VarChar(64)
  sizeBytes      Int         @map("size_bytes")
  contentHash    String?     @map("content_hash") @db.VarChar(64)
  indexStatus    IndexStatus @default(INDEXED) @map("index_status")
  indexedAt      DateTime    @default(now()) @map("indexed_at")
  createdAt      DateTime    @default(now()) @map("created_at")
  updatedAt      DateTime    @updatedAt @map("updated_at")

  source  ProjectSource      @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  symbols RepositorySymbol[]
  imports RepositoryImport[]

  @@unique([sourceId, relativePath])
  @@index([sourceId])
  @@index([sourceId, language])
  @@index([sourceId, classification])
  @@index([sourceId, indexStatus])
  @@map("repository_files")
}

model RepositorySymbol {
  id               String     @id @default(uuid()) @db.Uuid
  repositoryFileId String     @map("repository_file_id") @db.Uuid
  name             String     @db.VarChar(255)
  kind             SymbolKind @default(UNKNOWN)
  startLine        Int        @map("start_line")
  endLine          Int        @map("end_line")
  isExported       Boolean    @default(false) @map("is_exported")
  createdAt        DateTime   @default(now()) @map("created_at")

  repositoryFile RepositoryFile @relation(fields: [repositoryFileId], references: [id], onDelete: Cascade)

  @@index([repositoryFileId])
  @@index([name])
  @@index([repositoryFileId, kind])
  @@map("repository_symbols")
}

model RepositoryImport {
  id                   String     @id @default(uuid()) @db.Uuid
  repositoryFileId     String     @map("repository_file_id") @db.Uuid
  specifier            String     @db.VarChar(1024)
  importKind           ImportKind @default(LOCAL) @map("import_kind")
  resolvedRelativePath String?    @map("resolved_relative_path") @db.VarChar(1024)
  isExternal           Boolean    @default(false) @map("is_external")
  lineNumber           Int        @map("line_number")
  createdAt            DateTime   @default(now()) @map("created_at")

  repositoryFile RepositoryFile @relation(fields: [repositoryFileId], references: [id], onDelete: Cascade)

  @@index([repositoryFileId])
  @@index([repositoryFileId, isExternal])
  @@index([resolvedRelativePath])
  @@map("repository_imports")
}
```

---

## 4. Parser Architecture & Import Resolution

- **`TypeScriptSourceParser`**: Uses the official TypeScript compiler API (`ts.createSourceFile`) to parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` files. Extracts top-level functions, classes, interfaces, type aliases, enums, constants, variables, static imports, dynamic `import()` calls, and `require()` statements.
- **`PythonSourceParser`**: Deterministic top-level line parser for `.py` files extracting top-level `def`, `async def`, `class`, `import`, and `from ... import` statements.
- **`ImportResolver`**: Resolves relative specifiers (e.g. `./user-repository`, `../db`) against the set of known included repository files with candidate extension normalization (`.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, etc.), while classifying non-relative specifiers (`react`, `@prisma/client`) as external dependencies.

---

## 5. IPC Channels & Sandboxed Preload Bridge

| Channel                                  | Description                                       |
| ---------------------------------------- | ------------------------------------------------- |
| `desktop:sources:index:get-status`       | Get current index status and summary metrics      |
| `desktop:sources:index:refresh`          | Trigger full/incremental repository indexing run  |
| `desktop:sources:index:list-files`       | Query indexed files with pagination and search    |
| `desktop:sources:index:get-file-details` | Get single file with complete symbols and imports |
| `desktop:sources:index:search-symbols`   | Search symbols across indexed repository files    |

Exposed safely via `window.desktop.sources.index` in the sandboxed preload bridge.
