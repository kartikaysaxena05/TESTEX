# V7 Phase 105 — Patch Rollback & Recovery

## 1. Overview and Architecture

Phase 105 establishes the **Patch Rollback & Recovery** subsystem for the AI-Driven Software Quality Engineering Platform. While Phase 104 provided the human approval, rejection, and apply safety gateway, Phase 105 delivers the inverse operation: a mathematically verified, non-destructive, safe rollback engine capable of reverting applied AI patches.

The cardinal principle of Phase 105 is:
**Rollback is surgical and non-destructive.** Whole-repository destructive commands (`git reset --hard`, `git clean -fd`, `git checkout .`) are strictly forbidden. Rollback operates exclusively on patch-owned hunks, preserving independent user modifications in untouched files and in non-overlapping lines of the same file.

```
+---------------------------------------------------------------------------------------------------+
|                     V7 Phase 105 Patch Rollback & Recovery Architecture                           |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [DefectPatchApproval (Phase 104)]                                                                |
|   Status: APPLIED                                                                                 |
|   Base Revision: S_0                                                                              |
|   Applied Patch Hash: S_patch                                                                     |
|                  |                                                                                |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |                            PatchRollbackService (Phase 105)                                 |  |
|  |                                                                                             |  |
|  |  [1. Rollback Planning & Dry-Run]                                                           |  |
|  |     - Dry-run verification: simulates reverse hunks without modifying disk                  |  |
|  |     - Conflict Detection: evaluates working tree against applied patch                       |  |
|  |     - Detects: OVERLAPPING_USER_CHANGES, FILE_DELETED, NEWER_PATCH_CONFLICT, DRIFT          |  |
|  |     - Computes line shifts for independent user edits within the same file                  |  |
|  |                                                                                             |  |
|  |  [2. Content-Addressed Recovery Point Creation]                                            |  |
|  |     - Pre-mutation safety snapshot stored in `.ai-recovery/<recoveryPointId>/`             |  |
|  |     - Backs up pre-rollback file contents and sha256 hashes                                 |  |
|  |     - Atomic manifest persistence                                                           |  |
|  |                                                                                             |  |
|  |  [3. Surgical Reverse Mutation (0 Git Resets)]                                              |  |
|  |     - Reverts only patch-owned lines                                                        |  |
|  |     - In-memory backup and verification                                                     |  |
|  |     - If disk write fails: immediate atomic in-memory restore + RECOVERY_REQUIRED status   |  |
|  |     - Repository verification: computes postRollbackContentHash (S_2)                       |  |
|  |                                                                                             |  |
|  |  [4. Post-Rollback Defect Reverification]                                                   |  |
|  |     - Automatically re-executes original failing test suite                                 |  |
|  |     - Asserts test fails again (defect reappears as expected)                              |  |
|  |     - Preserves all 3 test runs: Baseline (Fail) -> Verified Fix (Pass) -> Rollback (Fail) |  |
|  |                                                                                             |  |
|  |  [5. Lifecycle & Approval State Synchronization]                                            |  |
|  |     - Transitions DefectPatchRollback to COMPLETED                                          |  |
|  |     - Transitions DefectPatchApproval to ROLLED_BACK                                        |  |
|  |     - Stores full audit trail with timestamps, user info, and hash invariants               |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                               |                                |
|                  v                                               v                                |
|  [Authoritative Database]                            [Local Workspace Files]                      |
|  - Table: defect_patch_rollbacks                     - Patch lines reverted to S_0                |
|  - Table: defect_patch_approvals (ROLLED_BACK)       - User independent edits 100% preserved     |
|  - Complete Audit Trail Logs                         - Strictly 0 git resets or clean -fd         |
|                                                                                                   |
|                  |                                                                                |
|                  v                                                                                |
|  [Desktop UI: PatchRollbackCard]                                                                  |
|  - Embedded within PatchApprovalCard for APPLIED or ROLLED_BACK patches                           |
|  - Dry-Run / Conflict Detection view with visual diff preview                                    |
|  - Rollback Confirmation Modal with mandatory reason input                                        |
|  - Mathematical Invariant Comparison (S_0 baseline vs S_1 applied vs S_2 post-rollback)          |
|  - Post-Rollback Test Reverification Status Badge                                                 |
|  - Crash / Interruption Recovery Button (`resumeRecovery`)                                        |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Mathematical Invariant & Proof

### The $S_0 \rightarrow S_1 \rightarrow S_2$ Invariant

Let:
- $S_0$: The repository/file state prior to applying the patch (baseline state, where the defect reproduces).
- $S_1$: The repository/file state immediately following patch application ($S_1 = S_0 + P$, where the defect is fixed).
- $U$: Arbitrary independent user modifications made after patch application ($S_{1, \text{user}} = S_1 + U$).
- $S_2$: The repository/file state following rollback.

**Invariant 1 (Patch Line Invariant):**
For all lines $\ell \in \text{Lines}(P)$ owned by the patch:
$$\left. S_2 \right|_{\text{Lines}(P)} \equiv \left. S_0 \right|_{\text{Lines}(P)}$$

**Invariant 2 (Independent Change Preservation):**
For all lines or files $u \in U$ where $u \cap \text{Lines}(P) = \emptyset$:
$$\left. S_2 \right|_u \equiv \left. S_{1, \text{user}} \right|_u$$

**Invariant 3 (Conflict Blocking):**
If $\exists u \in U$ such that $u \cap \text{Lines}(P) \neq \emptyset$:
$$\text{RollbackStatus} \leftarrow \text{CONFLICT\_BLOCKED}, \quad S_2 \equiv S_{1, \text{user}}$$
The working tree remains **100% untouched** (0 mutations).

### Real Git Verification Evidence
The invariant was certified against real Git repositories using `packages/core/src/patch/rollback/patch-rollback-real-git.test.ts`:
1. Repo initialized at commit $S_0$:
   - `src/calculator.ts` with division bug (`return 0`).
   - Baseline test run fails (`exitCode: 1`).
2. AI Patch applied at $S_1$:
   - Patch replaces `return 0` with `return a / b`.
   - Post-patch test passes (`exitCode: 0`).
3. User introduces independent modifications:
   - File A: Added helper `src/utils.ts` (`export const helper = 42;`).
   - File B: Added new function at top of `src/calculator.ts` (`export function add(a, b) { return a + b; }`).
4. Rollback executed ($S_2$):
   - $S_2$ for patch lines in `src/calculator.ts` is identical to $S_0$ (`return 0`).
   - User's `add()` function in `src/calculator.ts` is intact and untouched.
   - User's `src/utils.ts` is intact and untouched.
   - Post-rollback test runs and asserts defect re-occurs (`exitCode: 1`).
   - Git command log verifies **zero** `git reset`, `git checkout .`, or `git clean` calls.

---

## 3. Core Safety Boundaries & Rules

1. **Zero Destructive Reset Commands**:
   The engine strictly forbids issuing destructive whole-tree commands such as `git reset --hard`, `git clean -fd`, `git checkout .`, or branch deletes. Reversions are calculated hunk-by-hunk.

2. **Pre-Mutation Recovery Points**:
   Before modifying a single file on disk during rollback, the engine creates a content-addressed snapshot in `.ai-recovery/<recoveryPointId>/manifest.json` storing complete file contents and SHA-256 hashes.

3. **Crash & Interruption Recovery**:
   If an unexpected power failure, process termination, or unhandled exception occurs during disk writes:
   - The rollback record transitions to `RECOVERY_REQUIRED`.
   - The user can invoke `resumeRecovery(rollbackId)` via Desktop IPC or UI.
   - `RollbackRecoveryManager.restoreRecoveryPoint()` restores files to the pre-rollback state atomically.

4. **Independent Edit Line-Shift Intelligence**:
   When a user inserts or deletes lines above an applied patch hunk without touching the patch lines themselves, `RollbackConflictDetector` dynamically computes the hunk offset (`lineShift`), allowing the rollback to succeed cleanly without falsely flagging a conflict.

5. **Concurrency & Optimistic Locking**:
   Rollback operations guard against double-rollback or concurrent apply/rollback races. Only approvals with `APPLIED` status are eligible for rollback, and rollback transitions use atomic database status checks.

6. **Post-Rollback Reverification Preservation**:
   Following successful rollback, the platform triggers a verification test run. All three distinct verification runs are permanently linked in the audit log:
   - Initial Defect Verification (Failed)
   - Patch Verification (Passed)
   - Post-Rollback Reverification (Failed)

---

## 4. Conflict Classification & Resolution Matrix

When planning or executing a rollback, the working tree is analyzed against the applied patch. The table below details conflict types and handling:

| Conflict Type | Condition | Action Taken | Working Tree State |
| :--- | :--- | :--- | :--- |
| `OVERLAPPING_USER_CHANGES` | User modified lines belonging to the applied patch | Block rollback, report conflict lines and diff | Untouched (0 writes) |
| `SAME_FILE_CONFLICT` | Hunk context or structure altered in a conflicting way | Block rollback, report line numbers | Untouched (0 writes) |
| `FILE_DELETED` | A file modified by the patch was deleted by user | Block rollback with `PatchRollbackFileNotFoundError` | Untouched (0 writes) |
| `FILE_MOVED` | Target file was moved or renamed | Block rollback, report missing path | Untouched (0 writes) |
| `NEWER_PATCH_CONFLICT` | A newer approved patch modified the same file | Block rollback, report newer patch ID | Untouched (0 writes) |
| `DRIFT_DETECTED` | Repository HEAD changed unexpectedly | Flag warning/block depending on affected files | Untouched (0 writes) |

---

## 5. Directory Structure & Key Artifacts

```
packages/core/src/patch/rollback/
├── rollback-types.ts               # Domain types, interfaces, DTOs
├── rollback-errors.ts              # Domain error hierarchy (PatchRollbackError + 10 subclasses)
├── rollback-conflict-detector.ts   # Context matching, shift computation, conflict classification
├── rollback-planner.ts             # Non-destructive dry-run planner & reverse edit calculator
├── rollback-recovery-manager.ts    # Content-addressed snapshot store (.ai-recovery/)
├── patch-rollback-service.ts       # Orchestrator, lifecycle management, reverification runner
├── patch-rollback-contract.test.ts # Schema, contract, and error validation tests (12 tests)
├── patch-rollback-service.test.ts  # Core service unit tests (6 tests)
├── patch-rollback-adversarial.test.ts # Conflicts, overlaps, missing files, recovery tests (4 tests)
├── patch-rollback-real-git.test.ts # Real git S0 -> S1 -> S2 mathematical invariant certification (1 test)
└── index.ts                        # Module exports

apps/desktop/src/
├── main/ipc/
│   ├── patch-rollback-handlers.ts       # Desktop IPC bridge handlers (trusted sender checked)
│   └── patch-rollback-handlers.test.ts  # IPC handler tests (6 tests)
├── preload/
│   └── index.ts                         # Exposed `window.desktopBridge.patchRollback`
└── renderer/features/failures/
    ├── PatchRollbackCard.tsx            # UI card for rollback planning, execution, diff & audit
    ├── PatchApprovalCard.tsx            # Updated with ROLLED_BACK status and card mount
    └── patch-rollback-ui.test.tsx       # React component tests (2 tests)
```

---

## 6. Verification and Test Results

The rollback subsystem was validated across 6 test suites comprising **31 automated tests**, with 100% pass rate:

1. **Contracts & Schemas (`patch-rollback-contract.test.ts`)**: 12/12 passing
2. **IPC Handlers (`patch-rollback-handlers.test.ts`)**: 6/6 passing
3. **Desktop UI (`patch-rollback-ui.test.tsx`)**: 2/2 passing
4. **Adversarial & Conflict Engine (`patch-rollback-adversarial.test.ts`)**: 4/4 passing
5. **Real Git Repository Certification (`patch-rollback-real-git.test.ts`)**: 1/1 passing
6. **Core Service Engine (`patch-rollback-service.test.ts`)**: 6/6 passing

Total: **31 / 31 passing tests (0 failures, 0 regressions)**.
Monorepo typecheck: `npm run typecheck` passes with **0 errors**.
Desktop smoke test: `npm run desktop:smoke` passes with code **0**.
