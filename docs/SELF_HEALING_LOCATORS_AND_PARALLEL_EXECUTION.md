# V5 Phase 72 — Self-Healing Locators, Parallel Execution & Isolation Controls

## Executive Summary

V5 Phase 72 establishes **bounded, auditable locator self-healing** and **controlled parallel test execution with strict multi-tenant isolation** for the Autonomous Web Testing platform.

Core architectural tenets:

> **"Self-healing must never become uncontrolled autonomous guessing. Exact match and strong accessibility semantics outrank structural dynamic DOM attributes. Destructive actions demand higher confidence, security fields are strictly protected, ambiguity halts automation, and authoritative V4 test specifications are never invisibly mutated."**
>
> **"Parallel execution must enforce absolute isolation: zero cross-run browser context leakage, zero authentication crosstalk, zero variable scope collision, zero artifact path overlap, and cooperative deadlock-safe resource locking."**

---

## 1. Locator Self-Healing Subsystem

```text
Step Execution Failure (Locator Timeout / Not Found)
                     │
                     ▼
         Locator Healing Engine Initiated
                     │
                     ▼
        Bounded Candidate Discovery (≤ 25 candidates, ≤ 200 DOM nodes)
   (Targeted semantic roles, labels, placeholders, testIds, then interactive tree)
                     │
                     ▼
       Live Element Semantic Signature Extraction
   (role, accessibleName, label, placeholder, testId, inputType, formAction, contextText)
                     │
                     ▼
       Deterministic Candidate Scoring Model (0–100)
   ├── Security Field Check (Password ↔ Non-Password → IMMEDIATE DISQUALIFICATION)
   ├── Conflicting Action Keyword Check (Delete vs Save → -50 pts / DISQUALIFICATION)
   ├── Role & Tag Match (up to 30 pts)
   ├── Accessible Name & Token Overlap Similarity (up to 40 pts)
   ├── TestId & Prefix Family Match (up to 20 pts)
   ├── Label Match (up to 15 pts)
   ├── Input Type Match (up to 10 pts)
   ├── Nearby Context & Form Header Match (up to 5 pts)
   ├── Inactive / Invisible Element Penalties (-30 pts / -20 pts)
   └── Destructive Action Threshold Elevation (Required score ≥ 90 vs Standard ≥ 75)
                     │
                     ▼
          Ambiguity Margin Guardrail
   (If Top Score ≥ 50 and Runner-Up ≥ 50 with Score Difference < 15 → AMBIGUOUS)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
    [AMBIGUOUS]            [UNAMBIGUOUS]
Refuse to click;                 │
Report ambiguity                 ▼
                        Threshold Check
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [Score < Threshold]             [Score ≥ Threshold]
           HEAL_FAILED                         HEALED
                 │                               │
                 │                Execute Action via Healed Locator
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                    Persist LocatorHealingAttempt Audit
                                 │
                                 ▼
             Emit Reviewable LocatorHealingSuggestion (PENDING)
         (Original target preserved; V4 test definition immutable)
```

### Deterministic Candidate Scoring Weights

| Criteria                       | Max Points | Description                                                                                      |
| :----------------------------- | :--------- | :----------------------------------------------------------------------------------------------- |
| **Role & Tag Match**           | 30         | Exact accessibility role match (+30 pts), compatible tag matching (+25 pts)                      |
| **Accessible Name Match**      | 40         | Exact name (+40 pts), substring/high token overlap (+35 pts), Jaccard token similarity           |
| **Test ID Match**              | 20         | Exact `data-testid` (+20 pts), test-id family prefix match (e.g. `btn-v1` vs `btn-v2`) (+10 pts) |
| **Label Match**                | 15         | Explicit `label[for]` or parent label text match                                                 |
| **Input Type Match**           | 10         | Exact form input type or interactive control type matching                                       |
| **Context & Header Match**     | 5          | Nearby contextual header (`h1`–`h6`, `fieldset`, `legend`) match                                 |
| **Security Mismatch**          | -100       | **Disqualification**: Attempting to heal between password and non-password fields                |
| **Conflicting Action Keyword** | -50        | **Disqualification**: Conflicting verbs (e.g., target `Delete` vs candidate `Save`)              |
| **Invisible / Disabled**       | -30 / -20  | Penalties for non-visible or disabled elements                                                   |

### Safety Invariants

1. **Destructive Action Protection**: Actions classified as destructive (delete, pay, purchase, remove, cancel, checkout) require a strict confidence threshold of **$\ge 90$** (or healing is completely blocked by policy).
2. **Security Field Isolation**: Never heal between `<input type="password">` and standard text/email inputs.
3. **Ambiguity Halts Automation**: If two viable candidates score within **15 points** of each other, the engine marks the result as `AMBIGUOUS` and refuses to click.
4. **Immutable V4 Test Definitions**: Self-healing during execution creates a reviewable `LocatorHealingSuggestion` (`PENDING`, `ACCEPTED`, `REJECTED`) and an audit trail in `LocatorHealingAttempt`. Authoritative test definitions are never overwritten invisibly.
5. **Truthful Outcome Accounting**: A healed locator does not automatically force a test pass; assertions remain authoritative, and test runs track `healingUsed: true` and `healingCount`.

---

## 2. Parallel Execution & Strict Isolation Subsystem

```text
                 Parallel Worker Pool
     (maxParallelRuns bounded 1..16, default: 4)
                        │
      ┌─────────────────┼─────────────────┐
      ▼                 ▼                 ▼
  Worker 1          Worker 2          Worker N
      │                 │                 │
      ├─────────────────┼─────────────────┤
      ▼                 ▼                 ▼
 Atomic Run Claim   Atomic Run Claim   Atomic Run Claim
 (from RunQueue)    (from RunQueue)    (from RunQueue)
      │                 │                 │
      ├─────────────────┼─────────────────┤
      ▼                 ▼                 ▼
 Exclusive Resource Exclusive Resource Exclusive Resource
    Lock Check         Lock Check         Lock Check
 (ResourceLockSvc)  (ResourceLockSvc)  (ResourceLockSvc)
      │                 │                 │
      ├─────────────────┼─────────────────┤
      ▼                 ▼                 ▼
 Isolated Browser   Isolated Browser   Isolated Browser
     Context 1          Context 2          Context N
 (0 cookie/auth     (0 cookie/auth     (0 cookie/auth
  state leakage)     state leakage)     state leakage)
      │                 │                 │
      ├─────────────────┼─────────────────┤
      ▼                 ▼                 ▼
 Isolated Variable  Isolated Variable  Isolated Variable
     Scope 1            Scope 2            Scope N
      │                 │                 │
      ├─────────────────┼─────────────────┤
      ▼                 ▼                 ▼
 Isolated Artifact  Isolated Artifact  Isolated Artifact
     Directory          Directory          Directory
 (UUID-partitioned) (UUID-partitioned) (UUID-partitioned)
      │                 │                 │
      └─────────────────┼─────────────────┘
                        ▼
           Automatic Lock Cleanup on
              Completion or Error
```

### Parallel Execution Invariants

1. **Bounded Concurrency & Backpressure**: Worker pool dynamically regulates concurrency up to `maxParallelRuns` (clamped between 1 and 16). Additional runs remain queued until capacity is available.
2. **Context Isolation**: Every test run creates a fresh, isolated Playwright `BrowserContext`. Cookies, `localStorage`, `sessionStorage`, permissions, and network caches are never shared across concurrent runs.
3. **Deadlock-Safe Resource Locking**: Exclusive DB-backed locks (`ExecutionResourceLock`) serialize tests requiring exclusive resources (e.g. shared test accounts or exclusive system settings). All locks feature automatic lease expiry (default 5 min) and cleanup on run completion.
4. **Artifact Partitioning**: Screenshots, videos, DOM snapshots, and traces are written to run-specific paths (`evidence/{testRunId}/{executionId}/...`) preventing filename collisions.

---

## 3. Database Schema & Persistence

### New Models

- `LocatorHealingAttempt`: Authoritative per-step audit record tracking the original target, failure reason, healing result (`HEALED`, `AMBIGUOUS`, `HEAL_FAILED`, `POLICY_BLOCKED`), candidates evaluated, selected candidate, score, and threshold.
- `LocatorHealingSuggestion`: Reviewable suggestion associated with a test case and step, supporting review status transitions (`PENDING`, `ACCEPTED`, `REJECTED`), reviewer audit, and suggested locator recipe.
- `ExecutionResourceLock`: Exclusive resource locking model keyed by `(projectId, resourceKey)` with lease expiration.

### Updated Models

- `TestRun`: Added `healingUsed` (Boolean) and `healingCount` (Int).
- `TestCaseExecution`: Added `healingUsed` (Boolean) and `healingCount` (Int).
- `StepExecutionRecord`: Added `healingStatus` (String?), `healedTargetJson` (Json?), and `healingScore` (Int?).

---

## 4. Contracts & Sandboxed IPC

### New IPC Channels

- `EXECUTION_GET_HEALING_ATTEMPTS`: Queries authoritative healing attempt audit records.
- `EXECUTION_LIST_HEALING_SUGGESTIONS`: Lists reviewable healing suggestions with optional project/test/status filters.
- `EXECUTION_REVIEW_HEALING_SUGGESTION`: Accepts or rejects a suggestion with reviewer audit tracking.
- `EXECUTION_GET_PARALLEL_POOL_STATE`: Inspects worker pool active workers, running counts, and queue depth.

---

## 5. Automated Test Verification

| Test Suite                           | Purpose                                                                                                                              | Tests |
| :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :---- |
| `healing-candidate-scorer.test.ts`   | Unit tests for deterministic 0-100 scoring model, semantic weights, password disqualification, keyword conflict penalty, and ranking | 7     |
| `locator-healing-engine.test.ts`     | Unit tests for engine coordination, confidence thresholding, destructive action rules, and ambiguity margin guardrails               | 4     |
| `healing-suggestion-service.test.ts` | Unit tests for reviewable suggestion recording, status filtering, and review workflows                                               | 3     |
| `resource-lock-service.test.ts`      | Unit tests for atomic lock acquisition, contention rejection, re-entrancy, and cleanup                                               | 5     |
| `parallel-worker-pool.test.ts`       | Unit tests for bounded pool limits, queue processing, dynamic reconfiguration, and state inspection                                  | 4     |
| `healing-handlers.test.ts`           | Desktop IPC security tests (sender validation, schema validation, and persistence delegation)                                        | 6     |
| `healing-e2e-real-browser.test.ts`   | Real Playwright browser end-to-end tests for live locator healing, ambiguity refusal, and browser context isolation                  | 3     |
