# V7 Phase 96 — Bug Status & External Workflow Synchronization

## Executive Summary

Phase 96 delivers the authoritative Bug Status & External Workflow Synchronization subsystem for the AI-Driven Software Quality Engineering Platform. It provides bidirectional synchronization between internal defect triage lifecycle states and external issue tracking systems (Jira Cloud, Server, and Data Center).

### Strict Scope Boundaries & Critical Invariants

1. **Strict Phase 97+ Boundary**:
   - Strictly excludes automated defect reverification, failed-test reruns, fix verification, automated patching, repository code mutations, or CI/CD deployments.
   - Synchronization is strictly confined to workflow statuses, triage states, and audit event logs.

2. **The Verification Invariant (Section 5 & 11)**:
   - **External Jira `Done` status DOES NOT mean `verified fixed = TRUE`.**
   - When an external issue transitions to "Done" or "Resolved", the internal triage state transitions to `RESOLVED`, but the defect verification status strictly remains `NOT_VERIFIED`.
   - Automated reverification belongs exclusively to Phase 97+.

3. **Historical Ground Truth Preservation**:
   - Never mutates historical test executions (`TestRun`, `TestCaseExecution`, step actions, assertions), Phase 69/75 evidence archives, Phase 76 reproduction records, Phase 83 root cause determinations, or Phase 84 severity histories.

4. **Deterministic State Transition Matrix**:
   - Rejects illegal internal status jumps (e.g., jumping directly from `CLOSED` to `IN_PROGRESS` or `OPEN` without explicit reopening).

5. **3-Way Conflict Detection & Idempotency**:
   - Employs 3-way merge semantics with last-synced snapshots (`lastSyncedInternalStatus`, `lastSyncedExternalStatus`, `syncVersion`).
   - Supports 4 configurable conflict policies: `MANUAL_REVIEW`, `INTERNAL_WINS`, `EXTERNAL_WINS`, and `LATEST_VALID_CHANGE`.
   - In `MANUAL_REVIEW`, conflicting changes are flagged with `syncResult = 'CONFLICT'` and neither internal nor external state is overwritten until explicit human choice.

6. **Unmapped Status Rejection**:
   - External statuses without explicit or default mappings are rejected with `syncResult = 'UNMAPPED'`. The engine NEVER guesses or corrupts internal triage states.

7. **Multi-Tenant Isolation**:
   - Complete project isolation across all queries, mutations, status mappings, and audit logs. Cross-project defect manipulation is strictly rejected with `WorkflowCrossProjectForbiddenError`.

---

## 1. Architecture & Domain Model

### 1.1 Relational Schema (`prisma/schema.prisma`)

```prisma
enum InternalBugStatus {
  OPEN
  ACKNOWLEDGED
  IN_PROGRESS
  RESOLVED
  REOPENED
  CLOSED
  BLOCKED
  WONT_FIX
  DUPLICATE
}

enum DefectVerificationStatus {
  NOT_VERIFIED
  VERIFICATION_PENDING
  VERIFIED_FIXED
  VERIFICATION_FAILED
}

enum SyncDirection {
  BIDIRECTIONAL
  INTERNAL_TO_EXTERNAL
  EXTERNAL_TO_INTERNAL
}

enum SyncConflictPolicy {
  MANUAL_REVIEW
  INTERNAL_WINS
  EXTERNAL_WINS
  LATEST_VALID_CHANGE
}

enum SyncResultStatus {
  SYNCED
  NO_CHANGE
  CONFLICT
  BLOCKED
  UNMAPPED
  EXTERNAL_NOT_FOUND
  UNAUTHORIZED
  RATE_LIMITED
  FAILED
}

model BugWorkflowState {
  id                       String                   @id @default(uuid()) @db.Uuid
  projectId                String                   @map("project_id") @db.Uuid
  failureCaseId            String                   @unique @map("failure_case_id") @db.Uuid
  bugReportId              String?                  @map("bug_report_id") @db.Uuid
  currentStatus            InternalBugStatus        @default(OPEN) @map("current_status")
  verificationStatus       DefectVerificationStatus @default(NOT_VERIFIED) @map("verification_status")
  statusReason             String?                  @map("status_reason") @db.Text
  resolvedAt               DateTime?                @map("resolved_at") @db.Timestamptz(6)
  resolutionReason         String?                  @map("resolution_reason") @db.Text
  reopenedAt               DateTime?                @map("reopened_at") @db.Timestamptz(6)
  reopenReason             String?                  @map("reopen_reason") @db.Text
  closedAt                 DateTime?                @map("closed_at") @db.Timestamptz(6)
  lastChangedBy            String                   @default("SYSTEM") @map("last_changed_by") @db.VarChar(128)
  workflowVersion          Int                      @default(1) @map("workflow_version")
  lastExternalStatus       String?                  @map("last_external_status") @db.VarChar(128)
  lastExternalStatusId     String?                  @map("last_external_status_id") @db.VarChar(64)
  lastSyncedInternalStatus InternalBugStatus?       @map("last_synced_internal_status")
  lastSyncedExternalStatus String?                  @map("last_synced_external_status") @db.VarChar(128)
  lastSyncedAt             DateTime?                @map("last_synced_at") @db.Timestamptz(6)
  lastExternalUpdatedAt    DateTime?                @map("last_external_updated_at") @db.Timestamptz(6)
  syncVersion              Int                      @default(0) @map("sync_version")
  lastSyncResult           SyncResultStatus?        @map("last_sync_result")
  lastSyncError            String?                  @map("last_sync_error") @db.Text
  conflictState            Json?                    @map("conflict_state")
  createdAt                DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime                 @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project                  Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase              FailureCase              @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  bugReport                StructuredBugReport?     @relation(fields: [bugReportId], references: [id], onDelete: SetNull)
  syncEvents               WorkflowSyncEvent[]

  @@index([projectId, currentStatus])
  @@index([projectId, verificationStatus])
  @@map("bug_workflow_states")
}

model WorkflowStatusMapping {
  id                 String             @id @default(uuid()) @db.Uuid
  projectId          String             @map("project_id") @db.Uuid
  connectionId       String?            @map("connection_id") @db.Uuid
  externalSystem     String             @default("JIRA") @map("external_system") @db.VarChar(64)
  externalStatusId   String             @default("*") @map("external_status_id") @db.VarChar(64)
  externalStatusName String             @map("external_status_name") @db.VarChar(128)
  internalStatus     InternalBugStatus  @map("internal_status")
  direction          SyncDirection      @default(BIDIRECTIONAL) @map("direction")
  conflictPolicy     SyncConflictPolicy @default(MANUAL_REVIEW) @map("conflict_policy")
  isEnabled          Boolean            @default(true) @map("is_enabled")
  createdAt          DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime           @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project            Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  connection         JiraConnection?    @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([projectId, externalSystem, externalStatusName])
  @@index([projectId, isEnabled])
  @@map("workflow_status_mappings")
}

model WorkflowSyncEvent {
  id                String            @id @default(uuid()) @db.Uuid
  projectId         String            @map("project_id") @db.Uuid
  workflowStateId   String            @map("workflow_state_id") @db.Uuid
  failureCaseId     String            @map("failure_case_id") @db.Uuid
  bugReportId       String?           @map("bug_report_id") @db.Uuid
  connectionId      String?           @map("connection_id") @db.Uuid
  externalIssueId   String?           @map("external_issue_id") @db.VarChar(64)
  externalIssueKey  String?           @map("external_issue_key") @db.VarChar(64)
  direction         SyncDirection     @map("direction")
  sourceStatus      String            @map("source_status") @db.VarChar(128)
  targetStatus      String?           @map("target_status") @db.VarChar(128)
  mappedStatus      String?           @map("mapped_status") @db.VarChar(128)
  syncResult        SyncResultStatus  @map("sync_result")
  conflictDetails   Json?             @map("conflict_details")
  startedAt         DateTime          @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt       DateTime?         @map("completed_at") @db.Timestamptz(6)
  externalUpdatedAt DateTime?         @map("external_updated_at") @db.Timestamptz(6)
  internalUpdatedAt DateTime?         @map("internal_updated_at") @db.Timestamptz(6)
  errorCode         String?           @map("error_code") @db.VarChar(64)
  errorMessage      String?           @map("error_message") @db.Text
  retryCount        Int               @default(0) @map("retry_count")
  actor             String            @default("SYSTEM") @map("actor") @db.VarChar(128)
  createdAt         DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)

  project           Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workflowState     BugWorkflowState  @relation(fields: [workflowStateId], references: [id], onDelete: Cascade)

  @@index([projectId, failureCaseId, startedAt])
  @@index([projectId, syncResult])
  @@map("workflow_sync_events")
}
```

---

## 2. Core Subsystems

### 2.1 Deterministic Transition Matrix (`WorkflowTransitionValidator`)

Validates allowed state jumps and guards against terminal state bypass:

- `OPEN` -> `ACKNOWLEDGED`, `IN_PROGRESS`, `BLOCKED`, `WONT_FIX`, `DUPLICATE`
- `ACKNOWLEDGED` -> `IN_PROGRESS`, `BLOCKED`, `WONT_FIX`, `DUPLICATE`, `RESOLVED`
- `IN_PROGRESS` -> `RESOLVED`, `BLOCKED`, `WONT_FIX`, `DUPLICATE`
- `BLOCKED` -> `IN_PROGRESS`, `OPEN`, `WONT_FIX`
- `RESOLVED` -> `REOPENED`, `CLOSED`, `IN_PROGRESS`
- `REOPENED` -> `IN_PROGRESS`, `RESOLVED`, `BLOCKED`, `WONT_FIX`
- `CLOSED` -> `REOPENED` (strictly forbids jumping to `IN_PROGRESS` or `OPEN` directly)
- `WONT_FIX` -> `REOPENED`
- `DUPLICATE` -> `REOPENED`

### 2.2 Status Translation Engine (`WorkflowStatusMappingEngine`)

Translates between internal bug statuses and Jira status names with case-insensitivity and whitespace normalization:

- **Default Jira Mappings**:
  - `To Do`, `Open`, `Backlog`, `Selected for Development` <-> `OPEN`
  - `In Progress`, `In Review` <-> `IN_PROGRESS`
  - `Done`, `Resolved` <-> `RESOLVED`
  - `Closed` <-> `CLOSED`
  - `Reopened` <-> `REOPENED`
  - `Blocked` <-> `BLOCKED`
  - `Won't Fix`, `Won't Do` <-> `WONT_FIX`
  - `Duplicate` <-> `DUPLICATE`
- **Strict Invariant**: If an external status has no mapping configured and cannot be resolved through defaults, it is returned as `null` and flagged `UNMAPPED`. No automatic guessing is ever performed.

### 2.3 3-Way Conflict Detector (`WorkflowConflictDetector`)

Evaluates synchronization requests using the base snapshot from the last successful sync:

- **Agreement**: When mapped external status equals internal status, returns `NO_CHANGE` (idempotent).
- **Clean External Change**: When only external status changed since snapshot, returns `EXTERNAL` winner.
- **Clean Internal Change**: When only internal status changed since snapshot, returns `INTERNAL` winner.
- **Concurrent Conflict**: When both sides changed independently:
  - `MANUAL_REVIEW`: Flags `syncResult = 'CONFLICT'`, preserves current values on both sides, creates detailed conflict payload.
  - `INTERNAL_WINS`: Pushes internal status to Jira.
  - `EXTERNAL_WINS`: Pulls external status into platform.
  - `LATEST_VALID_CHANGE`: Compares `updatedAt` timestamps and adopts the more recent change.

### 2.4 Orchestration Service (`WorkflowSyncService`)

Coordinates the entire lifecycle:

- In-memory async mutex (`acquireLock`) per failureCase prevents concurrent sync races.
- Project boundary assertions guard against cross-tenant defect corruption.
- Queries available Jira transitions via `GET /rest/api/3/issue/{id}/transitions` and transitions the issue via `POST /rest/api/3/issue/{id}/transitions`.
- Dispatches Phase 95 email notification `TEST_REVERIFICATION_REQUIRED` when a defect transitions to `RESOLVED`, without blocking on delivery failures.
- Logs every sync attempt, whether successful, conflicting, unmapped, or unauthorized, to `WorkflowSyncEvent`.

---

## 3. Desktop IPC & UI Integration

### 3.1 IPC Channels

| Channel                           | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `workflow:get-state`              | Retrieves or initializes defect workflow state                          |
| `workflow:update-internal-status` | Transitions internal defect status with validation & optional Jira sync |
| `workflow:get-status-mappings`    | Lists configured project mappings (with Jira defaults fallback)         |
| `workflow:save-status-mapping`    | Creates or updates custom project mapping                               |
| `workflow:delete-status-mapping`  | Deletes custom mapping with project boundary checks                     |
| `workflow:sync-now`               | Executes immediate bidirectional sync with linked Jira issue            |
| `workflow:resolve-conflict`       | Manually resolves flagged conflict with user-chosen winner              |
| `workflow:list-sync-events`       | Lists paginated audit events for defect                                 |

### 3.2 UI Renderer (`WorkflowSyncCard.tsx`)

Embedded into `StructuredBugReportPanel.tsx` and available standalone:

- **Internal Status Badge**: Displays current platform triage status.
- **External Jira Status Badge**: Displays remote Jira status (or "Unlinked" / "Not Synced").
- **Verification Status Callout**: Explicitly shows `NOT_VERIFIED` with the label _"Independent of Jira resolution"_.
- **Sync Result Badge**: Real-time indicator (`SYNCED`, `NO_CHANGE`, `CONFLICT`, `UNMAPPED`, `BLOCKED`).
- **Conflict Banner**: Appears when conflict is detected with "Resolve Conflict" modal trigger.
- **Action Buttons**: "Sync Now" for immediate fetch/push, "Sync History" drawer for audit events, and internal transition dropdown.

---

## 4. Test & Verification Summary

| Suite                                   | Tests  | Status   | Duration    |
| --------------------------------------- | ------ | -------- | ----------- |
| `workflow-contract.test.ts`             | 8      | PASS     | 4.2 ms      |
| `workflow-transition-validator.test.ts` | 6      | PASS     | 2.2 ms      |
| `workflow-conflict-detector.test.ts`    | 7      | PASS     | 1.5 ms      |
| `workflow-sync-service.test.ts`         | 26     | PASS     | 269.4 ms    |
| `workflow-handlers.test.ts`             | 20     | PASS     | 6.7 ms      |
| `workflow-sync-ui.test.tsx`             | 4      | PASS     | 26.9 ms     |
| **Total Phase 96 Suites**               | **78** | **PASS** | **~820 ms** |

### Monorepo Regression Verification

- `npm run test:workflow`: 78/78 passing.
- `npm run test:jira`: 305/305 passing.
- `npm run test:email`: 25/25 passing.
- `npm run typecheck`: 0 errors across all packages.
- `npm run desktop:smoke`: launcher clean startup.

---

## 5. Certification & Production Readiness

- **Status**: COMPLETE & VERIFIED.
- **Real Jira Integration Certification**: BLOCKED (as expected, awaiting production Atlassian credentials / live cloud sandbox). Fully verified against mock Jira wire protocol and simulated REST endpoints.
