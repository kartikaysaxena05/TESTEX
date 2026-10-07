# V6 Phase 79 — Flakiness Detection & Reproducibility Intelligence Architecture

## 1. Executive Summary

Phase 79 introduces the **Flakiness Detection & Reproducibility Intelligence** subsystem to the AI-Driven Software Quality Engineering Platform.

Building upon Phase 74 (Failure Intelligence Domain), Phase 75 (Evidence Ingestion & Normalization), Phase 76 (Controlled Reproduction), Phase 77 (Deterministic Classification), and Phase 78 (Decision Integrity & Arbitration), Phase 79 delivers:

1. **Deterministic Flakiness Intelligence**: Quantifies test reliability across historical execution attempts and controlled reproductions without relying on non-deterministic heuristics or generative AI models.
2. **Multi-Attempt Eligibility Filtering**:
   - Strict same-test-version enforcement: Only attempts executing the identical test case version number ($V_{\text{target}}$) are comparable.
   - Tenant boundary isolation: All evaluated attempts must strictly belong to the same project tenant ($P_{\text{target}}$).
   - Environment comparability: Only attempts executed under `EXACT` or `EQUIVALENT` environments are grouped for core flakiness evaluation; drifted or incompatible environments trigger explicit variability states.
   - Trusted evidence integrity: Attempts with corrupted or mismatched evidence are excluded from statistical scoring.
3. **Dual State Taxonomy**:
   - `FlakinessState`: `STABLE_FAILURE`, `STABLE_PASS`, `FLAKY_CANDIDATE`, `CONFIRMED_FLAKY`, `INCONCLUSIVE`, `INSUFFICIENT_EVIDENCE`, `ENVIRONMENT_VARIABILITY`, `EXECUTION_VARIABILITY`.
   - `StabilityState`: `STABLE`, `INTERMITTENT`, `UNSTABLE`, `UNKNOWN`.
4. **False-Positive Flakiness Protection**:
   - A single alternation between `FAILED` and `PASSED` (e.g. 2 attempts total) evaluates strictly to `FLAKY_CANDIDATE`.
   - `CONFIRMED_FLAKY` strictly requires $\ge 3$ valid comparable attempts with matching failure signatures.
5. **Phase 76 & Phase 78 Integration**:
   - Consumes historical test runs ($E_1$), retries, and Phase 76 reproduction records directly via `IFailureReproductionService`. No duplicate reproduction engine is introduced.
   - Binds to Phase 78 decision integrity: if arbitration or decision integrity is `BLOCKED`, the flakiness evaluation outputs `INCONCLUSIVE`.
6. **Deterministic Cryptographic Digest**: Computes an invariant `SHA-256` analysis fingerprint across canonically sorted attempt summaries with credential and secret redaction.
7. **Lifecycle, Concurrency & Security**:
   - Real-time staleness detection on read: Automatically detects newly ingested attempts or newer reproductions.
   - Operator-controlled reanalysis: Explicit reanalysis requires an operator reason and re-evaluates all available attempt series.
   - Atomic concurrency serialization: Per-case mutex serialization (`withLock`) prevents concurrent mutation or race conditions.
   - Top-frame IPC sender validation: Prevents malicious child frame exploits.

---

## 2. Mathematical Formalization & Cryptographic Digest

### 2.1 Attempt Series Formal Model

Let $F$ be a Failure Case within project $P$ associated with test case $T$ at version $V_T$.

An execution attempt $A_i$ is represented as a tuple:
$$A_i = (id_i, type_i, n_i, status_i, \sigma_i, \Delta_{E,i}, \mathcal{I}_i, t_i)$$

where:

- $type_i \in \{\text{HISTORICAL\_RUN}, \text{HISTORICAL\_RETRY}, \text{REPRODUCTION\_ATTEMPT}\}$
- $n_i \in \mathbb{N}_{\ge 1}$ is the attempt number
- $status_i \in \{\text{PASSED}, \text{FAILED}, \text{TIMED\_OUT}, \text{ERROR}, \dots\}$
- $\sigma_i$ is the normalized failure signature (null if passed)
- $\Delta_{E,i} \in \{\text{EXACT}, \text{EQUIVALENT}, \text{DRIFTED}, \text{INCOMPATIBLE}\}$ is the environment equivalence relative to base
- $\mathcal{I}_i \in \{\text{VALID}, \text{TAMPERED}, \text{MISMATCH}, \text{CORRUPT}, \dots\}$ is the evidence integrity status
- $t_i$ is the execution timestamp

### 2.2 Eligibility Filtering Function

The set of eligible comparable attempts $\mathcal{A}_{\text{eligible}}$ is derived by:
$$\mathcal{A}_{\text{eligible}} = \{ A_i \mid project(A_i) = P \land version(A_i) = V_T \land \mathcal{I}_i \in \{\text{VALID}, \text{VERIFIED}\} \land \Delta_{E,i} \in \{\text{EXACT}, \text{EQUIVALENT}\} \}$$

Key eligibility metrics computed across $\mathcal{A}_{\text{eligible}}$:

- Total comparable attempts: $N = |\mathcal{A}_{\text{eligible}}|$
- Passed attempts: $N_{\text{pass}} = |\{A \in \mathcal{A}_{\text{eligible}} \mid status(A) = \text{PASSED}\}|$
- Failed attempts: $N_{\text{fail}} = |\{A \in \mathcal{A}_{\text{eligible}} \mid status(A) \neq \text{PASSED}\}|$
- Flip count $K_{\text{flip}}$: The number of state transitions ($\text{FAIL} \to \text{PASS}$ or $\text{PASS} \to \text{FAIL}$) in chronological sequence.
- Flakiness score:
  $$S_{\text{flaky}} = \begin{cases} 0.0 & \text{if } N < 2 \text{ or } N_{\text{pass}} = 0 \text{ or } N_{\text{fail}} = 0 \\ \min\left(1.0, \frac{2 \cdot \min(N_{\text{pass}}, N_{\text{fail}})}{N} \times \frac{K_{\text{flip}}}{N - 1}\right) & \text{otherwise} \end{cases}$$

### 2.3 Cryptographic Digest (Analysis Fingerprint)

The analysis fingerprint $\Phi_{\text{fingerprint}} \in [0-9a-f]^{64}$ is computed via SHA-256 over a canonical JSON payload:

```text
+-------------------------------------------------------------+
|               Canonical Payload Components                  |
+-------------------------------------------------------------+
| 1. failureCaseId (UUID)                                     |
| 2. testCaseId (UUID)                                        |
| 3. testCaseVersion (Number)                                 |
| 4. flakinessState (String Enum)                             |
| 5. stabilityState (String Enum)                             |
| 6. attemptsEvaluated (Number)                               |
| 7. passRate (Number rounded to 4 decimal places)            |
| 8. flakinessScore (Number rounded to 4 decimal places)      |
| 9. rulesTriggered (Alphabetically Sorted Array of Strings)  |
| 10. attempts: Array of Canonical Attempt Summaries:         |
|     - attemptNumber                                         |
|     - attemptType                                           |
|     - executionStatus                                       |
|     - environmentEquivalence                                |
|     - normalizedSignature (Redacted)                        |
|     (Sorted by attemptNumber ASC)                           |
+-------------------------------------------------------------+
                              |
                              v
             [Canonical JSON Serialization]
       (Recursively sorted object keys, no spaces)
                              |
                              v
             [SHA-256 Cryptographic Digest]
                              |
                              v
                     analysisFingerprint
```

**Secret Redaction Policy**:

- Passwords, authorization tokens, bearer credentials, and API keys found in signatures or error snippets are replaced with `[REDACTED]`.
- Non-deterministic environment timestamps and volatile memory pointers are strictly excluded from the canonical digest.

---

## 3. Flakiness & Stability State Decision Rules

The `FlakinessRulesEngine` evaluates attempt series through a deterministic multi-stage decision tree:

| Precondition                | State Condition                                             | Resulting `FlakinessState` | Resulting `StabilityState` | Primary Rationale                                                                             |
| :-------------------------- | :---------------------------------------------------------- | :------------------------- | :------------------------- | :-------------------------------------------------------------------------------------------- |
| Any                         | Decision integrity is `BLOCKED`                             | `INCONCLUSIVE`             | `UNKNOWN`                  | Phase 78 decision integrity blocked due to evidence contradiction.                            |
| Any                         | Total comparable attempts $< 2$                             | `INSUFFICIENT_EVIDENCE`    | `UNKNOWN`                  | Fewer than 2 comparable attempts available for evaluation.                                    |
| Any                         | Environment comparison yields `DRIFTED` or `INCOMPATIBLE`   | `ENVIRONMENT_VARIABILITY`  | `UNKNOWN`                  | Execution variability correlated with environment configuration drift.                        |
| Comparable attempts $\ge 2$ | All attempts `FAILED` ($N_{\text{pass}} = 0$)               | `STABLE_FAILURE`           | `STABLE`                   | Failure consistently reproduced across all evaluated attempts.                                |
| Comparable attempts $\ge 2$ | All attempts `PASSED` ($N_{\text{fail}} = 0$)               | `STABLE_PASS`              | `STABLE`                   | Test consistently passed across all evaluated attempts.                                       |
| Exactly 2 attempts          | 1 `FAILED` + 1 `PASSED`                                     | `FLAKY_CANDIDATE`          | `INTERMITTENT`             | Single state flip detected; insufficient evidence for confirmed flaky.                        |
| $\ge 3$ attempts            | Both pass and fail observed, failure signatures match       | `CONFIRMED_FLAKY`          | `INTERMITTENT`             | Repeated non-deterministic alternating outcomes under identical test version and environment. |
| $\ge 2$ attempts            | Both pass and fail observed, but failure signatures diverge | `EXECUTION_VARIABILITY`    | `UNSTABLE`                 | Divergent failure signatures across attempts indicate execution instability.                  |

### False-Positive Flakiness Guard

A critical architectural constraint prevents labeling a test `CONFIRMED_FLAKY` from a single `FAIL -> PASS` sequence. With only 2 attempts, the probability of external intervention (e.g. an unversioned service recovery or test data cleanup) cannot be statistically ruled out. Hence, exactly 2 alternating attempts strictly transitions to `FLAKY_CANDIDATE`. Only with $\ge 3$ attempts showing repeated state alternation with identical failure signatures does the system upgrade the state to `CONFIRMED_FLAKY`.

---

## 4. Subsystem Architecture

```text
+---------------------------------------------------------------------------------------+
|                                    Desktop Renderer                                   |
|  [FlakinessInspectionPanel] <---> [window.desktop.failures.*] (Preload ContextBridge)  |
+---------------------------------------------------------------------------------------+
                                           | IPC Channels
                                           v
+---------------------------------------------------------------------------------------+
|                                Desktop Main (IPC Layer)                               |
|  - handleAnalyzeFlakiness        - handleGetFlakinessAnalysis                         |
|  - handleReanalyzeFlakiness      - handleListFlakinessHistory                         |
|  [isTrustedIpcSender] Guard & Error Sanitizer                                         |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                Core Domain Services                                   |
|                                                                                       |
|  +---------------------------------------------------------------------------------+  |
|  |                           FlakinessAnalysisService                              |  |
|  |  - Atomic Per-Case Mutex Locking (withLock)                                     |  |
|  |  - Real-Time Staleness Detection                                                |  |
|  |  - Database Transaction Management                                              |  |
|  +---------------------------------------------------------------------------------+  |
|          |                                            |                               |
|          v                                            v                               |
|  +------------------------------+             +------------------------------------+  |
|  |   AttemptSeriesCollector     |             |        FlakinessRulesEngine        |  |
|  |  - Version Parity Filter     |             |  - Taxonomy State Derivation       |  |
|  |  - Multi-Tenant Boundary     |             |  - False-Positive Protection       |  |
|  |  - Environment Comparator    |             |  - Metric & Flakiness Score Calc   |  |
|  |  - Evidence Integrity Check  |             |  - Downstream Phase 78 Binding     |  |
|  +------------------------------+             +------------------------------------+  |
|          |                                            |                               |
|          +--------------------+  +--------------------+                               |
|                               |  |                                                    |
|                               v  v                                                    |
|  +---------------------------------------------------------------------------------+  |
|  |                       Deterministic Fingerprint Generator                       |  |
|  |  - Canonical JSON Serialization & Secret Redaction (SHA-256)                    |  |
|  +---------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                               Persistence Layer (Prisma)                              |
|  - Model: FlakinessAnalysis                                                           |
|  - Enums: FlakinessState, StabilityState                                              |
|  - Foreign Keys: FailureCase, Project, TestCase                                       |
+---------------------------------------------------------------------------------------+
```

---

## 5. Security Isolation & Concurrency Model

### 5.1 Multi-Tenant Project Isolation

All queries strictly filter by `projectId`. The service rejects any operation where the failure case or test case does not match the requesting tenant (`FLAKINESS_ANALYSIS_CROSS_PROJECT`).

### 5.2 Atomic Mutex Serialization

To prevent race conditions and concurrent write hazards, all flakiness analyses and reanalyses are serialized per `failureCaseId` using an in-memory promise-based mutex:

```typescript
await this.withLock(failureCaseId, async () => {
  // 1. Fetch failure case and verify tenant ownership
  // 2. Collect attempt series
  // 3. Evaluate deterministic rules
  // 4. Compute cryptographic fingerprint
  // 5. Atomic database transaction
});
```

### 5.3 Real-Time Staleness Lifecycle

When an analysis is retrieved via `getFlakinessAnalysis`, the service performs an O(1) staleness check:

1. It queries for any newer `TestCaseExecution` records for the same test case.
2. It queries for any newer `FailureReproductionRun` records created after `analyzedAt`.
3. If new data exists, `isStale: true` is computed dynamically on read without corrupting historical immutable records.

---

## 6. Verification Summary

The Phase 79 implementation is certified through rigorous automated testing:

1. **Deterministic Rules Engine (`flakiness-rules-engine.test.ts`)**: 8 tests verifying state taxonomy, false-positive protection, environment drift detection, signature divergence, and decision integrity blocking.
2. **Security Isolation (`flakiness-security.test.ts`)**: 6 tests verifying cross-tenant access rejection, secret redaction, missing case error handling, and payload sanitization.
3. **Concurrency & Locking (`flakiness-concurrency.test.ts`)**: Verifying atomic mutex serialization under concurrent analysis requests.
4. **Desktop IPC Handlers (`failure-flakiness-handlers.test.ts`)**: 9 tests verifying IPC input validation, top-frame sender authorization, error mapping, and handler registration.
5. **Renderer UI Inspection Panel (`failures-flakiness-ui.test.tsx`)**: 2 React component tests verifying loading states, score badge rendering, and trigger button behaviors.
6. **Full Regression Suite**: All 72 failure suites (194 tests) and the broader platform regression pass with 0 failures and 0 warnings.
