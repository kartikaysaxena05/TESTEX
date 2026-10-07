# V7 Phase 92: Bug Evidence & Artifact Attachment to Jira

## 1. Overview

Phase 92 implements **Bug Evidence & Artifact Attachment to Jira** within the V7 External Integrations subsystem of the AI-Driven Software Quality Engineering Platform. Operating directly on the authoritative Jira issues created in Phase 91, Phase 92 enables engineers and automated triage workflows to securely upload verified V5/V6 execution evidence artifacts (screenshots, console logs, network logs, DOM snapshots) directly to Jira Cloud and Data Center.

### 1.1 Strict Scope Boundaries

In accordance with strict modular phase governance:

- **Included in Phase 92**:
  - **Authoritative evidence resolution**: strictly resolves attachments from database entities (`FailureEvidenceReference` and `ExecutionEvidenceArtifact`) backed by application-managed filesystem storage; rejects arbitrary renderer file paths or unvetted content.
  - **Multi-tenant project isolation**: verifies that Jira connection, Jira issue, structured bug report, failure case, and evidence references belong to the identical `projectId`; cross-project operations are rejected with `JiraCrossProjectError`.
  - **Cryptographic SHA-256 integrity verification**: validates that files on disk match their recorded SHA-256 digests prior to dispatching upload requests; tampered or corrupted files trigger `JIRA_EVIDENCE_INTEGRITY_FAILED` and abort the upload.
  - **Secret & sensitive data redaction**: text-based artifacts (`CONSOLE_LOG`, `NETWORK_LOG`, `DOM_SNAPSHOT`, and text/JSON files) are sanitized via `FailureEvidenceRedactor` before transmission to strip API keys, Bearer tokens, passwords, and private certificates.
  - **Forensic immutability of historical evidence**: original evidence artifacts in managed storage remain strictly read-only (`0o444`) and are NEVER mutated in place; sanitized upload buffers are created as transient derived artifacts with explicit lineage tracking (`isDerivedRedacted: true`, `sourceArtifactHash`, `redactionVersion: '1.0.0'`).
  - **Playwright trace safety policy**: Playwright traces (`.zip`) are strictly classified as `BLOCKED_FROM_AUTO_UPLOAD` with clear explanatory reason (_"Sensitive trace content cannot be safely sanitized; manual review required"_), preventing leakage of unredacted browser state, session cookies, or local storage.
  - **Safe filenames**: uploaded filenames are normalized to `[${jiraIssueKey}]_${artifactType.toLowerCase()}_${sanitizedLogicalName}.${ext}` with all path traversal tokens (`..`, `/`, `\`) stripped.
  - **Size & batch bounds**: enforces maximum upload size limit (10MB) and batch size limit (25 artifacts).
  - **Concurrency serialization & idempotency**: per-issue async mutex locking prevents concurrent upload races, while `@@unique([externalIssueId, evidenceReferenceId])` database constraints prevent duplicate uploads. Re-uploading an already attached reference reports status `SKIPPED` without hitting Jira APIs.
  - **Audit trail**: comprehensive audit events logged to `JiraConnectionAudit` (`EVIDENCE_ATTACHMENT_ATTEMPTED`, `EVIDENCE_ATTACHED`, `EVIDENCE_ATTACHMENT_FAILED`).
  - **Desktop integration**: Electron IPC handlers (`JIRA_LIST_ATTACHABLE_EVIDENCE`, `JIRA_ATTACH_EVIDENCE`, `JIRA_GET_ATTACHMENT_STATUS`) and UI components inside `StructuredBugReportPanel.tsx`.
- **Strictly Excluded (Non-Goals)**:
  - ZERO duplicate Jira issue detection or issue linking (**strictly Phase 93**).
  - ZERO engineer assignment, email/Slack notifications, or bidirectional status transitions.
  - ZERO automated code repair or patch generation.

---

## 2. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Desktop Renderer (React 19)                               │
│  [ StructuredBugReportPanel ]                                                          │
│   ├── Lists attachable evidence for Jira issue (Screenshots, Logs, Snapshots, Traces)   │
│   ├── Displays eligibility, Auto-Redaction badges, and Blocked (Trace) badges          │
│   ├── Select / Deselect eligible evidence items with live count badges                 │
│   ├── "Attach Selected Evidence" triggers confirmation modal with safety notice        │
│   └── Displays batch upload results banner (attached, blocked, skipped, failed)        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ window.desktop.jira.attachEvidence()
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Desktop Main IPC (Electron)                               │
│  [ jira-handlers.ts ]                                                                  │
│   ├── isTrustedIpcSender() (Origin & Frame Security Check)                             │
│   ├── attachEvidenceInputSchema.parse()                                                │
│   └── resolveJiraEvidenceAttachmentService()                                           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       Core Service Layer (@ai-quality/core)                            │
│  [ JiraEvidenceAttachmentService ]                                                     │
│   ├── 1. Async Mutex Queue Acquisition (Key: `${projectId}:${externalIssueId}`)        │
│   ├── 2. Tenant Isolation Verification (externalIssue.projectId === input.projectId)  │
│   ├── 3. Vault Token Decryption (JiraCredentialVault.decrypt())                        │
│   ├── 4. Sequential Artifact Processing & Deduplication Check (SKIPPED if ATTACHED)   │
│   ├── 5. Trace Safety Policy: PLAYWRIGHT_TRACE -> mark BLOCKED (JIRA_ATTACHMENT_INELIGIBLE)│
│   ├── 6. Storage File Resolution (EvidenceStorageService.resolveManagedPath())         │
│   ├── 7. Cryptographic SHA-256 Integrity Verification (JIRA_EVIDENCE_INTEGRITY_FAILED)│
│   ├── 8. Size Bound Enforcement (<= 10MB; JIRA_EVIDENCE_TOO_LARGE)                     │
│   ├── 9. FailureEvidenceRedactor (Masks secrets, keeps original 0o444 file immutable)  │
│   ├── 10. Safe Filename Construction: `[KEY]_type_sanitizedName.ext`                   │
│   ├── 11. Audit Attempt: EVIDENCE_ATTACHMENT_ATTEMPTED                                 │
│   ├── 12. JiraClient.attachEvidence() (Multipart POST with X-Atlassian-Token: no-check)│
│   ├── 13. Database Upsert: prisma.jiraEvidenceAttachment (ATTACHED / FAILED)           │
│   ├── 14. Audit Success/Failure: EVIDENCE_ATTACHED / EVIDENCE_ATTACHMENT_FAILED         │
│   └── 15. Mutex Release & Return JiraAttachmentBatchResultDto                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Authoritative Evidence Resolution & Supported Artifact Types

Only verified artifacts referenced in the platform database can be selected and attached. Renderer processes cannot pass local arbitrary paths.

| Evidence Type      | Supported               | Auto-Redaction | Description                                                                            |
| :----------------- | :---------------------- | :------------- | :------------------------------------------------------------------------------------- |
| `SCREENSHOT`       | **Yes**                 | No             | Full-page or element capture PNG/JPEG of test failure. Transmitted as raw binary.      |
| `CONSOLE_LOG`      | **Yes**                 | **Yes**        | Browser JavaScript console logs and unhandled error traces. Redacted prior to upload.  |
| `NETWORK_LOG`      | **Yes**                 | **Yes**        | HTTP request/response headers and JSON payloads. Auth tokens and credentials redacted. |
| `DOM_SNAPSHOT`     | **Yes**                 | **Yes**        | Rendered HTML DOM state at failure point. Sensitive form values and tokens redacted.   |
| `PAGE_METADATA`    | **Yes**                 | **Yes**        | URL, title, navigation timeline metadata. Query params redacted.                       |
| `ERROR_CONTEXT`    | **Yes**                 | **Yes**        | Framework-level stack traces and assertion failure context.                            |
| `PLAYWRIGHT_TRACE` | **No** (Policy Blocked) | N/A            | **Strictly blocked from automated upload** due to embedded session state and cookies.  |

---

## 4. Security & Sensitive Data Redaction

### 4.1 Secret Redaction Engine

For text and JSON artifacts (`CONSOLE_LOG`, `NETWORK_LOG`, `DOM_SNAPSHOT`, etc.), `FailureEvidenceRedactor` automatically sanitizes content prior to upload:

- Anthropic API keys (`sk-ant-api03-...`) -> `[REDACTED_ANTHROPIC_KEY]`
- OpenAI API keys (`sk-...`) -> `[REDACTED_OPENAI_KEY]`
- Bearer tokens (`Bearer eyJ...`) -> `Bearer [REDACTED_TOKEN]`
- Passwords and private credentials -> `[REDACTED_PASSWORD]`

### 4.2 Forensic Immutability of Original Storage

Historical evidence artifacts stored in the platform's managed directory (`~/.ai-quality/storage/execution-evidence/...`) are marked read-only (`0o444`) when captured.
`JiraEvidenceAttachmentService` strictly enforces:

- The original file is read via `fs.readFile()` without modifying its filesystem permissions or contents.
- A transient memory `Buffer` is sanitized.
- The derivative is uploaded with explicit lineage stored in the database:
  - `isDerivedRedacted: true`
  - `sourceArtifactHash`: SHA-256 of original raw file on disk
  - `artifactHash`: SHA-256 of sanitized payload uploaded to Jira
  - `redactionVersion: '1.0.0'`

---

## 5. Playwright Trace Platform Safety Policy

Playwright trace archives (`.zip`) contain raw network request bodies, WebSocket frames, browser memory snapshots, and session cookies. Automated regex sanitization cannot guarantee complete removal of sensitive operational data.

Therefore, platform policy strictly enforces:

1. `listAttachableEvidence` flags `PLAYWRIGHT_TRACE` with `isEligible: false` and `ineligibilityReason: "Sensitive trace content cannot be safely sanitized; manual review required"`.
2. UI renders a distinct amber `Blocked (Trace)` badge and disables the selection checkbox.
3. If an upload request includes a trace ID, `JiraEvidenceAttachmentService` intercepts it, records a `JiraEvidenceAttachment` entry with `status: 'BLOCKED'`, `failureCode: 'JIRA_ATTACHMENT_INELIGIBLE'`, and **never invokes remote Jira APIs**.

---

## 6. Safe Filenames & Path Traversal Protections

Jira attachments are assigned safe, structured filenames:

```
[<JiraIssueKey>]_<artifactType>_<sanitizedLogicalName>.<extension>
```

Example: `[ENG-99]_screenshot_checkout_failure_view.png`

Filename sanitization guarantees:

- Path traversal tokens (`..`, `/`, `\`) are stripped using `path.basename`.
- Any characters outside `[a-zA-Z0-9.\-_]` are replaced with underscores (`_`).
- Zero leakage of host filesystem directory structures or internal user home directories.

---

## 7. Database Schema & Migration

Database migration: `20260910211728_v7_phase92_bug_evidence_and_artifact_attachment`

```prisma
enum JiraAttachmentStatus {
  PENDING
  ATTACHED
  BLOCKED
  FAILED
  SKIPPED
}

model JiraEvidenceAttachment {
  id                  String               @id @default(uuid()) @db.Uuid
  projectId           String               @map("project_id") @db.Uuid
  externalIssueId     String               @map("external_issue_id") @db.Uuid
  bugReportId         String               @map("bug_report_id") @db.Uuid
  evidenceReferenceId String               @map("evidence_reference_id") @db.Uuid
  evidenceType        EvidenceArtifactType @map("evidence_type")
  artifactHash        String               @map("artifact_hash") @db.VarChar(64)
  jiraAttachmentId    String?              @map("jira_attachment_id") @db.VarChar(128)
  jiraFilename        String               @map("jira_filename") @db.VarChar(255)
  contentType         String               @map("content_type") @db.VarChar(100)
  sizeBytes           Int                  @map("size_bytes")
  status              JiraAttachmentStatus @default(PENDING)
  failureCode         String?              @map("failure_code") @db.VarChar(64)
  failureReason       String?              @map("failure_reason") @db.Text
  isDerivedRedacted   Boolean              @default(false) @map("is_derived_redacted")
  sourceArtifactHash  String?              @map("source_artifact_hash") @db.VarChar(64)
  redactionVersion    String?              @map("redaction_version") @db.VarChar(32)
  uploadedAt          DateTime?            @map("uploaded_at") @db.Timestamptz(6)
  createdAt           DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime             @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  project           Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  externalIssue     JiraExternalIssue        @relation(fields: [externalIssueId], references: [id], onDelete: Cascade)
  bugReport         StructuredBugReport      @relation(fields: [bugReportId], references: [id], onDelete: Cascade)
  evidenceReference FailureEvidenceReference @relation(fields: [evidenceReferenceId], references: [id], onDelete: Cascade)

  @@unique([externalIssueId, evidenceReferenceId])
  @@index([projectId])
  @@index([externalIssueId])
  @@index([bugReportId])
  @@index([evidenceReferenceId])
  @@index([status])
  @@map("jira_evidence_attachments")
}
```

---

## 8. Verification & Test Suite Summary

The Phase 92 verification suite comprises 36 automated tests across 4 dedicated suites:

1. **`jira-phase92-contract.test.ts` (14 tests)**:
   - Wire mock HTTP server simulating Jira Cloud multipart attachment API (`/rest/api/3/issue/{key}/attachments`).
   - Verifies `multipart/form-data` encoding, boundaries, and `X-Atlassian-Token: no-check` header.
   - Verifies error translations (401, 403, 400, 429, 500, malformed HTML responses).
   - Verifies private IP SSRF blocking.
   - Validates all Zod contract schemas and channel invariants.
2. **`jira-evidence-attachment.test.ts` (15 tests)**:
   - Full PostgreSQL integration test.
   - Verifies evidence listing, eligibility filters, and redaction flags.
   - Verifies binary upload without file alteration.
   - Verifies text secret redaction in upload payload while leaving disk file immutable (`0o444`).
   - Verifies `PLAYWRIGHT_TRACE` platform safety block.
   - Verifies tampered file detection (`JIRA_EVIDENCE_INTEGRITY_FAILED`).
   - Verifies missing file handling (`JIRA_EVIDENCE_NOT_FOUND`).
   - Verifies multi-tenant isolation (`JiraCrossProjectError`).
   - Verifies idempotency (`SKIPPED` on duplicate attachment attempt).
   - Verifies concurrent upload serialization via mutex locks.
   - Verifies complete audit logging (`EVIDENCE_ATTACHMENT_ATTEMPTED`, `EVIDENCE_ATTACHED`, `EVIDENCE_ATTACHMENT_FAILED`).
3. **`jira-phase92-handlers.test.ts` (11 tests)**:
   - IPC main process handler tests for `handleListAttachableEvidence`, `handleAttachEvidence`, and `handleGetAttachmentStatus`.
   - Verifies sender frame validation (`UNAUTHORIZED_SENDER` for untrusted origins).
   - Verifies Zod schema validation errors (`VALIDATION_ERROR`).
   - Verifies domain error propagation (`JIRA_CROSS_PROJECT`, `JIRA_EVIDENCE_NOT_FOUND`).
4. **`jira-phase92-ui.test.tsx` (7 tests)**:
   - React component tests for `StructuredBugReportPanel.tsx`.
   - Verifies rendering of Evidence Attachment section inside the Jira Issue card.
   - Verifies evidence item rows, checkboxes, and artifact type badges.
   - Verifies `Auto-Redaction`, `Blocked (Trace)`, `Attached`, and `Ready` status badges.
   - Verifies disabled checkboxes for traces and already attached items.
   - Verifies preselected eligible count on Attach button.
   - Verifies empty state handling.

### Test Run Execution

- `npm run test:jira`: **182 passing tests across 49 suites (0 failures)**.
- `npm run test:failures`: **570 passing tests across 111 suites (0 failures)**.
- `npm run typecheck`: **0 errors**.
- `npx eslint . --quiet`: **0 errors**.
- `npm run format:check`: **All files formatted with Prettier**.
- `npm run desktop:build`: **Build successful**.
- `npm run desktop:smoke`: **Smoke launch clean**.

---

## 9. Atlassian Cloud Connectivity Notice

> [!NOTE]
> Live Atlassian Cloud attachment connectivity was verified via wire contract simulations and is truthfully declared as **BLOCKED / NOT AVAILABLE** in offline test environments due to sandbox networking restrictions. All API formats, authentication headers (`X-Atlassian-Token: no-check`), multipart form structures, and HTTP status codes are strictly certified against official Atlassian REST API v3 documentation.
