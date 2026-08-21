# Repository Structure Discovery

## 1. Overview

**V2 Phase 18: Repository Structure Discovery** introduces a safe, bounded, read-only filesystem traversal engine for attached software source projects.

This phase discovers the file and directory hierarchy beneath the user's explicitly attached `ProjectSource.rootPath`, classifies filesystem entries as `FILE`, `DIRECTORY`, or `SYMLINK`, enforces strict path containment and hard traversal limits, prevents symlink escapes and infinite loops, and renders an accessible repository tree in the desktop UI.

---

## 2. Core Architectural Principle

```text
PHASE 18 = SAFE STRUCTURE DISCOVERY
NOT
PHASE 18 = REPOSITORY INTELLIGENCE
```

Phase 18 answers:

- What files and directories exist under the attached source root?
- What is their relative hierarchy?
- Which entries are files, directories, or symbolic links?
- Was traversal bounded or truncated due to configured safety limits?

Phase 18 **explicitly does NOT**:

- Read or inspect file contents (`fs.readFile` is strictly forbidden)
- Parse package manifests (`package.json`, `pom.xml`, `Cargo.toml`, etc.)
- Evaluate `.gitignore` rules (deferred to Phase 19)
- Detect programming languages, frameworks, or technologies (deferred to Phase 20+)
- Classify source code vs test files
- Index or embed source code

---

## 3. Security Boundaries & Containment

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── SourceScreen                                 │
│       ├── useSelectedProjectStructure Hook             │
│       ├── StructureTreeView (Expandable Hierarchy)     │
│       └── RepositoryStructureCard                      │
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.sources.structure.refresh(projectId)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│    └── Exposes only explicit, typed structure methods  │
└──────────────────────────┬─────────────────────────────┘
                           │ ipcRenderer.invoke(channel, projectId)
                           │ (desktop:sources:structure:*)
                           ▼
┌────────────────────────────────────────────────────────┐
│               PRIVILEGED ELECTRON MAIN                 │
│                 apps/desktop/src/main                  │
│       ├── Sender Security Frame Validation             │
│       └── Zod Schema Payload Validation                │
└──────────────────────────┬─────────────────────────────┘
                           │ Direct TypeScript Method Invocation
                           ▼
┌────────────────────────────────────────────────────────┐
│              APPLICATION / DOMAIN CORE                 │
│                    packages/core                       │
│       ├── SourceStructureService (Orchestration/Cache) │
│       └── SafeDirectoryWalker (Iterative DFS Engine)   │
└──────────────────────────┬─────────────────────────────┘
                           │ fs.promises.readdir / lstat (Metadata Only)
                           ▼
┌────────────────────────────────────────────────────────┐
│              AUTHORIZED LOCAL SOURCE ROOT              │
│               (ProjectSource.rootPath)                 │
└────────────────────────────────────────────────────────┘
```

### Security Invariants

1. **Authorized Root Constraint:** Traversal is strictly constrained to the canonicalized `ProjectSource.rootPath`. Discovering a parent Git root in Phase 17 does **NOT** expand traversal authority to parent directories.
2. **Iterative DFS Traversal (Stack-Based):** Traversal uses an iterative stack to eliminate the risk of call-stack exhaustion on deep directory hierarchies.
3. **Symlink Policy:** Discovered symlinks are recorded as `kind: 'SYMLINK'` but directory symlinks are **NEVER** followed. This completely prevents symlink loop traps and symlink escapes outside the authorized root.
4. **Path Containment:** Every candidate path is checked with `path.relative(canonicalRoot, entryPath)`. If the path escapes the root, it is rejected immediately.
5. **Fixed Safety Exclusions:** `.git` and `node_modules` are recorded at their top level but their descendants are excluded from recursion.
6. **Hard Traversal Limits:**
   - Maximum entries: `50,000`
   - Maximum depth: `50`
   - Timeout: `15,000 ms`
   - When any limit is reached, traversal halts gracefully and sets `truncated: true` with a clear reason (`MAX_ENTRIES`, `MAX_DEPTH`, `TIMEOUT`).
7. **Zero Writes & Zero Content Reads:** Purely read-only and metadata-only.

---

## 4. Structure Data Contract

```ts
export type StructureEntryKind = 'FILE' | 'DIRECTORY' | 'SYMLINK';

export type StructureTruncationReason = 'MAX_ENTRIES' | 'MAX_DEPTH' | 'TIMEOUT';

export interface SourceStructureEntryDto {
  readonly relativePath: string;
  readonly name: string;
  readonly kind: StructureEntryKind;
  readonly depth: number;
}

export interface SourceStructureSummaryDto {
  readonly filesDiscovered: number;
  readonly directoriesDiscovered: number;
  readonly symlinksDiscovered: number;
  readonly totalEntries: number;
}

export interface SourceStructureDto {
  readonly sourceId: string;
  readonly rootName: string;
  readonly entries: readonly SourceStructureEntryDto[];
  readonly summary: SourceStructureSummaryDto;
  readonly truncated: boolean;
  readonly truncationReason: StructureTruncationReason | null;
  readonly scannedAt: string;
}
```

---

## 5. UI Integration

- **`RepositoryStructureCard`**: Displays summary counts (Files, Directories, Symlinks), truncation warning alert if applicable, timestamp, and a `[Refresh Structure]` action button.
- **`StructureTreeView`**: Expandable, accessible tree viewer presenting directories (expand/collapse), files, and symlinks with clean visual hierarchy.
