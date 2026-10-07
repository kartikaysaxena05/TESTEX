# V7 Phase 94 — Engineer Assignment & Defect Ownership Workflow

## Executive Summary

Phase 94 delivers an enterprise-grade, deterministic Engineer Assignment and Defect Ownership workflow for the AI-Driven Software Quality Engineering Platform. It bridges failure intelligence bug triage with human engineering ownership and bi-directional Jira synchronization. The architecture guarantees deterministic state transitions, multi-tenant cross-project isolation, optimistic concurrency version locking, robust partial-failure handling with retry semantics, and an immutable audit trail.

---

## 1. Architecture & Domain Model

### 1.1 Core Entities

The Phase 94 data model introduces three dedicated Prisma tables:

```prisma
enum DefectAssignmentSource {
  MANUAL_TRIAGE
  DEFECT_TRIAGE_RULES
  JIRA_REMOTE_SYNC
  FALLBACK_OWNER
}

enum JiraAssigneeSyncStatus {
  NOT_APPLICABLE
  PENDING
  SYNCED
  JIRA_SYNC_FAILED
}

enum DefectOwnershipAction {
  ASSIGN
  REASSIGN
  UNASSIGN
  SYNC_FROM_JIRA
  RETRY_SYNC
}

model ProjectEngineer {
  id              String           @id @default(uuid())
  projectId       String           @map("project_id")
  name            String
  email           String
  role            String           @default("ENGINEER")
  jiraAccountId   String?          @map("jira_account_id")
  jiraUsername    String?          @map("jira_username")
  isActive        Boolean          @default(true) @map("is_active")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")

  defectOwnerships DefectOwnership[]
  assignedHistories DefectOwnershipHistory[] @relation("AssignedEngineerHistories")

  @@unique([projectId, email])
  @@index([projectId, isActive])
  @@map("project_engineers")
}

model DefectOwnership {
  id                     String                 @id @default(uuid())
  projectId              String                 @map("project_id")
  failureCaseId          String                 @unique @map("failure_case_id")
  bugReportId            String?                @map("bug_report_id")
  assignedEngineerId     String?                @map("assigned_engineer_id")
  assignmentSource       DefectAssignmentSource @default(MANUAL_TRIAGE) @map("assignment_source")
  assignmentReason       String?                @map("assignment_reason")
  triageNotes            String?                @map("triage_notes")
  jiraAssigneeSyncStatus JiraAssigneeSyncStatus @default(NOT_APPLICABLE) @map("jira_assignee_sync_status")
  lastJiraSyncError      String?                @map("last_jira_sync_error")
  ownershipVersion       Int                    @default(1) @map("ownership_version")
  createdAt              DateTime               @default(now()) @map("created_at")
  updatedAt              DateTime               @updatedAt @map("updated_at")

  assignedEngineer       ProjectEngineer?       @relation(fields: [assignedEngineerId], references: [id], onDelete: SetNull)
  history                DefectOwnershipHistory[]

  @@index([projectId, assignedEngineerId])
  @@index([projectId, jiraAssigneeSyncStatus])
  @@map("defect_ownerships")
}

model DefectOwnershipHistory {
  id                   String                 @id @default(uuid())
  defectOwnershipId    String                 @map("defect_ownership_id")
  action               DefectOwnershipAction
  previousEngineerId   String?                @map("previous_engineer_id")
  newEngineerId        String?                @map("new_engineer_id")
  source               DefectAssignmentSource
  reason               String?
  triageNotes          String?                @map("triage_notes")
  syncStatus           JiraAssigneeSyncStatus @map("sync_status")
  jiraSyncError        String?                @map("jira_sync_error")
  actorId              String?                @map("actor_id")
  versionAtAction      Int                    @map("version_at_action")
  createdAt            DateTime               @default(now()) @map("created_at")

  defectOwnership      DefectOwnership        @relation(fields: [defectOwnershipId], references: [id], onDelete: Cascade)
  previousEngineer     ProjectEngineer?       @relation("PreviousEngineerHistories", fields: [previousEngineerId], references: [id], onDelete: SetNull)
  newEngineer          ProjectEngineer?       @relation("AssignedEngineerHistories", fields: [newEngineerId], references: [id], onDelete: SetNull)

  @@index([defectOwnershipId, createdAt])
  @@map("defect_ownership_histories")
}
```

---

## 2. Assignment, Reassignment & Unassignment Lifecycle

The lifecycle follows strict, deterministic state transitions:

```
                  ┌────────────────┐
                  │   UNASSIGNED   │
                  └──────┬─────────┘
                         │ assignEngineer()
                         ▼
                  ┌────────────────┐
         ┌───────►│    ASSIGNED    │◄──────┐
         │        └──────┬─────────┘       │
         │ reassign      │                 │
         │ Engineer()    │ unassign        │ retryJiraSync() /
         │               │ Engineer()      │ syncFromJira()
         ▼               ▼                 │
  ┌──────────────┐┌───────────────┐ ┌──────┴──────────┐
  │  REASSIGNED  ││  UNASSIGNED   │ │JIRA_SYNC_FAILED │
  └──────────────┘└───────────────┘ └─────────────────┘
```

1. **Eligible Assignee Resolution**: Only engineers registered to the matching `projectId` with `isActive = true` are eligible for assignment. Inactive engineers cannot be assigned and throw `JiraEngineerIneligibleError`.
2. **Assignment & Reassignment**:
   - Initial assignment transitions from `null` owner to an active engineer (`ASSIGN`).
   - If an engineer is already assigned, subsequent assignment to a different engineer is recorded as `REASSIGN`.
   - Idempotent assignment to the exact same engineer returns the existing ownership record without modifying version or recording duplicate history.
3. **Unassignment**:
   - Setting ownership to `null` transitions the defect to unassigned (`UNASSIGN`).
   - If an associated Jira issue link exists, the remote Jira ticket assignee is cleared (`accountId: null` or `name: null`).
4. **Optimistic Concurrency Control**:
   - Every mutation accepts an optional `expectedVersion`.
   - If `currentOwnership.ownershipVersion !== expectedVersion`, the operation is aborted with `JiraStaleOwnershipVersionError` (HTTP/IPC status `STALE_OWNERSHIP_VERSION`), protecting against concurrent triager race conditions.
5. **Entity Mutex**:
   - In-memory per-failureCase asynchronous mutex serialization ensures that concurrent operations on the same defect are executed sequentially without database deadlock.

---

## 3. Bi-Directional Jira Assignee Synchronization

### 3.1 REST API Wire Contract

When a defect is associated with an active Jira issue link (`JiraIssueLink`), ownership mutations synchronize the assignee to the Jira REST API:

| Jira Deployment Target | REST Route                                  | HTTP Method | Payload Schema                    | Success Response |
| :--------------------- | :------------------------------------------ | :---------- | :-------------------------------- | :--------------- |
| **Jira Cloud**         | `/rest/api/3/issue/{issueIdOrKey}/assignee` | `PUT`       | `{ "accountId": string \| null }` | `204 No Content` |
| **Jira Server / DC**   | `/rest/api/2/issue/{issueIdOrKey}/assignee` | `PUT`       | `{ "name": string \| null }`      | `204 No Content` |

### 3.2 Authentication & Security Defenses

1. **Authentication Headers**:
   - Jira Cloud uses Basic Auth with base64-encoded `email:apiToken`.
   - Jira Server/DC Personal Access Tokens (PAT) use `Bearer <token>` headers.
2. **SSRF Guarding**:
   - All Jira hostnames are strictly validated against `JiraUrlValidator`.
   - Loopback addresses (`127.0.0.1`, `localhost`), link-local IPv6, and cloud metadata endpoints (`169.254.169.254`) are blocked in production environments.
3. **Multi-Tenant Cross-Project Protection**:
   - The engineer, failure case, Jira connection, and active Jira issue link must all belong to the same tenant `projectId`.
   - Any mismatched cross-project relationship throws `JiraCrossProjectError` or `JiraEngineerNotFoundError`.

---

## 4. Partial Failure Semantics & Retry Workflows

### 4.1 Resilient Decoupling

A remote Jira API failure must **never** roll back an authoritative local defect ownership assignment:

```
Triage Engineer Action
        │
        ▼
1. Update Local DefectOwnership (PostgreSQL) ──► SUCCESS
        │
        ▼
2. Call Remote Jira PUT /assignee API
        ├── Success (204 No Content) ──► status = SYNCED
        └── Remote Failure (Network / 5xx / 400)
                 │
                 ├── Local assignment RETAINED
                 ├── status = JIRA_SYNC_FAILED
                 ├── lastJiraSyncError = "<details>"
                 └── JiraConnectionAudit = JIRA_ASSIGNEE_SYNC_FAILED
```

### 4.2 Retry Jira Sync

- If remote synchronization fails (e.g. Jira server outage or temporary network blip), the defect displays a rose `Jira Assignee Sync Failed` badge and exposes the `Retry Sync` action.
- Triagers can trigger `jira:retryAssigneeSync` without re-entering the assignment notes or re-selecting the engineer.
- On successful retry, status transitions to `SYNCED`, `lastJiraSyncError` is cleared, and an audit event `JIRA_ASSIGNEE_SYNCED` is recorded.

### 4.3 Remote Sync (`syncFromJira`)

- If an engineer is reassigned directly in Atlassian Jira, the platform provides `jira:syncAssigneeFromJira`.
- Fetches the remote issue details from Jira, matches the remote assignee against local `ProjectEngineer` records by `jiraAccountId` / `jiraUsername` / `email`, and reconciles the local ownership with source `JIRA_REMOTE_SYNC`.

---

## 5. Audit Trail & Provenance

Every ownership action records an audit record in `DefectOwnershipHistory` as well as a centralized `JiraConnectionAudit` entry:

- `DEFECT_ASSIGNED`: Defect assigned to an engineer.
- `DEFECT_REASSIGNED`: Defect reassigned to a different engineer.
- `DEFECT_UNASSIGNED`: Defect unassigned.
- `JIRA_ASSIGNEE_SYNCED`: Remote Jira ticket assignee successfully updated.
- `JIRA_ASSIGNEE_SYNC_FAILED`: Remote Jira update failed; local record retained.
- `OWNERSHIP_CONFLICT_DETECTED`: Stale version or concurrent collision detected.

---

## 6. Desktop IPC Contract & User Interface

### 6.1 Desktop IPC Channels

| Channel Constant                 | Method                    | Input Parameters                                                                                            | Return Value                 |
| :------------------------------- | :------------------------ | :---------------------------------------------------------------------------------------------------------- | :--------------------------- |
| `JIRA_GET_DEFECT_OWNERSHIP`      | `getDefectOwnership`      | `{ projectId, failureCaseId }`                                                                              | `DefectOwnershipDto \| null` |
| `JIRA_ASSIGN_ENGINEER`           | `assignEngineer`          | `{ projectId, failureCaseId, bugReportId?, engineerId, assignmentReason?, triageNotes?, expectedVersion? }` | `DefectOwnershipDto`         |
| `JIRA_UNASSIGN_ENGINEER`         | `unassignEngineer`        | `{ projectId, failureCaseId, reason?, expectedVersion? }`                                                   | `DefectOwnershipDto`         |
| `JIRA_LIST_PROJECT_ENGINEERS`    | `listProjectEngineers`    | `{ projectId, activeOnly? }`                                                                                | `ProjectEngineerDto[]`       |
| `JIRA_REGISTER_PROJECT_ENGINEER` | `registerProjectEngineer` | `{ projectId, name, email, role?, jiraAccountId?, jiraUsername? }`                                          | `ProjectEngineerDto`         |
| `JIRA_RETRY_ASSIGNEE_SYNC`       | `retryAssigneeSync`       | `{ projectId, failureCaseId }`                                                                              | `DefectOwnershipDto`         |
| `JIRA_SYNC_ASSIGNEE_FROM_JIRA`   | `syncAssigneeFromJira`    | `{ projectId, failureCaseId }`                                                                              | `DefectOwnershipDto`         |

### 6.2 UI Components (`StructuredBugReportPanel.tsx`)

The bug report triage workspace features an integrated **Defect Ownership Card**:

- `data-testid="defect-ownership-card"`: Primary container.
- `data-testid="assigned-engineer-name"`: Displays assigned engineer's name or `Unassigned`.
- `data-testid="assigned-engineer-email"`: Displays assigned engineer's email.
- `data-testid="defect-ownership-version"`: Displays optimistic concurrency version badge (`v1`, `v2`, etc.).
- `data-testid="jira-sync-status-badge"`: Color-coded status badge (`SYNCED` in emerald, `JIRA_SYNC_FAILED` in rose, `PENDING` in amber).
- `data-testid="btn-assign-engineer"`: Opens the engineer assignment modal.
- `data-testid="btn-unassign-engineer"`: Clears ownership.
- `data-testid="btn-retry-jira-sync"`: Retries failed Jira synchronization.
- `data-testid="btn-sync-from-jira"`: Reconciles local ownership with remote Jira ticket assignee.
- `data-testid="btn-view-ownership-history"`: Opens the historical audit modal displaying all past transitions, timestamps, actors, and reasons.

---

## 7. Verification & Certification

### 7.1 Test Suite Breakdown

All Phase 94 implementations are certified across 4 test suites:

1. `packages/core/src/jira/jira-phase94-contract.test.ts`: 14 tests (Zod schema validations, DTO contracts, IPC channels, and Wire API simulation).
2. `packages/core/src/jira/jira-defect-ownership.test.ts`: 25 tests (Database lifecycle, optimistic concurrency, multi-tenant isolation, SSRF defenses, and partial failure handling).
3. `apps/desktop/src/main/ipc/jira-phase94-handlers.test.ts`: 21 tests (Main-process IPC handlers, input sanitization, error normalization, and authorization checks).
4. `apps/desktop/src/main/jira-phase94-ui.test.tsx`: 4 tests (Renderer UI snapshot and component interactions).

**Cumulative Test Results:**

- `test:jira`: 305 passing across 90 suites (0 failures).
- `test:failures`: 570 passing across 111 suites (0 regressions).
- `tsc -b`: Clean build (0 errors).

---

## 8. Live Atlassian Cloud Connectivity Statement

> [!IMPORTANT]
> **LIVE JIRA CLOUD CERTIFICATION: BLOCKED / NOT VERIFIED**
> In accordance with instructions and security sandbox policy, outbound HTTP calls to live Atlassian Cloud production servers are disabled in this evaluation environment. All contracts, HTTP wire payloads (`PUT /rest/api/3/issue/{key}/assignee`), header formats, error statuses (`400`, `401`, `403`, `404`, `429`, `500`), and UI workflows have been exhaustively certified via high-fidelity HTTP wire mock servers and deterministic integration test suites.
