# V5 Phase 61: Test Run Orchestration, Queue, State Machine & Cancellation

## Executive Summary

Phase 61 establishes the authoritative execution orchestration engine controlling the lifecycle of validated executable test plans compiled in Phase 60. It shifts the platform from static plan compilation to an explicit, database-backed deterministic state machine, bounded FIFO queue, single-worker lease claiming semantics, request idempotency, cooperative token-based cancellation, and automatic crash recovery.

---

## Key Architecture & Components

```text
+-----------------------+      +---------------------------+      +----------------------+
| Executable Test Plan  | ---> |  Enqueue Run (Idempotent) | ---> | Postgres test_runs   |
| (V5 Phase 60 SHA-256) |      |  Prerequisites & Approval |      | (Status: QUEUED)     |
+-----------------------+      +---------------------------+      +----------------------+
                                                                             |
                                                                             v
+-----------------------+      +---------------------------+      +----------------------+
|  Terminal Run State   | <--- |  RunOrchestrator Worker   | <--- |   RunQueue Claim     |
| (PASSED/FAILED/etc.)  |      |  AbortController Signal   |      |   Atomic Lease Lock  |
+-----------------------+      +---------------------------+      +----------------------+
```

### 1. Authoritative State Machine (`RunStateMachine`)

Enforces lifecycle valid state transitions and strict terminal state immutability:

- **Active States**:
  - `QUEUED`: Stored in bounded FIFO queue, awaiting available worker lease slot.
  - `PREPARING`: Acquired worker lease; validating underlying plan integrity and initializing execution environment.
  - `RUNNING`: Actively dispatching steps and assertions to the browser context with an active `AbortSignal`.
- **Terminal States (Immutable)**:
  - `PASSED`: All actions and assertions completed successfully.
  - `FAILED`: Application behavior failed test verification expectations.
  - `BLOCKED`: Precondition unmet, target unreachable, or plan missing/invalid.
  - `AUTOMATION_ERROR`: Runner error, unexpected infrastructure failure, or process interruption.
  - `CANCELLED`: Cooperative user cancellation acknowledged and halted.

**Permitted Transitions**:

- `QUEUED -> PREPARING, CANCELLED`
- `PREPARING -> RUNNING, BLOCKED, AUTOMATION_ERROR, CANCELLED`
- `RUNNING -> PASSED, FAILED, BLOCKED, AUTOMATION_ERROR, CANCELLED`
- Terminal states are strictly immutable; transitions out of terminal states throw `TestRunAlreadyTerminalError`. Re-runs allocate fresh `TestRun` identities.

### 2. Bounded FIFO Queue & Atomic Worker Claiming (`RunQueue`)

- **Bounded Capacity**: Configurable queue depth (`maxQueueDepth = 100`, bounded up to 1000). Throws `TestRunQueueFullError` when capacity is reached.
- **Concurrency Bounded**: Configurable execution concurrency (`maxConcurrentRuns = 1` in Phase 61).
- **Deterministic FIFO Ordering**: `ORDER BY queuedAt ASC, id ASC`.
- **Atomic Lease Claiming**: Single-query transactional conditional update in PostgreSQL:
  ```sql
  UPDATE test_runs
  SET status = 'PREPARING', worker_id = :workerId, lease_expires_at = :leaseExpiresAt, heartbeat_at = NOW()
  WHERE id = :candidateId AND status = 'QUEUED'
  ```
  Guarantees zero double-claims and prevents race conditions across concurrent workers.

### 3. Cooperative Cancellation & Crash Recovery (`RunOrchestrator`)

- **Cooperative Cancellation**: Manages an in-memory map of `AbortController` instances keyed by `runId`. When cancellation is triggered:
  - For `QUEUED` runs: immediately marks `CANCELLED`.
  - For `PREPARING` or `RUNNING` runs: signals `AbortController.abort()`, stops dispatching further actions, and commits `CANCELLED` status.
- **Crash Recovery (`recoverOrphanedRuns`)**: On application startup or restart, any runs left in non-terminal `PREPARING` or `RUNNING` states are transitioned to `AUTOMATION_ERROR` with `terminalReason: 'PROCESS_INTERRUPTED: Application restarted or previous worker exited during active execution.'`.

### 4. Domain Service & Idempotency (`TestRunService`)

- Enforces test approval (`reviewStatus === 'APPROVED'`), project isolation, and requirement staleness guards.
- Supports `idempotencyKey` to prevent duplicate queue submissions.
- Provides project-isolated querying and queue inspection.

---

## Desktop Bridge & IPC Interface

### IPC Channels

- `desktop:test-runs:enqueue`: Enqueues an execution run for an approved test case.
- `desktop:test-runs:get`: Retrieves single run by ID.
- `desktop:test-runs:list`: Lists runs with status and test case filtering.
- `desktop:test-runs:cancel`: Cancels queued or running test execution.
- `desktop:test-runs:get-queue-state`: Retrieves real-time queue capacity, active count, and worker states.

---

## Verification & Test Metrics

- **Unit & Security Tests**:
  - `run-state-machine.test.ts`: Valid transition table, terminal immutability, invalid transition rejection.
  - `run-queue.test.ts`: Bounded capacity, FIFO ordering, atomic lease claim, heartbeats, queue state metrics.
  - `run-orchestrator.test.ts`: Full lifecycle execution, error handling, cooperative cancellation, crash recovery.
  - `test-run-service.test.ts`: PostgreSQL persistence, review status guards, staleness guards, project isolation, idempotency.
  - `test-run-handlers.test.ts`: IPC sender validation, payload validation, error sanitization.
- **Test Results**:
  - Phase 61 Orchestration Suite: **31 / 31 tests passed** (0 failures).
  - Platform Full Regression Suite: **1,293 / 1,293 tests passed** (0 failures).
  - TypeScript Typecheck: **Clean (0 errors)**.
  - ESLint: **Clean (0 errors)**.
  - Prettier: **Clean (100% formatted)**.
  - Electron Desktop Smoke & Production Build: **Clean**.
