# V7 Phase 102 — Secure Patch Sandbox & Change Isolation

## 1. Overview and Architecture

Phase 102 introduces the **Secure Patch Sandbox & Change Isolation** subsystem for the AI-Driven Software Quality Engineering Platform. It operates downstream of **Phase 101 (Limited AI Patch Generation)**.

When a candidate patch proposal is synthesized and inspected in Phase 101, it must NEVER be directly applied to the developer's working tree or authoritative repository. Phase 102 guarantees that candidate patches are materialized, applied, and inspected **strictly inside an isolated filesystem sandbox**, completely segregated from the authoritative repository.

```
+---------------------------------------------------------------------------------------------------+
|                     V7 Phase 102 Secure Patch Sandbox & Change Isolation Architecture             |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Phase 101: DefectPatchProposal] ---> [PatchSandboxService]                                      |
|                                                |                                                  |
|           +------------------------------------+------------------------------------+              |
|           |                                                                         |              |
|           v                                                                         v              |
|   [Authoritative Repository Protection]                             [Isolated Sandbox Directory]   |
|   - Zero Authoritative Mutations (0 writes)                         - Snapshot Copy Isolation      |
|   - Preserves User Uncommitted Work                                 - Pinned Revision Matching     |
|   - Rejects Diverged HEAD Revisions                                 - Unique Sandbox Root Path     |
|   - Authoritative Baseline Verification                             - Ephemeral Storage            |
|           |                                                                         |              |
|           |                                                                         v              |
|           |                                                         [SandboxContainmentValidator]  |
|           |                                                         - Canonical Path Containment   |
|           |                                                         - Symlink Escape Traps         |
|           |                                                         - .git Metadata Guard          |
|           |                                                         - Sensitive File Shield        |
|           |                                                         - Localization Allowlist       |
|           |                                                         - Binary File Prevention       |
|           |                                                                         |              |
|           |                                                                         v              |
|           |                                                         [SandboxPatchApplicator]       |
|           |                                                         - Structured Edit Application  |
|           |                                                         - Before/After SHA-256 Capture |
|           |                                                         - Conflict / Collision Detect  |
|           |                                                         - Actual Change-Set Metrics    |
|           |                                                                         |              |
|           v                                                                         v              |
|   [Authoritative Repo: 0 Changes]                                   [DefectPatchSandbox (DB)]      |
|   - Working tree unchanged                                          - Status: PATCH_APPLIED        |
|   - Dirty files untouched                                           - Actual vs Claimed Match      |
|   - Commit log identical                                            - Security Checks Audit Log    |
|   - No branches / stashes created                                   - Change-Set Hash Recorded     |
|                                                                                     |              |
|                                                                                     v              |
|                                                                     [Desktop UI: PatchSandboxCard] |
|                                                                     - Immutability Shield Banner   |
|                                                                     - Provision / Apply / Destroy  |
|                                                                     - Real-Time Security Badges    |
|                                                                     - Actual Diff & Metrics View   |
|                                                                     - Handoff Ready for Phase 103  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Strict Authoritative Repository Immutability**:
   Executing sandbox operations (creation, patch application, inspection, destruction) results in strictly **0 mutations** to the authoritative repository:
   - Zero files created, modified, or deleted in the target repository.
   - Zero Git commits created.
   - Zero Git branches created.
   - Zero Git pull requests or tags created.
   - Zero Git pushes or remote synchronization operations.
   - Zero Git resets, stashes, or cleans.
2. **Preservation of User Dirty Working Tree**:
   If the developer has uncommitted changes, modified files, or untracked scratch files in their authoritative working tree, those files remain 100% untouched and preserved.
3. **Revision Drift Defense**:
   Before a sandbox is provisioned or modified, the authoritative repository's `HEAD` commit is verified against the patch proposal's pinned `sourceRevision`. If the authoritative repository has diverged, the operation is blocked with `PatchSandboxRevisionMismatchError`.
4. **Physical Filesystem Containment**:
   All operations are strictly confined within the designated sandbox root directory. Any attempt to traverse out via `../`, leading slashes, null bytes, URL encoding, or drive letters is blocked with `PatchSandboxPathTraversalError`.
5. **Symlink Escape Defense**:
   Symlinks pointing outside the canonical sandbox root are resolved using `fs.realpathSync` and blocked with `PatchSandboxSymlinkEscapeError`.
6. **Git Metadata Protection**:
   Any patch hunk or file edit targeting `.git` directories, hooks, configuration, or index is strictly blocked with `PatchSandboxGitMetadataViolationError`.
7. **Sensitive File Blocking**:
   Targeting environment variables (`.env*`), SSH keys, TLS certificates, credentials, or secrets is strictly blocked with `PatchSandboxSensitiveFileBlockedError`.
8. **Defect Localization Allowlist Constraint**:
   Targeted files must reside strictly within the candidate files authorized by Phase 100 defect localization. Attempting to modify arbitrary files outside this scope triggers `PatchSandboxUnauthorizedFileError`.
9. **Binary File Protection**:
   Patches targeting binary files or containing null bytes are blocked with `PatchSandboxBinaryFileBlockedError`.
10. **Strict Phase 103 Boundary**:
    Executing test suites inside the sandbox for pass/fail regression analysis belongs strictly to **Phase 103 (Sandboxed Patch Reverification & Regression Testing)** and is **NOT** executed in Phase 102.

---

## 3. Database Schema & State Machine

### Prisma Model (`DefectPatchSandbox`)

```prisma
enum PatchSandboxStatus {
  CREATING
  READY
  PATCH_APPLYING
  PATCH_APPLIED
  PATCH_REJECTED
  FAILED
  DESTROYING
  DESTROYED
  EXPIRED
}

model DefectPatchSandbox {
  id                            String              @id @default(uuid())
  projectId                     String
  failureCaseId                 String
  repositoryId                  String
  patchProposalId               String
  sandboxStatus                 PatchSandboxStatus  @default(CREATING)
  sourceRevision                String
  sandboxRevision               String
  sanitizedSandboxLocation      String
  isolationStrategy             String              @default("SNAPSHOT_COPY_ISOLATION")
  isolationVersion              Int                 @default(1)
  originalRepoHeadCommit        String
  originalRepoClean             Boolean             @default(true)
  originalRepoIntegrityVerified Boolean             @default(true)
  originalRepoModifiedCount     Int                 @default(0)
  appliedPatchProposalVersion   Int
  patchApplied                  Boolean             @default(false)
  patchAppliedAt                DateTime?
  claimedFilesCount             Int                 @default(0)
  claimedLinesAdded             Int                 @default(0)
  claimedLinesRemoved           Int                 @default(0)
  actualFilesModified           String[]            @default([])
  actualFilesCreated            String[]            @default([])
  actualFilesDeleted            String[]            @default([])
  actualFilesRenamed            String[]            @default([])
  actualLinesAdded              Int                 @default(0)
  actualLinesRemoved            Int                 @default(0)
  actualTotalChangedLines       Int                 @default(0)
  actualUnifiedDiff             String?             @db.Text
  changeSetHash                 String?
  claimedVsActualDiffMatch      Boolean             @default(false)
  securityChecks                Json
  errorMessage                  String?
  destroyedAt                   DateTime?
  destroyedBy                   String?
  createdAt                     DateTime            @default(now())
  updatedAt                     DateTime            @updatedAt

  project                       Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  repository                    ProjectSource       @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  failureCase                   FailureCase         @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  patchProposal                 DefectPatchProposal @relation(fields: [patchProposalId], references: [id], onDelete: Cascade)

  @@index([projectId, failureCaseId])
  @@index([patchProposalId])
}
```

### Lifecycle State Machine

```
   [CREATING]
       │
       ▼
    [READY] ──────────┐ (Conflict / Security Error)
       │              ▼
       ▼       [PATCH_REJECTED]
[PATCH_APPLYING]
       │
       ▼
[PATCH_APPLIED] ─────┐
       │              │
       ▼              ▼
  [DESTROYING]   [EXPIRED]
       │
       ▼
  [DESTROYED]
```

---

## 4. Security & Containment Validator

The `SandboxContainmentValidator` class enforces multi-layered defenses prior to any filesystem operation:

1. **Path Normalization**: Strips leading `./`, collapses redundant slashes (`//`), rejects empty or whitespace strings.
2. **Traversal Neutralization**: Detects and rejects `..`, `%2e%2e`, `\`, drive letters, and null byte injections.
3. **Absolute & UNC Path Block**: Confirms the path is purely relative and cannot break out of root.
4. **Symlink Escape Detection**: Verifies that resolving symlinks via `fs.realpathSync` resolves to a path prefixed by the canonical sandbox directory.
5. **Dot-Git Protection**: Blocks any path equal to or starting with `.git/`, `.git\`, `.gitmodules`, or `.gitattributes`.
6. **Sensitive File Blocklist**: Blocks `.env*`, `*secret*`, `*credential*`, `*token*`, `*.pem`, `*.key`, `id_rsa*`.
7. **Scope Containment**: Cross-references every modified path against Phase 100's authorized defect localization allowlist.
8. **Binary Content Check**: Verifies patch hunks contain valid UTF-8 text and no binary null bytes.

---

## 5. Pure Deterministic Patch Applicator

The `SandboxPatchApplicator` performs structured edits inside the sandbox root:

- Validates file existence and reads canonical content.
- Records pre-patch file SHA-256 hash.
- Applies line replacements sequentially, verifying that original lines match disk content exactly.
- Detects line drift and hunk mismatch, aborting on conflict with `PatchSandboxConflictError`.
- Writes back modified content and records post-patch file SHA-256 hash.
- Generates canonical unified diff of actual changes applied on disk.
- Computes cryptographic `changeSetHash` covering all affected files and diffs.
- Verifies claimed lines added/removed match actual lines added/removed.

---

## 6. Desktop Integration & UI

### IPC Channel Registry

| Channel ID              | Protocol Name                     | Direction        | Payload Schema                   | Response DTO                       |
| ----------------------- | --------------------------------- | ---------------- | -------------------------------- | ---------------------------------- |
| `PATCH_SANDBOX_CREATE`  | `desktop:patch-sandboxes:create`  | Renderer -> Main | `createPatchSandboxInputSchema`  | `DefectPatchSandboxDto`            |
| `PATCH_SANDBOX_APPLY`   | `desktop:patch-sandboxes:apply`   | Renderer -> Main | `applyPatchToSandboxInputSchema` | `DefectPatchSandboxDto`            |
| `PATCH_SANDBOX_GET`     | `desktop:patch-sandboxes:get`     | Renderer -> Main | `getPatchSandboxInputSchema`     | `DefectPatchSandboxDto \| null`    |
| `PATCH_SANDBOX_LIST`    | `desktop:patch-sandboxes:list`    | Renderer -> Main | `listPatchSandboxesInputSchema`  | `readonly DefectPatchSandboxDto[]` |
| `PATCH_SANDBOX_DESTROY` | `desktop:patch-sandboxes:destroy` | Renderer -> Main | `destroyPatchSandboxInputSchema` | `DefectPatchSandboxDto`            |

### Desktop UI (`PatchSandboxCard`)

Located at `apps/desktop/src/renderer/features/failures/PatchSandboxCard.tsx`, this component renders:

- **Authoritative Immutability Shield**: Explicit guarantee banner displaying `0 Authoritative Mutations` and `Original Working Tree Preserved`.
- **Sandbox Status Badge**: Dynamic badge reflecting lifecycle status (`READY`, `PATCH_APPLIED`, `PATCH_REJECTED`, `DESTROYED`).
- **Security Check Grid**: Pass/fail badges for containment, symlink escape, `.git` metadata, sensitive file blocking, and scope allowlist.
- **Action Controls**:
  - `Provision Isolated Sandbox`: Creates ephemeral sandbox copy at pinned revision.
  - `Apply Candidate Patch`: Executes atomic patch application with conflict detection.
  - `Tear Down Sandbox`: Cleans up isolated filesystem sandbox and marks status as `DESTROYED`.
- **Actual Diff Viewer**: Code block showing the exact unified diff generated inside the sandbox and change set metrics.

---

## 7. Verification & Adversarial Certification

The Phase 102 test suite validates 46 automated tests across 7 comprehensive test suites:

1. `sandbox-containment-validator.test.ts`: 8 test suites validating path normalization, traversal defense, symlink escapes, `.git` blocking, sensitive file guards, and binary prevention.
2. `sandbox-patch-applicator.test.ts`: 3 tests validating clean atomic edits, SHA-256 hash verification, conflict detection, and non-existent file handling.
3. `patch-sandbox-contract.test.ts`: 7 tests validating Zod schemas, DTO structures, input validation, and IPC channels.
4. `patch-sandbox-service.test.ts`: 5 tests validating complete sandbox provisioning, revision pinning, patch application, and repository immutability.
5. `patch-sandbox-adversarial.test.ts`: 5 comprehensive attack scenarios:
   - Authoritative repository immutability with dirty working tree preservation.
   - Revision drift defense against diverged authoritative `HEAD`.
   - Path traversal attack blocked.
   - Sensitive file target attack blocked.
   - Unauthorized file scope attack blocked.
6. `patch-sandbox-handlers.test.ts`: 4 tests validating IPC sender origin verification, input schema validation, service delegation, and domain error sanitization.
7. `patch-sandbox-ui.test.tsx`: 2 tests validating UI card rendering, immutability banner, and card embedding.

All 46 tests pass with 0 failures, verified alongside the platform's broader regression suites.
