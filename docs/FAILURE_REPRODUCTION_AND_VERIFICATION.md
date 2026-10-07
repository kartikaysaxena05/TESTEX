# Failure Reproduction & Reproducibility Verification

**Version:** V6 — Failure Intelligence, Root-Cause Analysis & Intelligent Bug Triage  
**Phase:** 76 — Failure Reproduction & Reproducibility Verification  
**Status:** COMPLETE / FROZEN / CERTIFIED

---

## 1. Architectural Overview & Invariants

Phase 76 introduces the controlled failure reproduction engine and reproducibility verification subsystem for V6 Failure Intelligence. It enables automated, bounded re-execution of historical test failures under reconstructed environments while maintaining strict immutability of the original test execution records.

### Key Invariants

1. **Re-execution Using Existing V5 Runtime:** Reproduction directly uses the certified V5 Playwright browser runtime abstraction (`PlaywrightBrowserProvider`), running genuine browser sessions rather than mock assertions.
2. **Strict Immutability of Original Execution ($E_1$):** Original execution $E_1$ is never modified, overwritten, or re-run in place. Every reproduction attempt creates a brand-new execution identity ($E_2$) with its own `testRunId`, `executionId`, step records, assertion records, and timestamp trails.
3. **Exact Historical Test Version Resolution:** The reproduction subsystem binds strictly to the exact `TestCaseVersion` that failed originally (e.g. Test Case Version 2 if original ran Version 2). If subsequent authoring has produced Version 3, reproduction will not run Version 3 unless explicitly migrated.
4. **Environment Reconstruction & Drift Taxonomy:** The historical environment is reconstructed from the execution environment snapshot. If reproduction targets a drifted base URL, viewport, or engine, drift is classified as `EXACT`, `EQUIVALENT`, `DRIFTED`, `UNKNOWN`, or `INCOMPATIBLE`.
5. **Deterministic Failure Signature Comparison:** Signatures (`sig_<hash>`) strip volatile tokens (UUIDs, timestamps, randomized DOM attributes, memory addresses) before cryptographic comparison to verify whether the historical defect reproduced identically.
6. **Strict Outcome Taxonomy:** Reproduction attempts resolve to unambiguous deterministic outcomes: `REPRODUCED`, `NOT_REPRODUCED`, `BLOCKED`, `INCONCLUSIVE`, `CANCELLED`, or `EXECUTION_ERROR`.
7. **Concurrency & Cancellation Controls:** Concurrent reproduction runs on the same `failureCaseId` are rejected with `ReproductionAlreadyInProgressError`. Running reproductions can be aborted via standard `AbortController` signals.

---

## 2. Environment Reconstruction & Drift Taxonomy

The `EnvironmentReconstructor` reconstructs historical environment settings from `TestCaseExecution.environmentSnapshotJson` and compares them against target environment profiles.

| Equivalence Status | Criteria                                                                                                         | Impact on Reproduction                                                                       |
| :----------------- | :--------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **`EXACT`**        | All functional and visual properties (URL, browser engine, viewport, locale, timezone) match identically.        | Highest fidelity reproduction; failure signature comparison is fully valid.                  |
| **`EQUIVALENT`**   | Non-functional parameters differ (e.g., minor locale or timezone variance), but URL, engine, and viewport match. | Valid reproduction; notes non-functional divergence.                                         |
| **`DRIFTED`**      | Base URL changed, or viewport resolution differs by >100px width/height.                                         | Reproduction proceeds, but `environmentDriftDetected` flag is set to alert triage engineers. |
| **`UNKNOWN`**      | Historical execution omitted environment snapshot metadata.                                                      | Reproduction proceeds with default parameters; flags historical absence.                     |
| **`INCOMPATIBLE`** | Browser engines conflict (e.g., historical run on `chromium` requested on `firefox`).                            | Reproduction attempt is rejected with `ReproductionEnvironmentIncompatibleError`.            |

---

## 3. Comparison Engine & Signature Normalization

The `ReproductionComparator` evaluates original execution $E_1$ against reproduction execution $E_2$:

1. **Failure Signature Normalization:**
   Volatile tokens (UUIDs, ISO timestamps, memory addresses) are stripped before SHA-256 computation to ensure stable, deterministic fingerprints across environments.
2. **Step-by-Step Traversal:** Compares ordered `StepExecutionRecord` streams, matching action types, targets, error codes, and step outcome statuses.
3. **Assertion Verification:** Compares expected vs actual values, assertion operator, and diff summaries when failures stem from assertion mismatches.

### Reproduction Outcomes

| Outcome               | Trigger Condition                                                                                     |
| :-------------------- | :---------------------------------------------------------------------------------------------------- |
| **`REPRODUCED`**      | Reproduction failed with identical normalized signature and matching failed step index / action type. |
| **`NOT_REPRODUCED`**  | Reproduction test execution ran all historical steps to completion and PASSED.                        |
| **`BLOCKED`**         | Historical test version has no executable steps, or prerequisite assets are missing.                  |
| **`INCONCLUSIVE`**    | Reproduction failed at a different step or with an unrelated error code/signature.                    |
| **`CANCELLED`**       | In-flight execution was aborted by user request via `AbortController`.                                |
| **`EXECUTION_ERROR`** | Browser crashed, Playwright binary was unavailable, or unrecoverable driver error occurred.           |

---

## 4. Desktop IPC & Inspection UI

### IPC API Channel Matrix

| Channel Name                           | Bridge Method                    | Input Schema                           | Return Type                                        |
| :------------------------------------- | :------------------------------- | :------------------------------------- | :------------------------------------------------- |
| `failures:execute-reproduction`        | `executeReproduction(...)`       | `executeReproductionInputSchema`       | `DesktopResponse<ReproducibilitySummaryDto>`       |
| `failures:get-reproduction-attempts`   | `getReproductionAttempts(...)`   | `getReproductionAttemptsInputSchema`   | `DesktopResponse<FailureReproductionAttemptDto[]>` |
| `failures:get-reproducibility-summary` | `getReproducibilitySummary(...)` | `getReproducibilitySummaryInputSchema` | `DesktopResponse<ReproducibilitySummaryDto>`       |
| `failures:cancel-reproduction`         | `cancelReproduction(...)`        | `cancelReproductionInputSchema`        | `DesktopResponse<{ cancelled: boolean }>`          |

### Renderer Inspection Panel (`ReproductionInspectionPanel.tsx`)

- **Immutability Validation Card:** Explicitly displays original execution $E_1$ ID alongside reproduction execution $E_2$ ID with cryptographic immutability indicator.
- **Attempt Carousel & History:** Inspects individual reproduction runs, elapsed times, and step execution counts.
- **Side-by-Side Step Diffs:** Visual status chips comparing $E_1$ and $E_2$ steps.
- **Environment Drift Badge:** Displays drift warnings and changed properties when reproduction targets an updated staging URL.
- **Interactive Controls:** "Run Reproduction", "Cancel", and "Inspect Diff" buttons with optimistic UI feedback.

---

## 5. Verification & Certification

All 8 authoritative test suites for Phase 76 pass with zero errors:

1. `environment-reconstructor.test.ts` (8/8 passing)
2. `historical-test-resolver.test.ts` (4/4 passing)
3. `reproduction-comparator.test.ts` (9/9 passing)
4. `failure-reproduction-concurrency.test.ts` (1/1 passing)
5. `failure-reproduction-security.test.ts` (3/3 passing)
6. `failure-reproduction-certification.test.ts` (3/3 passing with real Playwright browser)
7. `failure-reproduction-handlers.test.ts` (7/7 passing)
8. `failures-reproduction-ui.test.tsx` (2/2 passing)

Total Failures domain test suite: **112 passing tests across 20 suites**.
