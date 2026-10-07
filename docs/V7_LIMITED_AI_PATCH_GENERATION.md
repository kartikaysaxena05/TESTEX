# V7 Phase 101 — Limited AI Patch Generation

## 1. Overview and Architecture

Phase 101 introduces the **Limited AI Patch Generation** subsystem for the AI-Driven Software Quality Engineering Platform. It operates strictly downstream of **Phase 99 (Quick-Fix Eligibility & Safety Analysis)** and **Phase 100 (Repository-Aware Defect Localization)**.

When a defect is authoritatively classified as `decision = ELIGIBLE` by Phase 99 and mapped to verified candidate files by Phase 100, Phase 101 synthesizes a minimal, evidence-grounded source code patch **proposal**.

The patch proposal is strictly **read-only**, persisted in PostgreSQL as unified diff text and structured line edit operations, bound cryptographically and by commit hash to the exact repository snapshot, and displayed in the desktop UI for developer inspection.

```
+---------------------------------------------------------------------------------------------------+
|                        V7 Phase 101 Limited AI Patch Generation Architecture                      |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Phase 99: ELIGIBLE] + [Phase 100: candidateFiles] ---> [PatchProposalService]                    |
|                                                                  |                                |
|           +------------------------------------------------------+--------------------+           |
|           |                                                      |                    |           |
|           v                                                      v                    v           |
|   [PatchContextBuilder]                                   [PatchGenerator]     [PatchParser]      |
|   - Phase 99 Decision Gate (ELIGIBLE only)                - Allowlist Filter   - Diff Parser      |
|   - Phase 100 candidateFiles allowlist                   - Hallucination Gate - Hunk Validator   |
|   - Workspace Root Resolution                            - PATCH_BOUNDS Check - Edits Generator   |
|   - Path Traversal & Symlink Defense                     - Risk Classifier    - Canonical Diff    |
|   - Secret Redaction Filter                              - Secret Redaction                       |
|   - Prompt Injection Neutralization                      - Low/Med/High Risk                      |
|   - Revision Drift Detection                                                                      |
|           |                                                      |                    |           |
|           +------------------------------------------------------+--------------------+           |
|                                  |                                                                |
|                                  v                                                                |
|                     [DefectPatchProposal (PostgreSQL)]                                            |
|                     - Unified Diff & Structured Edits                                             |
|                     - Lines Added / Removed / Changed                                             |
|                     - Risk Level (LOW / MEDIUM / HIGH)                                            |
|                     - Repository Snapshot Binding (Revision + Branch + SHA256)                    |
|                     - Full Traceability (FailureCase, Requirement, TestCase)                       |
|                     - Rationale, Behavior Changes, Assumptions                                    |
|                     - Zero Repository Mutation Guarantee (Disk Writes = 0)                        |
|                                  |                                                                |
|                                  v                                                                |
|                     [Desktop Inspection Card]                                                     |
|                     - Side-by-side / Unified Diff Viewer                                          |
|                     - Risk Badges & Audit Warnings                                                |
|                     - Generate, Regenerate, Withdraw Controls                                     |
|                     - Handoff Ready for Phase 102 (Sandbox Isolation)                             |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Proposal-Only Subsystem**: Phase 101 produces a **proposal only**.
2. **Zero Authoritative Repository Mutations**: Strictly **NO direct file edits**, **NO patch application**, **NO Git commits**, **NO Git branches**, **NO Pull Requests (PRs)**, **NO Git pushes**, **NO deployments**, and **NO production runs**.
3. **Repository Immutability Audit**: Executing Phase 101 results in strictly **0 changes** to target repository files, verified by `git status --short` before and after execution.
4. **Mandatory Grounding Gates**:
   - Defect **MUST** have an active Phase 99 `QuickFixEligibilityAssessment` with `decision === 'ELIGIBLE'`. If `decision` is `NOT_ELIGIBLE`, `NEEDS_HUMAN_REVIEW`, or `BLOCKED`, patch generation is rejected with `PatchProposalIneligibleError`.
   - Defect **MUST** have an active Phase 100 `RepositoryDefectLocalization` with at least one verified `candidateFile`. If missing, generation is rejected with `PatchProposalLocalizationRequiredError`.
5. **Strict File Allowlist**: Patch edits are strictly confined to the `candidateFiles` approved by Phase 100. Any edit targeting an unapproved file triggers `PatchProposalUnauthorizedFileError`.
6. **Anti-Hallucination Invariant**: All target files must physically exist in the workspace, and symbols referenced in original lines must exist verbatim in the target file content. Hallucinated files or lines trigger `PatchProposalHallucinatedEntityError` or `PatchProposalMalformedDiffError`.
7. **Safe Size Boundaries (`PATCH_BOUNDS`)**:
   - $\le 3$ files changed (preference for 1).
   - $\le 50$ lines added.
   - $\le 30$ lines removed.
   - $\le 60$ total changed lines.
   - $\le 64$ KB total unified diff byte size.
     Exceeding any bound throws `PatchProposalOversizedError`.
8. **High-Risk Operation Blocking**: Dangerous operations (`rm -rf`, `DROP TABLE`, `eval(`, `exec(`, child process spawns) trigger `PatchProposalHighRiskBlockedError`. Security-sensitive files/keywords escalate patch risk level to `HIGH`.
9. **Zero-Trust Input Sanitization**: Path traversal (`..`, `.git`, `.env`, symlink escape) is blocked with `PatchProposalPathTraversalError`. Secrets (passwords, JWTs, API tokens) are redacted from all prompts, contexts, diffs, and rationale.
10. **Multi-Tenant & Mutex Isolation**: Multi-tenant scoping by `projectId` prevents cross-tenant access. In-memory mutexes serialize concurrent patch generation on the same `failureCaseId`.
11. **Explicit Phase 102 Boundary**: Phase 102 (Secure Patch Sandbox & Change Isolation) is deliberately **NOT** implemented in Phase 101. Phase 101 delivers the canonical proposal to the database and UI, ready for sandboxed validation in Phase 102.

---

## 3. Strict Safety Limits (`PATCH_BOUNDS`)

```typescript
export const PATCH_BOUNDS = {
  MAX_FILES_CHANGED: 3,
  MAX_LINES_ADDED: 50,
  MAX_LINES_REMOVED: 30,
  MAX_TOTAL_CHANGED_LINES: 60,
  MAX_DIFF_BYTE_SIZE: 64 * 1024, // 64 KB
} as const;
```

---

## 4. Risk Classification & Escalation Rules

| Risk Level  | Criteria                                                                                                                                                                 | Permitted Actions                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **LOW**     | 1 target file, $\le 10$ lines changed, touches purely internal helper or utility logic, passes all validation.                                                           | Safe for candidate consideration; highlighted with green badge.                                    |
| **MEDIUM**  | 2–3 files, 11–60 lines changed, affects internal business logic or UI presentation.                                                                                      | Requires developer review before sandboxing; amber badge.                                          |
| **HIGH**    | Touches security-sensitive files or symbols (`auth`, `password`, `token`, `secret`, `permission`, `crypto`, `session`, `jwt`, `cookie`), or contains high-risk keywords. | High-risk warning badge; requires explicit human review.                                           |
| **BLOCKED** | Contains destructive commands (`DROP TABLE`, `eval(`, `rm -rf`, shell exec) or exceeds size bounds.                                                                      | Patch rejected outright with `PatchProposalHighRiskBlockedError` or `PatchProposalOversizedError`. |

---

## 5. Database Schema (`defect_patch_proposals`)

```prisma
enum PatchProposalStatus {
  PROPOSED
  SUPERSEDED
  REJECTED
  WITHDRAWN
}

enum PatchRiskLevel {
  LOW
  MEDIUM
  HIGH
}

model DefectPatchProposal {
  id                    String              @id @default(uuid())
  projectId             String              @map("project_id")
  failureCaseId         String              @map("failure_case_id")
  repositoryId          String?             @map("repository_id")
  quickFixAssessmentId  String              @map("quick_fix_assessment_id")
  defectLocalizationId  String              @map("defect_localization_id")
  rootCauseAnalysisId   String?             @map("root_cause_analysis_id")

  proposalVersion       Int                 @default(1) @map("proposal_version")
  status                PatchProposalStatus @default(PROPOSED)
  riskLevel             PatchRiskLevel      @default(LOW) @map("risk_level")

  repositoryRevision    String              @map("repository_revision")
  branchName            String?             @map("branch_name")
  isDrifted             Boolean             @default(false) @map("is_drifted")
  sourceFileSha256      String              @map("source_file_sha256")

  targetFiles           String[]            @map("target_files")
  primaryFilePath       String              @map("primary_file_path")
  linesAdded            Int                 @default(0) @map("lines_added")
  linesRemoved          Int                 @default(0) @map("lines_removed")
  totalChangedLines     Int                 @default(0) @map("total_changed_lines")

  unifiedDiff           String              @map("unified_diff") @db.Text
  structuredEditsJson   Json                @map("structured_edits_json")

  rationale             String              @db.Text
  expectedBehaviorChange String             @map("expected_behavior_change") @db.Text
  assumptions           String[]
  riskFactors           String[]            @map("risk_factors")
  uncertainties         String[]
  evidenceReferences    String[]            @map("evidence_references")
  testReferencesJson    Json                @map("test_references_json")

  modelProvider         String?             @map("model_provider")
  modelName             String?             @map("model_name")
  promptVersion         String?             @map("prompt_version")
  patchFingerprint      String              @map("patch_fingerprint")
  generationDurationMs  Int                 @default(0) @map("generation_duration_ms")

  isReadOnlyProposal    Boolean             @default(true) @map("is_read_only_proposal")
  appliedToDisk         Boolean             @default(false) @map("applied_to_disk")
  gitCommitSha          String?             @map("git_commit_sha")

  supersededById        String?             @map("superseded_by_id")
  supersededAt          DateTime?           @map("superseded_at")
  withdrawnReason       String?             @map("withdrawn_reason")
  withdrawnAt           DateTime?           @map("withdrawn_at")

  createdAt             DateTime            @default(now()) @map("created_at")
  updatedAt             DateTime            @updatedAt @map("updated_at")

  @@index([projectId, failureCaseId])
  @@index([projectId, status])
  @@map("defect_patch_proposals")
}
```

---

## 6. IPC API Contracts

| Channel                  | Input DTO                       | Response DTO                                    | Description                                                                                                              |
| ------------------------ | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `patchProposal:generate` | `GeneratePatchProposalInputDto` | `DesktopResult<DefectPatchProposalDto>`         | Evaluates grounding, builds context, synthesizes bounded patch proposal, archives prior versions, persists new proposal. |
| `patchProposal:get`      | `GetPatchProposalInputDto`      | `DesktopResult<DefectPatchProposalDto \| null>` | Retrieves authoritative active proposal for a failure case or specific proposal ID.                                      |
| `patchProposal:list`     | `ListPatchProposalsInputDto`    | `DesktopResult<DefectPatchProposalDto[]>`       | Lists all proposal versions for a failure case.                                                                          |
| `patchProposal:withdraw` | `WithdrawPatchProposalInputDto` | `DesktopResult<DefectPatchProposalDto>`         | Marks an active proposal as `WITHDRAWN` with recorded reason and timestamp.                                              |

---

## 7. Desktop UI Inspection Features

- **PatchProposalCard**: Embedded seamlessly into the defect analysis workspace (inside `DefectReverificationCard`).
- **Eligibility Notice**: Checks and reports whether Phase 99 marked the defect `ELIGIBLE` and Phase 100 identified candidate files.
- **Snapshot Binding**: Displays repository revision, branch, SHA256 fingerprint, and warnings if revision drift is detected.
- **Unified Diff Viewer**: Colorized additions (`green`) and deletions (`red`) with line numbers and hunk headers.
- **Change Metrics**: Line counts badge (+N / -M), total changed lines, risk level indicator (`LOW` / `MEDIUM` / `HIGH`).
- **Rationale & Assumptions**: Plain-English explanations of fix rationale, expected behavior changes, and assumptions.
- **Actions**: "Generate Patch Proposal", "Regenerate Proposal" (supersedes prior version), and "Withdraw Proposal".
- **Zero-Write Transparency Notice**: Prominently informs the developer that the proposal has made 0 modifications to the repository files or git history.

---

## 8. Handoff Contract to Phase 102

Phase 101 stops cleanly at proposal persistence and presentation. The generated proposal exposes:

- Canonical `unifiedDiff` and `structuredEditsJson`.
- Source snapshot binding: `repositoryRevision` and `sourceFileSha256`.
- Target files allowlist.
- Verified test references: `testReferencesJson` (linked to authoritative test cases).

Phase 102 (Secure Patch Sandbox & Change Isolation) consumes this proposal to:

1. Create an isolated temporary directory / worktree outside the repository.
2. Verify SHA256 integrity against original files.
3. Apply the patch in the isolated sandbox.
4. Execute regression tests and report sandbox verification results without risking authoritative source code.
