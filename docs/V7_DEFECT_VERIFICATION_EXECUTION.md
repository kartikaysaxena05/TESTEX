# V7 Phase 98 — Automated Failed-Test Rerun & Fix Verification

## 1. Overview and Architecture

Phase 98 delivers the authoritative, deterministic rerun and fix verification subsystem for the AI-Driven Software Quality Engineering Platform. It bridges defect reverification planning (Phase 97) with live, browser-driven fix confirmation.

When a bug is marked resolved or a fix is deployed, the verification execution engine reruns the historical test against the updated target environment, executes every step in a real Playwright headless browser, records a dedicated verification execution record ($E_2$), performs deep structural comparison against the original failed execution ($E_1$), and deterministically classifies the fix outcome.

```
+---------------------------------------------------------------------------------------------------+
|                                  V7 Phase 98 Fix Verification Subsystem                          |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Reverification Plan] ---> [DefectVerificationService]                                           |
|                                       |                                                           |
|                     +-----------------+-----------------+                                         |
|                     |                                   |                                         |
|           [Environment Safety]                [Playwright Browser]                                |
|           - Production Safety Policy           - Real Chromium / WebKit / Firefox                 |
|           - Mutating Action Blocker            - Real-time step execution                         |
|           - Disabled Target Blocker            - Evidence capture (screenshot, DOM, log)          |
|                                                         |                                         |
|                                                         v                                         |
|                                              [Verification Run E2]                                |
|                                              (New Execution Identity)                             |
|                                                         |                                         |
|                                                         v                                         |
|  [Original Failure E1] ---------------------> [VerificationComparator]                            |
|  (Strictly Immutable)                                   |                                         |
|                                                         v                                         |
|                                              [Deterministic Outcome]                              |
|                                              - VERIFIED_FIXED                                     |
|                                              - STILL_FAILING                                      |
|                                              - DIFFERENT_FAILURE                                  |
|                                              - BLOCKED                                            |
|                                              - CANCELLED                                          |
|                                              - EXECUTION_ERROR                                    |
|                                              - INCONCLUSIVE                                       |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Strict Phase 98 Boundary**: Verification rerun and fix comparison only. Strictly **no AI patch generation**, **no source code editing**, **no Git commits/PRs**, **no auto-deployment**, and **no automated repair planning**. Repair planning and eligibility scoring are strictly reserved for Phase 99+.
2. **Absolute Historical Immutability ($E_1$)**: The original failed test execution record ($E_1$), its step executions, assertion records, and V6 failure intelligence remain 100% immutable. $E_1$ is never modified, deleted, or marked `PASSED`.
3. **Dedicated Verification Identity ($E_2$)**: Every verification attempt generates a completely distinct, standalone `TestCaseExecution` record ($E_2$) linked to a newly generated `TestRun` and recorded in `DefectVerificationAttempt`.
4. **V5 Execution Engine Reuse**: Execution utilizes the established, production-grade `PlaywrightBrowserProvider` and `ExecutionPersistenceService`. No ad-hoc or duplicated browser runners are introduced.
5. **Deterministic Comparison Engine**: Rerun results are compared against $E_1$ deterministically via `VerificationComparator`. No heuristic guessing or hallucinated outcomes.
6. **Production Safety Policy**: Executions targeting production environments are evaluated strictly. Mutating steps (POST, PUT, DELETE, mutate, form submissions) or prohibited configurations immediately evaluate to `BLOCKED`.
7. **Per-Defect Mutex**: Concurrent verification requests on the same defect (`failureCaseId`) are strictly serialized via memory mutex locks to eliminate race conditions.
8. **Multi-Tenant Isolation**: Every database query, attempt record, and comparison operation is strictly scoped by `projectId`. Cross-project access is rejected with `VerificationCrossProjectForbiddenError`.

---

## 3. Database Schema & Migrations

Applied Migration: `20260911100755_v7_phase98_defect_verification_execution`

### Enums

- **`VerificationOutcome`**:
  - `VERIFIED_FIXED`: Test passed cleanly with all steps and assertions succeeding.
  - `STILL_FAILING`: Test failed at the same step with a matching failure signature or behavior.
  - `DIFFERENT_FAILURE`: Test failed at a different step or with an unrelated error.
  - `BLOCKED`: Pre-flight safety or environmental constraint prevented execution.
  - `INCONCLUSIVE`: Execution finished with ambiguous or incomplete data.
  - `CANCELLED`: Execution was explicitly cancelled by the user.
  - `EXECUTION_ERROR`: Browser crash, driver disconnection, or harness fault.

- **`VerificationMode`**:
  - `HISTORICAL`: Re-executes the exact historical test version that failed.
  - `CURRENT`: Re-executes the latest test version, detecting specification drift.

### Models

#### `DefectVerificationAttempt`

```prisma
model DefectVerificationAttempt {
  id                                   String                @id @default(uuid()) @db.Uuid
  projectId                            String                @db.Uuid
  reverificationId                     String                @db.Uuid
  failureCaseId                        String                @db.Uuid
  originalExecutionId                  String                @db.Uuid
  verificationExecutionId              String?               @db.Uuid
  verificationMode                     VerificationMode      @default(HISTORICAL)
  testCaseId                           String                @db.Uuid
  originalTestCaseVersionId            String?               @db.Uuid
  originalTestCaseVersionNumber        Int
  verificationTestCaseVersionId        String?               @db.Uuid
  verificationTestCaseVersionNumber    Int
  testVersionDifference                String?
  originalRequirementVersionNumber     Int?
  verificationRequirementVersionNumber Int?
  attemptNumber                        Int
  targetEnvironmentId                  String?               @db.Uuid
  browserEngine                        String                @default("chromium")
  status                               VerificationOutcome
  originalFailureSignature             String?
  verificationFailureSignature         String?
  isSignatureMatch                     Boolean?
  environmentEquivalence               String                @default("UNKNOWN")
  environmentComparisonJson            Json?
  blockerReason                        String?
  startedAt                            DateTime              @default(now()) @db.Timestamptz(6)
  completedAt                          DateTime?             @db.Timestamptz(6)
  executionDurationMs                  Int?
  metadataJson                         Json?
  createdAt                            DateTime              @default(now()) @db.Timestamptz(6)
  updatedAt                            DateTime              @updatedAt @db.Timestamptz(6)

  project            Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  reverification     DefectReverification  @relation(fields: [reverificationId], references: [id], onDelete: Cascade)
  failureCase        FailureCase           @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  originalExecution  TestCaseExecution     @relation("VerificationOriginalExecution", fields: [originalExecutionId], references: [id], onDelete: Restrict)
  verificationExec   TestCaseExecution?    @relation("VerificationRerunExecution", fields: [verificationExecutionId], references: [id], onDelete: SetNull)

  @@unique([reverificationId, attemptNumber])
  @@index([projectId])
  @@index([failureCaseId])
  @@index([status])
}
```

---

## 4. Verification Subsystem Architecture

### `DefectVerificationService`

- **Location**: `packages/core/src/verification/defect-verification-service.ts`
- **Responsibilities**:
  - Validates tenant authorization and input schema.
  - Acquires per-defect concurrency mutex.
  - Resolves defect reverification record and historical execution ($E_1$).
  - Evaluates target environment safety policies (`SAFE_MODE`, `PROHIBITED`).
  - Launches headless Playwright instance via `PlaywrightBrowserProvider`.
  - Executes step actions sequentially (`NAVIGATE`, `CLICK`, `FILL`, `ASSERT`).
  - Records step results and captures screenshots / DOM state upon failure.
  - Computes verification failure signatures via `FailureSignatureGenerator`.
  - Invokes `VerificationComparator` to generate deterministic outcome.
  - Persists `DefectVerificationAttempt` and writes `ReverificationAuditEvent`.
  - Updates `DefectReverification` status and outcome.

### `VerificationComparator`

- **Location**: `packages/core/src/verification/verification-comparator.ts`
- **Deterministic Outcome Rules**:
  - `verificationExecutionStatus === 'BLOCKED'` or `blockerReason != null` -> `BLOCKED`
  - `verificationExecutionStatus === 'CANCELLED'` -> `CANCELLED`
  - `verificationExecutionStatus === 'AUTOMATION_ERROR'` -> `EXECUTION_ERROR`
  - `verificationExecutionStatus === 'PASSED'` and all assertions pass -> `VERIFIED_FIXED`
  - `verificationExecutionStatus === 'FAILED'`:
    - If `verificationSignature === originalSignature` OR failing step index and action match -> `STILL_FAILING`
    - Otherwise -> `DIFFERENT_FAILURE`

---

## 5. Desktop IPC & Preload Layer

### IPC Channels (`packages/contracts/src/index.ts`)

- `desktop:verification:execute`: Trigger fix verification rerun for a defect.
- `desktop:verification:get-attempts`: List all verification attempts for a defect.
- `desktop:verification:get-comparison`: Get deep comparison details for an attempt.
- `desktop:verification:cancel`: Request cancellation of an active verification rerun.

### Security Defenses

- Sender frame validation: Rejects calls from unauthorized or cross-origin renderer frames.
- Strict Zod validation: Every payload validated against type schemas before execution.
- Domain error sanitization: Normalizes internal stack traces into client-safe DTOs.

---

## 6. Desktop UI

### `DefectVerificationPanel`

- **Location**: `apps/desktop/src/renderer/features/failures/DefectVerificationPanel.tsx`
- **Features**:
  - Mode selector: Toggle between `HISTORICAL` (exact test version) and `CURRENT` (latest version).
  - Attempt limit selector: Configure attempts (1 to 5).
  - Execute Verification button with live spinning progress indicators.
  - Active verification cancellation button.
  - Outcome summary badge (`VERIFIED_FIXED`, `STILL_FAILING`, `DIFFERENT_FAILURE`, `BLOCKED`).
  - Side-by-side comparison view ($E_1$ vs $E_2$) detailing step-by-step status, durations, and error messages.
  - Historical attempts log table with timestamp, mode, version, duration, and status.

### `DefectReverificationCard`

- Embedded directly within `DefectReverificationCard.tsx` under a dedicated Fix Verification section.

---

## 7. Verification & Certification Results

All 37 test cases in Phase 98 passed with zero failures:

1. **Contracts & Schemas (`verification-contract.test.ts`)**: 12/12 passing.
2. **Deterministic Comparator (`verification-comparator.test.ts`)**: 6/6 passing.
3. **Service Integration (`defect-verification-service.test.ts`)**: 8/8 passing.
4. **Real Playwright Browser Certification (`verification-real-browser-certification.test.ts`)**: 2/2 passing.
5. **IPC Handlers (`verification-handlers.test.ts`)**: 7/7 passing.
6. **UI Components (`verification-ui.test.tsx`)**: 2/2 passing.

**Total**: 37 tests across 6 suites, 0 failures.
**Full Monorepo Regressions**: Reverification (47/47), Workflow Sync (78/78), Email (25/25), Jira (305/305), Failures (570/570), Desktop Smoke passed.
