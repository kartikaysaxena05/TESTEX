# V7 Phase 106 — Requirement Change-Impact & Intelligent Retest Selection

## 1. Overview and Architecture

Phase 106 establishes the **Requirement Change-Impact & Intelligent Retest Selection** subsystem for the AI-Driven Software Quality Engineering Platform. This subsystem provides a deterministic, explainable, and sound impact analysis pipeline that answers:

- **What changed?** (Requirements, source code, symbols, APIs, configuration, or approved patches)
- **Which requirements are affected?** (Directly modified, related, or invalidated)
- **Which code paths/APIs are affected?** (Modified files, modified symbols, AST call sites, and transitive import chains)
- **Which tests must run?** (`MANDATORY` or `RECOMMENDED` with full causal rationale) vs **Which tests can safely be skipped?** (`NOT_IMPACTED` or `EXCLUDED` with explicit justification)
- **When is selective testing unsafe?** (Automatic escalation to `FULL_REGRESSION_REQUIRED = true`)

```
+---------------------------------------------------------------------------------------------------+
|               V7 Phase 106 Requirement Change-Impact & Retest Architecture                        |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Change Sources]                                                                                 |
|  - REQUIREMENT_CHANGE (Modified keys, text, criteria)                                             |
|  - SOURCE_CODE_CHANGE (File diffs, modified AST symbols)                                          |
|  - APPROVED_PATCH (Phase 104 DefectPatchApproval)                                                 |
|  - MANUAL_FILE_CHANGE / COMMIT_DIFF / BRANCH_DIFF                                                 |
|  - CONFIGURATION_CHANGE / API_CONTRACT_CHANGE                                                     |
|                  |                                                                                |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |                            ChangeSnapshotBuilder                                            |  |
|  |  - Ingests & normalizes diffs, AST symbols, API endpoints, and requirement keys             |  |
|  |  - Sanitizes sensitive tokens/secrets with [REDACTED_SECRET]                                 |  |
|  |  - Enforces resource bounds (2MB diff, 1,000 files, 500 symbols)                             |  |
|  |  - Creates immutable ChangeSnapshot record in PostgreSQL                                    |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                                                                |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |                            ImpactGraphBuilder                                               |  |
|  |  - Constructs directed acyclic graph: Nodes (Requirement, SourceFile, Symbol, TestCase)     |  |
|  |  - Constructs directed edges: IMPLEMENTS, DEPENDS_ON, VALIDATES, TRACES_TO, AFFECTS        |  |
|  |  - Traverses dependency graph up to depth 5 with cycle detection                            |  |
|  |  - Calculates transitive blast radius and dependency fan-out                                |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                                                                |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |                            TestSelectionEngine                                              |  |
|  |  - 7 Deterministic Selection Rules:                                                         |  |
|  |     Rule 1: Direct Requirement Trace -> MANDATORY (DIRECT, HIGH)                             |  |
|  |     Rule 2: Direct Code/Symbol Trace -> MANDATORY (DIRECT, HIGH)                              |  |
|  |     Rule 3: Transitive Dependency Trace -> RECOMMENDED (INDIRECT, MEDIUM/HIGH)               |  |
|  |     Rule 4: Approved Patch Reverification -> MANDATORY (PATCH_REVERIFICATION, HIGH)           |  |
|  |     Rule 5: Deprecated / Disabled -> EXCLUDED (HIGH)                                          |  |
|  |     Rule 6: Ambiguous / Untraced -> UNKNOWN (LOW/MEDIUM)                                      |  |
|  |     Rule 7: Unrelated Test -> NOT_IMPACTED (HIGH, with exclusion reason)                      |  |
|  |  - Risk Signal Evaluator (Security, Data Mutation, Public API, Fan-Out, Hotspots)           |  |
|  |  - Full Regression Escalation Evaluator (>50 files, >50% reqs, >75% unknown, root config)    |  |
|  |  - Produces immutable RetestPlan with comprehensive SelectedTestsJson and AuditTrail        |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                                                                |
|                  v                                                                                |
|  [Authoritative Database]                                                                         |
|  - Table: change_snapshots (Immutable change manifests)                                           |
|  - Table: retest_plans (Selected test suites, impact graphs, and full regression escalations)     |
|                  |                                                                                |
|                  v                                                                                |
|  [Desktop UI: RetestPlanCard & ImpactExplanationModal]                                            |
|  - Embedded within TraceabilityScreen (4th Tab: "Change Impact & Retest")                         |
|  - Stats badges: Mandatory, Recommended, Optional, Excluded, Not Impacted, Unknown                |
|  - Full Regression Escalation Banner when full regression is mandated                             |
|  - Filterable test table with status badges, confidence pills, and action explanations            |
|  - ImpactExplanationModal: Full causal trace path (Requirement -> Code -> Dependency -> Test)    |
|  - Multi-tenant isolation, 0 unauthorized cross-project reads/mutations                           |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Selection Determinism, Invariants & Graph Semantics

### The Impact Graph $G = (V, E)$

- **Vertices ($V$):**
  - $V_{\text{req}}$: Requirement nodes (e.g., `REQ-AUTH-01`).
  - $V_{\text{file}}$: Source file nodes (e.g., `src/auth/login.ts`).
  - $V_{\text{sym}}$: Symbol nodes (e.g., `loginUser`, `validatePassword`).
  - $V_{\text{test}}$: Test case nodes (e.g., `TC-AUTH-001`).
- **Edges ($E$):**
  - $\text{TRACES\_TO}: V_{\text{test}} \rightarrow V_{\text{req}}$ (Test validates requirement).
  - $\text{VALIDATES}: V_{\text{test}} \rightarrow V_{\text{file}} \cup V_{\text{sym}}$ (Test validates source code/symbol).
  - $\text{IMPLEMENTS}: V_{\text{file}} \cup V_{\text{sym}} \rightarrow V_{\text{req}}$ (Code implements requirement).
  - $\text{DEPENDS\_ON}: V_{\text{file}} \rightarrow V_{\text{file}}$ (Source file imports another source file).
  - $\text{AFFECTS}: V_{\text{change}} \rightarrow V_{\text{req}} \cup V_{\text{file}} \cup V_{\text{sym}}$ (Change directly touches entity).

### The Selection State Space

Each test case $t \in T$ in the project is partitioned into exactly one of six disjoint states:
$$\text{Partition}(T) = \{ T_{\text{MANDATORY}}, T_{\text{RECOMMENDED}}, T_{\text{OPTIONAL}}, T_{\text{NOT\_IMPACTED}}, T_{\text{UNKNOWN}}, T_{\text{EXCLUDED}} \}$$

1. **`MANDATORY`**:
   - Directly linked to a modified requirement ($\text{TRACES\_TO}$ changed $r \in \Delta_{\text{req}}$).
   - Directly tests modified source files or symbols ($\text{VALIDATES}$ changed $f \in \Delta_{\text{file}}$ or $s \in \Delta_{\text{sym}}$).
   - Targeted reverification test for an approved patch (`APPROVED_PATCH`).
   - Any test when `fullRegressionRequired === true`.
2. **`RECOMMENDED`**:
   - Tests a source file that transitively imports a modified file ($f_{\text{importer}} \xrightarrow{\text{DEPENDS\_ON}^k} f_{\text{changed}}$ for $1 \le k \le 5$).
   - Indirect requirement dependency where an upstream requirement changed.
3. **`OPTIONAL`**:
   - Indirect low-confidence traces or secondary integration tests where no core logic changed.
4. **`NOT_IMPACTED`**:
   - Proven disconnected in graph $G$: distance $d(\Delta, t) = \infty$.
   - Explicit rationale recorded: `"No direct or transitive dependency found between test case and change snapshot."`
5. **`UNKNOWN`**:
   - Test has zero requirement traces and zero source file coverage links.
   - Evaluated as risk signal. If ratio $\frac{|T_{\text{UNKNOWN}}|}{|T|} > 0.75$, escalates to full regression.
6. **`EXCLUDED`**:
   - Marked `isDeprecated === true` or disabled/quarantined. Explicit exclusion rationale recorded.

---

## 3. Full Regression Escalation Policy

Selective testing is only safe when the boundary of impact can be established with high confidence. The platform implements a deterministic safety circuit breaker that escalates `fullRegressionRequired = true` and mandates all non-excluded tests run when:

| Escalation Trigger               | Mathematical / Logical Condition                                                | Rationale                                                                                     |
| :------------------------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------- |
| **High File Blast Radius**       | $                                                                               | \Delta_{\text{files}}                                                                         | > 50$ | Large architectural refactor touches too many boundaries for selective isolation. |
| **Broad Requirement Churn**      | $\frac{                                                                         | \Delta_{\text{reqs}}                                                                          | }{    | R_{\text{project}}                                                                | } > 0.5$  | Over 50% of the project specification has changed; partial testing risks missing global regressions. |
| **Unmapped Test Swarm**          | $\frac{                                                                         | T_{\text{unknown}}                                                                            | }{    | T_{\text{project}}                                                                | } > 0.75$ | Over 75% of test cases lack traceability; selective boundaries cannot be certified.                  |
| **Core Framework / Root Config** | Touches root `package.json`, `tsconfig.json`, `pnpm-lock.yaml`, or root configs | Global configuration, compiler, or dependency changes affect all runtime execution semantics. |

---

## 4. Risk Signals & Explainability

For every test case evaluated, the engine produces explainable risk signals:

- **`SECURITY_CRITICAL_PATH`**: Change touches authentication, authorization, token, crypto, or session handling (`auth`, `login`, `jwt`, `crypto`, `permission`, `cors`, `vault`).
- **`DATA_MUTATION_PATH`**: Change touches database, migrations, transactions, or schema definitions (`schema`, `migration`, `prisma`, `database`, `repository`).
- **`PUBLIC_API_SURFACE`**: Change affects public REST, GraphQL, or IPC contract endpoints (`/api/`, `controller`, `route`, `endpoint`).
- **`HIGH_DEPENDENCY_FAN_OUT`**: Transitive dependency chain width or depth indicates widespread ripple effects.
- **`HISTORICAL_FAILURE_HOTSPOT`**: Test or module has high historical failure rate in execution logs.

---

## 5. Security & Isolation Invariants

1. **Multi-Tenant Isolation**:
   - Every read and write query scopes strictly by `projectId`.
   - Creating a snapshot or planning a retest with cross-project requirement IDs, patch IDs, or snapshot IDs throws `RetestProjectMismatchError`.
2. **Secret Redaction**:
   - All diff texts, symbol values, and configuration payloads pass through `sanitizeSecrets`.
   - Patterns matching GitHub tokens (`ghp_...`, `gho_...`), Bearer tokens, passwords, and API keys are replaced with `[REDACTED_SECRET]`.
3. **Bounded Resource Consumption**:
   - Diffs capped at 2MB (`MAX_DIFF_BYTES`).
   - Files capped at 1,000 (`MAX_CHANGED_FILES`).
   - Symbols capped at 500 (`MAX_CHANGED_SYMBOLS`).
   - Graph nodes capped at 1,000; edges capped at 5,000.
4. **Trusted IPC Sender Validation**:
   - All IPC channels (`desktop:retest:create-snapshot`, `desktop:retest:plan`, `desktop:retest:get-plan`, `desktop:retest:list-plans`, `desktop:retest:explain-test`) validate `event.senderFrame` via `isTrustedIpcSender`.
5. **Phase 107 Non-Interference**:
   - ZERO Phase 107 code (no Jira notification/update code, no post-fix comment triggers).

---

## 6. Verification & Certification Results

The implementation was certified across 6 test suites comprising 39 automated tests:

1. **`packages/core/src/retest/retest-contract.test.ts`** (11 tests):
   - Contract schemas, enums, DTOs, desktop channels, error hierarchy, version policies.
2. **`packages/core/src/retest/retest-plan-service.test.ts`** (8 tests):
   - Selection state determinism, direct vs transitive impact, patch reverification, exclusion, explanation generation, and idempotency.
3. **`packages/core/src/retest/retest-adversarial.test.ts`** (8 tests):
   - Cross-project isolation, secret redaction, 2MB payload bounding, concurrency locking, invalid ID rejections.
4. **`packages/core/src/retest/retest-real-git.test.ts`** (2 tests):
   - Certified with **real Git repository initialized on disk**: real commit diffs, real AST import graph analysis, zero false negatives/positives, and real root `package.json` config escalation.
5. **`apps/desktop/src/main/ipc/retest-handlers.test.ts`** (7 tests):
   - Trusted frame validation, sender spoofing rejection, DTO serialization, error code mapping.
6. **`apps/desktop/src/main/retest-ui.test.tsx`** (3 tests):
   - `RetestPlanCard` rendering, stats badges, full regression alert banner, `ImpactExplanationModal` trace path visualization.

**Overall Platform Verification:**

- `npm run test:retest`: **39 / 39 passing** (881ms).
- `npm run desktop:build`: **Build passed** (clean preload bundle & Vite bundle).
- `npm run desktop:smoke`: **Smoke passed** (code 0).
- `npx prisma migrate status`: **0 drift** (67 migrations applied).
- V7 Full Regression (`jira`, `email`, `workflow`, `reverification`, `verification`, `quick-fix`, `defect-localization`, `patch`, `sandbox`, `validation:patch`, `approval`, `rollback`, `retest`): **100% passing**.
