# V5 Phase 71 — Retry, Flakiness Detection & Execution Recovery

## Executive Summary

V5 Phase 71 establishes deterministic, bounded retry execution, automated failure classification, side-effect safety analysis, session recovery, and multi-attempt flakiness detection for autonomous web testing.

A core tenet of Phase 71 is:

> **"A retry is additional evidence, not permission to rewrite execution history. Retries must never hide failures."**

---

## Architecture & Attempt Lifecycle

```text
Existing V5 Execution Engine
           │
           ▼
    Initial Attempt (Attempt 1)
           │
           ▼
     Failure Occurs
           │
           ├───────────────────────────────────────────────────────┐
           ▼                                                       ▼
  Evidence Captured                                  Retry Policy Engine Evaluation
(Screenshot, Console, DOM, Trace)                   (shouldRetry: category, bounds, delay)
           │                                                       │
           │                                                       ▼
           │                                         Side-Effect Safety Analysis
           │                                         (Safe / Unsafe / Mutating check)
           │                                                       │
           │                                                       ▼
           │                                            Cancellation Check
           │                                         (Cooperative AbortSignal)
           │                                                       │
           └───────────────────┬───────────────────────────────────┘
                               │ (Eligible & Safe & Not Cancelled)
                               ▼
                   Execution Recovery Coordinator
             (Clean session disposal, fresh context, auth restore)
                               │
                               ▼
                   New Monotonic Attempt (Attempt 2)
                               │
                               ▼
               Truthful Outcome Evaluation & Comparison
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
     [STABLE]        [RECOVERED_RUNTIME]      [FLAKY_CANDIDATE]
  Consistent Pass     Infra crash recovered    Transient app failure
  or Consistent Fail   via clean session       recovered on retry
        │                      │                      │
        └──────────────────────┴──────────────────────┘
                               │
                               ▼
                 Truthful Final Run Result &
               Restart-Persistent Audit Trail
```

---

## Key Invariants

1. **Attempt Immutability**:
   Every execution attempt generates an immutable, monotonically numbered `TestCaseExecution` row in PostgreSQL (`Attempt 1`, `Attempt 2`, ...). Attempt 1 failure is never overwritten or deleted.
2. **Per-Attempt Evidence Isolation**:
   Phase 69–70 evidence bundles (screenshots, console logs, network entries, DOM snapshots, traces) remain strictly attached to the exact `executionId` and attempt that produced them.
3. **Bounded Retries**:
   Total attempts are strictly bounded (`min: 1`, `max: 5`, `default: 3`). Exponential backoff with configurable delays is enforced.
4. **Side-Effect Safety**:
   Plans containing state-mutating actions (form submissions, payments, deletions, checkout flows) are analyzed. Retries are blocked if execution reached or failed on a mutating step.
5. **Cancellation Preemption**:
   User cancellation requests immediately preempt retry evaluations. The active attempt is halted and final run status is set to `CANCELLED`.
6. **Separation of Status Dimensions**:
   - **Execution Status**: `PASSED`, `FAILED`, `CANCELLED`, `AUTOMATION_ERROR`.
   - **Reliability Status**: `STABLE`, `RECOVERED_RUNTIME`, `FLAKY_CANDIDATE`, `NOT_EVALUATED`.
   - **Retry Outcome Flag**: `passedAfterRetry: boolean`.

---

## Reliability Classification Matrix

| Attempt 1       | Attempt 2 | Attempt 3 | Final Status | `passedAfterRetry` | `reliabilityStatus` | `isFlakyCandidate` | Notes                                                        |
| :-------------- | :-------- | :-------- | :----------- | :----------------- | :------------------ | :----------------- | :----------------------------------------------------------- |
| `PASSED`        | —         | —         | `PASSED`     | `false`            | `STABLE`            | `false`            | First attempt passed cleanly.                                |
| `FAILED`        | `FAILED`  | `FAILED`  | `FAILED`     | `false`            | `STABLE`            | `false`            | Consistent deterministic failure.                            |
| `BROWSER_CRASH` | `PASSED`  | —         | `PASSED`     | `true`             | `RECOVERED_RUNTIME` | `false`            | Infrastructure crash recovered via fresh browser context.    |
| `TIMEOUT`       | `PASSED`  | —         | `PASSED`     | `true`             | `FLAKY_CANDIDATE`   | `true`             | Transient timing glitch passed on retry. Flagged for review. |
| `FAILED`        | `PASSED`  | `FAILED`  | `FAILED`     | `false`            | `FLAKY_CANDIDATE`   | `true`             | Inconsistent alternating outcomes across monotonic attempts. |

---

## Desktop IPC APIs & Contracts

### Channels

- `DESKTOP_CHANNELS.EXECUTION_GET_ATTEMPTS`: `execution:get-attempts`
- `DESKTOP_CHANNELS.EXECUTION_EVALUATE_RELIABILITY`: `execution:evaluate-reliability`

### Preload Bridge

Exposed on `window.desktop.executionHistory`:

- `getAttempts({ projectId, testRunId })`: Fetches full attempt summaries with duration, errors, and attached evidence bundle IDs.
- `evaluateReliability({ projectId, testRunId })`: Computes flakiness report, multi-attempt outcome trail, and classification.
