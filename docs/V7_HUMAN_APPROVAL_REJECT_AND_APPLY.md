# V7 Phase 104 — Human Approval, Reject & Apply Workflow

## 1. Overview and Architecture

Phase 104 establishes the **Human Approval, Reject & Apply Workflow** for the AI-Driven Software Quality Engineering Platform. It serves as the definitive, mandatory safety gateway between automated AI patch reasoning (Phase 101), sandbox isolation (Phase 102), sandbox before/after validation (Phase 103), and the developer's real repository workspace.

The cardinal principle of Phase 104 is:
**AI-generated patches NEVER apply automatically.** Every candidate patch requires explicit, interactive human review, evaluation of validation outcomes, and conscious human approval before any file modification can occur in the project workspace.

```
+---------------------------------------------------------------------------------------------------+
|               V7 Phase 104 Human Approval, Reject & Apply Workflow Architecture                   |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [DefectPatchValidation (Phase 103)]                                                              |
|   Outcome: VALID                                                                                  |
|   Patch Hash: S_patch                                                                             |
|   Base Revision: R_base                                                                           |
|                  |                                                                                |
|                  v                                                                                |
|  +---------------------------------------------------------------------------------------------+  |
|  |                            PatchApprovalService (Phase 104)                                 |  |
|  |                                                                                             |  |
|  |  [1. Approval Record Creation]                                                              |  |
|  |     - Validation outcome must be strictly VALID (throws if INVALID, REGRESSED, etc.)        |  |
|  |     - Captures reviewedPatchHash, baseRevision, affectedFiles, diff snapshot                |  |
|  |     - Initial Status: PENDING_REVIEW                                                        |  |
|  |                                                                                             |  |
|  |  [2. Human Review & Decision Gate]                                                          |  |
|  |     |                                                                                       |  |
|  |     +---> REJECT (Human Rejection)                                                          |  |
|  |     |     - Status: REJECTED                                                                |  |
|  |     |     - Rejection Reason (INCORRECT_FIX, REGRESSION_RISK, OUT_OF_SCOPE, etc.)           |  |
|  |     |     - Source code & repository are 100% UNTOUCHED (0 mutations)                       |  |
|  |     |     - Full audit trail recorded                                                       |  |
|  |     |                                                                                       |  |
|  |     +---> APPROVE (Human Approval)                                                          |  |
|  |           - Status: APPROVED                                                                |  |
|  |           - Records reviewedBy, reviewedAt, reviewComment                                   |  |
|  |           - Repository still completely untouched at approval time                          |  |
|  |                                                                                             |  |
|  |  [3. Controlled Apply Workflow]                                                             |  |
|  |     - Status check: MUST be APPROVED (blocks PENDING_REVIEW, REJECTED, etc.)                |  |
|  |     - Base Drift Defense: Git HEAD === approval.baseRevision                                |  |
|  |     - Immutability Check: proposal.unifiedDiffHash === approval.reviewedPatchHash           |  |
|  |     - Concurrency Control: Optimistic lock on version / status transition                   |  |
|  |     - PatchApplicator: Line-level hunk application with dry-run verification                |  |
|  |     - In-Memory Backup & Reversal: Rollback in-memory files if any disk write fails          |  |
|  |     - Zero Git Actions: Strictly 0 git commits, pushes, branches, or PRs                    |  |
|  |     - Status: APPLIED (or APPLY_FAILED with clean rollback)                                 |  |
|  +---------------------------------------------------------------------------------------------+  |
|                  |                                               |                                |
|                  v                                               v                                |
|  [Authoritative Database]                            [Local Workspace Files]                      |
|  - Table: defect_patch_approvals                     - Target files modified in-place             |
|  - Status: APPROVED / REJECTED / APPLIED             - Unstaged working tree changes              |
|  - Complete Audit Trail Logs                         - 0 Git commits / pushes                     |
|                                                                                                   |
|                  |                                                                                |
|                  v                                                                                |
|  [Desktop UI: PatchApprovalCard]                                                                  |
|  - Embedded within PatchProposalCard                                                              |
|  - Review Controls (Approve Modal, Reject Modal with structured reason codes)                     |
|  - Apply Confirmation Modal with Base Revision & Hash Immutability Display                        |
|  - Full Audit Trail Inspection View                                                               |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Security Boundaries

1. **Mandatory Human Decision Gate**:
   AI or automated systems are structurally prevented from applying patches without explicit human approval. Status must transition strictly through `PENDING_REVIEW -> APPROVED -> APPLYING -> APPLIED`. Attempting to apply directly from `PENDING_REVIEW` triggers `PatchApprovalNotApprovedError`.

2. **Validation Prerequisite**:
   Approval records can only be created for patches whose Phase 103 validation outcome is strictly `VALID`. Attempting to open an approval workflow for `INVALID`, `REGRESSED`, `INCONCLUSIVE`, or `TIMED_OUT` validations triggers `PatchApprovalValidationNotValidError`.

3. **First-Class Rejection Semantics**:
   Human reviewers can reject any patch with structured reason codes (`INCORRECT_FIX`, `REGRESSION_RISK`, `INADEQUATE_TEST_COVERAGE`, `CODING_STANDARDS_VIOLATION`, `OUT_OF_SCOPE`, `PREFERS_MANUAL_FIX`, `OTHER`). Upon rejection, repository and workspace files remain **100% untouched** (0 mutations).

4. **Patch & Hash Immutability**:
   The patch hash reviewed and approved by the human (`reviewedPatchHash`) must exactly match the hash of the patch proposal being applied (`appliedPatchHash`). If the patch proposal has been tampered with or modified after approval, apply is blocked with `PatchApprovalHashMismatchError`.

5. **Repository Base Drift Defense**:
   Before modifying any workspace files during apply, `PatchApprovalService` queries the authoritative repository's current HEAD commit SHA. If the repository has advanced since the patch was generated and approved (`currentRevision !== expectedBaseRevision`), apply is blocked with `PatchApprovalRepositoryDriftError`.

6. **Scope Containment & Path Traversal Prevention**:
   The `PatchApplicator` enforces canonical absolute path resolution, containment within `projectRoot`, forbids symlink path escapes, and validates that modified files match only the authorized `affectedFiles`. Any traversal or unauthorized scope triggers `PatchApprovalScopeViolationError`.

7. **Atomic Workspace Apply with In-Memory Rollback**:
   The `PatchApplicator` conducts a two-stage apply:
   - **Stage 1 (Dry-Run)**: Reads all target files, applies hunks in-memory, verifies matching context lines, and computes new hashes without touching disk.
   - **Stage 2 (Atomic Write)**: Backs up original file contents. If any disk write encounters an I/O error or permission failure, all previously written files are immediately restored from the in-memory backups.

8. **Strictly Zero Automatic Git Commits or Pushes**:
   Applying a patch mutates workspace files on disk so the developer can review them using their IDE or `git diff`. The platform **strictly NEVER executes `git commit`**, `git push`, branch creation, or GitHub/GitLab PR creation.

9. **Concurrency & Race Condition Protection**:
   `PatchApprovalService` uses database-level status guards to ensure an approval record cannot be approved or applied multiple times concurrently. Concurrent calls fail safely with `PatchApprovalConcurrentMutationError` or `PatchApprovalAlreadyAppliedError`.

10. **Strict Phase 105 Scope Boundary**:
    Phase 104 contains **strictly 0 Phase 105 patch rollback & recovery logic**. Database schemas, Prisma migrations, contracts, IPC channels, and UI cards contain no premature Phase 105 code.

---

## 3. Database Schema & Prisma Model

The `defect_patch_approvals` table persists approval decisions, audit trails, and apply outcomes.

```prisma
enum PatchApprovalStatus {
  PENDING_REVIEW
  APPROVED
  REJECTED
  SUPERSEDED
  APPLYING
  APPLIED
  APPLY_FAILED
}

enum PatchRejectionReason {
  INCORRECT_FIX
  REGRESSION_RISK
  INADEQUATE_TEST_COVERAGE
  CODING_STANDARDS_VIOLATION
  OUT_OF_SCOPE
  PREFERS_MANUAL_FIX
  OTHER
}

model DefectPatchApproval {
  id              String  @id @default(uuid()) @db.Uuid
  projectId       String  @map("project_id") @db.Uuid
  failureCaseId   String  @map("failure_case_id") @db.Uuid
  patchProposalId String  @map("patch_proposal_id") @db.Uuid
  validationId    String  @map("validation_id") @db.Uuid
  repositoryId    String? @map("repository_id") @db.Uuid

  status PatchApprovalStatus @default(PENDING_REVIEW) @map("status")

  // Immutability & Drift Fingerprints
  reviewedPatchHash String  @map("reviewed_patch_hash") @db.VarChar(128)
  appliedPatchHash  String? @map("applied_patch_hash") @db.VarChar(128)
  baseRevision      String  @map("base_revision") @db.VarChar(128)
  appliedRevision   String? @map("applied_revision") @db.VarChar(128)

  // Review Details
  reviewedBy    String?   @map("reviewed_by") @db.VarChar(128)
  reviewedAt    DateTime? @map("reviewed_at") @db.Timestamptz(6)
  reviewComment String?   @map("review_comment") @db.Text

  // Rejection Details
  rejectionReason  PatchRejectionReason? @map("rejection_reason")
  rejectionDetails String?               @map("rejection_details") @db.Text

  // Apply Execution
  applyRequestedAt   DateTime? @map("apply_requested_at") @db.Timestamptz(6)
  applyStartedAt     DateTime? @map("apply_started_at") @db.Timestamptz(6)
  appliedAt          DateTime? @map("applied_at") @db.Timestamptz(6)
  appliedBy          String?   @map("applied_by") @db.VarChar(128)
  applyError         String?   @map("apply_error") @db.Text
  applyErrorCategory String?   @map("apply_error_category") @db.VarChar(64)

  // Scope & Impact Metrics
  affectedFiles      String[] @default([]) @map("affected_files")
  filesModifiedCount Int      @default(0) @map("files_modified_count")
  linesAdded         Int      @default(0) @map("lines_added")
  linesRemoved       Int      @default(0) @map("lines_removed")
  appliedUnifiedDiff String?  @map("applied_unified_diff") @db.Text

  // Audit Trail & Events
  auditTrailJson Json @default("[]") @map("audit_trail_json")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project       Project               @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase   FailureCase           @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  patchProposal DefectPatchProposal   @relation(fields: [patchProposalId], references: [id], onDelete: Cascade)
  validation    DefectPatchValidation @relation(fields: [validationId], references: [id], onDelete: Cascade)
  repository    ProjectSource?        @relation(fields: [repositoryId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([failureCaseId])
  @@index([patchProposalId])
  @@index([validationId])
  @@index([status])
  @@index([createdAt])
  @@map("defect_patch_approvals")
}
```

---

## 4. IPC Channels and Contract Interfaces

```typescript
// IPC Channels
PATCH_APPROVAL_GET: 'desktop:patch-approvals:get',
PATCH_APPROVAL_LIST: 'desktop:patch-approvals:list',
PATCH_APPROVAL_APPROVE: 'desktop:patch-approvals:approve',
PATCH_APPROVAL_REJECT: 'desktop:patch-approvals:reject',
PATCH_APPROVAL_APPLY: 'desktop:patch-approvals:apply',

// Error Codes
'PATCH_APPROVAL_NOT_FOUND'
'PATCH_APPROVAL_CROSS_PROJECT'
'PATCH_APPROVAL_INVALID_STATE_TRANSITION'
'PATCH_APPROVAL_VALIDATION_NOT_VALID'
'PATCH_APPROVAL_STALE_VALIDATION'
'PATCH_APPROVAL_HASH_MISMATCH'
'PATCH_APPROVAL_REPOSITORY_DRIFT'
'PATCH_APPROVAL_NOT_APPROVED'
'PATCH_APPROVAL_ALREADY_APPLIED'
'PATCH_APPROVAL_APPLY_FAILED'
'PATCH_APPROVAL_SCOPE_VIOLATION'
'PATCH_APPROVAL_CONCURRENT_MUTATION'
```

---

## 5. Verification and Quality Gates

| Suite | Tests | Result | Invariants Verified |
| :--- | :--- | :--- | :--- |
| `patch-approval-contract.test.ts` | 10 | PASS | Channel names, Zod schemas, error translation |
| `patch-approval-service.test.ts` | 8 | PASS | State machine, atomic apply, backup restoration |
| `patch-approval-adversarial.test.ts` | 10 | PASS | Drift defense, hash mismatch, path traversal, concurrency |
| `patch-approval-real-certification.test.ts` | 3 | PASS | Real git repo, zero git commits, 100% untouched on reject |
| `patch-approval-handlers.test.ts` | 8 | PASS | IPC sender validation, schema parsing, domain error sanitization |
| `patch-approval-ui.test.tsx` | 2 | PASS | Card rendering, safety invariant notice, proposal integration |
| **Total Phase 104 Tests** | **41** | **PASS** | **100% Passing** |
