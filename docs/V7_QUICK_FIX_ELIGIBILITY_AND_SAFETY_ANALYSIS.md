# V7 Phase 99 — AI Quick-Fix Eligibility & Safety Analysis

## 1. Overview and Architecture

Phase 99 introduces the deterministic **AI Quick-Fix Eligibility & Safety Analysis** subsystem for the AI-Driven Software Quality Engineering Platform. It functions as an authoritative pre-flight safety gate that evaluates confirmed defects, repository context, Git state, and fix boundaries to certify whether an issue is safe for automated AI repair planning, requires human intervention, lacks sufficient evidence, or is strictly prohibited by safety policies.

```
+---------------------------------------------------------------------------------------------------+
|                           V7 Phase 99 Quick-Fix Eligibility Subsystem                             |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Failure Case / V6 Context] ---> [QuickFixEligibilityService]                                    |
|                                            |                                                      |
|           +--------------------------------+--------------------------------+                     |
|           |                                |                                |                     |
|           v                                v                                v                     |
|   [ScopeAnalyzer]             [BlastRadiusCalculator]             [SafetyPolicyChecker]           |
|   - Technical Localization     - RepositoryImport Graph            - Security / Crypto Paths      |
|   - RCA Repo References        - Dependent Files & Symbols         - Auth / RBAC / Sessions       |
|   - Candidate Files (max 3)    - Affected Modules                  - Financial / Payments / DDL   |
|   - Candidate Symbols (max 5)  - High-Risk Dependents              - Production CI/CD / Docker    |
|           |                                |                                |                     |
|           +--------------------------------+--------------------------------+                     |
|                                            |                                                      |
|                                            v                                                      |
|                                [GitCommandRunner]                                                 |
|                                - Working Tree Cleanliness Check                                   |
|                                - Uncommitted Modifications Check                                  |
|                                - Branch & Commit SHA Capture                                      |
|                                            |                                                      |
|                                            v                                                      |
|                                [QuickFixRulesEngine]                                              |
|                                (16 Deterministic Rule Evaluations)                                |
|                                            |                                                      |
|                                            v                                                      |
|                             [QuickFixEligibilityAssessment]                                       |
|                             - Decision: ELIGIBLE | NOT_ELIGIBLE | BLOCKED                         |
|                               NEEDS_HUMAN_REVIEW | INSUFFICIENT_EVIDENCE                          |
|                             - Risk Level: LOW | MEDIUM | HIGH | CRITICAL                          |
|                             - Confidence Score, Lineage & Supersession                            |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Strict Phase 99 Boundary**: Analysis and eligibility decisions only. Strictly **NO AI patch generation**, **NO source code editing**, **NO code fixes applied**, **NO Git commits**, **NO Git branches or PRs**, **NO production modification**, **NO deployment**, and **NO autonomous repair**. Autonomous repair planning and repository-aware code localization are reserved for Phase 100+.
2. **Read-Only Codebase Guarantee**: The eligibility subsystem executes zero mutations on repository files. The rules engine prototype contains no write, patch, or repair methods.
3. **Absolute Historical Immutability**: All original failed execution records ($E_1$), verification rerun records ($E_2$), V6 failure intelligence, and Phase 97/98 reverification artifacts remain 100% immutable.
4. **Deterministic Decision Ladder**: Every eligibility evaluation evaluates 16 stable rules with deterministic precedence:
   $$\text{BLOCKED} \succ \text{NOT\_ELIGIBLE} \succ \text{INSUFFICIENT\_EVIDENCE} \succ \text{NEEDS\_HUMAN\_REVIEW} \succ \text{ELIGIBLE}$$
5. **Multi-Tenant Scoping**: All assessments, failure cases, and repository sources are strictly isolated by `projectId`. Cross-project access is rejected with `QuickFixCrossProjectError`.
6. **Concurrency Mutex**: Per-defect in-memory mutexes serialize concurrent evaluation requests on the same `failureCaseId`.
7. **Lineage and Supersession**: New assessments on a defect preserve complete audit lineage: previous authoritative assessments have `isAuthoritative` set to `false` and `supersededById` linked to the new assessment.

---

## 3. Database Schema & Migrations

Applied Migration: `20260911102746_v7_phase99_quick_fix_eligibility_and_safety_analysis`

### Enums

```prisma
enum QuickFixEligibilityDecision {
  ELIGIBLE
  NOT_ELIGIBLE
  NEEDS_HUMAN_REVIEW
  INSUFFICIENT_EVIDENCE
  BLOCKED
}

enum QuickFixRiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

### Model: `QuickFixEligibilityAssessment`

```prisma
model QuickFixEligibilityAssessment {
  id                  String                      @id @default(uuid()) @db.Uuid
  projectId           String                      @map("project_id") @db.Uuid
  failureCaseId       String                      @map("failure_case_id") @db.Uuid
  repositoryId        String?                     @map("repository_id") @db.Uuid
  rootCauseAnalysisId String?                     @map("root_cause_analysis_id") @db.Uuid
  decision            QuickFixEligibilityDecision @default(INSUFFICIENT_EVIDENCE)
  primaryReason       String                      @map("primary_reason") @db.Text
  policyVersion       String                      @default("1.0.0") @map("policy_version") @db.VarChar(32)
  assessmentCount     Int                         @default(1) @map("assessment_count")
  isAuthoritative     Boolean                     @default(true) @map("is_authoritative")
  reassessmentReason  String?                     @map("reassessment_reason") @db.Text
  supersededById      String?                     @map("superseded_by_id") @db.Uuid

  candidateFiles       String[] @default([]) @map("candidate_files")
  candidateSymbolsJson Json     @default("[]") @map("candidate_symbols_json")
  matchedRules         String[] @default([]) @map("matched_rules")
  blockingRules        String[] @default([]) @map("blocking_rules")
  safetyWarnings       String[] @default([]) @map("safety_warnings")
  humanReviewReasons   String[] @default([]) @map("human_review_reasons")
  unknownFactors       String[] @default([]) @map("unknown_factors")

  riskFactorsJson   Json @default("{}") @map("risk_factors_json")
  blastRadiusJson   Json @default("{}") @map("blast_radius_json")
  requiredTestsJson Json @default("[]") @map("required_tests_json")
  gitStateJson      Json @default("{}") @map("git_state_json")
  metadataJson      Json @default("{}") @map("metadata_json")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project               Project                         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase           FailureCase                     @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  repository            ProjectSource?                  @relation(fields: [repositoryId], references: [id], onDelete: SetNull)
  rootCauseAnalysis     FailureRootCauseAnalysis?       @relation(fields: [rootCauseAnalysisId], references: [id], onDelete: SetNull)
  supersededBy          QuickFixEligibilityAssessment?  @relation("QuickFixSupersession", fields: [supersededById], references: [id], onDelete: SetNull)
  supersededAssessments QuickFixEligibilityAssessment[] @relation("QuickFixSupersession")

  @@index([projectId])
  @@index([failureCaseId])
  @@index([repositoryId])
  @@index([decision])
  @@index([isAuthoritative])
  @@index([createdAt])
  @@map("quick_fix_eligibility_assessments")
}
```

---

## 4. The 16 Deterministic Safety & Eligibility Rules

Every defect evaluation executes all 16 rules deterministically:

| #   | Stable Rule ID                   | Rule Name                             | Pass Condition                                                                      | Decision on Fail        | Risk Impact |
| --- | -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- | ----------- |
| 1   | `QF_REPRODUCIBLE_REQUIRED_001`   | Defect Must Be Reproduced             | At least 1 `FailureReproductionAttempt` with `status === 'REPRODUCED'`              | `NOT_ELIGIBLE`          | `HIGH`      |
| 2   | `QF_APP_FAILURE_REQUIRED_001`    | Application Defect Candidate Required | `FailureDomainSeparation` domain is `APPLICATION_DEFECT_CANDIDATE`                  | `NOT_ELIGIBLE`          | `HIGH`      |
| 3   | `QF_SECURITY_PATH_BLOCK_001`     | Security Sensitive Path Block         | No security paths (`/auth/`, `/crypto/`, `/secrets/`, `.env`, `.pem`, `..`)         | `BLOCKED`               | `CRITICAL`  |
| 4   | `QF_AUTH_PERMISSION_BLOCK_001`   | Auth & Permissions Block              | No auth/RBAC logic (`/permissions/`, `/rbac/`, `/session/`, `/roles/`)              | `BLOCKED`               | `CRITICAL`  |
| 5   | `QF_FINANCIAL_PAYMENT_BLOCK_001` | Financial & Payment Block             | No payment/billing code (`/billing/`, `/payment/`, `/stripe/`, `/invoice/`)         | `BLOCKED`               | `CRITICAL`  |
| 6   | `QF_DB_MIGRATION_BLOCK_001`      | DB Migration & Schema Block           | No migrations or DDL (`prisma/migrations/`, `schema.prisma`, `*.sql`)               | `BLOCKED`               | `CRITICAL`  |
| 7   | `QF_DEPENDENCY_CHANGE_BLOCK_001` | Dependency Manifest Review            | No dependency files (`package.json`, lockfiles, `requirements.txt`)                 | `NEEDS_HUMAN_REVIEW`    | `HIGH`      |
| 8   | `QF_PRODUCTION_CONFIG_BLOCK_001` | Production Config & CI/CD Block       | No infra/CI configurations (`.github/workflows/`, `Dockerfile`, `k8s/`)             | `BLOCKED`               | `CRITICAL`  |
| 9   | `QF_DATA_DESTRUCTIVE_BLOCK_001`  | Data Destructive Operation Block      | No drop/truncate/cascade/purge operations in symbols or cause                       | `BLOCKED`               | `CRITICAL`  |
| 10  | `QF_PUBLIC_API_BREAKING_001`     | Public API Breaking Review            | No public API route modifications (`/routes/`, `/api/`, OpenAPI)                    | `NEEDS_HUMAN_REVIEW`    | `HIGH`      |
| 11  | `QF_DIRTY_WORKTREE_BLOCK_001`    | Dirty Git Worktree Block              | Git worktree is clean (`modifiedFiles.length === 0 && untrackedFiles.length === 0`) | `BLOCKED`               | `HIGH`      |
| 12  | `QF_LARGE_SCOPE_BLOCK_001`       | Large Scope Ineligibility             | $\le 3$ candidate files AND $\le 5$ candidate symbols                               | `NOT_ELIGIBLE`          | `HIGH`      |
| 13  | `QF_BLAST_RADIUS_BLOCK_001`      | High Blast Radius Review              | $\le 10$ dependent files AND 0 high-risk callers                                    | `NEEDS_HUMAN_REVIEW`    | `HIGH`      |
| 14  | `QF_TEST_COVERAGE_REQUIRED_001`  | Test Coverage Required                | Associated test cases exist for regression fix verification                         | `INSUFFICIENT_EVIDENCE` | `MEDIUM`    |
| 15  | `QF_ROOT_CAUSE_CONFIDENCE_001`   | Root Cause Confidence Minimum         | Root cause confidence $\ge 0.6$ AND repository references count $> 0$               | `INSUFFICIENT_EVIDENCE` | `MEDIUM`    |
| 16  | `QF_SMALL_SCOPE_ELIGIBLE_001`    | Small Scope Clean Defect Eligible     | All 1–15 rules pass, scope within bounds, verified application defect               | `ELIGIBLE`              | `LOW`       |

---

## 5. Blast Radius & Scope Calculation

- **`ScopeAnalyzer`**: Ingests primary and secondary targets from `FailureTechnicalLocalization` and repository references from `FailureRootCauseAnalysis`. Normalizes paths, identifies symbols and functions, and validates scope limits ($\le 3$ files, $\le 5$ symbols).
- **`BlastRadiusCalculator`**: Queries the V2 `RepositoryImport` graph in PostgreSQL where `resolvedRelativePath` or `specifier` matches candidate files. Computes:
  - `totalDependentFiles`: Unique importing files across the repository.
  - `totalDependentSymbols`: Total symbols residing in dependent files.
  - `affectedModules`: High-level packages/folders containing dependent files.
  - `highRiskDependents`: Dependents that touch security, auth, billing, or API routes.

---

## 6. Git Working Tree Safety Inspection

- **`GitCommandRunner`**: Executes `git status --porcelain`, `git rev-parse --abbrev-ref HEAD`, and `git rev-parse HEAD` using `execFile` with `shell: false`, strict 3000ms timeouts, and maxBuffer limits.
- **Safety Invariant**: If any candidate file or the repository working tree contains uncommitted changes, rule `QF_DIRTY_WORKTREE_BLOCK_001` triggers, blocking automated fix workflows to prevent dirty state contamination.

---

## 7. Desktop IPC and Preload Bridge

### IPC Channels

| Channel                                  | Method                              | Input Schema                             | Result Schema                                                |
| ---------------------------------------- | ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `desktop:quick-fix:evaluate-eligibility` | `handleEvaluateQuickFixEligibility` | `evaluateQuickFixEligibilityInputSchema` | `DesktopResult<QuickFixEligibilityAssessmentDto>`            |
| `desktop:quick-fix:get-assessment`       | `handleGetQuickFixAssessment`       | `getQuickFixAssessmentInputSchema`       | `DesktopResult<QuickFixEligibilityAssessmentDto \| null>`    |
| `desktop:quick-fix:list-assessments`     | `handleListQuickFixAssessments`     | `listQuickFixAssessmentsInputSchema`     | `DesktopResult<readonly QuickFixEligibilityAssessmentDto[]>` |

### Security Invariants

- **`isTrustedIpcSender`**: Validates event sender origin and frame hierarchy (`parent === null` top-level frame only).
- **Zod Input Validation**: Rejects malformed parameters with `VALIDATION_ERROR`.
- **Domain Error Sanitization**: Domain errors (`QuickFixNotFoundError`, `QuickFixBlockedError`, `QuickFixCrossProjectError`, `QuickFixSafetyPolicyViolationError`) are mapped to typed `DesktopErrorCode` constants without leaking sensitive stack traces.

---

## 8. Interactive UI Component

`QuickFixEligibilityCard.tsx` provides an interface embedded directly inside the failure analysis and defect reverification workflows:

- **Decision Badges**: Distinct visual states for `ELIGIBLE` (emerald), `NOT_ELIGIBLE` (rose), `NEEDS_HUMAN_REVIEW` (amber), `INSUFFICIENT_EVIDENCE` (sky), and `BLOCKED` (red).
- **Risk Level Breakdown**: Clear color-coded risk badge (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Scope & Blast Radius Grid**: Displays candidate files, symbol counts, dependent file counts, and affected modules.
- **Git Worktree Status**: Live indicator showing clean worktree vs uncommitted modifications.
- **Rules Matrix**: Itemized list of all satisfied rules with checkmarks and blocking violations with warning callouts.
- **Strict Boundary Notice**: Prominent banner confirming: _"Phase 99: Analysis & Eligibility Only. AI patch generation, source code editing, Git commits, and autonomous repair are strictly disabled."_

---

## 9. Verification & Test Certification

The subsystem has been certified with 44 dedicated unit and integration tests across 6 test suites with a **100% pass rate**:

1. `packages/core/src/quick-fix/quick-fix-contract.test.ts`: Contracts, Zod schemas, enum values, DTO validation, and channel constants. (10/10 tests pass)
2. `packages/core/src/quick-fix/rules/quick-fix-rules-engine.test.ts`: Individual testing of all 16 deterministic rules, pass/fail conditions, and decision precedence ladder. (17/17 tests pass)
3. `packages/core/src/quick-fix/quick-fix-eligibility-service.test.ts`: Service lifecycle, multi-tenant boundary checks, Git state inspection, supersession management, and concurrency mutex. (4/4 tests pass)
4. `packages/core/src/quick-fix/quick-fix-adversarial.test.ts`: Path traversal attacks (`../../etc/passwd`), destructive keyword injection, financial symbol cloaking, database migration tampering, and the zero-modification invariant. (5/5 tests pass)
5. `apps/desktop/src/main/ipc/quick-fix-handlers.test.ts`: Main process IPC handlers, sender validation, Zod validation, error sanitization, and channel dispatch. (6/6 tests pass)
6. `apps/desktop/src/main/quick-fix-ui.test.tsx`: Server-rendered React tests for `QuickFixEligibilityCard` rendering, empty states, evaluate controls, boundary disclaimers, and seamless embedding inside `DefectReverificationCard`. (2/2 tests pass)

### Regression Test Suite Status

- `npm run test:verification` (Phase 98): 37/37 tests pass
- `npm run test:reverification` (Phase 97): 47/47 tests pass
- `npm run test:workflow` (Phase 96): 25/25 tests pass
- `npm run test:email` (Phase 95): 25/25 tests pass
- `npm run test:jira` (Phases 89–94): 305/305 tests pass
- `npm run desktop:smoke`: Pass (exit code 0)
- `npm run typecheck`: Pass (all workspaces exit code 0)
