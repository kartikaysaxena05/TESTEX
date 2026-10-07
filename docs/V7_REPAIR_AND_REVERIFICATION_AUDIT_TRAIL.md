# V7 Phase 108 — Complete Repair & Reverification Audit Trail

## 1. Overview & Architecture

The **Complete Repair & Reverification Audit Trail** provides an authoritative, append-only chronological provenance log for every failure, repair proposal, validation attempt, human approval decision, and reverification test run in the AI-Driven Software Quality Engineering Platform.

Strictly bounded by provenance and auditability rules, Phase 108 does **not** introduce new automated repair logic, release readiness scoring, or deployment mechanisms. Instead, it reconstructs the entire end-to-end lifecycle across V7 Phases 89–107:

```text
Failure (Phase 88/V6)
  └── Intelligence & Classification (Phase 88)
        └── Defect Report & Jira Issue Creation (Phases 91–93)
              └── Engineer Assignment & Notifications (Phases 94–95)
                    └── Reverification & Verification (Phases 97–98)
                          └── Quick-Fix Eligibility (Phase 99)
                                └── Defect Localization (Phase 100)
                                      └── AI Patch Proposal (Phase 101)
                                            └── Sandbox Containment (Phase 102)
                                                  └── Controlled Validation (Phases 103–104)
                                                        └── Human Approval / Rejection (Phase 105)
                                                              └── Patch Application / Rollback (Phase 106)
                                                                    └── Retest & Verification (Phase 107)
                                                                          └── Post-Fix Jira & Notification Update
                                                                                └── AUTHORITATIVE AUDIT TRAIL (Phase 108)
```

---

## 2. Relational Schema & Storage

### 2.1 Enums

- **`RepairAuditActorType`**:
  - `USER`: Human engineer or QA tester explicitly making a decision (e.g., approval, rejection, trigger).
  - `AI`: LLM or heuristics engine providing recommendations, localizations, and patch proposals.
  - `SYSTEM`: Internal state machine, scheduler, or background synchronization daemon.
  - `TEST_ENGINE`: Test execution engine (Playwright, Jest, Vitest, run orchestrator).
  - `JIRA_INTEGRATION`: Bidirectional Atlassian Jira webhook / REST API sync connector.
  - `NOTIFICATION_SERVICE`: Email or webhook notification delivery subsystem.
  - `REPAIR_ENGINE`: Patch synthesis, containment sandbox, diff parser, and git rollback coordinator.

- **`RepairAuditEventType`** (26 Distinct Lifecycle Events):
  - `FAILURE_CREATED`, `BUG_REPORT_CREATED`, `JIRA_ISSUE_CREATED`, `JIRA_ISSUE_LINKED`, `ENGINEER_ASSIGNED`, `REVERIFICATION_STARTED`, `REVERIFICATION_COMPLETED`, `QUICK_FIX_EVALUATED`, `QUICK_FIX_APPROVED_FOR_GENERATION`, `DEFECT_LOCALIZED`, `PATCH_PROPOSED`, `PATCH_VALIDATION_STARTED`, `PATCH_VALIDATION_COMPLETED`, `PATCH_REJECTED`, `PATCH_APPROVED`, `PATCH_APPLIED`, `PATCH_APPLY_FAILED`, `RETEST_STARTED`, `RETEST_COMPLETED`, `ROLLBACK_STARTED`, `ROLLBACK_COMPLETED`, `CHANGE_IMPACT_ANALYZED`, `REGRESSION_SELECTION_CREATED`, `POST_FIX_STATUS_UPDATED`, `NOTIFICATION_SENT`, `REPAIR_SESSION_COMPLETED`.

- **`RepairSessionStatus`**:
  - `ACTIVE`, `PATCH_APPROVED`, `PATCH_APPLIED`, `VERIFIED`, `REVERTED`, `FAILED`, `CANCELLED`, `COMPLETED`.

### 2.2 Models (`prisma/schema.prisma`)

```prisma
model RepairSession {
  id               String              @id @default(uuid())
  projectId        String
  failureCaseId    String
  sessionKey       String              @unique
  status           RepairSessionStatus @default(ACTIVE)
  totalEventsCount Int                 @default(0)
  startedAt        DateTime            @default(now())
  completedAt      DateTime?
  metadata         Json                @default("{}")
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  project     Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase FailureCase        @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)
  auditEvents RepairAuditEvent[]

  @@index([projectId])
  @@index([failureCaseId])
  @@index([status])
}

model RepairAuditEvent {
  id                    String               @id @default(uuid())
  sessionId             String
  projectId             String
  failureCaseId         String
  sequenceNumber        Int
  eventType             RepairAuditEventType
  actorType             RepairAuditActorType
  actorId               String               @db.VarChar(128)
  sourceComponent       String               @db.VarChar(64)
  timestamp             DateTime             @default(now())
  previousState         String?              @db.VarChar(255)
  newState              String?              @db.VarChar(255)
  evidenceReferences    Json                 @default("[]")
  repositoryState       Json                 @default("{}")
  testRunReferences     Json                 @default("[]")
  jiraReference         Json                 @default("{}")
  notificationReference Json                 @default("{}")
  reason                String?              @db.Text
  correlationId         String               @db.VarChar(128)
  causationId           String?              @db.VarChar(255)
  idempotencyKey        String               @unique @db.VarChar(255)
  schemaVersion         String               @default("1.0.0") @db.VarChar(32)
  metadata              Json                 @default("{}")
  createdAt             DateTime             @default(now())

  repairSession RepairSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  project       Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  failureCase   FailureCase   @relation(fields: [failureCaseId], references: [id], onDelete: Cascade)

  @@index([sessionId, sequenceNumber])
  @@index([projectId, failureCaseId])
  @@index([eventType])
  @@index([actorType])
  @@index([timestamp])
}
```

---

## 3. Core Capabilities

### 3.1 Append-Only Immutability & Deterministic Sequencing
- Every audit event receives a monotonic sequence number allocated through an in-memory lock per session.
- Events cannot be updated or deleted through standard business workflows.
- Timeline queries sort by `timestamp ASC, sequenceNumber ASC, id ASC`, ensuring exact temporal fidelity while handling backfilled historical operations gracefully.

### 3.2 Idempotency & Deduplication
- Auto-generated or caller-supplied `idempotencyKey` strings prevent double-recording of events upon network retries or periodic sync ticks.
- Collisions return the already-persisted record without advancing sequence counters or mutating states.

### 3.3 Historical Reconstruction Across Phases 89–107
The `AuditTimelineAssembler` introspects database entities created during earlier phases and converts them into normalized audit events:
- **Phase 88 / V6**: Initial failure case detection and automated classification.
- **Phase 91–93**: Jira ticket creation, duplicate linkage, and remote key tracking.
- **Phase 94–95**: Engineer assignments and email dispatch notifications.
- **Phase 97–98**: Defect reverification planning and re-execution test results.
- **Phase 99**: Quick-fix safety rule evaluation and proposal feasibility.
- **Phase 100**: Technical root-cause file and line localization.
- **Phase 101**: Unified diff patch proposal generation.
- **Phase 102**: Sandbox isolation and AST validation.
- **Phase 103–104**: Targeted regression testing and gate checks.
- **Phase 105**: Explicit human approval or rejection with mandatory rationales.
- **Phase 106**: Git branch patch application and emergency rollback snapshots.
- **Phase 107**: Retest execution and post-fix Jira/email updates.

### 3.4 Cryptographic Sealing & Export
- **JSON Export**: Complete structured dump of the session and all events, signed with a deterministic SHA-256 integrity checksum over normalized payloads.
- **Markdown Export**: Formatted executive and engineering audit trail with actor summary counts, chronological timeline tables, evidence references, and embedded SHA-256 seal.
- **Secret Redaction**: All exported artifacts pass through `SecretRedactor` to strip credentials, API keys, tokens, and private cookies before being returned to clients or disk.

---

## 4. Multi-Actor Distinction & Compliance

Under no circumstances may an automated system or AI agent act as a human approver:
- AI-generated proposals always carry `actorType: 'AI'`.
- Human approvals or rejections strictly require `actorType: 'USER'` and must be verified against trusted session identities.
- Retest and verification outputs are marked `actorType: 'TEST_ENGINE'`.
- External webhooks and sync actions are marked `actorType: 'JIRA_INTEGRATION'` or `actorType: 'NOTIFICATION_SERVICE'`.

---

## 5. UI Implementation (`RepairAuditTrailCard`)

Located within `apps/desktop/src/renderer/features/failures/RepairAuditTrailCard.tsx`:
- **Header & Session Status**: Displays current session status (`ACTIVE`, `VERIFIED`, etc.) and total recorded events.
- **Actor Badges**: Distinct color-coded badges for `HUMAN DECISION` (purple), `AI PROPOSAL` (blue), `TEST RESULT` (indigo), `EXTERNAL JIRA ACTION` (cyan), `NOTIFICATION` (amber), `REPAIR ENGINE` (emerald), and `SYSTEM FACT` (zinc).
- **Filtering & Search**: Real-time filtering by actor type (`ALL`, `HUMAN`, `AI`, `TEST_ENGINE`, `JIRA`, `NOTIFICATION`, `REPAIR_ENGINE`, `SYSTEM`) and instant text query filtering across event summaries, rationales, and IDs.
- **Exports**: Direct one-click download buttons for `Export JSON` and `Export Markdown` triggering automated browser/desktop file saves.

---

## 6. IPC Interface & Sender Security

| IPC Channel | Input Schema | Result DTO |
| :--- | :--- | :--- |
| `desktop:audit:get-timeline` | `getRepairTimelineInputSchema` | `RepairAuditTimelineDto` |
| `desktop:audit:get-session` | `getRepairSessionInputSchema` | `RepairSessionDto` |
| `desktop:audit:list-sessions` | `listRepairSessionsInputSchema` | `RepairSessionDto[]` |
| `desktop:audit:export-timeline` | `exportRepairTimelineInputSchema` | `ExportRepairTimelineResultDto` |
| `desktop:audit:record-event` | `recordRepairAuditEventInputSchema` | `RepairAuditEventDto` |

Every IPC invocation strictly enforces `isTrustedIpcSender(event)` to prevent subframe tampering and reject unauthorized cross-origin requests. Inputs are validated with Zod schemas, rejecting unexpected fields.
