# Failure Intelligence Domain & Analysis Pipeline Foundation (V6 Phase 74)

## Overview

Phase 74 establishes the authoritative domain model, persistence layer, service architecture, and controlled lifecycle state machine for **V6 — Failure Intelligence, Root-Cause Analysis & Intelligent Bug Triage**.

## Architectural Principles

1. **V6 Consumes V5 Without Mutating Execution Truth**:
   - V6 reads V5 `TestCaseExecution`, `StepExecutionRecord`, and `ExecutionEvidenceArtifact` records as strictly immutable truth.
   - V6 creates its own decoupled entity models (`FailureCase`, `FailureAnalysisRun`, `FailureEvidenceReference`).
2. **Failure Case Identity & Eligibility**:
   - 1-to-1 unique mapping to source execution (`executionId` unique constraint).
   - Eligibility policy: `FAILED`, `AUTOMATION_ERROR`, and `BLOCKED` executions qualify. `PASSED` executions are strictly rejected with `ExecutionIneligibleForFailureCaseError`.
3. **Analysis Lifecycle State Machine**:
   - Controlled state transitions: `PENDING` -> `READY` -> `ANALYZING` -> `COMPLETED`.
   - Branch transitions: `ANALYZING` -> `FAILED` / `BLOCKED` / `CANCELLED`.
   - Re-analysis support: `FAILED` / `BLOCKED` / `STALE` -> `READY` / `ANALYZING`.
   - `COMPLETED` analysis run explicitly does **not** equal a confirmed application bug (classification comes in future V6 phases).
4. **Versioned Analysis Runs (`FailureAnalysisRun`)**:
   - Every analysis attempt generates an incremental `attemptNumber` and immutable input snapshot JSON capturing context at analysis start.
5. **Auditable Evidence References (`FailureEvidenceReference`)**:
   - Discovers and references V5 screenshot, console, network, DOM, and trace artifacts without copying storage blobs.
6. **Staleness Tracking**:
   - `isStale`, `stalenessReason`, `staleAt` track when requirement versions advance or tests change.
7. **Security & Project Isolation**:
   - All queries, mutations, IPC handlers, and state transitions enforce strict multi-tenant project scoping.

## Schema Architecture

```prisma
enum FailureCaseStatus {
  PENDING
  READY
  ANALYZING
  COMPLETED
  FAILED
  BLOCKED
  STALE
  CANCELLED
}

enum FailureAnalysisRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  BLOCKED
  CANCELLED
}

model FailureCase {
  id                        String              @id @default(uuid()) @db.Uuid
  projectId                 String              @map("project_id") @db.Uuid
  testCaseId                String              @map("test_case_id") @db.Uuid
  testCaseVersionNumber     Int                 @map("test_case_version_number")
  testRunId                 String              @map("test_run_id") @db.Uuid
  executionId               String              @unique @map("execution_id") @db.Uuid
  stepExecutionId           String?             @map("step_execution_id") @db.Uuid
  stepIndex                 Int?                @map("step_index")
  triggeringExecutionStatus TestRunStatus       @map("triggering_execution_status")
  status                    FailureCaseStatus   @default(PENDING)
  isEligible                Boolean             @default(true) @map("is_eligible")
  ineligibilityReason       String?             @map("ineligibility_reason") @db.VarChar(255)
  isStale                   Boolean             @default(false) @map("is_stale")
  stalenessReason           String?             @map("staleness_reason") @db.VarChar(255)
  staleAt                   DateTime?           @map("stale_at")
  currentAnalysisRunId      String?             @map("current_analysis_run_id") @db.Uuid
  analysisAttemptCount      Int                 @default(0) @map("analysis_attempt_count")
  title                     String              @db.VarChar(255)
  failureSummary            String?             @map("failure_summary") @db.Text
  errorCode                 String?             @map("error_code") @db.VarChar(128)
  errorMessage              String?             @map("error_message") @db.Text
  environmentId             String?             @map("environment_id") @db.Uuid
  metadataJson              Json                @default("{}") @map("metadata_json")
  createdAt                 DateTime            @default(now()) @map("created_at")
  updatedAt                 DateTime            @updatedAt @map("updated_at")

  project                   Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  testCase                  TestCase            @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  testRun                   TestRun             @relation(fields: [testRunId], references: [id], onDelete: Cascade)
  execution                 TestCaseExecution   @relation(fields: [executionId], references: [id], onDelete: Cascade)
  stepExecution             StepExecutionRecord? @relation(fields: [stepExecutionId], references: [id], onDelete: SetNull)
  environment               ProjectEnvironment? @relation(fields: [environmentId], references: [id], onDelete: SetNull)
  analysisRuns              FailureAnalysisRun[]
  evidenceReferences        FailureEvidenceReference[]

  @@index([projectId, status])
  @@index([testCaseId])
  @@index([testRunId])
  @@map("failure_cases")
}

model FailureAnalysisRun {
  id                 String                   @id @default(uuid()) @db.Uuid
  projectId          String                   @map("project_id") @db.Uuid
  failureCaseId      String                   @map("failure_case_id") @db.Uuid
  attemptNumber      Int                      @map("attempt_number")
  analyzerVersion    String                   @default("1.0.0") @map("analyzer_version") @db.VarChar(32)
  status             FailureAnalysisRunStatus @default(PENDING)
  startedAt          DateTime?                @map("started_at")
  completedAt        DateTime?                @map("completed_at")
  durationMs         Int?                     @map("duration_ms")
  triggerSource      String                   @default("MANUAL") @map("trigger_source") @db.VarChar(64)
  inputSnapshotJson  Json                     @default("{}") @map("input_snapshot_json")
  failureReason      String?                  @map("failure_reason") @db.Text
  metadataJson       Json                     @default("{}") @map("metadata_json")
  createdAt          DateTime                 @default(now()) @map("created_at")
  updatedAt          DateTime                 @updatedAt @map("updated_at")

  project            Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase        FailureCase              @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  evidenceReferences FailureEvidenceReference[]

  @@unique([failureCaseId, attemptNumber])
  @@index([projectId, failureCaseId])
  @@map("failure_analysis_runs")
}

model FailureEvidenceReference {
  id                 String                    @id @default(uuid()) @db.Uuid
  projectId          String                    @map("project_id") @db.Uuid
  failureCaseId      String                    @map("failure_case_id") @db.Uuid
  analysisRunId      String?                   @map("analysis_run_id") @db.Uuid
  executionId        String                    @map("execution_id") @db.Uuid
  bundleId           String?                   @map("bundle_id") @db.Uuid
  artifactType       EvidenceArtifactType      @map("artifact_type")
  sourceArtifactId   String?                   @map("source_artifact_id") @db.Uuid
  stepExecutionId    String?                   @map("step_execution_id") @db.Uuid
  storageIdentity    String?                   @map("storage_identity") @db.VarChar(512)
  logicalName        String                    @map("logical_name") @db.VarChar(255)
  mimeType           String?                   @map("mime_type") @db.VarChar(128)
  byteSize           Int?                      @map("byte_size")
  sha256             String?                   @map("sha256") @db.VarChar(64)
  metadataJson       Json                      @default("{}") @map("metadata_json")
  attachedAt         DateTime                  @default(now()) @map("attached_at")

  project            Project                   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase        FailureCase               @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  analysisRun        FailureAnalysisRun?       @relation(fields: [analysisRunId], references: [id], onDelete: SetNull)
  execution          TestCaseExecution         @relation(fields: [executionId], references: [id], onDelete: Cascade)
  bundle             ExecutionEvidenceBundle?  @relation(fields: [bundleId], references: [id], onDelete: SetNull)
  sourceArtifact     ExecutionEvidenceArtifact? @relation(fields: [sourceArtifactId], references: [id], onDelete: SetNull)

  @@index([projectId, failureCaseId])
  @@index([executionId])
  @@map("failure_evidence_references")
}
```
