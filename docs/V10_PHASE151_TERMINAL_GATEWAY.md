# V10 — Phase 151: Sandboxed Terminal Command Gateway

## 1. Executive Summary

Phase 151 implements a centralized, sandboxed **Terminal Command Gateway** that enables the V10 autonomous agent to request and execute controlled terminal operations without granting direct or unrestricted shell access to the host system.

The gateway enforces multi-tenant boundaries (`userId → projectId → taskId`), worktree isolation, strict command policy classification (`SAFE`, `REQUIRES_APPROVAL`, `BLOCKED`), environment scrubbing (stripping API keys and secrets), output redaction (`[REDACTED_SECRET]`), output bounding, configurable timeouts, process-tree cancellation, and an unbreakable human decision gate that prohibits autonomous self-approval.

---

## 2. Gateway Architecture & Execution Flow

```
Agent (V10 Runtime)
         │
         ▼
 Tool Registry (`terminal.run`)
         │
         ▼
 Tool Permission System (Phase 144)
         │
         ▼
 TerminalCommandGateway (Core Service)
   ├── Multi-tenant validation (`userId → projectId → taskId`)
   ├── Worktree containment & path traversal check (`realpath`)
   ├── CommandPolicyEngine
   │     ├── Shell chaining / compound command blocker (;, &&, ||, |, `, $())
   │     ├── Restricted binary denylist (rm, dd, sudo, curl, ssh, sh, bash, ...)
   │     ├── Dangerous argument scanner (id_rsa, .env, .ssh, /etc, /root, ...)
   │     └── Subcommand classifier (SAFE vs REQUIRES_APPROVAL vs BLOCKED)
   ├── TerminalSanitizer
   │     ├── Environment allowlist filtering (PATH, HOME, TMPDIR, CI, ...)
   │     └── Output secret redactor (`SecretRedactor.redactText` + regex)
   ├── TerminalProcessRunner
   │     ├── Process execution via `spawn` (`shell: false`)
   │     ├── Configurable timeout & SIGTERM / SIGKILL tree termination
   │     ├── Output buffer limits (`maxOutputBytes`)
   │     └── Cancellation listener (`AbortSignal`)
   └── Persistence Layer
         ├── `AgentTerminalExecution` (Postgres record)
         ├── `AgentExecutionStep` (Thread execution step)
         └── `AgentToolAuditLog` (Immutable security audit trail)
```

---

## 3. Database Schema

Model added to `prisma/schema.prisma` and applied via migration `20261006050000_v10_phase151_terminal_gateway`:

```prisma
enum TerminalExecutionStatus {
  QUEUED
  WAITING_FOR_APPROVAL
  RUNNING
  COMPLETED
  FAILED
  TIMED_OUT
  CANCELLED
  BLOCKED
}

enum TerminalCommandPolicyClassification {
  SAFE
  REQUIRES_APPROVAL
  BLOCKED
}

model AgentTerminalExecution {
  id               String                              @id @default(uuid()) @db.Uuid
  projectId        String                              @map("project_id") @db.Uuid
  taskId           String                              @map("task_id") @db.Uuid
  threadId         String                              @map("thread_id") @db.Uuid
  stepId           String?                             @map("step_id") @db.Uuid
  command          String                              @db.Text
  workingDirectory String                              @map("working_directory") @db.VarChar(512)
  status           TerminalExecutionStatus             @default(QUEUED)
  policyDecision   TerminalCommandPolicyClassification @map("policy_decision")
  policyReason     String?                             @map("policy_reason") @db.Text
  exitCode         Int?                                @map("exit_code")
  stdout           String                              @default("") @db.Text
  stderr           String                              @default("") @db.Text
  durationMs       Int?                                @map("duration_ms")
  timedOut         Boolean                             @default(false) @map("timed_out")
  cancelled        Boolean                             @default(false) @map("cancelled")
  timeoutMs        Int                                 @default(30000) @map("timeout_ms")
  maxOutputBytes   Int                                 @default(524288) @map("max_output_bytes")
  approvedBy       String?                             @map("approved_by") @db.VarChar(128)
  approvedAt       DateTime?                           @map("approved_at") @db.Timestamptz(6)
  metadata         Json                                @default("{}") @map("metadata")
  startedAt        DateTime?                           @map("started_at") @db.Timestamptz(6)
  completedAt      DateTime?                           @map("completed_at") @db.Timestamptz(6)
  createdAt        DateTime                            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime                            @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  task    AgentThreadTask @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([projectId, status])
  @@index([taskId])
  @@index([threadId])
  @@index([createdAt])
  @@map("agent_terminal_executions")
}
```

---

## 4. Command Policy Rules

| Classification | Permitted Operations | Behavior |
|---|---|---|
| **SAFE** | `git status`, `git diff`, `git log`, `git branch`, `npm test`, `npm run test`, `pytest`, `node -v`, `python -V`, `tsc` (read-only) | Executes automatically in sandboxed process |
| **REQUIRES_APPROVAL** | `git commit`, `git add`, `git checkout`, `npm install`, `npm build`, `python script.py`, mutating linter fixes | Transitions to `WAITING_FOR_APPROVAL`. Requires human gate approval |
| **BLOCKED** | `rm`, `dd`, `sudo`, `curl`, `wget`, `nc`, `ssh`, `sh`, `bash`, `git push`, `git reset`, shell chaining (`;`, `&&`, `\|\|`, `\|`) | Unconditionally blocked; records security audit log |

---

## 5. Security Controls & Invariants

1. **No Arbitrary Shell Execution**: Commands are never passed to `/bin/sh` or `/bin/bash`. Child processes are executed via `spawn(binary, args, { shell: false })`.
2. **Path Traversal & Worktree Containment**: Working directory is verified against canonical real paths. Paths escaping the project worktree (`..`, `%2e`, null bytes, system paths) are rejected with `TerminalOutsideWorktreeError` or `TerminalPathTraversalError`.
3. **Environment Allowlist**: Only explicit benign keys (`PATH`, `HOME`, `TMPDIR`, `CI`, `LANG`, etc.) are passed to the child process. Host API keys, tokens, SSH credentials, and DB URLs are never inherited.
4. **Output Secret Redaction**: Stdout and stderr are scanned against known secrets (`SecretRedactor.redactText`) and credential patterns (Bearer tokens, GitHub tokens, AWS keys, Slack tokens, private keys) and masked with `[REDACTED_SECRET]`.
5. **No AI Self-Approval**: Autonomous identities (`agent_*` or `ai_*`) are blocked from approving terminal commands (`TerminalSelfApprovalForbiddenError`).
6. **Double Decision Protection**: Execution locks prevent concurrent race conditions, and decisions on already settled executions are rejected (`TerminalAlreadyDecidedError`).
7. **Timeout & Process Tree Termination**: Indefinitely running commands are terminated when `timeoutMs` expires and recorded as `TIMED_OUT`.
8. **Cancellation**: Task cancellation cascades to running terminal processes, terminating child processes and setting status to `CANCELLED`.

---

## 6. Desktop IPC Channels

| IPC Channel | Direction | Input Schema | Return Type | Description |
|---|---|---|---|---|
| `TERMINAL_EXECUTE` | Invoke | `TerminalExecuteInputDto` | `AgentTerminalExecutionDto` | Dispatches command through gateway |
| `TERMINAL_GET_EXECUTION` | Invoke | `GetTerminalExecutionInputDto` | `AgentTerminalExecutionDto \| null` | Retrieves single execution record |
| `TERMINAL_LIST_EXECUTIONS` | Invoke | `ListTerminalExecutionsInputDto` | `readonly AgentTerminalExecutionDto[]` | Lists recent task executions |
| `TERMINAL_APPROVE` | Invoke | `ApproveTerminalExecutionInputDto` | `AgentTerminalExecutionDto` | Human approval gate |
| `TERMINAL_REJECT` | Invoke | `RejectTerminalExecutionInputDto` | `AgentTerminalExecutionDto` | Rejects proposed command |
| `TERMINAL_CANCEL` | Invoke | `CancelTerminalExecutionInputDto` | `AgentTerminalExecutionDto` | Cancels running process |

---

## 7. Verification & Certification Results

- **Phase 151 Core Certification Suite**: **20/20 tests passing** (`v10-phase151-certification.test.ts`)
- **Phase 151 IPC Handlers Unit Tests**: **11/11 tests passing** (`terminal-handlers.test.ts`)
- **Phase 151 UI Component Tests**: **1/1 tests passing** (`terminal-ui.test.tsx`)
- **Full V10 Tools Certification (Phases 147–151)**: **78/78 tests passing across 5 suites**
- **TypeScript Typecheck**: **0 errors** (`npm run typecheck`)
- **Desktop Smoke**: **0 errors** (`npm run desktop:smoke`)
