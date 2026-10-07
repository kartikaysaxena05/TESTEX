# V7 Phase 103 — Patch Validation & Before/After Testing

## 1. Overview and Architecture

Phase 103 introduces the **Patch Validation & Before/After Testing** subsystem for the AI-Driven Software Quality Engineering Platform. It operates downstream of **Phase 101 (Limited AI Patch Generation)** and **Phase 102 (Secure Patch Sandbox & Change Isolation)**.

The primary objective of Phase 103 is to rigorously prove whether a candidate patch proposal actually resolves the target defect without introducing regressions into unrelated parts of the codebase, without breaking build or lint quality gates, and without violating scope boundaries—all while maintaining **strictly 0 mutations** to the authoritative repository.

```
+---------------------------------------------------------------------------------------------------+
|                  V7 Phase 103 Patch Validation & Before/After Testing Architecture                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [DefectPatchProposal (Phase 101)] + [DefectPatchSandbox (Phase 102)]                             |
|                                     |                                                             |
|                                     v                                                             |
|                         [PatchValidationService]                                                  |
|                                     |                                                             |
|            +------------------------+------------------------+                                    |
|            |                                                 |                                    |
|            v                                                 v                                    |
|   [Authoritative Protection]                        [Isolated Sandbox Root]                       |
|   - Strictly 0 repository mutations                 - Pre-Patch Baseline State                    |
|   - Dirty working tree untouched                    - Post-Patch Sandbox State                    |
|   - Revision match verification                     - Controlled Gate Execution                   |
|            |                                                 |                                    |
|            |    +--------------------------------------------+                                    |
|            |    |                                                                                 |
|            |    +---> 1. Mandatory BEFORE Baseline Execution (Must FAIL)                          |
|            |    |        - Same test case, steps, environment                                     |
|            |    |        - If PASS => INCONCLUSIVE (cannot take credit)                           |
|            |    |        - Independent beforeEvidenceJson captured                                |
|            |    |                                                                                 |
|            |    +---> 2. Sandbox Patch Application (Phase 102 applicator)                         |
|            |    |        - Clean structured edit application                                      |
|            |    |        - Scope audit & containment validation                                   |
|            |    |                                                                                 |
|            |    +---> 3. Mandatory AFTER Resolution Execution (Must PASS)                         |
|            |    |        - Identical test case, steps, environment                                |
|            |    |        - If FAIL => INVALID                                                     |
|            |    |        - Independent afterEvidenceJson captured                                 |
|            |    |                                                                                 |
|            |    +---> 4. Targeted Regression Suite Selection & Run                                |
|            |    |        - V4 Requirement-to-Test Traceability ranking                            |
|            |    |        - Target file overlap ranking                                            |
|            |    |        - If any test REGRESSES => INVALID                                       |
|            |    |                                                                                 |
|            |    +---> 5. Controlled Quality Gates Run                                             |
|            |    |        - typecheck, lint, build in sandboxRoot                                  |
|            |    |        - If any gate FAILS => INVALID                                           |
|            |    |                                                                                 |
|            |    +---> 6. Scope & Immutability Verification                                        |
|            |             - Unaudited files => BLOCKED                                             |
|            |             - Authoritative mutations == 0 check                                     |
|            |                                                                                      |
|            v                                                 v                                    |
|   [Authoritative Repo: 0 Writes]                    [DefectPatchValidation (DB)]                  |
|   - Preserves uncommitted work                      - Outcome: VALID / INVALID / INCONCLUSIVE      |
|   - No commits / branches / PRs                     - Before vs After Differential Evidence       |
|   - No pushes / deployment                          - Regressions & Quality Gate Results          |
|                                                              |                                    |
|                                                              v                                    |
|                                              [Desktop UI: PatchValidationCard]                    |
|                                              - Differential Before/After View                     |
|                                              - Targeted Regressions List                          |
|                                              - Quality Gates Status Badges                        |
|                                              - Scope Audit & Immutability Badge                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Strict Authoritative Repository Immutability**:
   Executing patch validation results in strictly **0 mutations** to the authoritative repository:
   - Zero files created, modified, or deleted in the target repository.
   - Zero Git commits created.
   - Zero Git branches created.
   - Zero Git pull requests, tags, or pushes.
   - Zero Git resets, stashes, or cleans.
2. **Preservation of Developer Working Tree**:
   If the developer has uncommitted changes, modified files, or untracked scratch files in their authoritative working tree, those files remain 100% untouched and preserved.
3. **Mandatory BEFORE Baseline Failure Verification**:
   The target test must be executed against the unpatched baseline state first. If the test unexpectedly passes on the unpatched baseline (`BEFORE = PASS`), the validation outcome is strictly **`INCONCLUSIVE`** because a patch cannot take credit for fixing a defect that does not fail.
4. **Mandatory AFTER Target Resolution Verification**:
   After the patch is applied inside the isolated Phase 102 sandbox, the same test must pass (`AFTER = PASS`). If it still fails, the outcome is strictly **`INVALID`**.
5. **Same-Test Guarantee**:
   The validation executes the exact same `testCaseId`, steps, and configuration across both before and after runs.
6. **Independent Evidence Capture**:
   BEFORE and AFTER execution evidence (DOM snippets, screenshots, console logs, network calls, failure signatures) are captured independently into separate JSON columns (`beforeEvidenceJson` and `afterEvidenceJson`). They never overwrite or mutate each other.
7. **Targeted Regression Invariant**:
   If the target test passes after the patch, but any test in the targeted regression test suite fails (`status === 'FAIL'`), the outcome is strictly **`INVALID`**.
8. **Controlled Quality Gates**:
   Standard project quality gates (`typecheck`, `lint`, `build`) run with `cwd: sandboxRoot` under controlled timeouts and sanitized output. A failure in any configured gate yields outcome **`INVALID`**.
9. **Scope Audit Defense**:
   If the patch modifies any file outside the localization candidate files or attempts to touch protected paths, the validation outcome is strictly **`BLOCKED`**.
10. **Strict Phase 104 Boundary**:
    Applying patches to the real git branch, approving, rejecting, or opening Pull Requests belongs strictly to **Phase 104 (Human Approval, Reject & Apply Workflow)** and is strictly **NOT** executed in Phase 103.

---

## 3. Database Schema & State Machine

### Prisma Model (`DefectPatchValidation`)

```prisma
enum PatchValidationOutcome {
  VALID
  INVALID
  INCONCLUSIVE
  BLOCKED
  CANCELLED
  EXECUTION_ERROR
}

enum PatchValidationStatus {
  QUEUED
  RUNNING_BEFORE
  PATCHING
  RUNNING_AFTER
  RUNNING_REGRESSIONS
  RUNNING_GATES
  COMPLETED
  FAILED
  CANCELLED
}

model DefectPatchValidation {
  id                    String                 @id @default(uuid())
  projectId             String                 @map("project_id")
  sourceId              String                 @map("source_id")
  failureCaseId         String                 @map("failure_case_id")
  patchProposalId       String                 @map("patch_proposal_id")
  sandboxId             String                 @map("sandbox_id")
  testCaseId            String                 @map("test_case_id")

  status                PatchValidationStatus  @default(QUEUED)
  validationOutcome     PatchValidationOutcome @default(INCONCLUSIVE) @map("validation_outcome")
  validationReason      String                 @map("validation_reason")

  beforeStatus          String?                @map("before_status")
  afterStatus           String?                @map("after_status")
  targetFailureFixed    Boolean                @default(false) @map("target_failure_fixed")

  beforeEvidenceJson    Json?                  @map("before_evidence_json")
  afterEvidenceJson     Json?                  @map("after_evidence_json")

  regressionsEvaluated  Int                    @default(0) @map("regressions_evaluated")
  regressionsPassed     Int                    @default(0) @map("regressions_passed")
  regressionsFailed     Int                    @default(0) @map("regressions_failed")
  regressionDetected    Boolean                @default(false) @map("regression_detected")
  regressionResultsJson Json?                  @map("regression_results_json")

  qualityGatesPassed    Boolean                @default(false) @map("quality_gates_passed")
  typecheckStatus       String?                @map("typecheck_status")
  lintStatus            String?                @map("lint_status")
  buildStatus           String?                @map("build_status")
  qualityGatesJson      Json?                  @map("quality_gates_json")

  authoritativeMutations Int                   @default(0) @map("authoritative_mutations")
  executionDurationMs    Int?                  @map("execution_duration_ms")
  actor                  String                @default("SYSTEM")
  startedAt              DateTime              @default(now()) @map("started_at")
  completedAt            DateTime?             @map("completed_at")
  createdAt              DateTime              @default(now()) @map("created_at")
  updatedAt              DateTime              @updatedAt @map("updated_at")

  project                Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  source                 ProjectSource         @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  failureCase            FailureCase           @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  patchProposal          DefectPatchProposal   @relation(fields: [patchProposalId], references: [id], onDelete: Cascade)
  sandbox                DefectPatchSandbox    @relation(fields: [sandboxId], references: [id], onDelete: Cascade)
  testCase               TestCase              @relation(fields: [testCaseId], references: [id], onDelete: Cascade)

  @@index([projectId, failureCaseId])
  @@index([patchProposalId])
  @@index([sandboxId])
  @@index([status])
  @@map("defect_patch_validations")
}
```

---

## 4. Subsystem Components & Modules

### 1. `PatchValidationService` (`packages/core/src/patch/validation/patch-validation-service.ts`)

The main orchestrator executing the 7-phase validation pipeline:

1. **Per-Defect Mutex & Concurrency Guard**: Rejects concurrent validation requests on the same `failureCaseId` with `PatchValidationInProgressError`. Supports clean cooperative cancellation via `AbortController` and timeout enforcement.
2. **Multi-Tenant Isolation**: Enforces project ID match across `Project`, `FailureCase`, `DefectPatchProposal`, and `DefectPatchSandbox`.
3. **Mandatory BEFORE Execution**: Executes the failing test against the unpatched sandbox baseline. Verifies baseline failure.
4. **Sandbox Patch Application**: Calls Phase 102 `PatchSandboxService.applyPatch` strictly inside the sandbox filesystem.
5. **Scope Audit**: Verifies that modified files strictly match candidate files from defect localization.
6. **Mandatory AFTER Execution**: Executes the target test against the patched sandbox state. Verifies resolution.
7. **Targeted Regression Suite**: Discovers and runs prioritized regression tests.
8. **Controlled Quality Gates**: Runs `typecheck`, `lint`, and `build` npm scripts in `sandboxRoot`.
9. **Authoritative Repository Immutability Check**: Asserts `git status --porcelain` on the authoritative repo is unchanged (`authoritativeMutations === 0`).

### 2. `ValidationEvidenceCollector` (`packages/core/src/patch/validation/validation-evidence-collector.ts`)

Collects and sanitizes differential evidence:

- Redacts bearer tokens, API keys, passwords, private keys, and secrets.
- Truncates strings exceeding buffer limits (DOM snapshots to 25,000 characters, stdout/stderr to 10,000 characters).
- Computes SHA-256 failure signatures for deterministic error fingerprinting.

### 3. `TargetedRegressionSelector` (`packages/core/src/patch/validation/targeted-regression-selector.ts`)

Intelligently selects and scores candidate regression tests without running the entire monolithic suite:

- **Requirement-to-Test Traceability (+50 points)**: Sibling tests linked to the same requirements as the target defect via V4 `RequirementTestTraceService`.
- **Target File Overlap (+40 points)**: Tests that reference or import the files modified by the candidate patch.
- **Bounded Selection**: Strictly capped to `MAX_REGRESSION_TESTS = 10` tests to preserve bounded execution time.

### 4. `ControlledGateRunner` (`packages/core/src/patch/validation/controlled-gate-runner.ts`)

Executes quality gate npm scripts (`npm run typecheck`, `npm run lint`, `npm run build`) in `sandboxRoot`:

- Inspects sandbox `package.json` to identify configured scripts.
- Marks unconfigured gates as `NOT_CONFIGURED` without failing.
- Executes configured gates with 60-second timeouts and output sanitization.

### 5. `DefaultTestExecutionEngine` (`packages/core/src/patch/validation/default-test-execution-engine.ts`)

Executes test steps or npm test scripts inside the sandbox:

- If `npm test` is configured in sandbox `package.json`, invokes `npm test -- -t <testKey>`.
- Otherwise evaluates test case steps deterministically.

---

## 5. Desktop IPC Bridge & Preload API

Exposed through Electron IPC channels and typed in `@ai-quality/contracts`:

| Channel                            | Method                                          | Description                                      |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| `desktop:patch-validation:execute` | `window.desktop.patchValidation.execute(input)` | Launches full 7-phase sandboxed patch validation |
| `desktop:patch-validation:get`     | `window.desktop.patchValidation.get(input)`     | Retrieves specific validation record by ID       |
| `desktop:patch-validation:list`    | `window.desktop.patchValidation.list(input)`    | Lists validations for a failure case or proposal |
| `desktop:patch-validation:cancel`  | `window.desktop.patchValidation.cancel(input)`  | Cancels an in-progress validation execution      |

---

## 6. Desktop UI (`PatchValidationCard`)

The `PatchValidationCard` (`apps/desktop/src/renderer/features/failures/PatchValidationCard.tsx`) is seamlessly embedded inside `PatchProposalCard`:

- **Differential Before/After View**: Side-by-side comparison of baseline failure vs patched pass.
- **Targeted Regressions Tab**: Displays evaluated regression tests with duration and status badges.
- **Quality Gates Tab**: Shows real-time pass/fail status for Typecheck, Lint, and Build.
- **Scope Audit & Immutability Tab**: Confirms modified files match allowed scope and displays `0 Authoritative Mutations` badge.
- **Interactive Controls**: Execute validation button, cancel button, and skip quality gates toggle.

---

## 7. Automated Test Suite & Verification Matrix

The Phase 103 subsystem is verified by 7 dedicated test suites comprising 31 unit, integration, and adversarial tests:

| Test Suite                                                                | Tests  | Result          |
| ------------------------------------------------------------------------- | ------ | --------------- |
| `packages/core/src/patch/validation/patch-validation-contract.test.ts`    | 7      | PASS            |
| `packages/core/src/patch/validation/patch-validation-service.test.ts`     | 6      | PASS            |
| `packages/core/src/patch/validation/patch-validation-adversarial.test.ts` | 4      | PASS            |
| `packages/core/src/patch/validation/targeted-regression-selector.test.ts` | 3      | PASS            |
| `packages/core/src/patch/validation/controlled-gate-runner.test.ts`       | 3      | PASS            |
| `apps/desktop/src/main/ipc/patch-validation-handlers.test.ts`             | 6      | PASS            |
| `apps/desktop/src/main/patch-validation-ui.test.tsx`                      | 2      | PASS            |
| **Total**                                                                 | **31** | **PASS (100%)** |

All tests pass deterministically with zero errors and zero warnings under strict TypeScript and ESLint standards.
