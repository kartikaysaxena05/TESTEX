# V7 Phase 100 — Repository-Aware Defect Localization

## 1. Overview and Architecture

Phase 100 introduces the deterministic **Repository-Aware Defect Localization** subsystem for the AI-Driven Software Quality Engineering Platform. It bridges confirmed runtime failures, execution traces, DOM actions, network telemetry, and V6 root cause intelligence directly with real repository source code, AST symbols, route handlers, and UI components.

The subsystem evaluates multi-signal evidence, validates that candidate entities exist in the authoritative repository index (0 hallucinations tolerated), detects Git revision drift between test failure time and current repository state, computes calibrated candidate confidence scores, and enables safe read-only source inspection without altering a single line of target repository source code.

```
+---------------------------------------------------------------------------------------------------+
|                       V7 Phase 100 Defect Localization Subsystem Architecture                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Failure Case / V6 Context] ---> [DefectLocalizationService]                                     |
|                                            |                                                      |
|           +--------------------------------+--------------------------------+                     |
|           |                                |                                |                     |
|           v                                v                                v                     |
|   [Signal Correlators]            [Symbol Graph Expander]         [CandidateValidator]            |
|   - NetworkRouteCorrelator        - AST Import Traversal          - Anti-Hallucination Gate       |
|   - UiComponentCorrelator         - Caller Graph Traversal        - Path Traversal Defense        |
|   - StackTraceCorrelator          - Depth-Bounded (<= 3)          - Symlink Escape Defense        |
|   - SourceMapResolver             - File/Symbol Enrichment        - Secret Redaction Filter       |
|           |                                |                                |                     |
|           +--------------------------------+--------------------------------+                     |
|                                            |                                                      |
|                                            v                                                      |
|                                 [CandidateRanker]                                                 |
|                                 - Deterministic Evidence Weights                                  |
|                                 - Multi-Signal Convergence Boost                                  |
|                                 - Disambiguation of Named Clones                                  |
|                                 - Contradicting Evidence Penalty                                  |
|                                 - Score Normalization in [0, 1]                                   |
|                                            |                                                      |
|                                            v                                                      |
|                          [RepositoryDefectLocalization]                                           |
|                          - Top Candidate Spotlight                                                |
|                          - Ranked Candidates List                                                 |
|                          - Revision Drift Detection (EXACT vs DRIFTED)                            |
|                          - Requirement-to-Test-to-Source Traceability                             |
|                          - Safe Read-Only Source Content Inspection                               |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Strict Scope Boundaries

1. **Strict Read-Only Repository Guarantee**: Defect localization is strictly read-only against the target repository. Strictly **NO source code modification**, **NO patch generation**, **NO AI-written replacement code**, **NO file edits**, **NO Git commits**, **NO Git branches or PRs**, **NO production modification**, and **NO deployment**. Autonomous repair and patch generation are strictly reserved for Phase 101+.
2. **Target Repository Source Mutations = 0**: Every localization execution guarantees that 0 target repository files are modified, staged, or committed.
3. **Absolute Historical Immutability**: All original failed execution records ($E_1$), verification rerun records ($E_2$), V6 failure intelligence, and Phase 97–99 records remain 100% immutable.
4. **Anti-Hallucination Invariant**: All candidate files and symbols returned to the user or stored in the database MUST exist in the verified repository index. Fabricated or hallucinated entities proposed by external agents or heuristics are filtered out and rejected.
5. **Path Traversal & Symlink Defense**: Candidate files and source inspection paths are checked against directory traversal (`..`, absolute paths, forbidden prefixes) and symlink escape boundaries.
6. **Revision Drift Awareness**: Detects and reports whether repository HEAD matches the exact commit where the failure was observed (`EXACT_REVISION`), has diverged (`DRIFTED_REVISION`), or if commit metadata is absent (`UNKNOWN`).
7. **Multi-Tenant Scoping**: All localizations, failure cases, and repository sources are strictly isolated by `projectId`. Cross-project access is rejected with `DefectLocalizationCrossProjectError`.
8. **Concurrency Mutex**: In-memory mutexes serialize concurrent localization requests on the same `failureCaseId`.
9. **Lineage and Supersession**: Re-localizing a defect creates a new authoritative version while marking previous records `isAuthoritative = false` and setting `supersededById`.

---

## 3. Database Schema & Migration

Applied Migration: `20260911104256_v7_phase100_repository_aware_defect_localization`

### Enums

```prisma
enum RepositoryRevisionState {
  EXACT_REVISION
  DRIFTED_REVISION
  EQUIVALENT_REVISION
  HISTORICAL_REVISION_UNAVAILABLE
  UNKNOWN
}

enum DefectCandidateType {
  FILE
  FUNCTION
  CLASS
  METHOD
  COMPONENT
  ROUTE
  SERVICE
  MIDDLEWARE
  CONFIGURATION
}
```

### Model: `RepositoryDefectLocalization`

```prisma
model RepositoryDefectLocalization {
  id                   String                   @id @default(uuid()) @db.Uuid
  projectId            String                   @map("project_id") @db.Uuid
  failureCaseId        String                   @map("failure_case_id") @db.Uuid
  repositoryId         String?                  @map("repository_id") @db.Uuid
  rootCauseAnalysisId  String?                  @map("root_cause_analysis_id") @db.Uuid
  quickFixAssessmentId String?                  @map("quick_fix_assessment_id") @db.Uuid
  repositoryRevision   String                   @default("HEAD") @map("repository_revision") @db.VarChar(128)
  failureTimeRevision  String?                  @map("failure_time_revision") @db.VarChar(128)
  branchName           String?                  @map("branch_name") @db.VarChar(128)
  revisionState        RepositoryRevisionState  @default(UNKNOWN) @map("revision_state")
  isDrifted            Boolean                  @default(false) @map("is_drifted")
  driftDetails         String?                  @map("drift_details") @db.Text
  topCandidateFilePath String?                  @map("top_candidate_file_path") @db.VarChar(512)
  topCandidateSymbolName String?                @map("top_candidate_symbol_name") @db.VarChar(255)
  topCandidateScore    Float?                   @map("top_candidate_score")
  topCandidateType     DefectCandidateType?     @map("top_candidate_type")
  candidateFiles       String[]                 @default([]) @map("candidate_files")
  rankedCandidatesJson Json                     @default("[]") @map("ranked_candidates_json")
  supportingEvidenceJson Json                   @default("[]") @map("supporting_evidence_json")
  contradictingEvidenceJson Json                 @default("[]") @map("contradicting_evidence_json")
  traceabilityJson     Json                     @default("{}") @map("traceability_json")
  analysisDurationMs   Int                      @default(0) @map("analysis_duration_ms")
  localizationVersion  Int                      @default(1) @map("localization_version")
  isAuthoritative      Boolean                  @default(true) @map("is_authoritative")
  relocalizationReason String?                  @map("relocalization_reason") @db.Text
  supersededById       String?                  @map("superseded_by_id") @db.Uuid
  createdAt            DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)

  project              Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase          FailureCase              @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  projectSource        ProjectSource?           @relation(fields: [repositoryId], references: [id], onDelete: SetNull)
  rootCauseAnalysis    FailureRootCauseAnalysis? @relation(fields: [rootCauseAnalysisId], references: [id], onDelete: SetNull)
  quickFixAssessment   QuickFixEligibilityAssessment? @relation(fields: [quickFixAssessmentId], references: [id], onDelete: SetNull)
  supersededBy         RepositoryDefectLocalization? @relation("LocalizationSupersession", fields: [supersededById], references: [id], onDelete: SetNull)
  supersededRecords    RepositoryDefectLocalization[] @relation("LocalizationSupersession")

  @@index([projectId, failureCaseId, isAuthoritative], name: "idx_rep_defect_loc_proj_fc_auth")
  @@index([repositoryRevision], name: "idx_rep_defect_loc_revision")
  @@map("repository_defect_localizations")
}
```

---

## 4. Signal Correlator Subsystem

The localization engine extracts multiple heterogeneous runtime signals and maps them to repository assets:

1. **`NetworkRouteCorrelator`**:
   - Parses HTTP endpoints and route paths from failed actions, network collector evidence, and technical localization.
   - Tokenizes path segments and matches them against repository route definitions, controller classes, and service files.
2. **`UiComponentCorrelator`**:
   - Extracts failed DOM selectors, test target elements, and UI component contexts.
   - Correlates DOM selectors with React (`.tsx`/`.jsx`), Vue (`.vue`), or Svelte (`.svelte`) components and identifies associated event handlers (e.g., `handleSubmit`, `onClick`).
3. **`StackTraceCorrelator`**:
   - Parses error stack frames from runtime exceptions, Playwright logs, and console error collector evidence.
   - Correlates frame file paths and line numbers directly to AST symbols and line ranges in the repository index.
4. **`SourceMapResolver`**:
   - Inspects the repository for source map files (`.map`) and build manifests.
   - Truthfully reports source map resolution state (`AVAILABLE`, `GENERATED`, or `UNAVAILABLE`) without hallucinating mappings.
5. **`SymbolGraphExpander`**:
   - Performs bounded AST graph exploration (depth $\le 3$) across imports and caller references.
   - Enriches candidate files with related services, utilities, and helper functions that participate in the failure call path.

---

## 5. Candidate Ranking & Anti-Hallucination Engine

### Anti-Hallucination Validation (`CandidateValidator`)

- Every candidate fact must have its file path verified against the active `RepositoryFile` index.
- If an entity or file does not exist in the repository, it is omitted.
- If a symbol name was proposed but is absent in the target file's AST symbols, the symbol name is sanitized to `null` to avoid hallucinated identifiers.
- Secret redaction automatically masks API keys, bearer tokens, JWTs, and private credentials in descriptions, provenance, and logs.

### Deterministic Evidence Scoring (`CandidateRanker`)

Signal evidence weights are defined deterministically:

| Evidence Signal             | Base Weight | Description                                |
| :-------------------------- | :---------- | :----------------------------------------- |
| `STACK_TRACE_FRAME`         | 0.95        | Direct runtime execution stack frame       |
| `ROOT_CAUSE_PROBABLE_LAYER` | 0.85        | V6 Root Cause Analysis identification      |
| `TECHNICAL_LOCALIZATION`    | 0.80        | V6 Timeline / technical cause localization |
| `NETWORK_ENDPOINT`          | 0.75        | Direct HTTP endpoint / route correlation   |
| `DOM_COMPONENT`             | 0.70        | DOM selector / UI component correlation    |
| `IMPORT_GRAPH`              | 0.40        | AST import or dependency traversal         |
| `CALLER_GRAPH`              | 0.40        | Caller reference traversal                 |
| `REQUIREMENT_TRACE`         | 0.35        | Requirement keywords / title match         |
| `KEYWORD_SIMILARITY`        | 0.20        | File path keyword similarity               |

Candidate scores are computed as:
$$S = \min\left(1.0, \, \max_{i} w_i + \sum_{j \ne i} 0.2 \cdot w_j - P_{\text{contradiction}}\right)$$

- **Disambiguation**: Concrete evidence (stack trace frames, exact route handler matches) decisively ranks above files that merely share keyword names.
- **Contradiction Penalty**: If a presentation-layer UI component is flagged for a backend database failure (or vice versa), a contradiction penalty of $0.35$ is deducted, and contradicting evidence items are surfaced in the audit record.

---

## 6. Desktop UI & IPC Bridge

- **IPC Handlers (`defect-localization-handlers.ts`)**:
  - `DEFECT_LOCALIZATION_LOCALIZE`: Triggers deterministic defect localization or returns authoritative cached result.
  - `DEFECT_LOCALIZATION_GET`: Retrieves the latest authoritative localization for a failure case.
  - `DEFECT_LOCALIZATION_LIST`: Lists localization history for a failure case.
  - `DEFECT_LOCALIZATION_INSPECT_SOURCE`: Safely reads a slice of candidate source code (read-only, bounded by byte limit, with secrets redacted).
- **React UI (`DefectLocalizationCard.tsx`)**:
  - **Revision State Badge**: Visual indicators for `EXACT_REVISION`, `DRIFTED_REVISION`, or `HISTORICAL_REVISION_UNAVAILABLE`.
  - **Drift Warning Banner**: Alerts engineers when repository HEAD has moved since the defect was observed.
  - **Top Candidate Spotlight**: Highlights the highest-confidence defect location with file path, symbol name, candidate type, and score.
  - **Ranked Candidates Table**: Detailed list of candidate files, symbol names, confidence scores, and primary signals.
  - **Traceability Trail**: End-to-end breadcrumb chain: Requirement $\rightarrow$ Test Case $\rightarrow$ Failed Step $\rightarrow$ Source File $\rightarrow$ AST Symbol.
  - **Read-Only Source Inspection Modal**: View exact source code lines with targeted defect line highlighting.
  - **Phase 100 Scope Notice**: Explicitly clarifies that source inspection is read-only and no code modifications or patches have been made.

---

## 7. Verification & Certification Results

All 7 Phase 100 test suites pass with 100% success (37 out of 37 tests):

1. **`defect-localization-contract.test.ts`**: Validates Zod schemas, DTOs, and channel constants.
2. **`correlators.test.ts`**: Tests Network, UI, StackTrace, SourceMap, and SymbolGraph correlators.
3. **`candidate-ranker.test.ts`**: Tests anti-hallucination validation, disambiguation, and contradiction penalties.
4. **`defect-localization-service.test.ts`**: Tests lifecycle, concurrency mutex, project isolation, and drift detection.
5. **`defect-localization-adversarial.test.ts`**: Validates path traversal blocking, secret redaction, and ZERO repository mutations.
6. **`defect-localization-handlers.test.ts`**: Verifies IPC sender validation, schema validation, and error sanitization.
7. **`defect-localization-ui.test.tsx`**: Tests component rendering, drift banners, and source modal interactions.

All existing regression test suites continue to pass cleanly:

- `test:quick-fix`: 44/44 pass
- `test:verification`: 37/37 pass
- `test:reverification`: 47/47 pass
- `test:workflow`: 78/78 pass
- `test:email`: 25/25 pass
- `test:jira`: 305/305 pass
- `desktop:smoke`: Passed with code 0
- `format:check`: Passed with code 0
