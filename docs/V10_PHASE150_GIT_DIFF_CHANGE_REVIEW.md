# V10 — Phase 150: Git Diff & Change Review

## 1. Executive Summary

Phase 150 introduces a secure, deterministic **Git Change-Review Layer** for the autonomous testing platform. This capability equips Codex-style agents to inspect, summarize, validate, and present repository modifications before changes are approved or applied.

The subsystem enforces strict multi-tenant boundaries (`userId → projectId → taskId`), worktree isolation, automated secret redaction, dangerous infrastructure file warnings, and an unbreakable human decision gate that explicitly blocks autonomous agents from self-approving their own changes.

---

## 2. Core Architecture

```
Agent Thread Task (V10 Phase 142)
               │
               ▼
   GitChangeReviewService (Core Domain)
   ├── Multi-tenant containment verification
   ├── Path canonicalization & worktree sandboxing
   ├── GitCommandRunner (read-only plumbing execution)
   │     ├── git status --porcelain=v1 -uall
   │     ├── git diff [--cached] [--numstat]
   │     └── git diff <base>..<target>
   ├── GitChangeAnalyzer
   │     ├── Automated secret redaction ([REDACTED_SECRET])
   │     ├── Dangerous CI / Dockerfile / Script detection
   │     └── Dependency / Test / Generated file categorization
   └── Prisma ORM (AgentGitChangeReview)
               │
               ▼
   Desktop IPC & Secure Bridge (apps/desktop)
   ├── Frame origin validation & session token authentication
   ├── 6 Typed Zod channels
   └── Preload desktop.gitReview API
               │
               ▼
   GitChangeReviewPanel (Renderer React Component)
   ├── Unified diff with syntax coloring (+ green, - red, @@ cyan)
   ├── Changed files explorer with additions/deletions breakdown
   ├── Secret warning banners & dangerous file indicators
   ├── Review status tracking (PENDING, REVIEWED, APPROVED, REJECTED, APPLIED)
   └── Human Approve / Reject review gate
```

---

## 3. Database Schema

Model added to `prisma/schema.prisma` and applied via migration `20261006040000_v10_phase150_git_diff_change_review`:

```prisma
enum ChangeReviewStatus {
  PENDING
  REVIEWED
  APPROVED
  REJECTED
  APPLIED
}

model AgentGitChangeReview {
  id              String             @id @default(uuid())
  projectId       String
  taskId          String
  commitBaseRef   String?
  status          ChangeReviewStatus @default(PENDING)
  changedFiles    String[]
  additions       Int                @default(0)
  deletions       Int                @default(0)
  diffContent     String             @db.Text
  diffRef         String?
  reviewedBy      String?
  reviewedAt      DateTime?
  decisionComment String?            @db.Text
  analysis        Json
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  project Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task    AgentThreadTask @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([projectId, status])
  @@index([taskId])
}
```

---

## 4. Key Security Invariants

1. **No Arbitrary Shell Execution**: Commands are strictly dispatched using `execFile` with argument arrays; `shell: false` is permanently enforced.
2. **Worktree Isolation & Path Traversal Prevention**: Every target directory and path is verified with `realpath` against the canonical Git worktree top-level. Encoded traversals (`%2e%2e`), null bytes (`\0`), and absolute paths escaping the worktree are rejected with `GitReviewOutsideWorktreeError` or `GitReviewPathTraversalError`.
3. **Automated Secret Redaction**: Private keys, AWS keys, GitHub tokens, Slack tokens, Bearer tokens, and generic passwords found in unified diffs are automatically scrubbed and replaced with `[REDACTED_SECRET]`.
4. **Autonomous Self-Approval Prevention**: Agents (`agent_*`, `ai_*`, or non-human actors) are explicitly forbidden from transitioning reviews to `APPROVED`. Human intervention is strictly required.
5. **Double Decision & Race Condition Protection**: Concurrent review approvals are guarded with per-review execution locks (`activeDecisions`), and reviews in terminal states (`APPROVED`, `REJECTED`, `APPLIED`) reject further state changes.

---

## 5. Desktop IPC Channels

| IPC Channel | Direction | Input Schema | Return Type | Description |
|---|---|---|---|---|
| `GIT_DIFF_GET_STATUS` | Invoke | `{ projectId: string }` | `GitWorkingStatusDto` | Inspects working directory porcelain status |
| `GIT_DIFF_GET` | Invoke | `{ projectId: string, staged?: boolean, ... }` | `GitDiffResultDto` | Unified diff with secret redactions and numstats |
| `GIT_CHANGE_REVIEW_CREATE` | Invoke | `{ projectId: string, taskId: string, ... }` | `AgentGitChangeReviewDto` | Persists a new change review in `PENDING` state |
| `GIT_CHANGE_REVIEW_GET` | Invoke | `{ projectId: string, reviewId: string }` | `AgentGitChangeReviewDto \| null` | Fetches change review with full analysis metadata |
| `GIT_CHANGE_REVIEW_APPROVE` | Invoke | `{ projectId: string, reviewId: string, reviewedBy?: string, ... }` | `AgentGitChangeReviewDto` | Human gate approval |
| `GIT_CHANGE_REVIEW_REJECT` | Invoke | `{ projectId: string, reviewId: string, reviewedBy?: string, reason: string }` | `AgentGitChangeReviewDto` | Rejects change review with reason |

---

## 6. Verification and Test Results

All 4 V10 certification test suites pass cleanly with **58 tests passing across 4 suites**:
- **Phase 147 (Playwright Execution Tool)**: 19/19 passing
- **Phase 148 (Failure Intelligence Tool)**: 2/2 passing
- **Phase 149 (Repair / Patch Tool)**: 19/19 passing
- **Phase 150 (Git Diff & Change Review)**: 18/18 passing
- **Phase 150 IPC Handlers Unit Tests**: 11/11 passing
- **Phase 150 UI Component Tests**: 1/1 passing
- **TypeScript Typecheck**: 0 errors (`npm run typecheck`)
- **Desktop Smoke**: 0 errors (`npm run desktop:smoke`)
