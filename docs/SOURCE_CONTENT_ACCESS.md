# Secure Source Content Access Layer

## 1. Overview

**V2 Phase 23: Secure Source Content Access Layer** establishes the platform's strictly controlled, read-only gateway for reading source file contents.

Serving as the foundational security boundary for subsequent repository indexing (Phase 24) and architecture discovery (Phase 25), this layer guarantees that only authorized, non-sensitive, non-binary text files within the filtered repository boundary can be inspected.

---

## 2. Core Architectural Flow

```text
Renderer / Internal Service
            │
            ▼
    Request: { projectId, relativePath }
            │
            ▼
 1. Relative Path Syntax & Escape Check (No traversal, no drive letters, no NUL)
            │
 2. Project & Source Authorization Resolution
            │
 3. Source Root Containment Verification
            │
 4. Phase-19 Filtered Structure Membership Check
            │
 5. Sensitive File Deny Policy (.env, private keys, secrets)
            │
 6. Binary Extension Filter
            │
 7. Pre-Read File Stat (Regular file check, symlink rejection, 1 MB limit)
            │
 8. Initial Byte Sample Buffer Read (NUL character check)
            │
 9. Bounded UTF-8 Read (BOM stripping)
            │
            ▼
  SourceFileContentDto (Status, Category, Language, Size, Content)
```

---

## 3. Strict Security & Authorization Invariants

1. **No Generic Filesystem API:** No arbitrary path or unrestricted `fs.readFile` APIs are exposed to the renderer process.
2. **Relative-Path Only Public API:** The renderer submits only `{ projectId, relativePath }`. The backend resolves the path strictly under the canonical `ProjectSource.rootPath`.
3. **Strict Containment & Traversal Protection:** Relative paths with `../`, absolute POSIX paths (`/etc/passwd`), Windows drive letters (`C:\...`), UNC paths (`\\server\share`), URL-like paths (`file://...`), and NUL byte injections (`\0`) are strictly rejected with `NOT_AUTHORIZED`.
4. **Git Root Separation:** Discovered Git repository roots do not expand authority. Nested sources only have authority over their own canonical subdirectory.
5. **Filtered Structure Membership:** A file must belong to the Phase-19 filtered structure. Excluded files (`node_modules/`, `.git/`, ignored files) cannot be read (status: `FILTERED`).
6. **Symlink Security:** Symlinks are rejected and not followed to prevent external escape.
7. **Sensitive File Policy:** Files containing secrets (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`, `credentials*`, `secrets*`) return `SENSITIVE` with `content: null`.
8. **Binary File Rejection:** Media, fonts, compiled binaries, archives, and files with NUL bytes return `BINARY` with `content: null`.
9. **Strict Size Limits:** Text files larger than 1 MB (1,048,576 bytes) return `TOO_LARGE` without reading the full file.
10. **Zero Source Content Logging:** Source file contents, snippets, and sensitive tokens are never written to logs or diagnostic error envelopes.
11. **Zero Source Modification:** The filesystem is strictly read-only.
12. **No Premature Content Persistence:** Full source files are not stored in PostgreSQL.

---

## 4. Source Content Status Codes

| Status                 | Description                                                                |
| :--------------------- | :------------------------------------------------------------------------- |
| `AVAILABLE`            | File successfully validated and UTF-8 text content returned.               |
| `NOT_FOUND`            | File was deleted or moved from disk after repository scan.                 |
| `NOT_AUTHORIZED`       | Path traversal, symlink escape, or unauthorized access attempt.            |
| `FILTERED`             | File is excluded by repository ignore rules or safety exclusions.          |
| `SENSITIVE`            | Content access denied by sensitive secret-bearing file policy.             |
| `BINARY`               | File is a binary format (media, compiled artifact, or contains NUL bytes). |
| `TOO_LARGE`            | File size exceeds the 1 MB limit.                                          |
| `UNSUPPORTED_ENCODING` | File contains malformed text encoding.                                     |
| `UNAVAILABLE_SOURCE`   | Attached source root directory is missing or unmounted.                    |

---

## 5. Public Bridge & Internal Service API

### Renderer IPC Bridge (`window.desktop.sources.content`)

```ts
const result = await window.desktop.sources.content.get({
  projectId: '...',
  relativePath: 'src/services/user.service.ts',
});
```

### Privileged Core Service (`SourceContentService`)

```ts
// Single file read
const fileDto = await sourceContentService.readSourceFile(projectId, relativePath);

// Bounded batch read for repository indexer (Max 50 files, 5 MB total)
const batchDtos = await sourceContentService.readTextFiles(projectId, relativePaths);
```
