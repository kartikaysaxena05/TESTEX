# V8 Phase 121 — Local Project Folder Connection & Secure File Access

## Overview

V8 Phase 121 implements the production-grade **Local Project Folder Connection & Secure File Access** subsystem for the **AI-Driven Software Quality Engineering Platform**. It empowers the Electron desktop application to connect a **real local project directory on the user's host filesystem** and securely expose its directory structure and file contents to existing platform services and AI reasoning pipelines without permitting filesystem access outside the selected project root.

Phase 121 strictly adheres to enterprise security standards:
- **Zero Mock Folders / Zero Fake Files**: Operates directly on genuine local filesystem hierarchies.
- **Strict Project Root Confinement**: Canonicalizes paths and prevents all directory traversal vectors (`../`, absolute paths, percent-encoded traversal, Windows drive/UNC/alternate data stream prefixes, and symlink escapes).
- **Least-Privilege IPC Bridge**: Context isolation and sandboxed preload expose only safe, parameter-validated, read-only file access routines to the renderer.
- **Tenant & Cross-Project Isolation**: Prevents User A from inspecting User B's connected roots and forbids cross-project path substitutions.
- **Downstream Intelligence Synergy**: Integrates cleanly into `ProjectSource` and `ProjectGitMetadata`, instantly enabling V2 Repository Intelligence, V3 Requirement Extraction, V5 Test Compilation, V6 Root Cause Analysis, and V7 Defect Localization.
- **Strict Phase Freeze**: Contains zero Phase 122 (Browser running app process attachment) and zero V9 (Ollama / local model runtime) functionality.

---

## 1. Architectural Flow & Defense-in-Depth Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    RENDERER UI LAYER (React 19)                                    |
| +------------------------------------------------------------------------------------------------+ |
| | ConnectLocalFolderModal (Native folder picker trigger, manual path input, security notice)     | |
| | LocalFolderCard (Status badge, Git details, path display, validate & disconnect actions)        | |
| | EmptyProjectSourceSelection (Local Folder card active with Phase 121 badge)                    | |
| | EnvironmentOverview (Connected Local Folder view + '+ Connect Local Folder' trigger)           | |
| | ProjectContext (localFolder state, connectLocalFolder, disconnectLocalFolder, validateLocalFolder)|
| +--------------------------------------------------+---------------------------------------------+ |
+----------------------------------------------------|-----------------------------------------------+
                                                     | IPC Bridge (window.desktop.localFolder)
+----------------------------------------------------v-----------------------------------------------+
|                                    PRELOAD & DESKTOP IPC LAYER                                     |
| +------------------------------------------------------------------------------------------------+ |
| | Preload API: localFolder.connect, disconnect, validate, get, listDirectory, readFile, search, etc|
| | IPC Channels: DESKTOP_CHANNELS.LOCAL_FOLDER_* (10 channels)                                     | |
| | Security Handlers: isTrustedIpcSender(event), assertAuthenticated(event), Zod schema validation  | |
| | Error Mapping: Domain exceptions -> DesktopResult with canonical DesktopErrorCode               | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Validated Domain Calls (userId injected)
+----------------------------------------------------v-----------------------------------------------+
|                                       CORE DOMAIN LAYER                                            |
| +------------------------------------------------------------------------------------------------+ |
| | LocalFolderService: Project ownership check, canonical path resolution, Git detection,          | |
| |                     transactional ProjectSource & ProjectGitMetadata upsert, audit logging       | |
| | SecureFileAccessService: Bounded directory listing, 10MB file reads (UTF-8/Base64), safe search | |
| | SecureProjectRootGuard: Realpath canonicalization, path traversal firewall, symlink containment | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Real Host Filesystem / DB Persistence
+----------------------------------------------------v-----------------------------------------------+
|               DATABASE PERSISTENCE               |             HOST FILESYSTEM ACCESS              |
| +----------------------------------------------+ | +---------------------------------------------+ |
| | ProjectSource (kind: 'LOCAL_DIRECTORY')      | | | Canonical Host Project Directory            | |
| | ProjectGitMetadata (branch, commit, status)  | | | Bounded directory walk (ignore node_modules)| |
| | AuthAuditEvent (5 dedicated audit actions)   | | | Read-only file inspection (10MB bound)      | |
| +----------------------------------------------+ | +---------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Core Subsystems & Components

### 2.1 Native Folder Selection Flow
The Electron main process exposes native folder selection via [`folder-picker.ts`](file:///Users/kartikaysaxena/Desktop/collage/apps/desktop/src/main/dialogs/folder-picker.ts):
- Utilizes `dialog.showOpenDialog` configured with `properties: ['openDirectory', 'createDirectory']`.
- Validates the resulting path on the host filesystem immediately:
  - Verifies existence and confirms the target is a directory.
  - Checks read permissions via `fs.accessSync(selectedPath, fs.constants.R_OK)`.
  - Canonicalizes symlinks to their underlying physical directory via `fs.realpathSync`.
- Returns `{ success: true, folderPath }` or canonical error codes on user cancellation or permission failure.

### 2.2 Strict Project Root Security Guard
The [`SecureProjectRootGuard`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/local-folders/secure-project-root-guard.ts) enforces strict boundary isolation before any file or directory operation:
1. **Canonical Root Resolution**: The project root is canonicalized at configuration time via `fs.realpathSync`.
2. **Null-Byte Injection Defense**: Rejects inputs containing `\0` or `%00`.
3. **Decoded Traversal Rejection**: Rejects percent-encoded traversals (`%2e%2e`, `%2f`, `%5c`).
4. **Windows Path Escape Defense**: Blocks Windows drive letters (`C:`, `D:`), UNC paths (`\\server\share`, `//server/share`), and NTFS alternate data streams (`file:stream`).
5. **Absolute Path Containment**: Resolves candidate relative paths against the canonical root and asserts that `path.resolve` does not escape `canonicalRoot`.
6. **Path Traversal Rejection**: Checks that the relative path does not begin with `..` or `/`.
7. **Symlink Escape Defense**: Uses `fs.realpathSync` on the target path and verifies that its physical target directory remains strictly inside `canonicalRoot`. Internal symlinks within the project root are permitted, while external symlinks are deterministically rejected with `LocalFolderSymlinkEscapeError`.

### 2.3 Privileged Local Folder & File Services
- **[`LocalFolderService`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/local-folders/local-folder-service.ts)**:
  - Authorizes project ownership by checking `project.userId === userId`.
  - Canonicalizes the selected path and verifies host read accessibility.
  - Probes for Git repository metadata (`.git/HEAD`, current branch, head commit SHA).
  - Transactionally creates or updates `ProjectSource` (`kind: 'LOCAL_DIRECTORY'`, `rootPath`) and `ProjectGitMetadata`.
  - Records authoritative audit events for connection, reconnection, and validation.
- **[`SecureFileAccessService`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/local-folders/secure-file-access-service.ts)**:
  - **`listDirectory`**: Returns directory entries with metadata (type, size, permissions, modified timestamp). Supports recursive exploration with a maximum depth limit (default 10) and automatically ignores standard noise directories (`node_modules`, `.git`, `dist`, `.next`, etc.).
  - **`readFile`**: Bounded file reader enforcing a strict **10MB** maximum file size (`LocalFolderFileTooLargeError`). Safely detects binary files by scanning for null bytes in the initial 8KB chunk; returns text as `utf-8` and binary files as `base64`.
  - **`search`**: Fast regex and substring file/content search bounded by `maxResults` (default 50) and `maxFilesScanned` (default 500) to prevent denial-of-service on large trees.
  - **`checkExists`** and **`getMetadata`**: Safe existence checking and POSIX metadata inspection.
  - **`detectGit`**: Inspects Git repository state without invoking shell commands.

### 2.4 Desktop IPC Handlers & Preload Bridge
The main-process IPC router [`local-folder-handlers.ts`](file:///Users/kartikaysaxena/Desktop/collage/apps/desktop/src/main/ipc/local-folder-handlers.ts) provides defense-in-depth:
- **Untrusted Frame Rejection**: Rejects requests from non-top-level or external origin frames via `isTrustedIpcSender(event.senderFrame)`.
- **Authentication Guard**: Verifies active session presence via `assertAuthenticated()`.
- **Zod Runtime Validation**: Validates all input payloads before delegating to domain services.
- **DesktopResult Envelope**: Standardizes responses into `{ success: true, data }` or `{ success: false, error: { code, message } }`.
- **Preload API**: Safely exposed via `window.desktop.localFolder` under `contextBridge.exposeInMainWorld()`.

---

## 3. Security Protections & Defenses Implemented

| Security Threat | Attack Vector | Phase 121 Defense |
|---|---|---|
| **Relative Path Traversal** | `../../etc/passwd`, `../secrets.env` | Checked via normalized path analysis and `path.relative` prefix verification (`LocalFolderPathTraversalError`). |
| **Encoded Traversal** | `%2e%2e%2f`, `%252e%252e` | URL-decoding pass detects encoded `..` and `/` characters before path evaluation. |
| **Absolute Path Escapes** | `/etc/shadow`, `/var/run/secrets` | Stripped and validated strictly against the project root boundary. |
| **Windows Traversal Escapes** | `C:\Windows\System32`, `\\host\share` | Rejection of drive prefixes (`/^[a-zA-Z]:/`), UNC paths (`/^[\/\\]{2}/`), and alternate data streams (`/:\$/`). |
| **Symlink Escapes** | Project symlink pointing to `/root` | `fs.realpathSync` physical canonicalization check; non-contained symlinks rejected with `LocalFolderSymlinkEscapeError`. |
| **Cross-Tenant Project Access** | User A requesting Project B's folder | Strict project ownership verification (`project.userId === authenticatedUserId`). |
| **Cross-Project Path Substitution** | Re-pointing Project A to Project B's root | Canonical root is strictly queried from database-backed `ProjectSource` belonging to the verified project. |
| **Memory Exhaustion (DoS)** | Reading multi-gigabyte dump files | Hard limit of 10MB per file with immediate file-size stat check before buffer allocation. |
| **Renderer Code Injection** | Compromised renderer running raw Node `fs` | No `fs` access in renderer; sandboxed preload exposes strictly validated IPC invocations. |
| **Audit Evasion** | Security violation attempts unnoticed | All traversal and symlink escapes immediately generate `LOCAL_FOLDER_SECURITY_VIOLATION` audit entries. |

---

## 4. Authoritative Audit Trail

Phase 121 introduces 5 dedicated audit action types in `AuthAuditAction`:
1. `LOCAL_FOLDER_CONNECTED`: Emitted upon successfully associating a local directory with a project.
2. `LOCAL_FOLDER_DISCONNECTED`: Emitted upon removing a connected folder association.
3. `LOCAL_FOLDER_RECONNECTED`: Emitted upon updating a project's folder to a new path.
4. `LOCAL_FOLDER_VALIDATED`: Emitted upon manual or automated accessibility verification.
5. `LOCAL_FOLDER_SECURITY_VIOLATION`: Emitted whenever a path traversal or symlink escape attempt is intercepted.

---

## 5. Automated Test Coverage & Certification

### 5.1 Main Process IPC Unit Tests
File: [`apps/desktop/src/main/ipc/local-folder-handlers.test.ts`](file:///Users/kartikaysaxena/Desktop/collage/apps/desktop/src/main/ipc/local-folder-handlers.test.ts)
- **24/24 passing unit tests**:
  - Untrusted frame sender rejection.
  - Missing authentication session handling (`LOCAL_FOLDER_ACCESS_DENIED`).
  - Zod validation for UUIDs, empty search terms, and invalid path inputs.
  - Domain error mapping to canonical `DesktopErrorCode` enum values.
  - Successful delegation of all 10 IPC operations.

### 5.2 Core Domain Integration & Certification Suite
File: [`packages/core/src/local-folders/certification/v8-phase121-certification.test.ts`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/local-folders/certification/v8-phase121-certification.test.ts)
- **29/29 passing integration tests**:
  - Real local folder connection and database persistence in `ProjectSource`.
  - Directory listing with recursive traversal and noise directory filtering.
  - Safe text reading with UTF-8 encoding and accurate line count calculation.
  - Automatic binary detection and base64 payload encoding.
  - 10MB file size limit enforcement.
  - Search engine filtering by name and content.
  - Defenses against relative `../`, absolute escapes, percent-encoded traversal, Windows drives, UNC paths, and alternate data streams.
  - Host symlink containment verification and external symlink escape rejection.
  - Multi-user tenant isolation (User A vs. User B, Project A vs. Project B).
  - Missing and deleted directory detection (`MISSING` status).
  - Audit trail logging across all lifecycle actions and security violations.

### 5.3 Combined Test Execution
```bash
npm run test:phase121
# Output:
# ▶ Phase 121 Local Folder IPC Handlers & Security Tests (24/24 passed)
# ▶ V8 Phase 121 — Local Project Folder Connection & Secure File Access Certification Suite (29/29 passed)
# ℹ tests 53
# ℹ pass 53
# ℹ fail 0
```

---

## 6. Verification & Certification Status

- **Monorepo Build**: `npm run typecheck` (`tsc -b`) exits 0 with zero errors.
- **Desktop Bundling**: `npm run desktop:build` completes successfully (sandboxed preload bundled via esbuild, Vite production build successful).
- **Linter Check**: `npx eslint` passes with 0 errors and 0 warnings on all Phase 121 source files.
- **V8 Regression Suite**: `npm run test:v8-certification` executes 284 tests across all V8 phases (Phases 111 through 121) with 284 passes and 0 failures.
- **Certification Outcome**: **V8 Phase 121 Certified and Frozen**.
