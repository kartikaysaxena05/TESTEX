# V8 Phase 120 — Git Repository Connection & Repository Import

## Overview

V8 Phase 120 implements the production-grade **Git Repository Connection & Repository Import** subsystem for the **AI-Driven Software Quality Engineering Platform**. It empowers authenticated users to connect remote Git repositories (starting with GitHub) to their V8 projects, authenticate securely via personal access tokens, inspect accessible repositories and branches, validate preflight accessibility, and physically import repository source trees to disk with comprehensive safety constraints.

Phase 120 integrates seamlessly into existing V2–V7 intelligence systems by adapting imported codebases directly into the existing `ProjectSource` and `ProjectGitMetadata` models. **Zero duplicate repository-analysis or AI test engines were created**, and strict architectural boundaries for Phase 121 (Local Folder Scanning) and Phase 122 (Browser Process Attachment) are maintained.

---

## 1. Architectural Flow & Integration

```
+----------------------------------------------------------------------------------------------------+
|                                    RENDERER UI LAYER (React 19)                                    |
| +------------------------------------------------------------------------------------------------+ |
| | ConnectRepositoryModal (Token auth, repo selection, branch picker, preflight check, import UI) | |
| | RepositoryConnectionCard (Status badge, branch/revision, last verified, switch active, delete)| |
| | EmptyProjectSourceSelection (Repository card active, Phase 121 & 122 boundary notices)         | |
| | EnvironmentOverview (Connected Git Repositories view + '+ Connect Repository' trigger)         | |
| | ProjectContext (repositoryConnections, activeRepositoryConnection, sourceState: REPOSITORY)    | |
| +--------------------------------------------------+---------------------------------------------+ |
+----------------------------------------------------|-----------------------------------------------+
                                                     | IPC Bridge (window.desktop.repositoryConnections)
+----------------------------------------------------v-----------------------------------------------+
|                                    PRELOAD & DESKTOP IPC LAYER                                     |
| +------------------------------------------------------------------------------------------------+ |
| | Preload API: repositoryConnections.*, gitProvider.*                                            | |
| | IPC Channels: DESKTOP_CHANNELS.REPOSITORY_CONNECTIONS_*, DESKTOP_CHANNELS.GIT_PROVIDER_*        | |
| | Security Handlers: assertAuthenticated(event), validateSender(event), envelope error mapping   | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Domain Calls (userId injected)
+----------------------------------------------------v-----------------------------------------------+
|                                       CORE DOMAIN LAYER                                            |
| +------------------------------------------------------------------------------------------------+ |
| | RepositoryConnectionService: Authorization orchestration, audit logging, atomic imports        | |
| | RepositoryConnectionRepository: Soft-delete filtered CRUD, atomic transaction-safe setActive   | |
| | GitCredentialVault: AES-256-GCM authenticated encryption bound to connectionId AAD             | |
| | GitProviderClient: GitHub API client with rate limits, token verification, and file download   | |
| | ImportSafetyValidator: Path traversal firewall, symlink escape blocker, size/count limits      | |
| | RepositoryImporter: Atomic staging directory promotion and cancellation rollback engine        | |
| +--------------------------------------------------+-----------------------------------------------+
                                                     | Downstream Sync / Physical Storage
+----------------------------------------------------v-----------------------------------------------+
|               DATABASE PERSISTENCE               |             HOST FILESYSTEM STORAGE             |
| +----------------------------------------------+ | +---------------------------------------------+ |
| | RepositoryConnection & ImportRecord (Prisma) | | | Safe Directory:                             | |
| | ProjectSource & ProjectGitMetadata (V2 Sync) | | |   <storagePath>/projects/<pId>/<connId>/    | |
| | AuthAuditEvent (12 dedicated Git actions)    | | | Atomic staging directory promotion         | |
| +----------------------------------------------+ | +---------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Core Subsystems

### 2.1 Git Provider Connection & GitHub API Integration
The [`GitProviderClient`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/git-repositories/git-provider-client.ts) handles communication with GitHub:
- **Authentication**: Validates personal access tokens against `https://api.github.com/user`.
- **Scope Extraction**: Inspects the `X-OAuth-Scopes` header to verify required scopes (`repo` or `public_repo`).
- **Rate Limit Handling**: Extracts `X-RateLimit-Remaining` and `X-RateLimit-Reset`, throwing `GitProviderRateLimitError` with retry timestamps when exhausted.
- **Repository Discovery**: Lists accessible repositories (`/user/repos?per_page=100&sort=updated`) with factual metadata (name, full name, owner, visibility, default branch, URL).
- **Branch Discovery**: Lists remote branches (`/repos/{owner}/{repo}/branches?per_page=100`) and commits for exact SHA resolution.
- **Tree & Blob Download**: Recursively traverses repository trees and streams source blobs with bounded chunking.

### 2.2 AES-256-GCM Credential Vault & Secret Redaction
The [`GitCredentialVault`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/git-repositories/git-credential-vault.ts) provides enterprise-grade token security:
- **Authenticated Encryption**: Uses AES-256-GCM with a 12-byte cryptographic IV and 16-byte authentication tag.
- **AAD Cryptographic Binding**: Binds encryption and decryption to `connectionId` via Additional Authenticated Data (AAD). Tampering with `connectionId` causes decryption failure.
- **Key Derivation**: Derives the 256-bit vault key via HKDF using `APP_SECRET` / `SESSION_SECRET` with salt `v8-git-credential-vault-salt`.
- **Zero Plaintext DB Storage**: The database only stores base64-encoded ciphertext with IV and auth tag in `encryptedAuthToken`.
- **Zero Plaintext Logs**: All tokens are automatically registered with `SecretRedactor`, replacing any token occurrences in logs, strings, or error messages with `'***'`.

### 2.3 Path Traversal Defense & Import Safety Bounds
The [`ImportSafetyValidator`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/git-repositories/import-safety-validator.ts) rigorously audits every imported entry:
- **Path Traversal Guard**: Rejects relative traversals (`..`, `../`), absolute paths (`/etc/passwd`, `C:\Windows`), null bytes (`\0`), and URL-encoded traversals (`%2e%2e%2f`).
- **Symlink Escape Defense**: Resolves symlink targets using `path.resolve` and verifies they remain strictly within the root import directory. External symlinks are rejected with `PathTraversalError`.
- **File Size Bounds**: Limits individual file size to **10MB** (`RepositoryFileTooLargeError`).
- **Repository Size Bounds**: Limits cumulative extracted repository size to **100MB** (`RepositorySizeExceededError`).
- **File Count Bounds**: Limits maximum total file count to **10,000 files** (`RepositoryFileCountExceededError`).
- **Timeout**: Enforces an explicit 30,000ms operation timeout with `AbortSignal` cancellation support.

### 2.4 Atomic Staging, Physical File Import & Rollback
The [`RepositoryImporter`](file:///Users/kartikaysaxena/Desktop/collage/packages/core/src/git-repositories/repository-importer.ts) executes atomic disk operations:
- **Staging Directory**: Extracts repository files into a temporary staging folder (`<targetPath>.staging-<timestamp>`).
- **Atomic Promotion**: Upon validating all safety invariants, performs an atomic filesystem rename (`fs.rename`) to the permanent target path (`<storagePath>/projects/<projectId>/<connectionId>`).
- **Cancellation & Rollback**: Listens to `AbortSignal`. If cancelled or if any validation fails, immediately purges the staging directory and reports `CANCELLED` or `FAILED` without leaving partial files on disk.

### 2.5 Downstream V2 Intelligence Synchronization
Rather than creating redundant repository analysis engines, Phase 120 automatically bridges imported Git repositories to existing platform infrastructure:
- When a repository is imported or set active, `RepositoryConnectionService` syncs the target directory to `ProjectSource` (`kind: 'LOCAL_DIRECTORY'`, `rootPath`).
- Updates `ProjectGitMetadata` (`isGitRepository: true`, `currentBranch`, `headCommit`).
- Enables existing V2 symbol parsers, V3 requirement extractors, V5 test compilers, V6 root cause analyzers, and V7 defect localizers to operate on the imported source tree out-of-the-box.

### 2.6 Multi-Repository Support & Atomic Active Switching
- A single project can connect multiple Git repositories (e.g., frontend repo and backend repo).
- Exactly one repository connection can be `isActive: true` at a time.
- `setActiveConnection` atomically clears `isActive` on all other connections and sets `isActive = true` on the designated connection within a single Prisma transaction.

### 2.7 Truthful ProjectSourceState Evolution
The project's source state reflects truthful operational readiness:
- `NOT_CONFIGURED`: Neither website targets nor repository connections exist.
- `WEBSITE_CONFIGURED`: At least one website target exists.
- `REPOSITORY_CONFIGURED`: At least one repository connection exists.
- `BOTH_CONFIGURED`: Both website targets and repository connections are configured.

### 2.8 Multi-User Tenant Isolation
All repository connection operations enforce multi-tenant isolation:
- Verifies `project.ownerId === userId` on every create, list, read, update, verify, import, or delete operation.
- Rejects cross-project access attempts (e.g., User A accessing Project B's repository) with `ProjectAccessDeniedError` or `RepositoryAccessDeniedError`.

### 2.9 Comprehensive Audit Trail
Every action records an immutable audit log entry in `AuthAuditEvent`:
- `REPOSITORY_CONNECTION_CREATED`
- `REPOSITORY_CONNECTION_UPDATED`
- `REPOSITORY_CONNECTION_DELETED`
- `REPOSITORY_CONNECTION_ACTIVATED`
- `REPOSITORY_CONNECTION_VERIFIED`
- `REPOSITORY_CONNECTION_VERIFICATION_FAILED`
- `REPOSITORY_IMPORT_STARTED`
- `REPOSITORY_IMPORT_COMPLETED`
- `REPOSITORY_IMPORT_FAILED`
- `REPOSITORY_IMPORT_CANCELLED`
- `REPOSITORY_TOKEN_ROTATED`
- `GIT_PROVIDER_AUTHORIZED`

---

## 3. Desktop Preload API & IPC Channels

### 3.1 Exposed Preload API (`window.desktop`)
```typescript
interface DesktopBridge {
  repositoryConnections: {
    list: (projectId: string) => Promise<RepositoryConnectionDto[]>;
    get: (projectId: string, connectionId: string) => Promise<RepositoryConnectionDto>;
    create: (input: CreateRepositoryConnectionInput) => Promise<RepositoryConnectionDto>;
    update: (input: UpdateRepositoryConnectionInput) => Promise<RepositoryConnectionDto>;
    delete: (projectId: string, connectionId: string) => Promise<boolean>;
    setActive: (projectId: string, connectionId: string) => Promise<RepositoryConnectionDto>;
    verifyAccess: (projectId: string, connectionId: string) => Promise<VerifyRepositoryAccessResult>;
    importRepository: (input: ImportRepositoryInput) => Promise<RepositoryImportRecordDto>;
    cancelImport: (projectId: string, importRecordId: string) => Promise<boolean>;
    resolveSnapshot: (projectId: string, connectionId?: string) => Promise<RepositoryConnectionSnapshot>;
  };
  gitProvider: {
    verifyAuth: (input: VerifyGitProviderAuthInput) => Promise<GitProviderAccountInfo>;
    listRepositories: (provider: GitProviderType, authToken: string) => Promise<GitProviderRepositoryInfo[]>;
    listBranches: (provider: GitProviderType, authToken: string, owner: string, repo: string) => Promise<GitProviderBranchInfo[]>;
  };
}
```

### 3.2 IPC Handlers & Security Guards
All IPC handlers in [`repository-connection-handlers.ts`](file:///Users/kartikaysaxena/Desktop/collage/apps/desktop/src/main/ipc/repository-connection-handlers.ts) enforce:
1. **Top-Level Frame Validation**: Rejects any IPC call originating from nested child frames or webviews (`Untrusted sender frame`).
2. **Session Authentication Assertion**: Requires an active authenticated session (`assertAuthenticated`).
3. **Zod Runtime Schema Validation**: Validates all incoming payloads against strict Zod schemas.
4. **Envelope Error Mapping**: Catches domain errors and serializes them safely into envelope error responses with codes and messages.

---

## 4. UI Layer Architecture

### 4.1 ConnectRepositoryModal
- Accessible via "+ Connect Repository" on the dashboard, environment overview, or empty project state.
- Step 1: Input Personal Access Token and authenticate provider. Displays authorized username and granted scopes.
- Step 2: Select repository from searchable dropdown, select branch, optionally specify commit SHA, and enter display name.
- Step 3: Run preflight accessibility check.
- Step 4: Physical source import with real-time progress indicator and cancellation button.

### 4.2 RepositoryConnectionCard
- Renders connection status badge (`CONFIGURED`, `CONNECTED`, `ACCESSIBLE`, `IMPORTING`, `IMPORTED`, `UNREACHABLE`, `UNAUTHORIZED`, `FAILED`).
- Displays active badge, branch name, commit revision, and last verified timestamp.
- Context menu / action buttons: "Set as Active", "Preflight Check", "Import / Sync", and "Disconnect".

---

## 5. Certification & Verification Results

### 5.1 Test Suites Execution
| Test Suite | Tests Run | Pass | Fail | Execution Time |
|---|---|---|---|---|
| `test:phase120` (Handler + Core Cert) | 39 | 39 | 0 | 746 ms |
| `test:v8-certification` (Phases 111–120) | 231 | 231 | 0 | 5,435 ms |
| `test:v7-certification` (Closed-Loop Freeze) | 17 | 17 | 0 | 2,158 ms |
| `test:auth` (Authentication Suite) | 119 | 119 | 0 | 4,594 ms |
| `test:renderer` (UI Design System & Pages) | 90 | 90 | 0 | 220 ms |
| `desktop:build` & `desktop:smoke` | Full Build | OK | 0 | Exit 0 |

### 5.2 Typecheck & Schema Integrity
- `npm run typecheck` (`tsc -b`): **0 errors across monorepo**.
- Prisma Schema: 78 migrations applied, **0 schema drift**.
