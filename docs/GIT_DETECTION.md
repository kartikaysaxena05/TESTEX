# Git Repository Detection & Validation

## 1. Overview

**V2 Phase 17: Git Repository Detection & Validation** introduces deterministic, local-only Git inspection for software directories attached to QA Projects.

This phase determines whether the attached source directory belongs to a Git working tree, resolves the canonical repository root, classifies the attachment relation (`ROOT` vs `NESTED`), and extracts verified branch and HEAD commit identities without performing network access, write operations, diffs, or recursive file analysis.

---

## 2. Core Architectural Principle

```text
PHASE 17 = GIT DETECTION + VALIDATION
NOT
PHASE 17 = FULL GIT INTELLIGENCE
```

Phase 17 answers:

- Is Git installed and available locally?
- Is the attached source directory inside a Git working tree?
- What is the top-level repository root?
- Is the attached source itself the repository root or nested within one?
- What is the current checked-out branch (or detached HEAD)?
- What is the current HEAD commit identifier?

Phase 17 **explicitly does NOT**:

- Perform network operations (`git fetch`, `git pull`, `git push`, `git clone`, `git ls-remote`)
- Request or handle remote credentials (tokens, SSH keys, passwords)
- Modify repository state (`git checkout`, `git commit`, `git reset`, `git stash`, `git clean`)
- Inspect file diffs or working tree changes (`git diff`, `git status`, `git log`)
- Recursively scan files or parse code/manifests

---

## 3. Process Execution & Security Boundaries

Git commands are executed in the privileged application core with strict isolation:

```
┌────────────────────────────────────────────────────────┐
│                   UNPRIVILEGED UI                      │
│             apps/desktop/src/renderer                  │
│       ├── SourceScreen                                 │
│       ├── useSelectedProjectGit Hook                   │
│       └── GitDetailsCard                               │
└──────────────────────────┬─────────────────────────────┘
                           │ window.desktop.sources.git.refresh(projectId)
                           ▼
┌────────────────────────────────────────────────────────┐
│                 SANDBOXED PRELOAD                      │
│             apps/desktop/dist/preload/index.cjs        │
│    └── Exposes only explicit, typed Git bridge methods │
└──────────────────────────┬─────────────────────────────┘
                           │ ipcRenderer.invoke(channel, projectId)
                           │ (desktop:sources:git:*)
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
│       ├── GitService (Business Logic)                  │
│       ├── GitCommandRunner (execFile, shell: false)    │
│       └── GitRepository (Prisma Persistence)           │
└──────────────────────────┬─────────────────────────────┘
                           │ child_process.execFile (shell: false)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   LOCAL GIT BINARY                     │
│                 (Allowlisted commands)                 │
└────────────────────────────────────────────────────────┘
```

### Security Invariants

1. **Zero Shell Strings (`shell: false`):** Process execution uses `execFile` with explicit argument arrays (e.g. `['git', '-C', dirPath, 'rev-parse', '--show-toplevel']`). Command strings are never passed through a shell (`sh`, `bash`, `cmd.exe`), completely preventing shell injection vulnerabilities.
2. **Bounded Execution:** Every Git command has a bounded 3000ms timeout and a 512KB maxBuffer limit.
3. **Restricted Command Allowlist:**
   - `git --version`
   - `git -C <path> rev-parse --is-inside-work-tree`
   - `git -C <path> rev-parse --show-toplevel`
   - `git -C <path> branch --show-current`
   - `git -C <path> symbolic-ref --short HEAD`
   - `git -C <path> rev-parse HEAD`
   - `git -C <path> symbolic-ref -q HEAD`
4. **Source Authority Boundary:** If an attached source is nested inside a larger repository (e.g. attached `~/repo/apps/web` inside `~/repo`), discovering the repository root does **NOT** expand the authorized source-reading boundary to the parent repository.

---

## 4. Database Schema

Git metadata is persisted in PostgreSQL in the `project_git_metadata` table:

```prisma
enum GitSourceRelation {
  ROOT
  NESTED
  UNKNOWN
}

model ProjectGitMetadata {
  id                         String             @id @default(uuid()) @db.Uuid
  sourceId                   String             @unique @map("source_id") @db.Uuid
  isGitRepository            Boolean            @map("is_git_repository")
  repositoryRoot             String?            @map("repository_root") @db.VarChar(4096)
  sourceRelationToRepository GitSourceRelation  @default(UNKNOWN) @map("source_relation_to_repository")
  currentBranch              String?            @map("current_branch") @db.VarChar(255)
  headCommit                 String?            @map("head_commit") @db.VarChar(64)
  isDetachedHead             Boolean            @default(false) @map("is_detached_head")
  lastCheckedAt              DateTime           @default(now()) @map("last_checked_at")
  createdAt                  DateTime           @default(now()) @map("created_at")
  updatedAt                  DateTime           @updatedAt @map("updated_at")

  source ProjectSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@map("project_git_metadata")
}
```

---

## 5. Edge Cases & Resilience

- **Missing Git Binary:** Returns `gitAvailable: false`. Does not crash or attempt auto-installation.
- **Non-Git Directory:** Returns `isGitRepository: false`, `sourceRelationToRepository: 'UNKNOWN'`. Treated as a valid local directory product state.
- **Empty / Unborn Repository (0 commits):** Returns `isGitRepository: true`, `currentBranch: 'main'`, `headCommit: null`. Handled gracefully without error.
- **Detached HEAD:** Returns `isGitRepository: true`, `isDetachedHead: true`, `currentBranch: null`, and the full commit SHA.
- **Git Worktrees:** Handled transparently because `git rev-parse --is-inside-work-tree` and `--show-toplevel` operate correctly regardless of whether `.git` is a directory or a worktree link file.
