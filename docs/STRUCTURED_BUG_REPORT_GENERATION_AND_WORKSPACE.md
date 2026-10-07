# V6 Phase 87: Structured Bug Report Generation & Failure Intelligence Workspace

## 1. Overview & Purpose

Phase 87 implements **Structured Bug Report Generation & Failure Intelligence Workspace**, transforming verified, multi-phase failure intelligence (Phases 74–86) into an auditable, structured internal defect and diagnostic report format.

This subsystem provides:

1. **Defect Eligibility Evaluation**: Deterministic gating separating confirmed application defects from test automation failures, test data issues, environment outages, and flakiness.
2. **Reproduction Step Derivation**: Concrete step-by-step reproduction instructions derived directly from recorded step execution telemetry (`StepExecutionRecord`), complete with target elements and payloads.
3. **Traceability Matrix**: Immutable linking to historical test case version, requirement version, and active executable test plan.
4. **Epistemic Humility & Framing**: Root-cause conclusions framed strictly as `[HYPOTHESIS]`, clearly separated from verified execution facts and deterministic inferences.
5. **Rigorous Secret Redaction**: Multi-layer sanitization of passwords, API keys, bearer tokens, session identifiers, and database connection strings across markdown bodies, summaries, titles, and telemetry objects.
6. **Immutable Revision History**: Revision tracking (Rev 1, Rev 2, ...) with mandatory audit reasons, forward and backward links (`supersedesId`, `supersededById`), and state transitions.
7. **Interactive Desktop Failure Workspace**: Desktop renderer panel (`StructuredBugReportPanel`) embedded within the failure cases view, offering real-time report generation, tabbed Markdown preview, raw metadata inspection, regeneration dialogs, and revision history.

---

## 2. Core Architectural Principles & Invariants

### 2.1 Scope Separation & Non-V7 Boundaries

- **Internal Platform Defect Reports**: Structured bug reports are strictly internal analytical artifacts stored within the database and displayed in the desktop application.
- **Strictly No External Systems (V7)**: No Jira, GitHub Issues, Linear, or Bugzilla ticket sync; no Slack/email notifications; no engineer assignment workflows; no auto-patching or automated code fixes.

### 2.2 Eligibility Gating & Defect States

A failure case is evaluated by `BugReportEligibilityEvaluator` into one of the canonical defect states:

- `CONFIRMED_APPLICATION_DEFECT`: Failure domain candidate confirmed through deterministic reproduction (`isApplicationDefect: true`).
- `SUPPORTED_APPLICATION_DEFECT`: Candidate supported by classification or AI reasoning but not yet deterministically reproduced (`isApplicationDefect: true`).
- `AUTOMATION_FAILURE`: Diagnostic report for selector failure, framework crash, or locator timeout (`isApplicationDefect: false`).
- `TEST_DATA_FAILURE`: Diagnostic report for missing database records, fixtures, or mocks (`isApplicationDefect: false`).
- `ENVIRONMENT_FAILURE`: Diagnostic report for network partition, gateway timeout, or backend outage (`isApplicationDefect: false`).
- `FLAKY_UNSTABLE_FAILURE`: Diagnostic report for intermittent non-deterministic execution (`isApplicationDefect: false`).
- `BLOCKED_EXECUTION`: Preconditions or test execution prerequisites unfulfilled (`isApplicationDefect: false`).
- `INCONCLUSIVE`: Conflicting signals without decisive resolution (`isApplicationDefect: false`).
- `UNKNOWN`: Missing telemetry or unanalyzed state (`isApplicationDefect: false`).

### 2.3 Derived Step-by-Step Reproduction Procedure

Reproduction steps are reconstructed deterministically from `StepExecutionRecord` entities:

- Steps ordered by sequence index (`stepIndex`).
- Action types (`NAVIGATE`, `CLICK`, `FILL`, `ASSERT`, etc.) and target summaries.
- Payload parameters with sensitive values redacted.
- Clear identification of the exact failure step and execution halt point.

### 2.4 Traceability Matrix & Historical Linking

Reports link to the specific execution versions that generated the failure:

- Requirement key and requirement historical version.
- Test case key and test case historical version.
- Executable test plan identity and SHA-256 fingerprint.

### 2.5 Multi-Layer Secret Sanitization

Both algorithmic regex rules and registered known plaintext secrets are sanitized:

- Passwords (`password: [REDACTED]`, `postgres://user:[REDACTED]@host...`).
- Bearer tokens (`Bearer [REDACTED]`).
- Sensitive query parameters (`?token=[REDACTED]`, `&apiKey=[REDACTED]`).
- Cookies and session tokens.
- Inputs into password fields (`input[name="password"]`).

### 2.6 Immutable Revision History & Staleness Detection

- Initial report starts at `revision: 1`.
- User-initiated re-evaluations create `revision: 2`, with required audit reason, setting `supersedesId` to the previous report and marking previous as `SUPERSEDED`.
- Staleness is computed dynamically by comparing `generatedAt` against newer evidence attachments, reclassifications, or reproduction attempts.

---

## 3. Data Model & Storage (`StructuredBugReport`)

Prisma model `StructuredBugReport` persists each report revision:

```prisma
model StructuredBugReport {
  id                   String            @id @default(uuid()) @db.Uuid
  projectId            String            @map("project_id") @db.Uuid
  failureCaseId        String            @map("failure_case_id") @db.Uuid
  failureAnalysisRunId String?           @map("failure_analysis_run_id") @db.Uuid
  reportNumber         String            @map("report_number") @db.VarChar(32)
  revision             Int               @default(1)
  status               BugReportStatus   @default(READY) @map("status")
  defectState          String            @map("defect_state") @db.VarChar(64)
  isApplicationDefect  Boolean           @map("is_application_defect")
  title                String            @db.VarChar(256)
  summary              String            @db.Text
  reportMarkdown       String            @map("report_markdown") @db.Text
  reportFingerprint    String            @map("report_fingerprint") @db.VarChar(64)
  generatorVersion     String            @default("1.0.0") @map("generator_version") @db.VarChar(32)

  // Versioned Traceability
  testCaseId           String?           @map("test_case_id") @db.Uuid
  testCaseKey          String?           @map("test_case_key") @db.VarChar(64)
  testCaseVersion      Int?              @map("test_case_version")
  requirementId        String?           @map("requirement_id") @db.Uuid
  requirementKey       String?           @map("requirement_key") @db.VarChar(64)
  requirementVersion   Int?              @map("requirement_version")

  // Telemetry & Steps
  preconditionsJson      Json            @default("[]") @map("preconditions_json")
  reproductionStepsJson  Json            @default("[]") @map("reproduction_steps_json")
  expectedBehavior       String          @map("expected_behavior") @db.Text
  actualBehavior         String          @map("actual_behavior") @db.Text
  failedStepIndex        Int?            @map("failed_step_index")

  // Hypotheses & Localization
  rootCauseHypothesis  String?           @map("root_cause_hypothesis") @db.Text
  probableLayer        String?           @map("probable_layer") @db.VarChar(64)
  probableComponent    String?           @map("probable_component") @db.VarChar(255)

  // Impact & Confidence
  severity             String?           @db.VarChar(32)
  priority             String?           @db.VarChar(32)
  clusterKey           String?           @map("cluster_key") @db.VarChar(64)
  clusterMemberCount   Int?              @map("cluster_member_count")
  calibratedScore      Float?            @map("calibrated_score")
  evidenceReferencesJson Json            @default("[]") @map("evidence_references_json")
  limitationsJson      Json              @default("[]") @map("limitations_json")

  // Revisioning & Audit
  regenerationReason   String?           @map("regeneration_reason") @db.Text
  supersedesId         String?           @map("supersedes_id") @db.Uuid
  supersededById       String?           @map("superseded_by_id") @db.Uuid
  isStale              Boolean           @default(false) @map("is_stale")
  stalenessReason      String?           @map("staleness_reason") @db.Text

  createdAt            DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime          @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project              Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase          FailureCase       @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)

  @@unique([projectId, failureCaseId, revision])
  @@index([projectId, status])
  @@index([failureCaseId, revision])
  @@map("structured_bug_reports")
}
```

---

## 4. Subsystem Components

1. **`BugReportEligibilityEvaluator`**:
   - Analyzes upstream domain separation, deterministic classification, flakiness analysis, and reproduction outcomes.
   - Evaluates whether the incident is a genuine application defect (`CONFIRMED_APPLICATION_DEFECT` or `SUPPORTED_APPLICATION_DEFECT`) or a test automation diagnostic report.
2. **`BugReportGenerator`**:
   - Synthesizes all multi-phase facts into structured data DTOs and formatted Markdown.
   - Scans facts for secrets and applies multi-layered sanitization.
   - Derives reproduction steps and expected vs actual behavior.
   - Computes deterministic SHA-256 fingerprint across all report attributes.
3. **`StructuredBugReportService`**:
   - Enforces per-case serialization via `withLock` to prevent concurrent race conditions.
   - Manages creation, retrieval, listing with pagination, and regeneration with revision history.
   - Enforces strict project boundary security (`assertCaseAccess`).
4. **Desktop IPC Handlers & Renderer**:
   - IPC channels: `desktop:failure:create-bug-report`, `desktop:failure:get-bug-report`, `desktop:failure:list-bug-reports`, `desktop:failure:regenerate-bug-report`, `desktop:failure:list-bug-report-history`.
   - UI component: `StructuredBugReportPanel` with tabbed views (Report Preview, Metadata & Evidence, Audit History) and regeneration dialog.
